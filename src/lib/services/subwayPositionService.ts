/**
 * @fileoverview 서울시 지하철 실시간 열차 위치 서비스 (subwayPositionService)
 *
 * REAL_TIME_SUBWAY_LOCATION_API_KEY를 사용하여
 * 서울 지하철 노선별 실시간 운행 열차의 위치와 상태(진입, 도착, 출발)를 조회하고
 * 15초 동안 인메모리에 캐싱하여 실시간 도착 정보(ETA) 보정 및 노선도 뷰에 제공합니다.
 */

import { SubwayPosition } from '@/types/journey';

// ─── 상수 & 캐시 ─────────────────────────────────────────────────────────────

/** 노선별 위치 API 호출 인메모리 캐시 유지 시간 (15초) */
const POSITION_CACHE_TTL_MS = 15_000;

/** API 호출 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 5_000;

interface CacheEntry {
  timestamp: number;
  positions: SubwayPosition[];
}

/** 노선명/ID 기준 인메모리 캐시 */
const linePositionCache = new Map<string, CacheEntry>();

/** 동시 요청 시 중복 fetch 방지용 Promise 맵 */
const pendingFetchMap = new Map<string, Promise<SubwayPosition[]>>();

// ─── 노선명 정규화 헬퍼 ───────────────────────────────────────────────────────

/**
 * subwayId 또는 노선명을 서울시 realtimePosition API가 요구하는 subwayNm으로 변환합니다.
 */
export function resolveSubwayNameForPositionApi(subwayIdOrName: string): string {
  const clean = String(subwayIdOrName || '').trim();

  if (clean === '1001' || clean === '1' || clean.includes('1호선')) return '1호선';
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) return '2호선';
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) return '3호선';
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) return '4호선';
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) return '5호선';
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) return '6호선';
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) return '7호선';
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) return '8호선';
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) return '9호선';
  if (clean === '1063' || clean.includes('경의중앙') || clean.includes('경의') || clean.includes('중앙선')) return '경의중앙선';
  if (clean === '1065' || clean.includes('공항철도') || clean.includes('공항')) return '공항철도';
  if (clean === '1067' || clean.includes('경춘선')) return '경춘선';
  if (clean === '1075' || clean.includes('수인분당') || clean.includes('분당선') || clean.includes('수인선')) return '수인분당선';
  if (clean === '1077' || clean.includes('신분당')) return '신분당선';
  if (clean === '1092' || clean.includes('우이신설')) return '우이신설선';
  if (clean === '1093' || clean.includes('서해선')) return '서해선';
  if (clean.includes('신림선')) return '신림선';

  if (/^\d+호선$/.test(clean)) return clean;
  if (/^\d+$/.test(clean) && parseInt(clean, 10) >= 1 && parseInt(clean, 10) <= 9) {
    return `${clean}호선`;
  }

  return clean;
}

function getSubwayLocationApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey =
    env.REAL_TIME_SUBWAY_LOCATION_API_KEY ||
    env['REAL_TIME_SUBWAY_LOCATION_API_KEY '] ||
    env.REAL_TIME_SUBWAY_API_KEY ||
    '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

// ─── 공개 API 함수 ───────────────────────────────────────────────────────────

/**
 * 특정 노선(예: '2호선', '1002')의 모든 실시간 열차 위치를 조회합니다.
 */
