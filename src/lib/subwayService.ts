/**
 * @fileoverview 지하철 관련 서비스 (역 조회, 소요 시간 계산, 실시간 ETA)
 *
 * 두 가지 데이터 소스를 사용합니다:
 * 1. 로컬 JSON (서울교통공사_역간거리.json) — 정적 소요 시간 계산
 * 2. TAGO API — 실시간 열차 스케줄 조회
 */

import fs from 'fs';
import path from 'path';

// ─── 상수 ────────────────────────────────────────────────────────────────────

/** TAGO 환경 변수 키 이름 */
const TAGO_API_KEY_ENV = 'REAL_TIME_BUS_API_KEY';

/** 자정 기준 총 초 수 (시간표 롤오버 보정용) */
const MIDNIGHT_SECONDS = 24 * 3_600;

/** 역간 거리 JSON 파일명 */
const STATION_DISTANCE_FILENAME = '서울교통공사_역간거리.json';

/** 역간 거리 JSON 경로 (cwd 기준 data 디렉터리) */
const STATION_DISTANCE_FILEPATH = path.join(process.cwd(), 'data', STATION_DISTANCE_FILENAME);

/** 타임테이블 캐시 유효 시간 (3시간) */
const TIMETABLE_CACHE_TTL_MS = 3 * 3_600 * 1_000;

/** 타임테이블 API 에러 시 재호출 방지 캐시 유효 시간 (5분) */
const TIMETABLE_ERROR_CACHE_TTL_MS = 5 * 60 * 1_000;

/** 코레일 등 barvlDt 없는 노선의 기본 Fallback 소요 시간 (초/역) */
const FALLBACK_SECONDS_PER_STATION = 120;

/** barvlDt 없는 노선의 기본 Fallback 시간 (분) */
const FALLBACK_DEFAULT_MINUTES = 99;

// ─── 로컬 타입 정의 ──────────────────────────────────────────────────────────

/** 서울교통공사_역간거리.json의 단일 데이터 행 타입 */
interface StationDistanceRow {
  sbwy_rout_ln: string | number; // 호선 번호 (예: 1, 2, … 9)
  sbwy_stns_nm: string;          // 역명 (예: '강남역')
  hm: string;                    // 전역과의 소요 시간 (형식: "M:SS")
}

/** 서울교통공사_역간거리.json 루트 타입 */
interface StationDistanceDb {
  DATA: StationDistanceRow[];
}

/** TAGO 스케줄 API 단일 아이템 타입 */
interface ScheduleItem {
  trainNo: string | number;
  depTime?: string | number;
  arrTime?: string | number;
  endSubwayStationNm?: string;
}

/** calculateSubwayETADynamic 반환 타입 */
export interface SubwayEtaResult {
  statusText: string;
  minutesLeft: number;
  arrivalTime: string;
  isApproaching: boolean;
}

// ─── 메모리 캐시 ─────────────────────────────────────────────────────────────

/** 역명 → Station ID 캐시 (API 중복 호출 방지) */
const stationIdCache: Record<string, string> = {};

/** 역간 거리 JSON 파일 캐시 (프로세스 생애주기 동안 유지) */
let stationDistanceDb: StationDistanceDb | null = null;

/** 시간표 캐시 (역명_방향 → { expires, schedule }) */
const timetableCache = new Map<string, { expires: number; schedule: ScheduleItem[] }>();

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 역간 거리 DB를 로드합니다. 최초 호출 시 파일을 읽고 이후 캐시를 반환합니다.
 */
function getStationDistanceDb(): StationDistanceDb | null {
  if (stationDistanceDb) return stationDistanceDb;

  try {
    if (!fs.existsSync(STATION_DISTANCE_FILEPATH)) return null;
    const fileContent = fs.readFileSync(STATION_DISTANCE_FILEPATH, 'utf-8');
    stationDistanceDb = JSON.parse(fileContent) as StationDistanceDb;
    return stationDistanceDb;
  } catch (e) {
    console.error('[subwayService] 역간 거리 JSON 로드 실패:', e);
    return null;
  }
}

