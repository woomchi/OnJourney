/**
 * @fileoverview 지하철 실시간 도착 정보 서비스
 *
 * 서울시 공공 API(swopenAPI)에서 실시간 열차 도착 정보를 조회하고,
 * API 키 미설정·오류·빈 결과 등 모든 경우에 시간표 Fallback으로 대응합니다.
 *
 * 처리 흐름:
 * 1. API 키 없음 → 시간표 기반 Fallback
 * 2. API 호출 → JSON 처리 → 만료 데이터 필터
 * 3. 결과 없음 / 오류 → 시간표 기반 Fallback
 * 4. 정상 결과 → ETA 계산 → 정렬
 */

import {
  calculateSubwayETADynamic,
  calculateNextTrainFromTimetable,
  parseSeoulApiDate,
  isStationReachableOnLine,
  extractTrainMetadata,
} from '@/lib/subwayService';
import { SubwayRealtimeQueryType } from '../validations/subway';
import type { SubwayArrival } from '@/types/journey';
import { getStationArrivalsFromTotalCache } from './subwayTotalRealtimeService';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 서울시 지하철 실시간 API 캐시 재검증 주기 (초) */
const REALTIME_REVALIDATE_SECONDS = 5;

/** '진입/도착' 상태 데이터 수신 후 유효 시간 (밀리초, 180초 = 3분) */
const STALE_APPROACHING_THRESHOLD_MS = 180_000;

/** 일반 운행 상태 데이터 수신 후 유효 시간 (밀리초, 300초 = 5분) */
const STALE_RUNNING_THRESHOLD_MS = 300_000;

/** arvlCd = '2'는 '출발/운행 종료'를 의미하여 필터링 대상 */
const ARRIVAL_CODE_ENDED = '2';

/** arvlCd = '0' 또는 '1'은 '진입/도착'으로 수신 시각 기반 만료 검증 필요 */
const ARRIVAL_CODES_APPROACHING = new Set(['0', '1']);

/** API 호출 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 5_000;

// ─── 로컬 타입 ─────────────────────────────────────────────────────────────────

/** 서울시 실시간 API XML row의 최소 필드 타입 */
export interface SubwayRawRow {
  subwayId?: string | number;
  updnLine?: string;
  btrainNo?: string | number;
  trainNo?: string | number;
  arvlMsg2?: string;
  recptnDt?: string;
  barvlDt?: number | string;
  arvlCd?: string | number;
  trainLineNm?: string;
  btrainSttus?: string;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * 2차 Fallback(일괄 API 캐시) ➡️ 3차 Fallback(시간표)을 순차적으로 시도합니다.
 */
async function fallbackToTotalOrTimetable(
  cleanStation: string,
  wayCode?: string
): Promise<SubwayArrival[]> {
  try {
    const secondaryArrivals = await getStationArrivalsFromTotalCache(cleanStation, wayCode);
    if (secondaryArrivals && secondaryArrivals.length > 0) {
      return secondaryArrivals;
    }
  } catch (e) {
    console.warn(`[subwayRealtimeService] 2차 일괄 API 캐시 조회 실패 (${cleanStation}):`, e);
  }
  return buildTimetableFallback(cleanStation, wayCode);
}

/**
 * updnLine(방향) 정보를 기반으로 시간표 Fallback 결과를 생성합니다.
 */
async function buildTimetableFallback(
  cleanStation: string,
  wayCode?: string
): Promise<SubwayArrival[]> {
  const directions = wayCode
    ? [wayCode === '1' ? '상행' : '하행']
    : ['상행', '하행'];

  const results: SubwayArrival[] = [];

  for (const updnLine of directions) {
    const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);
    if (nextTrain) {
      results.push({
        subwayId: '',
        updnLine,
        trainNo: nextTrain.trainNo,
        statnNm: cleanStation,
        arvlMsg2: nextTrain.statusText,
        recptnDt: '',
        statusText: nextTrain.statusText,
        minutesLeft: nextTrain.minutesLeft,
        arrivalTime: nextTrain.arrivalTime,
        isApproaching: nextTrain.isApproaching,
        isRealtime: false,
      });
    }
  }

  results.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return results;
}

/**
 * 실시간 API row가 만료된 데이터인지 판별합니다.
 */