export async function fetchSubwayPositionsByLine(
  subwayIdOrName: string
): Promise<SubwayPosition[]> {
  const subwayNm = resolveSubwayNameForPositionApi(subwayIdOrName);
  if (!subwayNm) return [];

  const now = Date.now();
  const cached = linePositionCache.get(subwayNm);

  // 1. 유효한 인메모리 캐시 반환
  if (cached && now - cached.timestamp < POSITION_CACHE_TTL_MS) {
    return cached.positions;
  }

  // 2. 진행 중인 요청 재활용
  if (pendingFetchMap.has(subwayNm)) {
    return pendingFetchMap.get(subwayNm)!;
  }

  const apiKey = getSubwayLocationApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    return [];
  }

  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimePosition/0/100/${encodeURIComponent(
    subwayNm
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`서울시 열차 위치 API 오류: ${response.status}`);
      }

      const data = await response.json();

      if (
        data.errorMessage &&
        data.errorMessage.code !== 'INFO-000' &&
        data.errorMessage.status !== 200
      ) {
        throw new Error(`서울시 열차 위치 API 오류: ${data.errorMessage.message}`);
      }

      const rawList: any[] = data.realtimePositionList || [];

      // trainNo 기준 중복 제거 (가장 최신 recptnDt 유지)
      const latestTrainMap = new Map<string, any>();
      for (const row of rawList) {
        const trainNo = String(row.trainNo || '').trim();
        if (!trainNo) continue;

        const existing = latestTrainMap.get(trainNo);
        if (!existing) {
          latestTrainMap.set(trainNo, row);
        } else {
          // 수신 시각 비교하여 더 최신 레코드 채택
          const prevTime = String(existing.recptnDt || existing.lastRecptnDt || '');
          const currTime = String(row.recptnDt || row.lastRecptnDt || '');
          if (currTime >= prevTime) {
            latestTrainMap.set(trainNo, row);
          }
        }
      }

      const deduplicatedRows = Array.from(latestTrainMap.values());

      const positions: SubwayPosition[] = deduplicatedRows.map((row) => {
        const isExpress =
          row.directAt === '1' ||
          String(row.trainLineNm || '').includes('급행') ||
          String(row.trainLineNm || '').includes('(급)');

        return {
          subwayId: String(row.subwayId || ''),
          subwayNm: String(row.subwayNm || subwayNm),
          statnId: String(row.statnId || ''),
          statnNm: String(row.statnNm || '').replace(/역$/, '').trim(),
          trainNo: String(row.trainNo || ''),
          lastRecptnDt: row.lastRecptnDt,
          recptnDt: String(row.recptnDt || ''),
          updnLine: String(row.updnLine || '0'), // 0: 상행/내선, 1: 하행/외선
          statnTid: row.statnTid ? String(row.statnTid) : undefined,
          statnTnm: row.statnTnm ? String(row.statnTnm).replace(/역$/, '').trim() : undefined,
          trainSttus: String(row.trainSttus ?? '0'), // 0: 진입, 1: 도착, 2: 출발, 3: 전역출발
          directAt: row.directAt ? String(row.directAt) : '0',
          lstcarAt: row.lstcarAt ? String(row.lstcarAt) : '0',
          isExpress,
        };
      });

      // 캐시 갱신
      linePositionCache.set(subwayNm, {
        timestamp: Date.now(),
        positions,
      });

      return positions;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      if (isTimeout) {
        console.warn(`[subwayPositionService] 타임아웃 (${subwayNm} 위치 조회)`);
      } else {
        console.warn(`[subwayPositionService] 위치 조회 실패 (${subwayNm}):`, error);
      }
      return linePositionCache.get(subwayNm)?.positions || [];
    } finally {
      clearTimeout(timeoutId);
      pendingFetchMap.delete(subwayNm);
    }
  })();

  pendingFetchMap.set(subwayNm, fetchPromise);
  return fetchPromise;
}

/**
 * 특정 열차번호(trainNo)의 현재 위치 정보를 조회합니다.
 */
export async function getTrainPositionByTrainNo(
  subwayIdOrName: string,
  trainNo: string
): Promise<SubwayPosition | null> {
  if (!trainNo) return null;
  const positions = await fetchSubwayPositionsByLine(subwayIdOrName);
  const cleanTrainNo = String(trainNo).trim();
  const matched = positions.find((p) => p.trainNo === cleanTrainNo || p.trainNo.endsWith(cleanTrainNo));
  return matched || null;
}
