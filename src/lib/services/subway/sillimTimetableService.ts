/**
 * 신림선(샛강 ~ 보라매 ~ 신림 ~ 관악산 11개 역) 공식 시간표 인메모리 서비스
 *
 * 신림선 공식 운영사 웹사이트(sillimlrt.com)의 시간표를 압축한
 * `sillim_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 1분 단위 초정밀 Fallback 도착 정보를 계산합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface SillimTimetableItem {
  no: string; // 열차 번호 (예: "S1001", "S2001")
  t: string;  // 출발 시각 (예: "05:30")
  d: string;  // 종착역 (예: "샛강", "관악산")
}

export interface SillimStationTimetableData {
  [groupKey: string]: SillimTimetableItem[]; // 예: "신림선_DAY_UP", "신림선_DAY_DOWN"
}

export interface UnifiedSillimTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, SillimStationTimetableData>;
}

export interface SillimNextTrainResult {
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
  isExpress: boolean;
  canBoard: boolean;
  subwayNm: string;
}

// ─── 데이터베이스 경로 및 싱글톤 인메모리 캐시 ────────────────────────────────────

const TIMETABLES_DIR = path.join(process.cwd(), 'src', 'data', 'subway', 'timetables');
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'sillim_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'sillim_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedSillimTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getSillimTimetableDatabase(): UnifiedSillimTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedSillimTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedSillimTimetableDatabase;
      return memoryDb;
    }

    console.warn('[SillimTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[SillimTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 신림선 11개 역사 목록 및 정규화 유틸 ──────────────────────────────────────────

/** 신림선 11개 공식 표준 역사 순서 (샛강 ~ 관악산) */
export const SILLIM_STATIONS = [
  '샛강',
  '대방',
  '서울지방병무청',
  '보라매',
  '보라매공원',
  '보라매병원',
  '당곡',
  '신림',
  '서원',
  '서울대벤처타운',
  '관악산',
] as const;

/**
 * 신림선에만 존재하는 단독 고유역 Set (환승 없는 7개 역)
 */
export const SILLIM_UNIQUE_STATIONS = new Set<string>([
  '서울지방병무청',
  '보라매공원',
  '보라매병원',
  '당곡',
  '서원',
  '서울대벤처타운',
  '관악산',
]);

const SILLIM_STATION_SET = new Set<string>(SILLIM_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '샛강역': '샛강',
  '대방역': '대방',
  '대방(성애병원)': '대방',
  '성애병원': '대방',
  '성애병원역': '대방',
  '서울지방병무청역': '서울지방병무청',
  '병무청': '서울지방병무청',
  '병무청역': '서울지방병무청',
  '지방병무청': '서울지방병무청',
  '보라매역': '보라매',
  '보라매공원역': '보라매공원',
  '보라매병원역': '보라매병원',
  '보라매병원(전문건설회관)': '보라매병원',
  '전문건설회관': '보라매병원',
  '당곡역': '당곡',
  '신림역': '신림',
  '서원역': '서원',
  '서울대벤처타운역': '서울대벤처타운',
  '벤처타운': '서울대벤처타운',
  '벤처타운역': '서울대벤처타운',
  '관악산역': '관악산',
  '관악산(서울대)': '관악산',
  '서울대(관악산)': '관악산',
};

/**
 * 주어진 역명이 신림선 소속 역인지 확인합니다.
 */
export function isSillimStation(stationName: string): boolean {
  const official = resolveOfficialSillimStationName(stationName);
  return official !== null && SILLIM_STATION_SET.has(official);
}

/**
 * 신림선 전용 고유역(환승역 제외 7개 역)인지 확인합니다.
 */
export function isSillimExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialSillimStationName(stationName);
  return official !== null && SILLIM_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 신림선인지 확인합니다.
 */
export function isSillimLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1095' ||
    s.includes('신림선') ||
    s.includes('신림')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialSillimStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '')
    .replace(/역$/g, '')
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (SILLIM_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 신림선 기준:
 * - 상행(UP): 관악산 -> 신림 -> 보라매 -> 샛강 방면 (1)
 * - 하행(DOWN): 샛강 -> 보라매 -> 신림 -> 관악산 방면 (2)
 */
export function resolveSillimDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (u === '1' || u === '상행' || u.includes('샛강') || u.includes('대방')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('관악산') || u.includes('신림') || u.includes('서원')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (d.includes('샛강') || d.includes('대방') || d.includes('보라매')) {
      return 'UP';
    }
    if (d.includes('관악산') || d.includes('신림') || d.includes('서원') || d.includes('서울대')) {
      return 'DOWN';
    }
  }

  return 'DOWN';
}

// ─── 날짜/시각 유틸 ──────────────────────────────────────────────────────────