export function isStaleRow(row: SubwayRawRow, currentTimeMs: number): boolean {
  const arvlCd = String(row.arvlCd ?? '');
  const arvlMsg2 = String(row.arvlMsg2 ?? '');

  // 1. 이미 당역 출발 완료된 열차
  if (arvlMsg2.includes('당역 출발') || arvlMsg2.includes('당역출발')) {
    return true;
  }

  // 2. recptnDt 수신 시각 기반 유효시간 검증
  const recptnDt = String(row.recptnDt || '');
  if (recptnDt) {
    try {
      const receiptTimeMs = parseSeoulApiDate(recptnDt);
      if (!isNaN(receiptTimeMs)) {
        const elapsedMs = currentTimeMs - receiptTimeMs;
        const isApproachingOrArrived =
          ARRIVAL_CODES_APPROACHING.has(arvlCd) ||
          arvlMsg2.includes('진입') ||
          arvlMsg2.includes('도착');

        const thresholdMs = isApproachingOrArrived
          ? STALE_APPROACHING_THRESHOLD_MS
          : STALE_RUNNING_THRESHOLD_MS;

        if (elapsedMs > thresholdMs) {
          return true;
        }
      }
    } catch {
      // 날짜 파싱 실패 시 만료로 처리하지 않음
    }
  }

  return false;
}

function getSubwayApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey =
    env.REAL_TIME_SUBWAY_API_KEY ||
    env['REAL_TIME_SUBWAY_API_KEY '] ||
    env.REAL_TIME_SEOUL_SUBWAY_API_KEY ||
    env['REAL_TIME_SEOUL_SUBWAY_API_KEY '] ||
    '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 역명으로 지하철 실시간 도착 정보를 조회합니다.
 *
 * 1차: REAL_TIME_SUBWAY_API_KEY (단일 역 실시간 API)
 * 2차: REAL_TIME_SUBWAY_TOTAL_API_KEY (일괄 도착 API 캐시)
 * 3차: ODsay 시간표 기반 정적 Fallback
 */
