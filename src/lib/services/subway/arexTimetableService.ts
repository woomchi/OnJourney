/**
 * 공항철도(AREX, 서울 ~ 인천공항2터미널 14개 역) 공식 시간표 인메모리 서비스
 *
 * 공항철도 공식 열차시각표(data/공항철도_열차시각표_251229.xlsx)를 압축한
 * `arex_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 1분 단위 초정밀 Fallback 도착 정보를 계산합니다.
 * 직통열차(A1xxx, 서울 ↔ 인천공항1·2터미널 직통) 및 일반열차를 완벽 분기 지원합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface ArexTimetableItem {
  no: string; // 열차 번호 (예: "A2001", "A1001")
  t: string;  // 출발 시각 (예: "05:20")
  d: string;  // 종착역 (예: "인천공항2터미널", "검암", "서울", "디지털미디어시티")
  e: number;  // 0: 일반, 1: 직통
}

export interface ArexStationTimetableData {
  [groupKey: string]: ArexTimetableItem[]; // 예: "공항철도_DAY_UP", "공항철도_DAY_DOWN"
}

export interface UnifiedArexTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, ArexStationTimetableData>;
}

export interface ArexNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'arex_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'arex_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedArexTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getArexTimetableDatabase(): UnifiedArexTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedArexTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedArexTimetableDatabase;
      return memoryDb;
    }

    console.warn('[ArexTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[ArexTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 공항철도 14개 여객 역사 목록 및 정규화 유틸 ────────────────────────────────────

/** 공항철도 14개 공식 표준 역사 순서 (서울 ~ 인천공항2터미널) */
export const AREX_STATIONS = [
  '서울',
  '공덕',
  '홍대입구',
  '디지털미디어시티',
  '마곡나루',
  '김포공항',
  '계양',
  '검암',
  '청라국제도시',
  '영종',
  '운서',
  '공항화물청사',
  '인천공항1터미널',
  '인천공항2터미널',
] as const;

/**
 * 공항철도에만 존재하는 단독 고유역 Set (6개 역)
 * 타 수도권 전철 환승이 없는 공항철도 전용 역들입니다.
 */
export const AREX_UNIQUE_STATIONS = new Set<string>([
  '청라국제도시',
  '영종',
  '운서',
  '공항화물청사',
  '인천공항1터미널',
  '인천공항2터미널',
]);

const AREX_STATION_SET = new Set<string>(AREX_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '서울역': '서울',
  '지하서울역': '서울',
  '공덕역': '공덕',
  '홍대입구역': '홍대입구',
  '홍대': '홍대입구',
  '디지털미디어시티역': '디지털미디어시티',
  'DMC': '디지털미디어시티',
  'DMC역': '디지털미디어시티',
  '마곡나루역': '마곡나루',
  '김포공항역': '김포공항',
  '계양역': '계양',
  '검암역': '검암',
  '청라국제도시역': '청라국제도시',
  '청라역': '청라국제도시',
  '영종역': '영종',
  '운서역': '운서',
  '공항화물청사역': '공항화물청사',
  '화물청사': '공항화물청사',
  '화물청사역': '공항화물청사',
  '인천공항1터미널역': '인천공항1터미널',
  '인천국제공항1터미널': '인천공항1터미널',
  '인천공항1': '인천공항1터미널',
  '인천공항T1': '인천공항1터미널',
  '인천공항2터미널역': '인천공항2터미널',
  '인천국제공항2터미널': '인천공항2터미널',
  '인천공항2': '인천공항2터미널',
  '인천공항T2': '인천공항2터미널',
};

/**
 * 주어진 역명이 공항철도 소속 역인지 확인합니다.
 */
export function isArexStation(stationName: string): boolean {
  const official = resolveOfficialArexStationName(stationName);
  return official !== null && AREX_STATION_SET.has(official);
}

/**
 * 공항철도 전용 고유역(환승역 제외 6개 역)인지 확인합니다.
 */
export function isArexExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialArexStationName(stationName);
  return official !== null && AREX_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 공항철도인지 확인합니다.
 */
