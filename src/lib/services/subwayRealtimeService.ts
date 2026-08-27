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
} from '@/lib/services/subwayService';
import { SubwayRealtimeQueryType } from '../validations/subway';
import type { SubwayArrival, SubwayPosition } from '@/types/journey';
import { getStationArrivalsFromTotalCache } from './subwayTotalRealtimeService';
import { fetchSubwayPositionsByLine } from './subwayPositionService';
import { fetchDaejeonSubwayArrivals } from './daejeonSubwayService';
import { detectSubwayRegion } from './subwayRegionRouter';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import { isMatchingSubwayId, resolveWayCode, resolvePositionDirection } from '@/lib/constants/subwayLineMap';
import { resolveSeoulApiStationName } from '@/lib/constants/subwayStationAliases';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 서울시 지하철 실시간 API 캐시 재검증 주기 (초) */
const REALTIME_REVALIDATE_SECONDS = 5;

/** '진입/도착' 상태 데이터 수신 후 유효 시간 (밀리초, 180초 = 3분) */
const STALE_APPROACHING_THRESHOLD_MS = 180_000;

/** 일반 운행 상태 데이터 수신 후 유효 시간 (밀리초, 720초 = 12분, 심야 및 코레일/외곽 장거리 배차 구간 고려) */
const STALE_RUNNING_THRESHOLD_MS = 720_000;

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
 * 2차 Fallback(일괄 API 캐시) ➡️ 3차 Fallback(ODsay 시간표)을 순차적으로 시도합니다.
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

/** '당역 출발' 상태 데이터 수신 후 유효 시간 (밀리초, 30초) */
const STALE_DEPARTED_THRESHOLD_MS = 30_000;

/**
 * 실시간 API row가 만료된 데이터인지 판별합니다.
 */
export function isStaleRow(row: SubwayRawRow, currentTimeMs: number): boolean {
  const arvlCd = String(row.arvlCd ?? '');
  const arvlMsg2 = String(row.arvlMsg2 ?? '');

  const isDeparted =
    arvlCd === ARRIVAL_CODE_ENDED ||
    arvlMsg2.includes('당역 출발') ||
    arvlMsg2.includes('당역출발') ||
    arvlMsg2 === '출발';

  // recptnDt 수신 시각 기반 유효시간 정밀 검증
  const recptnDt = String(row.recptnDt || '');
  if (recptnDt) {
    try {
      const receiptTimeMs = parseSeoulApiDate(recptnDt);
      if (!isNaN(receiptTimeMs)) {
        const elapsedMs = currentTimeMs - receiptTimeMs;

        // 1. 이미 출발한 열차: 수신 후 30초 초과 시 완전 만료 처리
        if (isDeparted) {
          return elapsedMs > STALE_DEPARTED_THRESHOLD_MS;
        }

        // 2. 당역 진입/도착: 3분(180초) 초과 시 만료 처리
        const isApproachingOrArrived =
          ARRIVAL_CODES_APPROACHING.has(arvlCd) ||
          arvlMsg2.includes('당역 진입') ||
          arvlMsg2.includes('당역 도착') ||
          arvlMsg2 === '진입' ||
          arvlMsg2 === '도착';

        const thresholdMs = isApproachingOrArrived
          ? STALE_APPROACHING_THRESHOLD_MS
          : STALE_RUNNING_THRESHOLD_MS;

        if (elapsedMs > thresholdMs) {
          return true;
        }
      }
    } catch {
      // 날짜 파싱 실패 시 기본 로직
    }
  } else if (isDeparted) {
    // 수신 시각이 없는데 출발 상태인 경우 즉시 만료 처리
    return true;
  }

  return false;
}

function getSubwayApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey =
    env.REAL_TIME_SUBWAY_API_KEY ||
    env.REAL_TIME_SEOUL_SUBWAY_API_KEY ||
    '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

/**
 * 열차 번호의 다양한 표기 형태(예: 'K1234', '1234', '001234', '042')를 모두 추출하여 일치 확률을 극대화합니다.
 */
