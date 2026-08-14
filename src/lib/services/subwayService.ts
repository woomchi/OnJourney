/**
 * @fileoverview 지하철 관련 서비스 (역 조회, 소요 시간 계산, 실시간 ETA)
 *
 * ODsay API(#12 searchSubwaySchedule, #10 subwayStationInfo, #14 searchStation)를 통해
 * 전국 전체 지하철 노선(수도권, 신분당선, 지방 광역시)의 정적/실시간 시간표와 스케줄을 조회합니다.
 * 네트워크 장애 시 로컬 JSON (서울교통공사_역간거리.json)을 보조 Fallback으로 사용합니다.
 */

import fs from 'fs';
import path from 'path';
import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';

// ─── 상수 ────────────────────────────────────────────────────────────────────

/** 자정 기준 총 초 수 (시간표 롤오버 보정용) */
const MIDNIGHT_SECONDS = 24 * 3_600;

/** 통합 역간 거리 JSON 파일명 (1~9호선 + 코레일 전구간 통합) */
const STATION_DISTANCE_UNIFIED_FILENAME = '지하철_통합_역간거리.json';
const STATION_DISTANCE_FALLBACK_FILENAME = '서울교통공사_역간거리.json';

/** 역간 거리 JSON 경로 */
const STATION_DISTANCE_UNIFIED_FILEPATH = path.join(process.cwd(), 'data', STATION_DISTANCE_UNIFIED_FILENAME);
const STATION_DISTANCE_FALLBACK_FILEPATH = path.join(process.cwd(), 'data', STATION_DISTANCE_FALLBACK_FILENAME);

/** 타임테이블 캐시 유효 시간 (3시간) */
const TIMETABLE_CACHE_TTL_MS = 3 * 3_600 * 1_000;

/** 타임테이블 API 에러 시 재호출 방지 캐시 유효 시간 (5분) */
const TIMETABLE_ERROR_CACHE_TTL_MS = 5 * 60 * 1_000;

/** 코레일 등 barvlDt 없는 노선의 기본 Fallback 소요 시간 (초/역) */
const FALLBACK_SECONDS_PER_STATION = 120;

/** barvlDt 없는 노선의 기본 Fallback 시간 (분) */
const FALLBACK_DEFAULT_MINUTES = 99;

// ─── 로컬 타입 정의 ──────────────────────────────────────────────────────────

/** 지하철 역간거리 데이터 단일 행 타입 */
interface StationDistanceRow {
  sbwy_rout_ln: string | number; // 호선 번호 또는 노선명 (예: 1, 2, '1063', '수인분당선')
  sbwy_stns_nm: string;          // 역명 (예: '강남역', '수원')
  hm: string;                    // 전역과의 소요 시간 (형식: "M:SS")
  dist_km?: number;              // 역간 거리 (km)
  acml_dist?: number;            // 누적 거리 (km)
}

/** 역간 거리 JSON 루트 타입 */
interface StationDistanceDb {
  DATA: StationDistanceRow[];
}

/** 시간표 API 단일 아이템 타입 */
export interface ScheduleItem {
  trainNo: string | number;
  depTime?: string | number;
  arrTime?: string | number;
  endSubwayStationNm?: string;
  isExpress?: boolean;
}

/** calculateSubwayETADynamic 반환 타입 */
export interface SubwayEtaResult {
  statusText: string;
  minutesLeft: number;
  arrivalTime: string;
  isApproaching: boolean;
  isPassed?: boolean;
}

// ─── 메모리 캐시 ─────────────────────────────────────────────────────────────

/** 역명 → ODsay Station ID 캐시 (중복 API 호출 방지) */
const stationIdCache: Record<string, string> = {};

/** 역간 거리 JSON 파일 캐시 (프로세스 생애주기 동안 유지) */
let stationDistanceDb: StationDistanceDb | null = null;

/** 시간표 캐시 (역명_방향 → { expires, schedule }) */
const timetableCache = new Map<string, { expires: number; schedule: ScheduleItem[] }>();

/**
 * 만료된 시간표 캐시 항목을 정리합니다.
 */