export function isArexLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1065' ||
    s.includes('공항철도') ||
    s.includes('공항선') ||
    s.includes('arex')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialArexStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '')
    .replace(/역$/g, '')
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (AREX_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 공항철도 기준:
 * - 상행(UP): 인천공항2터미널 -> 공덕 -> 서울역 방면 (1)
 * - 하행(DOWN): 서울역 -> 공덕 -> 검암 -> 인천공항2터미널 방면 (2)
 */
export function resolveArexDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (u === '1' || u === '상행' || u.includes('서울') || u.includes('dmc') || u.includes('공덕') || u.includes('홍대')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('인천공항') || u.includes('검암') || u.includes('청라') || u.includes('공항')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (d.includes('서울') || d.includes('디지털미디어시티') || d.includes('dmc') || d.includes('공덕') || d.includes('홍대입구')) {
      return 'UP';
    }
    if (d.includes('인천공항') || d.includes('검암') || d.includes('청라국제도시') || d.includes('공항') || d.includes('운서') || d.includes('영종')) {
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

export function getArexWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
  const { day } = getKstComponents(date);
  if (day === 0) return 'END'; // 일요일
  if (day === 6) return 'SAT'; // 토요일 (휴일 시간표 공유)
  return 'DAY';                // 평일 (월~금)
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * 특정 역의 시간표 데이터를 O(1)로 조회합니다.
 */
export function loadArexStationTimetable(
  stationName: string
): ArexStationTimetableData | null {
  const db = getArexTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialArexStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetArexNextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
  allowExpress?: boolean; // 직통열차 포함 여부 (기본 true)
}

/**
 * 공항철도 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getArexNextTrain(options: GetArexNextTrainOptions): ArexNextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date(), allowExpress = true } = options;

  const officialStation = resolveOfficialArexStationName(stationName);
  if (!officialStation) return null;

  const db = getArexTimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveArexDirection(updnLine, destination);
  const weekTag = getArexWeekTag(baseTime);
  const groupKey = `공항철도_${weekTag}_${direction}`;

  const scheduleList = stationData[groupKey];
  if (!scheduleList || scheduleList.length === 0) {
    return null;
  }

  const { hours, minutes } = getKstComponents(baseTime);
  const currentMinutes = hours * 60 + minutes;

  // 04:00 기준 당일 운행편 필터링
  // allowExpress가 false이면 일반열차(e === 0)만 선택
  const eligibleTrains = allowExpress ? scheduleList : scheduleList.filter(it => it.e === 0);

  const upcomingTrains = eligibleTrains.filter((item) => {
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
    const isExpress = next.e === 1;
    const expressPrefix = isExpress ? '[직통] ' : '';

    return {
      trainNo: next.no,
      endSubwayStationNm: next.d,
      minutesLeft,
      arrivalTime: next.t,
      statusText: isApproaching
        ? `${expressPrefix}${next.d}행 곧 도착`
        : `${expressPrefix}${next.d}행 약 ${minutesLeft}분 후 (${next.t})`,
      isApproaching,
      isExpress,
      canBoard: true,
      subwayNm: '공항철도',
    };
  }

  // 당일 운행 종료 시 익일 첫차 대기 반환
  const firstTrain = eligibleTrains[0];
  if (firstTrain) {
    const isExpress = firstTrain.e === 1;
    const expressPrefix = isExpress ? '[직통] ' : '';
    return {
      trainNo: firstTrain.no,
      endSubwayStationNm: firstTrain.d,
      minutesLeft: 999,
      arrivalTime: firstTrain.t,
      statusText: `[시간표] 운행종료 (첫차 ${expressPrefix}${firstTrain.t})`,
      isApproaching: false,
      isExpress,
      canBoard: false,
      subwayNm: '공항철도',
    };
  }

  return null;
}

/**
 * getArexNextTrain의 별칭 함수
 */
export const getNextTrainFromArexTimetable = getArexNextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getArexTimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date; allowExpress?: boolean }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialArexStationName(stationName);
  if (!officialStation) return [];

  const db = getArexTimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveArexDirection(updnLine);
  const groupKey = `공항철도_${dayType}_${direction}`;
  const rawList = db.data[officialStation][groupKey] || [];

  const baseTime = options?.baseTime || new Date();
  const { hours, minutes } = getKstComponents(baseTime);
  const currentMinutes = hours * 60 + minutes;

  const allowExpress = options?.allowExpress ?? true;
  const filteredList = allowExpress ? rawList : rawList.filter(it => it.e === 0);

  const entries: SubwayTimetableEntry[] = [];
  let foundFirstUpcoming = false;

  for (const item of filteredList) {
    let trainMin = timeToMinutes(item.t);
    if (trainMin < 240) trainMin += 1440;
    let currMin = currentMinutes;
    if (currMin < 240) currMin += 1440;

    const diff = trainMin - currMin;
    const minutesLeft = diff >= 0 ? diff : 1440 + diff;
    const isUpcoming = !foundFirstUpcoming && diff >= 0;
    if (isUpcoming) foundFirstUpcoming = true;

    const isExpress = item.e === 1;
    const expressPrefix = isExpress ? '[직통] ' : '';

    entries.push({
      trainNo: item.no,
      depTime: item.t,
      destStation: item.d,
      drctType: direction === 'UP' ? '1' : '2',
      directionName: direction === 'UP' ? '서울역 방면' : '인천공항 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `${expressPrefix}곧 도착` : `${expressPrefix}${minutesLeft}분 후`,
      isUpcoming,
      isExpress,
    });
  }

  return entries;
}
