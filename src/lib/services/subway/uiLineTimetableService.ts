/**
 * @fileoverview 우이신설선(북한산우이 ~ 신설동 13개 역사) 오프라인 압축 시간표 서비스
 * 공식 우이신설도시철도 웹사이트 시간표 데이터를 바탕으로 100% 로컬 인메모리에서 빠른 Fallback 제공
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

export const UI_LINE_CODE = '1092';

/**
 * 우이신설선 공식 역 목록 (북한산우이 기점 ~ 신설동 종점 13개 역사)
 */
export const UI_LINE_STATIONS = [
  '북한산우이',
  '솔밭공원',
  '4·19민주묘지',
  '가오리',
  '화계',
  '삼양',
  '삼양사거리',
  '솔샘',
  '북한산보국문',
  '정릉',
  '성신여대입구',
  '보문',
  '신설동',
] as const;

export type UiLineStationName = typeof UI_LINE_STATIONS[number];

/**
 * 우이신설선 단독 고유역 Set (10개 역)
 * 타 노선과 환승되지 않는 순수 우이신설선 전용 역 목록입니다.
 * 환승역: 성신여대입구(4호선), 보문(6호선), 신설동(1호선, 2호선)
 */
export const UI_LINE_UNIQUE_STATIONS = new Set<string>([
  '북한산우이',
  '솔밭공원',
  '4·19민주묘지',
  '가오리',
  '화계',
  '삼양',
  '삼양사거리',
  '솔샘',
  '북한산보국문',
  '정릉',
]);

const UI_LINE_STATION_SET = new Set<string>(UI_LINE_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '북한산우이역': '북한산우이',
  '솔밭공원역': '솔밭공원',
  '4.19민주묘지': '4·19민주묘지',
  '419민주묘지': '4·19민주묘지',
  '4·19민주묘지역': '4·19민주묘지',
  '4.19민주묘지역': '4·19민주묘지',
  '419민주묘지역': '4·19민주묘지',
  '4·19묘지': '4·19민주묘지',
  '419묘지': '4·19민주묘지',
  '가오리역': '가오리',
  '화계역': '화계',
  '삼양역': '삼양',
  '삼양사거리역': '삼양사거리',
  '솔샘역': '솔샘',
  '북한산보국문역': '북한산보국문',
  '북한산보국문(서경대)': '북한산보국문',
  '서경대': '북한산보국문',
  '정릉역': '정릉',
  '성신여대입구역': '성신여대입구',
  '돈암역': '성신여대입구',
  '보문역': '보문',
  '신설동역': '신설동',
};

/**
 * 주어진 역명이 우이신설선 소속 역인지 확인합니다.
 */
export function isUiLineStation(stationName: string): boolean {
  const official = resolveOfficialUiLineStationName(stationName);
  return official !== null && UI_LINE_STATION_SET.has(official);
}

/**
 * 우이신설선 전용 고유역(환승역 제외 10개 역)인지 확인합니다.
 */
export function isUiLineExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialUiLineStationName(stationName);
  return official !== null && UI_LINE_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 우이신설선인지 확인합니다.
 */
export function isUiLineLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1092' ||
    s === '우이' ||
    s.includes('우이신설') ||
    s.includes('우이') ||
    s.includes('ui-line') ||
    s.includes('uiline')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialUiLineStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '')
    .replace(/역$/g, '')
    .trim();

  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (UI_LINE_STATION_SET.has(clean)) {
    return clean;
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 우이신설선 기준:
 * - 상행(UP): 북한산우이 -> 정릉 -> 성신여대입구 -> 신설동 방면 (1)
 * - 하행(DOWN): 신설동 -> 성신여대입구 -> 정릉 -> 북한산우이 방면 (2)
 */
export function resolveUiLineDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (u === '1' || u === '상행' || u.includes('신설동') || u.includes('성신여대') || u.includes('보문')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('북한산우이') || u.includes('우이') || u.includes('솔밭공원') || u.includes('정릉')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (d.includes('신설동') || d.includes('성신여대') || d.includes('보문')) {
      return 'UP';
    }
    if (d.includes('북한산우이') || d.includes('우이') || d.includes('솔밭공원') || d.includes('정릉')) {
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

export function getUiLineWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
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

export interface UiLineTimetableEntry {
  t: string;  // 출발 시각 (HH:mm)
  d: string;  // 종착역 (신설동 또는 북한산우이)
  no: string; // 열차 번호 (U1xxx / U2xxx)
}

export type UiLineStationTimetableData = Record<string, UiLineTimetableEntry[]>;

export interface UiLineDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalRecords: number;
    source: string;
    updatedAt: string;
  };
  data: Record<string, UiLineStationTimetableData>;
}

let cachedUiLineDb: UiLineDatabase | null = null;

export function getUiLineTimetableDatabase(): UiLineDatabase | null {
  if (cachedUiLineDb) {
    return cachedUiLineDb;
  }

  try {
    const gzPath = path.join(
      process.cwd(),
      'src',
      'data',
      'subway',
      'timetables',
      'ui_line_subway_timetables.json.gz'
    );

    if (!fs.existsSync(gzPath)) {
      console.warn(`[UiLineTimetable] 시간표 압축 DB 파일이 존재하지 않습니다: ${gzPath}`);
      return null;
    }

    const gzBuffer = fs.readFileSync(gzPath);
    const jsonStr = zlib.gunzipSync(gzBuffer).toString('utf-8');
    cachedUiLineDb = JSON.parse(jsonStr) as UiLineDatabase;
    return cachedUiLineDb;
  } catch (error) {
    console.error('[UiLineTimetable] 시간표 압축 DB 로드 중 오류 발생:', error);
    return null;
  }
}

/**
 * 특정 역의 시간표 데이터를 O(1)로 조회합니다.
 */
export function loadUiLineStationTimetable(
  stationName: string
): UiLineStationTimetableData | null {
  const db = getUiLineTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialUiLineStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetUiLineNextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
}

export interface UiLineNextTrainResult {
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
 * 우이신설선 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getUiLineNextTrain(options: GetUiLineNextTrainOptions): UiLineNextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date() } = options;

  const officialStation = resolveOfficialUiLineStationName(stationName);
  if (!officialStation) return null;

  const db = getUiLineTimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveUiLineDirection(updnLine, destination);
  const weekTag = getUiLineWeekTag(baseTime);
  const groupKey = `우이신설선_${weekTag}_${direction}`;

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
      subwayNm: '우이신설선',
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
      subwayNm: '우이신설선',
    };
  }

  return null;
}

/** getUiLineNextTrain 별칭 함수 */
export const getNextTrainFromUiLineTimetable = getUiLineNextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getUiLineTimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialUiLineStationName(stationName);
  if (!officialStation) return [];

  const db = getUiLineTimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveUiLineDirection(updnLine);
  const groupKey = `우이신설선_${dayType}_${direction}`;
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
      directionName: direction === 'UP' ? '신설동 방면' : '북한산우이 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `곧 도착` : `${minutesLeft}분 후`,
      isUpcoming,
      isExpress: false,
    });
  }

  return entries;
}