/**
 * "M:SS" 형식의 문자열을 초(seconds)로 변환합니다.
 * @example parseMinSecToSeconds("2:30") → 150
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

  // "HHMMSS" 형식 (콜론 없이 6자리)
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
 * TAGO API 키를 환경 변수에서 반환합니다.
 */
function getTaGoApiKey(): string {
  return process.env[TAGO_API_KEY_ENV] || '';
}

/**
 * subwayId를 호선 코드 문자열로 변환합니다.
 * (예: "1001" → "1", "1009" → "9")
 */
function resolveLineCode(subwayId: string): string {
  if (subwayId.startsWith('100')) {
    return subwayId.substring(3); // "1" ~ "8"
  }
  if (subwayId === '1009') {
    return '9';
  }
  return '';
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
 * 현재 요일에 따른 TAGO 운행 유형 코드를 반환합니다.
 * ('01': 평일, '02': 토요일, '03': 일요일/공휴일)
 */
function getDailyTypeCode(): string {
  const day = new Date().getDay();
  if (day === 0) return '03'; // 일요일
  if (day === 6) return '02'; // 토요일
  return '01';                // 평일
}

// ─── 공개 유틸리티 ───────────────────────────────────────────────────────────

/**
 * 로컬 DB(서울교통공사_역간거리.json)를 이용하여
 * 동일 노선의 두 역 사이 소요 시간(초)을 계산합니다.
 *
 * @param subwayId       호선 ID (예: "1001" = 1호선)
 * @param currentStation 현재 역명
 * @param targetStation  목적 역명
 * @returns 소요 시간(초), 계산 불가 시 null
 */
export function calculateTimeBetweenStations(
  subwayId: string,
  currentStation: string,
  targetStation: string
): number | null {
  const db = getStationDistanceDb();
  if (!db?.DATA) return null;

  const lineCode = resolveLineCode(subwayId);
  if (!lineCode) return null;

  const cleanCurrent = normalizeStationName(currentStation);
  const cleanTarget = normalizeStationName(targetStation);

  const lineStations = db.DATA.filter(
    (row) => String(row.sbwy_rout_ln) === lineCode
  );
  if (lineStations.length === 0) return null;

  const normalize = (nm: string) => nm.replace(/역$/, '').trim();

  const currentIdx = lineStations.findIndex(
    (row) => normalize(row.sbwy_stns_nm) === cleanCurrent
  );
  const targetIdx = lineStations.findIndex(
    (row) => normalize(row.sbwy_stns_nm) === cleanTarget
  );

  if (currentIdx === -1 || targetIdx === -1) return null;

  // 방향 관계없이 startIdx+1 ~ endIdx 구간의 누적 소요 시간 합산
  const startIdx = Math.min(currentIdx, targetIdx);
  const endIdx = Math.max(currentIdx, targetIdx);

  let totalSeconds = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    totalSeconds += parseMinSecToSeconds(lineStations[i].hm);
  }

  return totalSeconds;
}

/**
 * 역명으로 TAGO SubwayInfo API에서 Station ID를 조회합니다.
 * 결과는 메모리에 캐시되어 중복 네트워크 요청을 방지합니다.
 *
 * @throws TAGO API 키 미설정 또는 역 조회 실패 시
 */
