/**
 * @fileoverview 의정부경전철(발곡 ~ 차량기지임시승강장 16개 역사) 오프라인 압축 시간표 서비스
 * 공식 의정부경전철 웹사이트 시간표 데이터를 바탕으로 100% 로컬 인메모리에서 빠른 Fallback 제공
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

export const UIJEONGBU_LINE_CODE = '1010';

/**
 * 의정부경전철 공식 역 목록 (발곡 기점 ~ 차량기지임시승강장 종점 16개 역사)
 */
export const UIJEONGBU_STATIONS = [
  '발곡',
  '회룡',
  '범골',
  '경전철의정부',
  '의정부시청',
  '흥선',
  '의정부중앙',
  '동오',
  '새말',
  '경기도청북부청사',
  '효자',
  '곤제',
  '어룡',
  '송산',
  '탑석',
  '차량기지임시승강장',
] as const;

export type UijeongbuStationName = typeof UIJEONGBU_STATIONS[number];

/**
 * 의정부경전철 단독 고유역 Set (15개 역)
 * 타 노선과 환승되지 않는 순수 의정부경전철 전용 역 목록입니다.
 * 환승역: 회룡 (1호선)
 */
export const UIJEONGBU_UNIQUE_STATIONS = new Set<string>([
  '발곡',
  '범골',
  '경전철의정부',
  '의정부시청',
  '흥선',
  '의정부중앙',
  '동오',
  '새말',
  '경기도청북부청사',
  '효자',
  '곤제',
  '어룡',
  '송산',
  '탑석',
  '차량기지임시승강장',
]);

const UIJEONGBU_STATION_SET = new Set<string>(UIJEONGBU_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '발곡역': '발곡',
  '회룡역': '회룡',
  '범골역': '범골',
  '경전철의정부': '경전철의정부',
  '경전철의정부역': '경전철의정부',
  '의정부시청': '의정부시청',
  '의정부시청역': '의정부시청',
  '흥선': '흥선',
  '흥선역': '흥선',
  '흥선(하늘빛이음)': '흥선',
  '의정부중앙': '의정부중앙',
  '의정부중앙역': '의정부중앙',
  '동오': '동오',
  '동오역': '동오',
  '새말': '새말',
  '새말역': '새말',
  '경기도청북부청사': '경기도청북부청사',
  '경기도청북부청사역': '경기도청북부청사',
  '경기북부청사': '경기도청북부청사',
  '경기북부청사역': '경기도청북부청사',
  '북부청사': '경기도청북부청사',
  '북부청사역': '경기도청북부청사',
  '효자': '효자',
  '효자역': '효자',
  '효자(유디치과)': '효자',
  '곤제': '곤제',
  '곤제역': '곤제',
  '어룡': '어룡',
  '어룡역': '어룡',
  '어룡(국민건강보험공단)': '어룡',
  '송산': '송산',
  '송산역': '송산',
  '탑석': '탑석',
  '탑석역': '탑석',
  '차량기지임시승강장': '차량기지임시승강장',
  '차량기지임시승강장역': '차량기지임시승강장',
  '임시승강장': '차량기지임시승강장',
  '차량기지': '차량기지임시승강장',
  '차량기지역': '차량기지임시승강장',
};

/**
 * 주어진 역명이 의정부경전철 소속 역인지 확인합니다.
 */
export function isUijeongbuStation(stationName: string): boolean {
  const official = resolveOfficialUijeongbuStationName(stationName);
  return official !== null && UIJEONGBU_STATION_SET.has(official);
}

/**
 * 의정부경전철 전용 고유역(환승역 회룡 제외 15개 역)인지 확인합니다.
 */
export function isUijeongbuExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialUijeongbuStationName(stationName);
  return official !== null && UIJEONGBU_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 의정부경전철인지 확인합니다.
 */
export function isUijeongbuLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1010' ||
    s === '의정부' ||
    s.includes('의정부경전철') ||
    s.includes('의정부') ||
    s.includes('ulrt') ||
    s.includes('u-line') ||
    s.includes('uline')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialUijeongbuStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const trimmed = rawStationName.trim();

  if (ALIAS_MAP[trimmed]) {
    return ALIAS_MAP[trimmed];
  }

  const clean = trimmed
    .replace(/\(.*?\)/g, '')
    .replace(/역$/g, '')
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }

  if (UIJEONGBU_STATION_SET.has(clean)) {
    return clean;
  }

  // 특수 매칭: '시청' -> '의정부시청', '중앙' -> '의정부중앙'
  if (clean === '시청') return '의정부시청';
  if (clean === '중앙') return '의정부중앙';

  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 의정부경전철 기준:
 * - 상행(UP): 발곡 -> 회룡 -> 의정부시청 -> 탑석 / 차량기지임시승강장 방면 (1)
 * - 하행(DOWN): 차량기지임시승강장 / 탑석 -> 의정부시청 -> 회룡 -> 발곡 방면 (2)
 */
