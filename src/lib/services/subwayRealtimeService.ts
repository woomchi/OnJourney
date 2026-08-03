/**
 * @fileoverview 지하철 실시간 도착 정보 서비스
 *
 * 서울시 공공 API(swopenAPI)에서 실시간 열차 도착 정보를 조회하고,
 * API 키 미설정·오류·빈 결과 등 모든 경우에 시간표 Fallback으로 대응합니다.
 *
 * 처리 흐름:
 * 1. API 키 없음 → 시간표 기반 Fallback
 * 2. API 호출 → XML 파싱 → 만료 데이터 필터
 * 3. 결과 없음 / 오류 → 시간표 기반 Fallback
 * 4. 정상 결과 → ETA 계산 → 정렬
 */

import { XMLParser } from 'fast-xml-parser';
import {
  calculateSubwayETADynamic,
  calculateNextTrainFromTimetable,
} from '@/lib/subwayService';
import { SubwayRealtimeQueryType } from '../validations/subway';
import type { SubwayArrival } from '@/types/journey';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 서울시 지하철 실시간 API 캐시 재검증 주기 (초) */
const REALTIME_REVALIDATE_SECONDS = 15;

/** 실시간 데이터 수신 후 유효 시간 (밀리초, 90초) */
const STALE_DATA_THRESHOLD_MS = 90_000;

/** arvlCd = '2'는 '운행 종료'를 의미하여 필터링 대상 */
const ARRIVAL_CODE_ENDED = '2';

/** arvlCd = '0' 또는 '1'은 '진입/도착'으로 수신 시각 기반 만료 검증 필요 */
const ARRIVAL_CODES_APPROACHING = new Set(['0', '1']);

/** API 호출 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 5_000;

// ─── 로컬 타입 ─────────────────────────────────────────────────────────────────

/** 서울시 실시간 API XML row의 최소 필드 타입 */
interface SubwayRawRow {
  subwayId?: string | number;
  updnLine?: string;
  btrainNo?: string | number;
  trainNo?: string | number;
  arvlMsg2?: string;
  recptnDt?: string;
  barvlDt?: number;
  arvlCd?: string | number;
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * updnLine(방향) 정보를 기반으로 시간표 Fallback 결과를 생성합니다.
 *
 * 세 곳(API 키 없음, 빈 결과, 오류)에서 동일하게 필요하던 중복 블록을 단일 함수로 추출합니다.
 *
 * @param cleanStation 정규화된 역명 (접미사 '역' 제거)
 * @param wayCode      방향 코드 ('1': 상행, 그 외: 하행)
 * @returns 시간표 기반 도착 정보 배열, 다음 열차가 없으면 빈 배열
 */
async function buildTimetableFallback(
  cleanStation: string,
  wayCode?: string
): Promise<SubwayArrival[]> {
  if (!wayCode) return [];

  const updnLine = wayCode === '1' ? '상행' : '하행';
  const nextTrain = await calculateNextTrainFromTimetable(cleanStation, updnLine);

  if (!nextTrain) return [];

  return [
    {
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
    },
  ];
}

/**
 * 실시간 API row가 만료된 데이터인지 판별합니다.
 *
 * - arvlCd = '2' → 운행 종료, 항상 제외
 * - arvlCd = '0' | '1' → 수신 후 90초 초과 시 만료로 간주
 */
function isStaleRow(row: SubwayRawRow, currentTimeMs: number): boolean {
  const arvlCd = String(row.arvlCd || '');

  if (arvlCd === ARRIVAL_CODE_ENDED) return true;

  if (ARRIVAL_CODES_APPROACHING.has(arvlCd)) {
    const recptnDt = String(row.recptnDt || '');
    if (recptnDt) {
      try {
        const receiptTimeMs = new Date(recptnDt.replace(' ', 'T')).getTime();
        if (!isNaN(receiptTimeMs) && currentTimeMs - receiptTimeMs > STALE_DATA_THRESHOLD_MS) {
          return true;
        }
      } catch {
        // 날짜 파싱 실패 시 만료로 처리하지 않음
      }
    }
  }

  return false;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 역명으로 지하철 실시간 도착 정보를 조회합니다.
 *
 * 실시간 데이터 수신 불가 시 정적 시간표 기반 Fallback을 반환하며,
 * 절대로 빈 배열 이외의 에러를 외부로 던지지 않습니다.
 *
 * @param params.station 역명 (예: '강남역' 또는 '강남')
 * @param params.wayCode 방향 코드 ('1': 상행, '2': 하행)
 */
export async function fetchSubwayRealtime(
  params: SubwayRealtimeQueryType
): Promise<SubwayArrival[]> {
  const { station, wayCode } = params;
  const apiKey = process.env.REAL_TIME_SEOUL_SUBWAY_API_KEY;
  const cleanStation = station.replace(/역$/, '').trim();

  // ─ API 키 미설정 → 시간표 Fallback ─
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    return buildTimetableFallback(cleanStation, wayCode);
  }

  const url =
    `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/xml/realtimeStationArrival` +
    `/0/20/${encodeURIComponent(cleanStation)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      next: { revalidate: REALTIME_REVALIDATE_SECONDS },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`서울시 지하철 API 오류 응답: ${response.status}`);
    }

    const xmlData = await response.text();

    // API 키 오류 또는 한도 초과 응답은 에러로 처리
    if (
      xmlData.includes('RESULT.LIMIT_TO_OVER_ERROR') ||
      xmlData.includes('KEY형식오류') ||
      xmlData.includes('인증키가 유효하지 않습니다')
    ) {
      throw new Error('서울시 지하철 API 키 오류 또는 한도 초과');
    }

    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });
    const parsed = parser.parse(xmlData) as {
      realtimeStationArrival?: { row?: SubwayRawRow | SubwayRawRow[] };
    };

    const rawRows = parsed?.realtimeStationArrival?.row;
    let rows: SubwayRawRow[] = [];
    if (rawRows) {
      rows = Array.isArray(rawRows) ? rawRows : [rawRows];
    }

    // 만료 데이터 필터링
    const currentTimeMs = Date.now();
    rows = rows.filter((row) => !isStaleRow(row, currentTimeMs));

    // ─ 유효 결과 없음 → 시간표 Fallback ─
    if (rows.length === 0) {
      return buildTimetableFallback(cleanStation, wayCode);
    }

    // ─ ETA 계산 (병렬 처리) ─
    const processedArrivals = await Promise.all(
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
          String(row.subwayId || '')
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
        } satisfies SubwayArrival;
      })
    );

    // 접근 중인 열차 우선, 이후 minutesLeft 오름차순 정렬
    processedArrivals.sort((a, b) => {
      if (a.isApproaching && !b.isApproaching) return -1;
      if (!a.isApproaching && b.isApproaching) return 1;
      return a.minutesLeft - b.minutesLeft;
    });

    return processedArrivals;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      console.warn(`[subwayRealtimeService] 타임아웃: ${cleanStation} 실시간 정보 조회 초과`);
    } else {
      console.error(`[subwayRealtimeService] 오류 (역: ${cleanStation}):`, error);
    }

    // 오류 발생 시에도 시간표 Fallback으로 서비스 연속성 유지
    return buildTimetableFallback(cleanStation, wayCode);
  } finally {
    clearTimeout(timeoutId);
  }
}