export async function fetchStationId(stationName: string): Promise<string> {
  const cleanName = normalizeStationName(stationName);

  if (stationIdCache[cleanName]) {
    return stationIdCache[cleanName];
  }

  const apiKey = getTaGoApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER') {
    throw new Error('TAGO API 키가 설정되지 않았습니다.');
  }

  const url =
    `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnList` +
    `?serviceKey=${apiKey}&pageNo=1&numOfRows=15&_type=json` +
    `&stationName=${encodeURIComponent(cleanName)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json() as {
      response?: { body?: { items?: { item?: ScheduleItem[] | ScheduleItem } } };
    };
    const items = (data.response?.body?.items?.item as unknown) as
      | Array<{ subwayRouteName?: string; subwayStationId?: string }>
      | { subwayRouteName?: string; subwayStationId?: string }
      | undefined;

    let stationId = '';
    if (Array.isArray(items)) {
      // 1호선 우선 매칭 (예: "시청역"처럼 동명 역이 여러 호선에 존재하는 경우)
      const matched = items.find((it) => String(it.subwayRouteName || '').includes('1호선'));
      stationId = matched?.subwayStationId ?? items[0]?.subwayStationId ?? '';
    } else if (items) {
      stationId = (items as { subwayStationId?: string }).subwayStationId ?? '';
    }

    if (stationId) {
      stationIdCache[cleanName] = stationId;
      return stationId;
    }

    throw new Error(`역 ID를 찾을 수 없습니다: ${cleanName}`);
  } catch (err) {
    console.warn(`[subwayService] ${cleanName} 역 ID 조회 실패:`, err);
    throw err;
  }
}

/**
 * TAGO 시간표 API에서 특정 열차 번호의 departure/arrival 시각을 조회합니다.
 */
async function fetchScheduleTime(
  stationId: string,
  trainNo: string,
  upDownTypeCode: string,
  timeType: 'depTime' | 'arrTime'
): Promise<string | null> {
  const apiKey = getTaGoApiKey();
  const dailyTypeCode = getDailyTypeCode();

  const url =
    `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnAcctoSchdulList` +
    `?serviceKey=${apiKey}&pageNo=1&numOfRows=300&_type=json` +
    `&subwayStationId=${stationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${upDownTypeCode}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json() as {
      response?: { body?: { items?: { item?: unknown } } };
    };
    const items = data.response?.body?.items?.item;

    const matchItem = (it: Record<string, unknown>) =>
      String(it.trainNo || '').trim() === String(trainNo).trim()
        ? String(it[timeType] || '') || null
        : null;

    if (Array.isArray(items)) {
      const matched = (items as Record<string, unknown>[]).find(
        (it) => String(it.trainNo || '').trim() === String(trainNo).trim()
      );
      return matched ? String(matched[timeType] || '') || null : null;
    } else if (items) {
      return matchItem(items as Record<string, unknown>);
    }

    return null;
  } catch (err) {
    console.warn(
      `[subwayService] 스케줄 조회 실패 (역 ID: ${stationId}, 열차: ${trainNo}):`,
      err
    );
    return null;
  }
}

/**
 * 현재 역과 목적 역의 시간표를 조회하여 동적 이동 시간(초)을 계산합니다.
 *
 * 실제 발차 시각과 도착 시각의 차이를 자정 롤오버를 고려하여 산출합니다.
 * @returns 이동 시간(초), 조회 실패 시 null
 */
export async function fetchDynamicTravelTimeSec(
  currentStation: string,
  targetStation: string,
  trainNo: string,
  updnLine: string
): Promise<number | null> {
  try {
    const [currentId, targetId] = await Promise.all([
      fetchStationId(currentStation),
      fetchStationId(targetStation),
    ]);

    const upDownTypeCode = resolveUpDownTypeCode(updnLine);

    const [depTimeStr, arrTimeStr] = await Promise.all([
      fetchScheduleTime(currentId, trainNo, upDownTypeCode, 'depTime'),
      fetchScheduleTime(targetId, trainNo, upDownTypeCode, 'arrTime'),
    ]);

    if (!depTimeStr || !arrTimeStr) return null;

    const depSec = timeToSeconds(depTimeStr);
    const arrSec = timeToSeconds(arrTimeStr);
    let diffSec = arrSec - depSec;

    // 자정 롤오버 보정 (예: 23:55 출발 → 00:05 도착)
    if (diffSec < 0) diffSec += MIDNIGHT_SECONDS;

    return diffSec;
  } catch {
    return null;
  }
}

/**
 * 역의 당일 시간표를 조회하고 3시간 동안 캐시합니다.
 *
 * TAGO API 과다 호출 방지를 위해 실패 시 5분간 빈 배열을 캐시합니다.
 *
 * @returns 시간표 아이템 배열, API 키 미설정 또는 실패 시 빈 배열
 */