function pruneExpiredTimetableCache(): void {
  const now = Date.now();
  for (const [key, value] of timetableCache.entries()) {
    if (value.expires < now) {
      timetableCache.delete(key);
    }
  }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 역간 거리 DB를 로드합니다. (통합 데이터셋 우선, 부재 시 서울교통공사 원본 fallback)
 */
function getStationDistanceDb(): StationDistanceDb | null {
  if (stationDistanceDb) return stationDistanceDb;

  try {
    const targetPath = fs.existsSync(STATION_DISTANCE_UNIFIED_FILEPATH)
      ? STATION_DISTANCE_UNIFIED_FILEPATH
      : fs.existsSync(STATION_DISTANCE_FALLBACK_FILEPATH)
      ? STATION_DISTANCE_FALLBACK_FILEPATH
      : null;

    if (!targetPath) return null;
    const fileContent = fs.readFileSync(targetPath, 'utf-8');
    stationDistanceDb = JSON.parse(fileContent) as StationDistanceDb;
    return stationDistanceDb;
  } catch (e) {
    console.error('[subwayService] 역간 거리 JSON 로드 실패:', e);
    return null;
  }
}

/**
 * "M:SS" 형식의 문자열을 초(seconds)로 변환합니다.
 */
function parseMinSecToSeconds(hmStr: string): number {
  if (!hmStr) return 0;
  const [m = 0, s = 0] = hmStr.split(':').map(Number);
  return m * 60 + s;
}

/**
 * 시간 문자열("HH:mm:ss", "HH:mm", "HHMMSS" 등)을 자정 기준 총 초로 변환합니다.
 */
function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;

  if (!timeStr.includes(':') && timeStr.length >= 6) {
    const h = parseInt(timeStr.substring(0, 2), 10);
    const m = parseInt(timeStr.substring(2, 4), 10);
    const s = parseInt(timeStr.substring(4, 6), 10);
    return h * 3_600 + m * 60 + s;
  }

  const [h = 0, m = 0, s = 0] = timeStr.split(':').map(Number);
  return h * 3_600 + m * 60 + s;
}

/**
 * subwayId 또는 노선명을 바탕으로 매칭 가능한 노선 코드/이름 목록을 반환합니다.
 */
function resolveCandidateLineCodes(subwayId: string): string[] {
  const cleanId = String(subwayId || '').trim();

  // 1호선
  if (cleanId === '1001' || cleanId === '1' || cleanId.includes('1호선')) {
    return ['1', '1001', '1001_경부', '1001_경인', '1001_경원', '1001_장항', '1호선_경부선', '1호선_경인선', '1호선_장항선', '1호선_경원선', '경원선'];
  }
  // 2호선
  if (cleanId === '1002' || cleanId === '2' || cleanId.includes('2호선')) {
    return ['2', '1002'];
  }
  // 3호선
  if (cleanId === '1003' || cleanId === '3' || cleanId.includes('3호선')) {
    return ['3', '1003', '3호선_일산선', '1003_일산', '일산선'];
  }
  // 4호선
  if (cleanId === '1004' || cleanId === '4' || cleanId.includes('4호선')) {
    return ['4', '1004', '4호선_과천안산선', '1004_과천안산', '과천선', '안산선'];
  }
  // 5호선
  if (cleanId === '1005' || cleanId === '5' || cleanId.includes('5호선')) {
    return ['5', '1005'];
  }
  // 6호선
  if (cleanId === '1006' || cleanId === '6' || cleanId.includes('6호선')) {
    return ['6', '1006'];
  }
  // 7호선
  if (cleanId === '1007' || cleanId === '7' || cleanId.includes('7호선')) {
    return ['7', '1007'];
  }
  // 8호선
  if (cleanId === '1008' || cleanId === '8' || cleanId.includes('8호선')) {
    return ['8', '1008'];
  }
  // 9호선
  if (cleanId === '1009' || cleanId === '9' || cleanId.includes('9호선')) {
    return ['9', '1009'];
  }
  // 경의중앙선
  if (cleanId === '1063' || cleanId.includes('경의중앙') || cleanId.includes('경의선') || cleanId.includes('중앙선')) {
    return ['1063', '경의중앙선', '경의선', '중앙선'];
  }
  // 경춘선
  if (cleanId === '1067' || cleanId.includes('경춘')) {
    return ['1067', '경춘선'];
  }
  // 수인분당선
  if (cleanId === '1075' || cleanId.includes('수인분당') || cleanId.includes('분당선') || cleanId.includes('수인선')) {
    return ['1075', '수인분당선', '분당선', '수인선'];
  }
  // 경강선
  if (cleanId === '1081' || cleanId.includes('경강')) {
    return ['1081', '경강선'];
  }
  // 서해선
  if (cleanId === '1093' || cleanId.includes('서해')) {
    return ['1093', '서해선'];
  }

  // 기본 단일 호선 번호 추출 시도
  if (cleanId.startsWith('100')) {
    return [cleanId.substring(3), cleanId];
  }
  return [cleanId];
}