export function resolveUijeongbuDirection(
  updnLine?: string,
  destination?: string,
  stationName?: string
): 'UP' | 'DOWN' {
  const officialStation = resolveOfficialUijeongbuStationName(stationName);
  // 기점 발곡역은 상행(탑석/차량기지행)만 존재
  if (officialStation === '발곡') return 'UP';
  // 종점 차량기지임시승강장은 하행(발곡행)만 존재
  if (officialStation === '차량기지임시승강장') return 'DOWN';

  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (
      u === '1' ||
      u === '상행' ||
      u.includes('탑석') ||
      u.includes('차량기지') ||
      u.includes('송산') ||
      u.includes('어룡') ||
      u.includes('곤제')
    ) {
      return 'UP';
    }
    if (
      u === '2' ||
      u === '하행' ||
      u.includes('발곡') ||
      u.includes('회룡') ||
      u.includes('범골') ||
      u.includes('의정부시청')
    ) {
      return 'DOWN';
    }
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (d.includes('탑석') || d.includes('차량기지') || d.includes('송산') || d.includes('어룡')) {
      return 'UP';
    }
    if (d.includes('발곡') || d.includes('회룡') || d.includes('범골')) {
      return 'DOWN';
    }
  }

  return 'UP';
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

export function getUijeongbuWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
  const { day } = getKstComponents(date);
  if (day === 0) return 'END'; // 일요일
  if (day === 6) return 'SAT'; // 토요일
  return 'DAY';                // 평일 (월~금)
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// ─── 인메모리 압축 DB 로더 (싱글톤) ───────────────────────────────────────────

export interface UijeongbuTimetableEntry {
  t: string;  // 출발 시각 (HH:mm)
  d: string;  // 종착역 (탑석, 차량기지임시승강장, 발곡)
  no: string; // 열차 번호 (U1xxx / U2xxx)
}

export type UijeongbuStationTimetableData = Record<string, UijeongbuTimetableEntry[]>;

export interface UijeongbuDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalRecords: number;
    source: string;
    updatedAt: string;
  };
  data: Record<string, UijeongbuStationTimetableData>;
}

let cachedUijeongbuDb: UijeongbuDatabase | null = null;

export function getUijeongbuTimetableDatabase(): UijeongbuDatabase | null {
  if (cachedUijeongbuDb) {
    return cachedUijeongbuDb;
  }

  try {
    const gzPath = path.join(
      process.cwd(),
      'src',
      'data',
      'subway',
      'timetables',
      'uijeongbu_subway_timetables.json.gz'
    );

    if (!fs.existsSync(gzPath)) {
      console.warn(`[UijeongbuTimetable] 시간표 압축 DB 파일이 존재하지 않습니다: ${gzPath}`);
      return null;
    }

    const gzBuffer = fs.readFileSync(gzPath);
    const jsonStr = zlib.gunzipSync(gzBuffer).toString('utf-8');
    cachedUijeongbuDb = JSON.parse(jsonStr) as UijeongbuDatabase;
    return cachedUijeongbuDb;
  } catch (error) {
    console.error('[UijeongbuTimetable] 시간표 압축 DB 로드 중 오류 발생:', error);
    return null;
  }
}

/**
 * 특정 역의 시간표 데이터를 O(1)로 조회합니다.
 */
export function loadUijeongbuStationTimetable(
  stationName: string
): UijeongbuStationTimetableData | null {
  const db = getUijeongbuTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialUijeongbuStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetUijeongbuNextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
}

export interface UijeongbuNextTrainResult {
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

/**
 * 의정부경전철 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getUijeongbuNextTrain(options: GetUijeongbuNextTrainOptions): UijeongbuNextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date() } = options;

  const officialStation = resolveOfficialUijeongbuStationName(stationName);
  if (!officialStation) return null;

  const db = getUijeongbuTimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveUijeongbuDirection(updnLine, destination, officialStation);
  const weekTag = getUijeongbuWeekTag(baseTime);
  const groupKey = `의정부경전철_${weekTag}_${direction}`;

  const scheduleList = stationData[groupKey];
  if (!scheduleList || scheduleList.length === 0) {
    return null;
  }

  const { hours, minutes } = getKstComponents(baseTime);
  const currentMinutes = hours * 60 + minutes;

  // 04:00 기준 당일 운행 순환 계산
  const upcomingTrains = scheduleList.filter((item) => {
    let trainMin = timeToMinutes(item.t);
    if (trainMin < 240) trainMin += 1440; // 익일 심야 운행편 (00:xx)
    let currMin = currentMinutes;
    if (currMin < 240) currMin += 1440;

    return trainMin >= currMin;
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
      subwayNm: '의정부경전철',
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
      subwayNm: '의정부경전철',
    };
  }

  return null;
}

/** getUijeongbuNextTrain 별칭 함수 */
export const getNextTrainFromUijeongbuTimetable = getUijeongbuNextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getUijeongbuTimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialUijeongbuStationName(stationName);
  if (!officialStation) return [];

  const db = getUijeongbuTimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveUijeongbuDirection(updnLine, undefined, officialStation);
  const groupKey = `의정부경전철_${dayType}_${direction}`;
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
      directionName: direction === 'UP' ? '탑석/차량기지 방면' : '발곡 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `곧 도착` : `${minutesLeft}분 후`,
      isUpcoming,
      isExpress: false,
    });
  }

  return entries;
}