export async function fetchAndCacheTimetable(
  stationName: string,
  updnLine: string
): Promise<ScheduleItem[]> {
  const cleanName = normalizeStationName(stationName);
  const upDownTypeCode = resolveUpDownTypeCode(updnLine);
  const cacheKey = `${cleanName}_${upDownTypeCode}`;
  const now = Date.now();

  const cached = timetableCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.schedule;
  }

  const apiKey = getTaGoApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER') return [];

  try {
    const stationId = await fetchStationId(cleanName);
    const dailyTypeCode = getDailyTypeCode();

    const url =
      `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnAcctoSchdulList` +
      `?serviceKey=${apiKey}&pageNo=1&numOfRows=500&_type=json` +
      `&subwayStationId=${stationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${upDownTypeCode}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json() as {
      response?: { body?: { items?: { item?: unknown } } };
    };
    const items = data.response?.body?.items?.item;

    let schedule: ScheduleItem[] = [];
    if (Array.isArray(items)) schedule = items as ScheduleItem[];
    else if (items) schedule = [items as ScheduleItem];

    // 성공: 3시간 캐시
    timetableCache.set(cacheKey, { expires: now + TIMETABLE_CACHE_TTL_MS, schedule });
    return schedule;
  } catch {
    // 실패: 5분간 빈 배열 캐시하여 연속 에러 시 TAGO 서버 과부하 방지
    timetableCache.set(cacheKey, { expires: now + TIMETABLE_ERROR_CACHE_TTL_MS, schedule: [] });
    return [];
  }
}

/**
 * 정적 시간표 캐시에서 다음 열차 도착 정보를 계산합니다.
 *
 * @returns 다음 열차 정보, 없으면 null
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
    statusText: `[시간표] ${String(next.endSubwayStationNm || '')}행 (${arrivalTime})`,
    isApproaching: false,
  };
}

// ─── 공개 유틸리티: 실시간 메시지 파싱 ──────────────────────────────────────

/**
 * 실시간 도착 메시지(arvlMsg2)에서 현재 열차의 위치 역명을 추출합니다.
 */
export function extractCurrentStation(
  arvlMsg2: string,
  targetStation: string,
  _updnLine?: string
): string {
  // 괄호 안의 역명 추출: "(강남) 진입" 등의 형태
  const parenMatch = arvlMsg2.match(/\(([^)]+)\)/);
  if (parenMatch) {
    return parenMatch[1].replace(/역$/, '').trim();
  }

  // "강남역 진입", "강남역 도착" 등의 형태
  const suffixMatch = arvlMsg2.match(/^([가-힣a-zA-Z0-9]+)\s*(진입|도착|출발)$/);
  if (suffixMatch) {
    const station = suffixMatch[1].replace(/역$/, '').trim();
    if (station !== '전') return station;
  }

  return '';
}

/**
 * 실시간 도착 메시지(arvlMsg2)에서 남은 역 수를 추출합니다.
 *
 * - "[3]" 형태 → 3 반환
 * - "전역" 포함 → 1 반환
 * - "진입"/"도착" 포함 → 0 반환
 * - 파싱 불가 → null 반환
 */
export function extractRemainingStations(arvlMsg2: string): number | null {
  const bracketMatch = arvlMsg2.match(/\[(\d+)\]/);
  if (bracketMatch) return parseInt(bracketMatch[1], 10);
  if (arvlMsg2.includes('전역')) return 1;
  if (arvlMsg2.includes('진입') || arvlMsg2.includes('도착')) return 0;
  return null;
}

// ─── 내부 빌더: ETA 응답 객체 생성 ──────────────────────────────────────────

/**
 * 열차가 대상 역에 직접 도달한 경우의 응답 객체를 생성합니다.
 */
function buildApproachingResponse(arvlMsg2: string, targetClean: string): SubwayEtaResult {
  const isJustDeparted = arvlMsg2.includes(`${targetClean} 출발`);
  const detail = isJustDeparted ? '출발함' : '곧 도착';

  const subDetail = arvlMsg2.includes(`${targetClean} 진입`)
    ? '진입'
    : arvlMsg2.includes(`${targetClean} 도착`)
    ? '도착'
    : '출발';

  return {
    statusText: `${detail} [${subDetail}]`,
    minutesLeft: 0,
    arrivalTime: '',
    isApproaching: true,
  };
}

/**
 * barvlDt(초 단위 실시간 잔여 시간)가 있는 경우의 ETA 응답 객체를 생성합니다.
 * 수신 시각(recptnDt)과 현재 시각의 차이를 보정합니다.
 */
function buildBarvlDtResponse(
  barvlDt: number,
  recptnDt: string,
  arvlMsg2: string,
  remainingStations: number | null
): SubwayEtaResult {
  // 수신 시각 기준 경과 시간 보정
  let timeDiffSec = 0;
  if (recptnDt) {
    try {
      const receiptTime = new Date(recptnDt.replace(' ', 'T')).getTime();
      const currentTime = Date.now();
      if (!isNaN(receiptTime)) {
        timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1_000));
      }
    } catch {
      // 날짜 파싱 실패 시 보정 생략
    }
  }

  const correctedRemainingSec = Math.max(0, barvlDt - timeDiffSec);

  if (correctedRemainingSec === 0) {
    return {
      statusText: arvlMsg2,
      minutesLeft: 1,
      arrivalTime: '',
      isApproaching: true,
    };
  }

  const minutesLeft = Math.ceil(correctedRemainingSec / 60);
  const arrivalDate = new Date(Date.now() + correctedRemainingSec * 1_000);
  const hours = String(arrivalDate.getHours()).padStart(2, '0');
  const mins = String(arrivalDate.getMinutes()).padStart(2, '0');
  const arrivalTime = `${hours}:${mins}`;

  // "X분 [Y전역]" 형식 상태 텍스트 구성
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
  };
}

/**
 * barvlDt가 없는 코레일 관할 노선 등의 Fallback ETA 응답 객체를 생성합니다.
 *
 * DB 기반 소요 시간을 시도하고, 실패 시 남은 역 수 × 2분으로 추산합니다.
 */
function buildFallbackResponse(
  arvlMsg2: string,
  remainingStations: number | null,
  currentStation: string,
  targetClean: string,
  subwayId: string | undefined,
  updnLine: string | undefined
): SubwayEtaResult {
  // 남은 역 수 기반 초기 추정
  let minutesLeft =
    remainingStations !== null
      ? Math.max(1, remainingStations * (FALLBACK_SECONDS_PER_STATION / 60))
      : FALLBACK_DEFAULT_MINUTES;

  // DB 기반 소요 시간으로 개선 시도
  if (currentStation && subwayId) {
    const dbSeconds = calculateTimeBetweenStations(subwayId, currentStation, targetClean);
    if (dbSeconds !== null && dbSeconds > 0) {
      minutesLeft = Math.ceil(dbSeconds / 60);
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
 *
 * 처리 우선순위:
 * 1. 대상 역에 직접 진입/도착/출발 중 → 즉시 도착 응답
 * 2. barvlDt(초 단위 잔여 시간) 존재 → 서울시 관할 노선 실시간 계산
 * 3. 그 외 → DB 또는 남은 역 수 기반 Fallback
 */
export async function calculateSubwayETADynamic(
  arvlMsg2: string,
  recptnDt: string,
  targetStation: string,
  trainNo: string,
  updnLine?: string,
  barvlDt?: number,
  subwayId?: string
): Promise<SubwayEtaResult> {
  const targetClean = normalizeStationName(targetStation);
  const remainingStations = extractRemainingStations(arvlMsg2);

  // 1. 대상 역에 직접 도달한 경우
  const isDirectlyAtTarget =
    arvlMsg2.includes(`${targetClean} 진입`) ||
    arvlMsg2.includes(`${targetClean} 도착`) ||
    arvlMsg2.includes(`${targetClean} 출발`);

  if (isDirectlyAtTarget) {
    return buildApproachingResponse(arvlMsg2, targetClean);
  }

  // 2. 초 단위 실시간 잔여 시간(barvlDt) 존재 — 서울시 관할 노선
  if (barvlDt && barvlDt > 0) {
    return buildBarvlDtResponse(barvlDt, recptnDt, arvlMsg2, remainingStations);
  }

  // 3. barvlDt 없는 코레일 관할 노선 등 — DB 또는 Fallback
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
 * @deprecated 외부에서 직접 사용보다 calculateSubwayETADynamic 사용을 권장합니다.
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
  return 4 * 60; // 기본 4분
}