/**
 * 역명에서 "역" 접미사를 제거하고 공백을 정리합니다.
 */
function normalizeStationName(name: string): string {
  return name.replace(/역$/, '').trim();
}

/**
 * updnLine 문자열에서 상행/하행 방향 코드를 반환합니다.
 * @returns '1' (상행) | '2' (하행)
 */
function resolveUpDownTypeCode(updnLine: string): '1' | '2' {
  const isUpLine =
    updnLine === '상행' ||
    updnLine?.includes('상선') ||
    updnLine?.includes('내선') ||
    updnLine?.includes('서울') ||
    updnLine?.includes('청량리');
  return isUpLine ? '1' : '2';
}

/**
 * ODsay searchSubwaySchedule의 시간 노드 리스트를 ScheduleItem 구조체 배열로 파싱합니다.
 */
function parseOdsaySubwayTimeList(timeNodes: any[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  if (!Array.isArray(timeNodes)) return items;

  for (const node of timeNodes) {
    const hour = Number(node.Idx || node.idx);
    if (isNaN(hour)) continue;

    // 일반 열차 시간 리스트 (예: "03(성수) 15(신창) 27(천안)")
    const rawList = String(node.list || '').trim();
    if (rawList) {
      const tokens = rawList.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const match = tok.match(/^(\d+)(?:\(([^)]+)\))?/);
        if (match) {
          const min = parseInt(match[1], 10);
          const dest = match[2] ? match[2].trim() : '';
          const hourStr = String(hour % 24).padStart(2, '0');
          const minStr = String(min).padStart(2, '0');
          const timeStr = `${hourStr}:${minStr}:00`;
          items.push({
            trainNo: `ODS-${hourStr}${minStr}`,
            depTime: timeStr,
            arrTime: timeStr,
            endSubwayStationNm: dest ? (dest.endsWith('역') ? dest : `${dest}역`) : '방면',
            isExpress: false,
          });
        }
      }
    }

    // 급행 열차 시간 리스트
    const rawExpList = String(node.expList || '').trim();
    if (rawExpList) {
      const tokens = rawExpList.split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        const match = tok.match(/^(\d+)(?:\(([^)]+)\))?/);
        if (match) {
          const min = parseInt(match[1], 10);
          const dest = match[2] ? match[2].trim() : '';
          const hourStr = String(hour % 24).padStart(2, '0');
          const minStr = String(min).padStart(2, '0');
          const timeStr = `${hourStr}:${minStr}:00`;
          items.push({
            trainNo: `EXP-${hourStr}${minStr}`,
            depTime: timeStr,
            arrTime: timeStr,
            endSubwayStationNm: dest ? (dest.endsWith('역') ? dest : `${dest}(급행)`) : '급행',
            isExpress: true,
          });
        }
      }
    }
  }

  return items;
}

// ─── 공개 유틸리티 ───────────────────────────────────────────────────────────

/**
 * 통합 DB(지하철_통합_역간거리.json)를 이용하여
 * 동일 노선의 두 역 사이 소요 시간(초)을 계산합니다 (Fallback용).
 */
