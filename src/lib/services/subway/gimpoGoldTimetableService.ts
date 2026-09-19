/**
 * 김포골드라인(양촌 ~ 구래 ~ 김포공항 10개 역) 공식 시간표 인메모리 서비스
 *
 * 김포골드라인 공식 웹사이트(gimpogoldline.com)의 시간표를 압축한
 * `gimpo_gold_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 1분 단위 초정밀 Fallback 도착 정보를 계산합니다.
 * 구래행 타절 및 양촌행 연장 운행편을 완벽 분기 지원합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface GimpoGoldTimetableItem {
  no: string; // 열차 번호 (예: "G1001", "G2001")
  t: string;  // 출발 시각 (예: "05:26")
  d: string;  // 종착역 (예: "김포공항", "구래", "양촌")
}

export interface GimpoGoldStationTimetableData {
  [groupKey: string]: GimpoGoldTimetableItem[]; // 예: "김포골드라인_DAY_UP", "김포골드라인_DAY_DOWN"
}

export interface UnifiedGimpoGoldTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, GimpoGoldStationTimetableData>;
}

export interface GimpoGoldNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'gimpo_gold_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'gimpo_gold_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedGimpoGoldTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getGimpoGoldTimetableDatabase(): UnifiedGimpoGoldTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedGimpoGoldTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedGimpoGoldTimetableDatabase;
      return memoryDb;
    }

    console.warn('[GimpoGoldTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[GimpoGoldTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 김포골드라인 10개 역사 목록 및 정규화 유틸 ──────────────────────────────────────

/** 김포골드라인 10개 공식 표준 역사 순서 (양촌 ~ 김포공항) */
export const GIMPO_GOLD_STATIONS = [
  '양촌',
  '구래',
  '마산',
  '장기',
  '운양',
  '걸포북변',
  '사우',
  '풍무',
  '고촌',
  '김포공항',
] as const;

/**
 * 김포골드라인에만 존재하는 단독 고유역 Set (환승 없는 9개 역)
 * 김포공항을 제외한 전 역사가 김포골드라인 전용 역입니다.
 */
export const GIMPO_GOLD_UNIQUE_STATIONS = new Set<string>([
  '양촌',
  '구래',
  '마산',
  '장기',
  '운양',
  '걸포북변',
  '사우',
  '풍무',
  '고촌',
]);

const GIMPO_GOLD_STATION_SET = new Set<string>(GIMPO_GOLD_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '양촌역': '양촌',
  '구래역': '구래',
  '마산역': '마산',
  '장기역': '장기',
  '운양역': '운양',
  '걸포북변역': '걸포북변',
  '걸포역': '걸포북변',
  '사우역': '사우',
  '사우(김포시청)': '사우',
  '김포시청역': '사우',
  '김포시청': '사우',
  '풍무역': '풍무',
  '고촌역': '고촌',
  '김포공항역': '김포공항',
  '신김포': '김포공항',
};

/**
 * 주어진 역명이 김포골드라인 소속 역인지 확인합니다.
 */
export function isGimpoGoldStation(stationName: string): boolean {
  const official = resolveOfficialGimpoGoldStationName(stationName);
  return official !== null && GIMPO_GOLD_STATION_SET.has(official);
}

/**
 * 김포골드라인 전용 고유역(환승역 제외 9개 역)인지 확인합니다.
 */
export function isGimpoGoldExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialGimpoGoldStationName(stationName);
  return official !== null && GIMPO_GOLD_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 김포골드라인인지 확인합니다.
 */
export function isGimpoGoldLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1096' ||
    s === '1017' ||
    s === '김포' ||
    s.includes('김포골드') ||
    s.includes('골드라인') ||
    s.includes('김포도시철도') ||
    s.includes('gimpo')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialGimpoGoldStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '')
    .replace(/역$/g, '')
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (GIMPO_GOLD_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 김포골드라인 기준:
 * - 상행(UP): 양촌/구래 -> 사우 -> 고촌 -> 김포공항 방면 (1)
 * - 하행(DOWN): 김포공항 -> 고촌 -> 사우 -> 구래/양촌 방면 (2)
 */
export function resolveGimpoGoldDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (u === '1' || u === '상행' || u.includes('김포공항') || u.includes('공항')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('구래') || u.includes('양촌') || u.includes('마산') || u.includes('장기')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (d.includes('김포공항') || d.includes('공항')) {
      return 'UP';
    }
    if (d.includes('구래') || d.includes('양촌') || d.includes('마산') || d.includes('장기') || d.includes('사우')) {
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

export function getGimpoGoldWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
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
export function loadGimpoGoldStationTimetable(
  stationName: string
): GimpoGoldStationTimetableData | null {
  const db = getGimpoGoldTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialGimpoGoldStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetGimpoGoldNextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
}

/**
 * 김포골드라인 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getGimpoGoldNextTrain(options: GetGimpoGoldNextTrainOptions): GimpoGoldNextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date() } = options;

  const officialStation = resolveOfficialGimpoGoldStationName(stationName);
  if (!officialStation) return null;

  const db = getGimpoGoldTimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveGimpoGoldDirection(updnLine, destination);
  const weekTag = getGimpoGoldWeekTag(baseTime);
  const groupKey = `김포골드라인_${weekTag}_${direction}`;

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
      subwayNm: '김포골드라인',
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
      subwayNm: '김포골드라인',
    };
  }

  return null;
}

/** getGimpoGoldNextTrain 별칭 함수 */
export const getNextTrainFromGimpoGoldTimetable = getGimpoGoldNextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getGimpoGoldTimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialGimpoGoldStationName(stationName);
  if (!officialStation) return [];

  const db = getGimpoGoldTimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveGimpoGoldDirection(updnLine);
  const groupKey = `김포골드라인_${dayType}_${direction}`;
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
      directionName: direction === 'UP' ? '김포공항 방면' : '구래/양촌 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `곧 도착` : `${minutesLeft}분 후`,
      isUpcoming,
      isExpress: false,
    });
  }

  return entries;
}