export function getTrainNoVariations(rawNo: string | number | undefined): string[] {
  if (rawNo === undefined || rawNo === null) return [];
  const clean = String(rawNo).trim();
  if (!clean) return [];

  const variations = new Set<string>();
  variations.add(clean);

  // 1. 앞자리 0 제거 (e.g. '001234' -> '1234')
  const noLeadingZeros = clean.replace(/^0+/, '');
  if (noLeadingZeros) variations.add(noLeadingZeros);

  // 2. 영문 접두사 제거 (e.g. 'K1234' -> '1234', 'S052' -> '52')
  const noAlpha = clean.replace(/^[A-Za-z]+/, '');
  if (noAlpha) {
    variations.add(noAlpha);
    const noAlphaNoZero = noAlpha.replace(/^0+/, '');
    if (noAlphaNoZero) variations.add(noAlphaNoZero);
  }

  // 3. 숫자 부분만 4자리 패딩 (e.g. '42' -> '0042')
  const digitsOnly = clean.replace(/\D/g, '');
  if (digitsOnly) {
    variations.add(digitsOnly);
    const digitsNoZero = digitsOnly.replace(/^0+/, '');
    if (digitsNoZero) variations.add(digitsNoZero);
    if (digitsOnly.length <= 4) {
      variations.add(digitsOnly.padStart(4, '0'));
    }
  }

  return Array.from(variations);
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 역명으로 지하철 실시간 도착 정보를 조회합니다.
 *
 * 지역 라우팅 체계:
 * - 대전(daejeon): 대전교통공사 열차시각표 서비스(DaejeonSubwayService) ➡️ ODsay Fallback
 * - 부산/대구/광주: ODsay 시간표 Fallback
 * - 수도권(seoul): 서울시 실시간 API ➡️ 2차 일괄 캐시 ➡️ ODsay Fallback
 */
export async function fetchSubwayRealtime(
  params: SubwayRealtimeQueryType
): Promise<SubwayArrival[]> {
  const { station, wayCode, subwayId, destination, headsign } = params;
  const cleanStation = station.replace(/역$/, '').trim();

  // ─ 1. 지역 감지 및 라우팅 ─
  const region = detectSubwayRegion({
    station: cleanStation,
    subwayId,
    destination,
    headsign,
  });

  // 1-1. 대전 도시철도 전용 분기
  if (region === 'daejeon') {
    try {
      const daejeonArrivals = await fetchDaejeonSubwayArrivals(cleanStation, wayCode);
      if (daejeonArrivals && daejeonArrivals.length > 0) {
        return daejeonArrivals;
      }
    } catch (e) {
      console.warn(`[subwayRealtimeService] 대전 시각표 조회 실패 (${cleanStation}):`, e);
    }
    return buildTimetableFallback(cleanStation, wayCode);
  }

  // 1-2. 부산 / 대구 / 광주 등 기타 지방 도시철도 (ODsay 시간표 Fallback)
  if (region === 'busan' || region === 'daegu' || region === 'gwangju') {
    return buildTimetableFallback(cleanStation, wayCode);
  }

  // ─ 2. 수도권(seoul / unknown) 실시간 API 조회 ─
  const apiKey = getSubwayApiKey();

  // API 키 미설정 → 2차/3차 Fallback
  if (!apiKey || apiKey === 'PLACEHOLDER' || apiKey.trim() === '') {
    return fallbackToTotalOrTimetable(cleanStation, wayCode);
  }

  const apiStationName = resolveSeoulApiStationName(cleanStation, subwayId);
  const url =
    `http://swopenAPI.seoul.go.kr/api/subway/${apiKey}/json/realtimeStationArrival` +
    `/0/20/${encodeURIComponent(apiStationName)}`;

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

    // 1. 만료된 데이터(수신 시각 초과 또는 출발 완료 열차) 1차 필터링
    const now = timeOffsetManager.getSynchronizedNow();
    rows = rows.filter((row) => !isStaleRow(row, now));

    // 2. 요청된 subwayId가 지정된 경우, 환승역 타 노선 데이터 혼선을 방지하기 위해 노선 필터링
    if (subwayId) {
      rows = rows.filter((row) => isMatchingSubwayId(row.subwayId, subwayId));
    }

    // 3. 하차역(destination) 지정 시 도달 가능 여부(canBoard) 사전 판별
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

    // 4. 요청된 wayCode 방향과 일치하는 열차만 엄격 필터링 ('1': 상행/내선, '2': 하행/외선)
    if (wayCode) {
      rows = rows.filter((row) => resolveWayCode(row.updnLine) === wayCode);
    }

    // ─ 실시간 열차 위치 정보 조회 (해당 노선) 및 방향 복합키 Map 빌드 ─
    // Key: `${posDirection}_${trainNo}` 및 열차 번호 단독 키
    let positionMap = new Map<string, SubwayPosition>();
    try {
      const targetSubwayId = subwayId || (rows[0] ? String(rows[0].subwayId || '') : '');
      if (targetSubwayId) {
        const positions = await fetchSubwayPositionsByLine(targetSubwayId);
        for (const pos of positions) {
          if (pos.trainNo) {
            const dir = String(pos.updnLine ?? '0'); // '0': 상행/내선, '1': 하행/외선
            const variations = getTrainNoVariations(pos.trainNo);

            for (const v of variations) {
              positionMap.set(`${dir}_${v}`, pos);
              // 방향 무관 Fallback 매핑 (해당 열차 번호가 이미 없을 때만 저장)
              if (!positionMap.has(v)) {
                positionMap.set(v, pos);
              }
            }
          }
        }
      }
    } catch {
      // 위치 정보 조회 실패 시 기본 도착 정보만으로 계속 진행
    }

    // ─ 유효 결과 없음 → 2차/3차 Fallback ─
    if (rows.length === 0) {
      return fallbackToTotalOrTimetable(cleanStation, wayCode);
    }

    // ─ ETA 및 메타데이터 계산 ─
    const processedArrivalsRaw = rows.map((row) => {
      const liveMsg = String(row.arvlMsg2 || '');
      const recTime = String(row.recptnDt || '');
      const lineName = String(row.updnLine || '');
      const trainNo = String(row.btrainNo || row.trainNo || '');
      const barvlDt = Number(row.barvlDt || 0);

      // 위치 API 조인 (방향 + trainNo 복합키 기준 및 다양한 변형 형태 탐색)
      const rowPosDir = resolvePositionDirection(row.updnLine); // '0': 상행/내선, '1': 하행/외선
      const trainNoVars = getTrainNoVariations(trainNo);

      let matchedPos: SubwayPosition | undefined = undefined;
      // 1. 방향 일치 우선 탐색
      for (const v of trainNoVars) {
        matchedPos = positionMap.get(`${rowPosDir}_${v}`);
        if (matchedPos) break;
      }
      // 2. 방향 무관 열차번호 단독 탐색
      if (!matchedPos) {
        for (const v of trainNoVars) {
          matchedPos = positionMap.get(v);
          if (matchedPos) break;
        }
      }

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
        row.btrainSttus,
        matchedPos?.statnNm
      );

      const { destination: destName, isExpress: isMetaExpress } = extractTrainMetadata(row.trainLineNm);
      const isExpress =
        isMetaExpress ||
        matchedPos?.isExpress ||
        row.btrainSttus === '급행' ||
        String(row.trainLineNm || '').includes('급행') ||
        String(row.trainLineNm || '').includes('(급)');

      const canBoard = destination ? (reachableMap.get(row) ?? true) : true;

      // 위치 API가 직접 매칭되지 않아도 도착 정보(arvlCd)를 기반으로 상태를 상호 보완한 position 객체 구성
      const resolvedPosition: SubwayPosition | undefined =
        matchedPos ||
        (row.arvlCd !== undefined && trainNo
          ? {
              subwayId: String(row.subwayId || ''),
              subwayNm: '',
              statnId: '',
              statnNm: cleanStation,
              trainNo,
              recptnDt: recTime,
              updnLine: rowPosDir,
              statnTnm: destName || undefined,
              trainSttus: String(row.arvlCd ?? '99'),
              directAt: isExpress ? '1' : '0',
              isExpress,
            }
          : undefined);

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
        currentTrainPosition: resolvedPosition,
      };
    });

    // 지나간 열차(isPassed === true) 제외
    const validArrivals = processedArrivalsRaw.filter(
      (item) => !item.isPassed
    ) as SubwayArrival[];

    // 모든 실시간 열차가 지나쳤으면 Fallback으로 자동 전환
    if (validArrivals.length === 0) {
      return fallbackToTotalOrTimetable(cleanStation, wayCode);
    }

    // 1차: canBoard(직통 가능 여부: true 우선), 2차: arrivalPriority, 3차: minutesLeft, 4차: 급행 우선
    validArrivals.sort((a, b) => {
      const cbA = a.canBoard !== false ? 1 : 0;
      const cbB = b.canBoard !== false ? 1 : 0;
      if (cbA !== cbB) return cbB - cbA; // true(1)가 false(0)보다 우선

      const pA = a.arrivalPriority ?? (a.isApproaching ? 1 : 10 + (a.minutesLeft || 0));
      const pB = b.arrivalPriority ?? (b.isApproaching ? 1 : 10 + (b.minutesLeft || 0));
      if (pA !== pB) return pA - pB;

      const minA = a.minutesLeft || 0;
      const minB = b.minutesLeft || 0;
      if (minA !== minB) return minA - minB;

      // 동일 ETA일 경우 급행(isExpress) 우선
      if (a.isExpress && !b.isExpress) return -1;
      if (!a.isExpress && b.isExpress) return 1;

      return 0;
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