export function calculateTimeBetweenStations(
  subwayId: string,
  currentStation: string,
  targetStation: string,
  updnLine?: string
): number | null {
  const db = getStationDistanceDb();
  if (!db?.DATA) return null;

  const candidateCodes = resolveCandidateLineCodes(subwayId);
  if (candidateCodes.length === 0) return null;

  const cleanCurrent = normalizeStationName(currentStation);
  const cleanTarget = normalizeStationName(targetStation);
  const normalize = (nm: string) => nm.replace(/역$/, '').trim();

  // 각 후보 노선 그룹별로 current와 target 역이 모두 포함된 서브라인 탐색
  for (const lineCode of candidateCodes) {
    const lineStations = db.DATA.filter(
      (row) => String(row.sbwy_rout_ln) === lineCode
    );
    if (lineStations.length === 0) continue;

    const currentIdx = lineStations.findIndex(
      (row) => normalize(row.sbwy_stns_nm) === cleanCurrent
    );
    const targetIdx = lineStations.findIndex(
      (row) => normalize(row.sbwy_stns_nm) === cleanTarget
    );

    if (currentIdx !== -1 && targetIdx !== -1 && currentIdx !== targetIdx) {
      // 방향 검증 (updnLine이 제공된 경우)
      if (updnLine) {
        const wayCode = resolveUpDownTypeCode(updnLine);
        const isLine2 = lineCode === '2' || lineCode === '1002';

        if (isLine2) {
          // 2호선: '1'(내선/상행, 인덱스 증가 방향), '2'(외선/하행, 인덱스 감소 방향)
          if (wayCode === '1' && currentIdx > targetIdx) continue;
          if (wayCode === '2' && currentIdx < targetIdx) continue;
        } else {
          // 일반 노선 (1~9호선, 국철): Index 0=기점(상행측), Index N=종점(하행측)
          // '1'(상행): 종점 -> 기점 (currentIdx > targetIdx 이어야 전진)
          // '2'(하행): 기점 -> 종점 (currentIdx < targetIdx 이어야 전진)
          if (wayCode === '1' && currentIdx < targetIdx) continue;
          if (wayCode === '2' && currentIdx > targetIdx) continue;
        }
      }

      const startIdx = Math.min(currentIdx, targetIdx);
      const endIdx = Math.max(currentIdx, targetIdx);

      let totalSeconds = 0;
      for (let i = startIdx + 1; i <= endIdx; i++) {
        totalSeconds += parseMinSecToSeconds(lineStations[i].hm);
      }
      return totalSeconds;
    }
  }

  return null;
}

/**
 * 역명으로 ODsay 대중교통 정류장 검색 API(#14 searchStation)에서 지하철 Station ID를 조회합니다.
 */
export async function fetchStationId(stationName: string): Promise<string> {
  const cleanName = normalizeStationName(stationName);

  if (stationIdCache[cleanName]) {
    return stationIdCache[cleanName];
  }

  try {
    // stationClass='2' (ODsay 대중교통 정류장 검색에서 지하철 구분)
    const data = await OdsayAdapter.fetchSearchStation(cleanName, '2');
    const stations = data?.result?.station;

    let stationId = '';
    if (Array.isArray(stations) && stations.length > 0) {
      const matched =
        stations.find(
          (s: any) =>
            normalizeStationName(s.stationName) === cleanName
        ) ?? stations[0];
      stationId = String(matched.stationID);
    }

    if (stationId) {
      stationIdCache[cleanName] = stationId;
      return stationId;
    }

    throw new Error(`ODsay 역 ID를 찾을 수 없습니다: ${cleanName}`);
  } catch (err) {
    console.warn(`[subwayService] ${cleanName} ODsay 역 ID 조회 실패:`, err);
    throw err;
  }
}

/**
 * 현재 역과 목적 역의 ODsay 시간표를 조회하여 동적 이동 시간(초)을 계산합니다.
 */
