/**
 * @fileoverview 서울시 지하철 실시간 도착 정보 (일괄) 서비스
 *
 * REAL_TIME_SUBWAY_TOTAL_API_KEY (OA-15799) 인증키를 사용하여
 * 서울 지하철 전체 역의 실시간 도착 정보를 일괄 조회하고 인메모리에 캐싱합니다.
 */

import { calculateSubwayETADynamic, extractTrainMetadata } from '@/lib/subwayService';
import { SubwayTotalQueryType } from '../validations/subway';
import type { SubwayArrival } from '@/types/journey';
import { isStaleRow } from './subwayRealtimeService';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import { resolveWayCode } from '@/lib/constants/subwayLineMap';
import { fetchCachedTotalArrivals } from '@/lib/infrastructure/subwayCacheService';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

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

// ─── 서비스 함수 ─────────────────────────────────────────────────────────────

function getSubwayTotalApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey = env.REAL_TIME_SUBWAY_TOTAL_API_KEY || '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

/**
 * 서울시 지하철 실시간 일괄 도착 정보 API(OA-15799)를 호출하거나 Next.js 캐시를 반환합니다.
 */
export async function fetchSubwayTotalArrivals(
  params?: SubwayTotalQueryType
): Promise<RawSubwayArrivalRow[]> {
  const apiKey = getSubwayTotalApiKey();

  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    console.warn('[subwayTotalRealtimeService] REAL_TIME_SUBWAY_TOTAL_API_KEY 미설정');
    return [];
  }

  const startIndex = params?.startIndex || '0';
  const endIndex = params?.endIndex || '100';

  const rows = await fetchCachedTotalArrivals(apiKey, startIndex, endIndex);
  return filterRowsByParams(rows, params);
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
    filteredRows = allRows.filter((row) => resolveWayCode(row.updnLine) === wayCode);
  }

  // 만료된 데이터(수신 시각 초과 또는 출발 완료 열차) 필터링
  const now = timeOffsetManager.getSynchronizedNow();
  filteredRows = filteredRows.filter((row) => !isStaleRow(row, now));

  const processed = filteredRows.map((row) => {
    const liveMsg = String(row.arvlMsg2 || '');
    const recTime = String(row.recptnDt || '');
    const lineName = String(row.updnLine || '');
    const trainNo = String(row.btrainNo || row.trainNo || '');
    const barvlDt = Number(row.barvlDt || 0);

    const eta = calculateSubwayETADynamic(
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

    const { destination: destName, isExpress: isMetaExpress } = extractTrainMetadata(row.trainLineNm);
    const isExpress =
      isMetaExpress ||
      row.btrainSttus === '급행' ||
      row.btrainSttus === '특급' ||
      String(row.trainLineNm || '').includes('급행') ||
      String(row.trainLineNm || '').includes('(급)');

    return {
      subwayId: String(row.subwayId || ''),
      updnLine: lineName,
      trainNo,
      statnNm: cleanStation,
      arvlMsg2: liveMsg,
      recptnDt: recTime,
      trainLineNm: row.trainLineNm,
      destinationStationNm: destName || undefined,
      isExpress,
      ...eta,
      isRealtime: true,
    };
  });

  const validArrivals = processed.filter((item) => !item.isPassed) as SubwayArrival[];

  validArrivals.sort((a, b) => {
    const pA = a.arrivalPriority ?? (a.isApproaching ? 1 : 10 + (a.minutesLeft || 0));
    const pB = b.arrivalPriority ?? (b.isApproaching ? 1 : 10 + (b.minutesLeft || 0));
    if (pA !== pB) return pA - pB;

    const minA = a.minutesLeft || 0;
    const minB = b.minutesLeft || 0;
    if (minA !== minB) return minA - minB;

    if (a.isExpress && !b.isExpress) return -1;
    if (!a.isExpress && b.isExpress) return 1;

    return 0;
  });

  return validArrivals;
}
