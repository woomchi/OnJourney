/**
 * @fileoverview 지하철 실시간 API 캐시 서비스
 *
 * Next.js unstable_cache를 사용하여 워커 간 공유 캐시를 구현합니다.
 * 서버리스 환경(Vercel Functions 등)에서도 15초 TTL 기반 캐시가 안정적으로 작동합니다.
 *
 * 캐시 전략:
 * - 일괄 도착 API (swopenAPI): revalidate 15초
 * - 노선별 열차 위치 API (swopenAPI): revalidate 15초
 */

import { unstable_cache } from 'next/cache';
import type { RawSubwayArrivalRow } from '../services/subwayTotalRealtimeService';
import type { SubwayPosition } from '@/types/journey';

const TOTAL_ARRIVAL_REVALIDATE = 15; // 초
const POSITION_REVALIDATE = 15;      // 초 (도착 정보 15초 주기와 동기화)
const FETCH_TIMEOUT_MS = 6_000;

/** API 실패/타임아웃 대비 노선별 직전 정상 스냅샷 메모리 캐시 */
const lastKnownPositionsMap = new Map<string, SubwayPosition[]>();

/**
 * 서울시 지하철 일괄 도착 API 호출 (원시 fetch)
 */
async function fetchTotalArrivalsRaw(
  apiKey: string,
  startIndex: string,
  endIndex: string
): Promise<RawSubwayArrivalRow[]> {
  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/ALL/${startIndex}/${endIndex}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`서울시 일괄 지하철 API 응답 오류: ${response.status}`);
    }

    const data = await response.json();

    if (
      data.errorMessage &&
      data.errorMessage.code !== 'INFO-000' &&
      data.errorMessage.status !== 200
    ) {
      throw new Error(`서울시 일괄 지하철 API 오류: ${data.errorMessage.message}`);
    }

    return (data.realtimeArrivalList || []) as RawSubwayArrivalRow[];
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      console.warn('[subwayCacheService] 타임아웃: 일괄 정보 조회 시간 초과');
    } else {
      console.warn('[subwayCacheService] 일괄 조회 실패:', error);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 서울시 지하철 노선별 열차 위치 API 호출 (원시 fetch)
 */
async function fetchPositionsByLineRaw(
  apiKey: string,
  subwayNm: string
): Promise<SubwayPosition[]> {
  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimePosition/0/100/${encodeURIComponent(
    subwayNm
  )}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
        const prevTime = String(existing.recptnDt || existing.lastRecptnDt || '');
        const currTime = String(row.recptnDt || row.lastRecptnDt || '');
        if (currTime >= prevTime) {
          latestTrainMap.set(trainNo, row);
        }
      }
    }

    const deduplicatedRows = Array.from(latestTrainMap.values());

    const mappedPositions = deduplicatedRows.map((row) => {
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
        updnLine: String(row.updnLine || '0'),
        statnTid: row.statnTid ? String(row.statnTid) : undefined,
        statnTnm: row.statnTnm ? String(row.statnTnm).replace(/역$/, '').trim() : undefined,
        trainSttus: String(row.trainSttus !== undefined && row.trainSttus !== null ? row.trainSttus : '99'),
        directAt: row.directAt ? String(row.directAt) : '0',
        lstcarAt: row.lstcarAt ? String(row.lstcarAt) : '0',
        isExpress,
      };
    });

    if (mappedPositions.length > 0) {
      lastKnownPositionsMap.set(subwayNm, mappedPositions);
    }

    return mappedPositions;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      console.warn(`[subwayCacheService] 타임아웃 (${subwayNm} 위치 조회) - 직전 스냅샷 Fallback 적용`);
    } else {
      console.warn(`[subwayCacheService] 위치 조회 실패 (${subwayNm}):`, error);
    }

    // 장애 시 직전 성공 스냅샷(Last Known Good) 제공
    const fallbackSnapshot = lastKnownPositionsMap.get(subwayNm);
    if (fallbackSnapshot && fallbackSnapshot.length > 0) {
      return fallbackSnapshot;
    }

    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── 캐시 래퍼 (Next.js unstable_cache) ──────────────────────────────────────

/**
 * 15초 TTL 캐시가 적용된 일괄 도착 API 조회 함수
 */
export const fetchCachedTotalArrivals = unstable_cache(
  async (apiKey: string, startIndex: string, endIndex: string): Promise<RawSubwayArrivalRow[]> => {
    return fetchTotalArrivalsRaw(apiKey, startIndex, endIndex);
  },
  ['subway-total-arrivals'],
  { revalidate: TOTAL_ARRIVAL_REVALIDATE }
);

/**
 * 15초 TTL 캐시가 적용된 노선별 열차 위치 API 조회 함수
 * 노선명(subwayNm)별로 캐시 키를 완벽히 격리합니다.
 */
export async function fetchCachedPositionsByLine(
  apiKey: string,
  subwayNm: string
): Promise<SubwayPosition[]> {
  const cachedFn = unstable_cache(
    async () => fetchPositionsByLineRaw(apiKey, subwayNm),
    ['subway-positions-by-line', subwayNm],
    { revalidate: POSITION_REVALIDATE }
  );
  return cachedFn();
}
