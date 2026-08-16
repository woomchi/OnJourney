/**
 * @fileoverview 서울시 지하철 실시간 도착 정보 (일괄) 서비스
 *
 * REAL_TIME_SUBWAY_TOTAL_API_KEY (OA-15799) 인증키를 사용하여
 * 서울 지하철 전체 역의 실시간 도착 정보를 일괄 조회하고 인메모리에 캐싱합니다.
 */

import { calculateSubwayETADynamic } from '@/lib/subwayService';
import { SubwayTotalQueryType } from '../validations/subway';
import type { SubwayArrival } from '@/types/journey';
import { isStaleRow } from './subwayRealtimeService';

// ─── 상수 & 캐시 ─────────────────────────────────────────────────────────────

/** 일괄 API 호출 인메모리 캐시 유지 시간 (15초) */
const TOTAL_CACHE_TTL_MS = 15_000;

/** API 호출 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 6_000;

/** 서울시 API raw 결과 row 타입 */
export interface RawSubwayArrivalRow {
  subwayId?: string | number;
  updnLine?: string;
  btrainNo?: string | number;
  trainNo?: string | number;
  statnNm?: string;
  arvlMsg2?: string;
  recptnDt?: string;
  barvlDt?: number | string;
  arvlCd?: string | number;
  [key: string]: any;
}

interface CacheEntry {
  timestamp: number;
  rows: RawSubwayArrivalRow[];
}

let totalArrivalCache: CacheEntry | null = null;
let pendingFetchPromise: Promise<RawSubwayArrivalRow[]> | null = null;

// ─── 서비스 함수 ─────────────────────────────────────────────────────────────

function getSubwayTotalApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey =
    env.REAL_TIME_SUBWAY_TOTAL_API_KEY ||
    env['REAL_TIME_SUBWAY_TOTAL_API_KEY '] ||
    '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

/**
 * 서울시 지하철 실시간 일괄 도착 정보 API(OA-15799)를 호출하거나 캐시를 반환합니다.
 */
export async function fetchSubwayTotalArrivals(
  params?: SubwayTotalQueryType
): Promise<RawSubwayArrivalRow[]> {
  const now = Date.now();

  // 1. 유효한 인메모리 캐시가 존재하는 경우 즉시 반환
  if (totalArrivalCache && now - totalArrivalCache.timestamp < TOTAL_CACHE_TTL_MS) {
    return filterRowsByParams(totalArrivalCache.rows, params);
  }

  // 2. 동시 요청 시 중복 fetch 방지를 위해 진행 중인 promise 재활용
  if (pendingFetchPromise) {
    const rows = await pendingFetchPromise;
    return filterRowsByParams(rows, params);
  }

  const apiKey = getSubwayTotalApiKey();

  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    console.warn('[subwayTotalRealtimeService] REAL_TIME_SUBWAY_TOTAL_API_KEY 미설정');
    return [];
  }

  const startIndex = params?.startIndex || '0';
  const endIndex = params?.endIndex || '100';

  const url = `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival/ALL/${startIndex}/${endIndex}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  pendingFetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        cache: 'no-store', // 서버 차원 캐싱은 인메모리 객체로 제어
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

      const rows: RawSubwayArrivalRow[] = data.realtimeArrivalList || [];

      // 캐시 갱신
      totalArrivalCache = {
        timestamp: Date.now(),
        rows,
      };

      return rows;
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      if (isTimeout) {
        console.warn('[subwayTotalRealtimeService] 타임아웃: 일괄 정보 조회 시간 초과');
      } else {
        console.error('[subwayTotalRealtimeService] 일괄 조회 실패:', error);
      }
      // 실패 시 이전 캐시가 있다면 리턴
      return totalArrivalCache?.rows || [];
    } finally {
      clearTimeout(timeoutId);
      pendingFetchPromise = null;
    }
  })();

  const fetchedRows = await pendingFetchPromise;
  return filterRowsByParams(fetchedRows, params);
}

/**
 * 파라미터(역명 등)에 따라 row 데이터를 필터링합니다.
 */
function filterRowsByParams(
  rows: RawSubwayArrivalRow[],
  params?: SubwayTotalQueryType
): RawSubwayArrivalRow[] {
  if (!params?.station) return rows;

  const cleanTarget = params.station.replace(/역$/, '').trim();
  return rows.filter((r) => {
    const statnNm = String(r.statnNm || '').replace(/역$/, '').trim();
    return statnNm === cleanTarget;
  });
}

/**
 * 일괄 도착 API 데이터를 활용하여 특정 역의 SubwayArrival 타입 배열을 반환합니다.
 * (단일 역 API 실패 시 2차 Fallback용)
 */
export async function getStationArrivalsFromTotalCache(
  station: string,
  wayCode?: string
): Promise<SubwayArrival[]> {
  const cleanStation = station.replace(/역$/, '').trim();
  const allRows = await fetchSubwayTotalArrivals({ startIndex: '0', endIndex: '500', station: cleanStation });

  if (!allRows || allRows.length === 0) {
    return [];
  }

  // 요청된 wayCode 방향과 일치하는 열차만 필터링
  let filteredRows = allRows;
  if (wayCode) {
    filteredRows = allRows.filter((row) => {
      const lineStr = String(row.updnLine || '');
      const isUpLine =
        lineStr === '상행' ||
        lineStr.includes('상선') ||
        lineStr.includes('내선') ||
        lineStr.includes('서울') ||
        lineStr.includes('청량리');
      const trainWayCode = isUpLine ? '1' : '2';
      return trainWayCode === wayCode;
    });
  }

  // 만료된 데이터(수신 시각 초과 또는 출발 완료 열차) 필터링
  const now = Date.now();
  filteredRows = filteredRows.filter((row) => !isStaleRow(row, now));

  const processed = await Promise.all(
    filteredRows.map(async (row) => {
      const liveMsg = String(row.arvlMsg2 || '');
      const recTime = String(row.recptnDt || '');
      const lineName = String(row.updnLine || '');
      const trainNo = String(row.btrainNo || row.trainNo || '');
      const barvlDt = Number(row.barvlDt || 0);

      const eta = await calculateSubwayETADynamic(
        liveMsg,
        recTime,
        cleanStation,
        trainNo,
        lineName,
        barvlDt,
        String(row.subwayId || ''),
        row.arvlCd,
        row.trainLineNm,
        row.btrainSttus
      );

      return {
        subwayId: String(row.subwayId || ''),
        updnLine: lineName,
        trainNo,
        statnNm: cleanStation,
        arvlMsg2: liveMsg,
        recptnDt: recTime,
        ...eta,
        isRealtime: true,
      };
    })
  );

  const validArrivals = processed.filter((item) => !item.isPassed) as SubwayArrival[];

  validArrivals.sort((a, b) => {
    if (a.isApproaching && !b.isApproaching) return -1;
    if (!a.isApproaching && b.isApproaching) return 1;
    return a.minutesLeft - b.minutesLeft;
  });

  return validArrivals;
}