export async function fetchDynamicTravelTimeSec(
  currentStation: string,
  targetStation: string,
  trainNo: string,
  updnLine: string
): Promise<number | null> {
  try {
    const [currentSchedule, targetSchedule] = await Promise.all([
      fetchAndCacheTimetable(currentStation, updnLine),
      fetchAndCacheTimetable(targetStation, updnLine),
    ]);

    if (!currentSchedule.length || !targetSchedule.length) return null;

    const currentTrain = currentSchedule.find(
      (it) => String(it.trainNo).trim() === String(trainNo).trim()
    );
    const targetTrain = targetSchedule.find(
      (it) => String(it.trainNo).trim() === String(trainNo).trim()
    );

    if (!currentTrain?.depTime || !targetTrain?.arrTime) return null;

    const depSec = timeToSeconds(String(currentTrain.depTime));
    const arrSec = timeToSeconds(String(targetTrain.arrTime));
    let diffSec = arrSec - depSec;

    // 자정 롤오버 보정 (예: 23:55 출발 → 00:05 도착)
    if (diffSec < 0) diffSec += MIDNIGHT_SECONDS;

    return diffSec;
  } catch {
    return null;
  }
}

/**
 * ODsay (신) 지하철역 전체 시간표 API(#12 searchSubwaySchedule)를 조회하고 3시간 캐시합니다.
 */
export async function fetchAndCacheTimetable(
  stationName: string,
  updnLine: string
): Promise<ScheduleItem[]> {
  pruneExpiredTimetableCache();

  const cleanName = normalizeStationName(stationName);
  const upDownTypeCode = resolveUpDownTypeCode(updnLine);
  const cacheKey = `${cleanName}_${upDownTypeCode}`;
  const now = Date.now();

  const cached = timetableCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.schedule;
  }

  try {
    const stationId = await fetchStationId(cleanName);
    const scheduleData = await OdsayAdapter.fetchSubwaySchedule(stationId, upDownTypeCode);
    const result = scheduleData?.result;

    if (!result) {
      timetableCache.set(cacheKey, { expires: now + TIMETABLE_ERROR_CACHE_TTL_MS, schedule: [] });
      return [];
    }

    const day = new Date().getDay();
    let dayListObj = result.WeekList;
    if (day === 0) dayListObj = result.SunList || result.WeekList;
    else if (day === 6) dayListObj = result.SatList || result.WeekList;

    const dirNode = upDownTypeCode === '1' ? dayListObj?.up : dayListObj?.down;
    const timeNodes = dirNode?.time ?? [];

    const schedule = parseOdsaySubwayTimeList(timeNodes);

    // 성공: 3시간 캐시
    timetableCache.set(cacheKey, { expires: now + TIMETABLE_CACHE_TTL_MS, schedule });
    return schedule;
  } catch (e) {
    console.warn(`[subwayService] ODsay 시간표 조회 실패 (${cleanName}):`, e);
    // 실패: 5분간 빈 배열 캐시
    timetableCache.set(cacheKey, { expires: now + TIMETABLE_ERROR_CACHE_TTL_MS, schedule: [] });
    return [];
  }
}

/**
 * 정적 시간표 캐시에서 다음 열차 도착 정보를 계산합니다.
 */
export async function calculateNextTrainFromTimetable(
  stationName: string,
  updnLine: string
): Promise<{
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
} | null> {
  const schedule = await fetchAndCacheTimetable(stationName, updnLine);
  if (!schedule || schedule.length === 0) return null;

  const now = new Date();
  const currentTotalSec = now.getHours() * 3_600 + now.getMinutes() * 60 + now.getSeconds();

  const upcoming = schedule
    .filter((it) => {
      if (!it.arrTime && !it.depTime) return false;
      const sec = timeToSeconds(String(it.arrTime || it.depTime));
      return sec >= currentTotalSec;
    })
    .sort(
      (a, b) =>
        timeToSeconds(String(a.arrTime || a.depTime)) -
        timeToSeconds(String(b.arrTime || b.depTime))
    );

  if (upcoming.length === 0) return null;

  const next = upcoming[0];
  const targetSec = timeToSeconds(String(next.arrTime || next.depTime));
  const diffSec = targetSec - currentTotalSec;
  const minutesLeft = Math.ceil(diffSec / 60);

  const h = Math.floor(targetSec / 3_600);
  const m = Math.floor((targetSec % 3_600) / 60);
  const arrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return {
    trainNo: String(next.trainNo),
    endSubwayStationNm: String(next.endSubwayStationNm || ''),
    minutesLeft,
    arrivalTime,
    statusText: `[시간표] ${String(next.endSubwayStationNm || '')} (${arrivalTime})`,
    isApproaching: false,
  };
}