export async function fetchSubwayRealtime(
  params: SubwayRealtimeQueryType
): Promise<SubwayArrival[]> {
  const { station, wayCode, subwayId, destination, headsign } = params;
  const apiKey = getSubwayApiKey();
  const cleanStation = station.replace(/역$/, '').trim();

  // ─ API 키 미설정 → 2차/3차 Fallback ─
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    return fallbackToTotalOrTimetable(cleanStation, wayCode);
  }

  const url =
    `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival` +
    `/0/20/${encodeURIComponent(cleanStation)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`서울시 지하철 API 오류 응답: ${response.status}`);
    }

    const data = await response.json();

    // API 키 오류 또는 한도 초과 응답은 에러로 처리
    if (
      data.errorMessage &&
      data.errorMessage.code !== 'INFO-000' &&
      data.errorMessage.status !== 200
    ) {
      throw new Error(`서울시 지하철 API 오류: ${data.errorMessage.message}`);
    }

    let rows: SubwayRawRow[] = data.realtimeArrivalList || [];

    // 만료된 데이터(수신 시각 초과 또는 출발 완료 열차) 1차 필터링
    const now = Date.now();
    rows = rows.filter((row) => !isStaleRow(row, now));

    // 요청된 subwayId가 지정된 경우, 환승역 타 노선 데이터 혼선을 방지하기 위해 노선 필터링
    if (subwayId) {
      const cleanId = String(subwayId).trim();
      rows = rows.filter((row) => {
        const rowSubwayId = String(row.subwayId || '').trim();
        if (!rowSubwayId) return true;
        if (rowSubwayId === cleanId) return true;
        if (parseInt(rowSubwayId, 10) === parseInt(cleanId, 10)) return true;

        if ((cleanId === '1' || cleanId.includes('1호선')) && rowSubwayId === '1001') return true;
        if ((cleanId === '2' || cleanId.includes('2호선')) && rowSubwayId === '1002') return true;
        if ((cleanId === '3' || cleanId.includes('3호선')) && rowSubwayId === '1003') return true;
        if ((cleanId === '4' || cleanId.includes('4호선')) && rowSubwayId === '1004') return true;
        if ((cleanId === '5' || cleanId.includes('5호선')) && rowSubwayId === '1005') return true;
        if ((cleanId === '6' || cleanId.includes('6호선')) && rowSubwayId === '1006') return true;
        if ((cleanId === '7' || cleanId.includes('7호선')) && rowSubwayId === '1007') return true;
        if ((cleanId === '8' || cleanId.includes('8호선')) && rowSubwayId === '1008') return true;
        if ((cleanId === '9' || cleanId.includes('9호선')) && rowSubwayId === '1009') return true;
        if ((cleanId.includes('수인분당') || cleanId.includes('분당선')) && rowSubwayId === '1075') return true;
        if (cleanId.includes('신분당') && rowSubwayId === '1077') return true;
        if ((cleanId.includes('경의중앙') || cleanId.includes('경의선')) && rowSubwayId === '1063') return true;
        if (cleanId.includes('공항철도') && rowSubwayId === '1065') return true;

        return false;
      });
    }

    // 요청된 wayCode 방향과 일치하는 열차만 필터링 ('1': 상행/내선, '2': 하행/외선)
    if (wayCode) {
      rows = rows.filter((row) => {
        const lineStr = String(row.updnLine || '');
        const isUpLine =
          lineStr === '상행' ||
          lineStr === '0' ||
          lineStr.includes('상선') ||
          lineStr.includes('내선') ||
          lineStr.includes('서울') ||
          lineStr.includes('청량리');
        const trainWayCode = isUpLine ? '1' : '2';
        return trainWayCode === wayCode;
      });
    }

    // 하차역(destination) 지정 시 도달 가능 여부(canBoard) 사전 판별
    const reachableMap = new Map<SubwayRawRow, boolean>();
    if (destination) {
      for (const row of rows) {
        const canReach = isStationReachableOnLine(
          String(row.subwayId || subwayId || ''),
          cleanStation,
          destination,
          row.trainLineNm,
          row.updnLine
        );
        reachableMap.set(row, canReach);
      }

      // 목적지에 도달 가능한 열차가 1개 이상 존재하면, 도달 가능한 열차만 선별
      const reachableRows = rows.filter((r) => reachableMap.get(r) === true);
      if (reachableRows.length > 0) {
        rows = reachableRows;
      }
    }

    // ─ 유효 결과 없음 → 2차/3차 Fallback ─
    if (rows.length === 0) {
      return fallbackToTotalOrTimetable(cleanStation, wayCode);
    }

    // ─ ETA 및 메타데이터 계산 (병렬 처리) ─
    const processedArrivalsRaw = await Promise.all(
      rows.map(async (row) => {
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

        const { destination: destName, isExpress: isMetaExpress } = extractTrainMetadata(row.trainLineNm);
        const isExpress =
          isMetaExpress ||
          row.btrainSttus === '급행' ||
          row.btrainSttus === '특급' ||
          String(row.trainLineNm || '').includes('급행') ||
          String(row.trainLineNm || '').includes('(급)');

        const canBoard = destination ? (reachableMap.get(row) ?? true) : true;

        return {
          subwayId: String(row.subwayId || ''),
          updnLine: lineName,
          trainNo,
          statnNm: cleanStation,
          arvlMsg2: liveMsg,
          recptnDt: recTime,
          trainLineNm: row.trainLineNm,
          ...eta,
          isRealtime: true,
          canBoard,
          destinationStationNm: destName || undefined,
          isExpress,
        };
      })
    );

    // 지나간 열차(isPassed === true) 제외
    const validArrivals = processedArrivalsRaw.filter(
      (item) => !item.isPassed
    ) as SubwayArrival[];

    // 모든 실시간 열차가 지나쳤으면 Fallback으로 자동 전환
    if (validArrivals.length === 0) {
      return fallbackToTotalOrTimetable(cleanStation, wayCode);
    }

    // 1차: canBoard(직통 가능 여부: true 우선), 2차: arrivalPriority, 3차: minutesLeft 정렬
    validArrivals.sort((a, b) => {
      const cbA = a.canBoard !== false ? 1 : 0;
      const cbB = b.canBoard !== false ? 1 : 0;
      if (cbA !== cbB) return cbB - cbA; // true(1)가 false(0)보다 우선

      const pA = a.arrivalPriority ?? (a.isApproaching ? 1 : 10 + (a.minutesLeft || 0));
      const pB = b.arrivalPriority ?? (b.isApproaching ? 1 : 10 + (b.minutesLeft || 0));
      if (pA !== pB) return pA - pB;
      return (a.minutesLeft || 0) - (b.minutesLeft || 0);
    });

    return validArrivals;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      console.warn(`[subwayRealtimeService] 타임아웃: ${cleanStation} 실시간 정보 조회 초과`);
    } else {
      console.error(`[subwayRealtimeService] 오류 (역: ${cleanStation}):`, error);
    }

    // 오류 발생 시에도 Fallback으로 서비스 연속성 유지
    return fallbackToTotalOrTimetable(cleanStation, wayCode);
  } finally {
    clearTimeout(timeoutId);
  }
}