function getKstComponents(date: Date): { day: number; hours: number; minutes: number; seconds: number } {
  const kstTime = date.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstTime);
  return {
    day: kst.getUTCDay(),
    hours: kst.getUTCHours(),
    minutes: kst.getUTCMinutes(),
    seconds: kst.getUTCSeconds(),
  };
}

export function getSillimWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
  const { day } = getKstComponents(date);
  if (day === 0) return 'END'; // 일요일
  if (day === 6) return 'SAT'; // 토요일 (주말 시간표 공유)
  return 'DAY';                // 평일 (월~금)
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 특정 역의 시간표 데이터를 O(1)로 조회합니다.
 */
export function loadSillimStationTimetable(
  stationName: string
): SillimStationTimetableData | null {
  const db = getSillimTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialSillimStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetSillimNextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
}

/**
 * 신림선 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getSillimNextTrain(options: GetSillimNextTrainOptions): SillimNextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date() } = options;

  const officialStation = resolveOfficialSillimStationName(stationName);
  if (!officialStation) return null;

  const db = getSillimTimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveSillimDirection(updnLine, destination);
  const weekTag = getSillimWeekTag(baseTime);
  const groupKey = `신림선_${weekTag}_${direction}`;

  const scheduleList = stationData[groupKey];
  if (!scheduleList || scheduleList.length === 0) {
    return null;
  }

  const { hours, minutes } = getKstComponents(baseTime);
  const currentMinutes = hours * 60 + minutes;

  const upcomingTrains = scheduleList.filter((item) => {
    let trainMin = timeToMinutes(item.t);
    // 익일 새벽 (00:00 ~ 03:59) 열차는 24시간을 더해 계산
    if (trainMin < 240) trainMin += 1440;
    let currMinAdjusted = currentMinutes;
    if (currMinAdjusted < 240) currMinAdjusted += 1440;
    return trainMin >= currMinAdjusted;
  });

  if (upcomingTrains.length > 0) {
    const next = upcomingTrains[0];
    let nextMin = timeToMinutes(next.t);
    if (nextMin < 240) nextMin += 1440;
    let currMin = currentMinutes;
    if (currMin < 240) currMin += 1440;

    const minutesLeft = Math.max(0, nextMin - currMin);
    const isApproaching = minutesLeft <= 2;

    return {
      trainNo: next.no,
      endSubwayStationNm: next.d,
      minutesLeft,
      arrivalTime: next.t,
      statusText: isApproaching
        ? `${next.d}행 곧 도착`
        : `${next.d}행 약 ${minutesLeft}분 후 (${next.t})`,
      isApproaching,
      isExpress: false,
      canBoard: true,
      subwayNm: '신림선',
    };
  }

  // 당일 운행 종료 시 익일 첫차 대기 반환
  const firstTrain = scheduleList[0];
  if (firstTrain) {
    return {
      trainNo: firstTrain.no,
      endSubwayStationNm: firstTrain.d,
      minutesLeft: 999,
      arrivalTime: firstTrain.t,
      statusText: `[시간표] 운행종료 (첫차 ${firstTrain.t})`,
      isApproaching: false,
      isExpress: false,
      canBoard: false,
      subwayNm: '신림선',
    };
  }

  return null;
}

/** getSillimNextTrain 별칭 함수 */
export const getNextTrainFromSillimTimetable = getSillimNextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getSillimTimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialSillimStationName(stationName);
  if (!officialStation) return [];

  const db = getSillimTimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveSillimDirection(updnLine);
  const groupKey = `신림선_${dayType}_${direction}`;
  const rawList = db.data[officialStation][groupKey] || [];

  const baseTime = options?.baseTime || new Date();
  const { hours, minutes } = getKstComponents(baseTime);
  const currentMinutes = hours * 60 + minutes;

  const entries: SubwayTimetableEntry[] = [];
  let foundFirstUpcoming = false;

  for (const item of rawList) {
    let trainMin = timeToMinutes(item.t);
    if (trainMin < 240) trainMin += 1440;
    let currMin = currentMinutes;
    if (currMin < 240) currMin += 1440;

    const diff = trainMin - currMin;
    const minutesLeft = diff >= 0 ? diff : 1440 + diff;
    const isUpcoming = !foundFirstUpcoming && diff >= 0;
    if (isUpcoming) foundFirstUpcoming = true;

    entries.push({
      trainNo: item.no,
      depTime: item.t,
      destStation: item.d,
      drctType: direction === 'UP' ? '1' : '2',
      directionName: direction === 'UP' ? '샛강 방면' : '관악산 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `곧 도착` : `${minutesLeft}분 후`,
      isUpcoming,
      isExpress: false,
    });
  }

  return entries;
}