import {
  parseSubwayArrivalMessage,
  extractCurrentStationRobust,
  extractRemainingStationsRobust,
} from './subwayMessageParser';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';

// ─── 공개 유틸리티: 실시간 메시지 파싱 ──────────────────────────────────────

/**
 * 시간대별 혼잡도 보정 가중치를 반환합니다.
 * (출근 7~9시: 1.25, 퇴근 17~19시: 1.2, 야간 22~05시: 0.9)
 */
function getRushHourFactor(date: Date = new Date()): number {
  const hours = date.getHours();
  if (hours >= 7 && hours < 9) return 1.25;
  if (hours >= 17 && hours < 19) return 1.2;
  if (hours >= 22 || hours < 5) return 0.9;
  return 1.0;
}

/**
 * 실시간 도착 메시지(arvlMsg2)에서 현재 열차의 위치 역명을 정밀 추출합니다.
 */
export function extractCurrentStation(
  arvlMsg2: string,
  targetStation: string,
  _updnLine?: string
): string {
  return extractCurrentStationRobust(arvlMsg2, targetStation);
}

/**
 * 실시간 도착 메시지(arvlMsg2)에서 남은 역 수를 정밀 추출합니다.
 */
export function extractRemainingStations(arvlMsg2: string): number | null {
  return extractRemainingStationsRobust(arvlMsg2);
}

// ─── 내부 빌더: ETA 응답 객체 생성 ──────────────────────────────────────────

function buildApproachingResponse(arvlMsg2: string, targetClean: string): SubwayEtaResult {
  const isJustDeparted = arvlMsg2.includes(`${targetClean} 출발`) || arvlMsg2.includes('출발');
  if (isJustDeparted) {
    return {
      statusText: `${targetClean} 출발함`,
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: false,
      isPassed: true,
    };
  }

  const subDetail = arvlMsg2.includes(`${targetClean} 진입`) || arvlMsg2.includes('진입')
    ? '진입'
    : '도착';

  return {
    statusText: `곧 도착 [${subDetail}]`,
    minutesLeft: 0,
    arrivalTime: '',
    isApproaching: true,
    isPassed: false,
  };
}

function buildBarvlDtResponse(
  barvlDt: number,
  recptnDt: string,
  arvlMsg2: string,
  remainingStations: number | null
): SubwayEtaResult {
  let timeDiffSec = 0;
  if (recptnDt) {
    try {
      const receiptTime = new Date(recptnDt.replace(' ', 'T')).getTime();
      const currentTime = timeOffsetManager.getSynchronizedNow();
      if (!isNaN(receiptTime)) {
        timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1_000));
      }
    } catch {
      // 파싱 실패 시 경과 시간 보정 생략
    }
  }

  const correctedRemainingSec = Math.max(0, barvlDt - timeDiffSec);

  // 남은 시간이 0초 이하로 경과한 열차는 1분 고정 대신 지나간 열차(isPassed: true)로 처리
  if (correctedRemainingSec === 0) {
    return {
      statusText: arvlMsg2.includes('출발') ? '출발함' : '지나침',
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: false,
      isPassed: true,
    };
  }

  const minutesLeft = Math.ceil(correctedRemainingSec / 60);
  const syncNow = timeOffsetManager.getSynchronizedNow();
  const arrivalDate = new Date(syncNow + correctedRemainingSec * 1_000);
  const hours = String(arrivalDate.getHours()).padStart(2, '0');
  const mins = String(arrivalDate.getMinutes()).padStart(2, '0');
  const arrivalTime = `${hours}:${mins}`;

  let statusText = `${minutesLeft}분`;
  if (remainingStations !== null) {
    if (remainingStations === 0) {
      statusText = '곧 도착 [진입]';
    } else if (remainingStations === 1) {
      statusText = `${minutesLeft}분 [전역]`;
    } else {
      statusText = `${minutesLeft}분 [${remainingStations}전역]`;
    }
  }

  return {
    statusText,
    minutesLeft,
    arrivalTime,
    isApproaching: minutesLeft <= 1,
    isPassed: false,
  };
}

function buildFallbackResponse(
  arvlMsg2: string,
  remainingStations: number | null,
  currentStation: string,
  targetClean: string,
  subwayId: string | undefined,
  updnLine: string | undefined
): SubwayEtaResult {
  const rushFactor = getRushHourFactor();
  let minutesLeft =
    remainingStations !== null
      ? Math.max(1, Math.round(remainingStations * (FALLBACK_SECONDS_PER_STATION / 60) * rushFactor))
      : FALLBACK_DEFAULT_MINUTES;

  if (currentStation && subwayId) {
    const dbSeconds = calculateTimeBetweenStations(subwayId, currentStation, targetClean, updnLine);
    if (dbSeconds !== null && dbSeconds > 0) {
      minutesLeft = Math.ceil((dbSeconds * rushFactor) / 60);
    } else if (dbSeconds === null && updnLine) {
      // 진행 방향과 반대인 열차 -> 이미 지나간 열차 처리
      return {
        statusText: '지나침',
        minutesLeft: 0,
        arrivalTime: '',
        isApproaching: false,
        isPassed: true,
      };
    }
  }

  let statusText = arvlMsg2;
  if (remainingStations !== null) {
    if (remainingStations === 0) {
      statusText = '곧 도착';
    } else if (remainingStations === 1) {
      statusText = `${minutesLeft}분 [전역]`;
    } else {
      statusText = `${minutesLeft}분 [${remainingStations}전역]`;
    }
  }

  return {
    statusText,
    minutesLeft,
    arrivalTime: '',
    isApproaching: remainingStations !== null && remainingStations <= 1,
  };
}

// ─── 공개 API: 실시간 ETA 계산 ───────────────────────────────────────────────

/**
 * 실시간 도착 정보를 바탕으로 지하철 ETA를 동적으로 계산합니다.
 */
export async function calculateSubwayETADynamic(
  arvlMsg2: string,
  recptnDt: string,
  targetStation: string,
  trainNo: string,
  updnLine?: string,
  barvlDt?: number,
  subwayId?: string,
  arvlCd?: string | number
): Promise<SubwayEtaResult> {
  const targetClean = normalizeStationName(targetStation);

  // 1. 이미 해당 역을 출발한 열차 판별 (arvlCd = '2' 출발 또는 arvlMsg2에 "[target] 출발" / "당역 출발")
  const arvlCdStr = String(arvlCd ?? '');
  const isDepartedCode = arvlCdStr === '2';
  const isDepartedMsg =
    arvlMsg2.includes(`${targetClean} 출발`) ||
    arvlMsg2.includes('당역 출발') ||
    arvlMsg2.includes('당역출발') ||
    (arvlMsg2.endsWith('출발') && !arvlMsg2.includes('전역'));

  if (isDepartedCode || isDepartedMsg) {
    return {
      statusText: `${targetClean} 출발함`,
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: false,
      isPassed: true,
    };
  }

  const remainingStations = extractRemainingStations(arvlMsg2);

  const isDirectlyAtTarget =
    arvlMsg2.includes(`${targetClean} 진입`) ||
    arvlMsg2.includes(`${targetClean} 도착`);

  if (isDirectlyAtTarget) {
    return buildApproachingResponse(arvlMsg2, targetClean);
  }

  if (barvlDt && barvlDt > 0) {
    return buildBarvlDtResponse(barvlDt, recptnDt, arvlMsg2, remainingStations);
  }

  const currentStation = extractCurrentStation(arvlMsg2, targetClean, updnLine);
  return buildFallbackResponse(
    arvlMsg2,
    remainingStations,
    currentStation,
    targetClean,
    subwayId,
    updnLine
  );
}

/**
 * Fallback 소요 시간을 초 단위로 계산합니다 (남은 역 수 기반).
 * @deprecated calculateSubwayETADynamic 사용 권장
 */
export function calculateFallbackTimeSec(
  _currentStation: string,
  _targetStation: string,
  arvlMsg2: string
): number {
  const fallbackStations = extractRemainingStations(arvlMsg2);
  if (fallbackStations !== null) {
    return fallbackStations * FALLBACK_SECONDS_PER_STATION;
  }
  return 4 * 60;
}
