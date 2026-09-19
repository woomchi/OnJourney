/**
 * 에버라인(용인경전철, 기흥 ~ 전대·에버랜드 15개 역) 공식 시간표 인메모리 서비스
 *
 * 용인경전철 공식 운행 시간표 데이터(15개 역 첫차/막차 및 공식 배차간격표)를 압축한
 * `everline_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 1분 단위 초정밀 Fallback 도착 정보를 계산합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface EverlineTimetableItem {
  no: string; // 열차 번호 (예: "Y1001", "Y2001")
  t: string;  // 출발 시각 (예: "05:30")
  d: string;  // 종착역 (예: "기흥", "전대·에버랜드")
}

export interface EverlineStationTimetableData {
  [groupKey: string]: EverlineTimetableItem[]; // 예: "에버라인_DAY_UP", "에버라인_DAY_DOWN"
}

export interface UnifiedEverlineTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, EverlineStationTimetableData>;
}

export interface EverlineNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'everline_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'everline_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedEverlineTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getEverlineTimetableDatabase(): UnifiedEverlineTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedEverlineTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedEverlineTimetableDatabase;
      return memoryDb;
    }

    console.warn('[EverlineTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[EverlineTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 에버라인 15개 역사 목록 및 정규화 유틸 ──────────────────────────────────────────

/** 에버라인 15개 역사 공식 표준명 순서 */
export const EVERLINE_STATIONS = [
  '기흥',
  '강남대',
  '지석',
  '어정',
  '동백',
  '초당',
  '삼가',
  '시청·용인대',
  '명지대',
  '김량장',
  '용인중앙시장',
  '고진',
  '보평',
  '둔전',
  '전대·에버랜드',
] as const;

/**
 * 에버라인에만 존재하는 고유역 Set
 * 환승역인 기흥역을 제외한 14개 역은 다른 노선과 겹치지 않는 고유역입니다.
 */
export const EVERLINE_UNIQUE_STATIONS = new Set<string>([
  '강남대',
  '지석',
  '어정',
  '동백',
  '초당',
  '삼가',
  '시청·용인대',
  '명지대',
  '김량장',
  '용인중앙시장',
  '고진',
  '보평',
  '둔전',
  '전대·에버랜드',
]);

const EVERLINE_STATION_SET = new Set<string>(EVERLINE_STATIONS);

/**
 * 역명 별칭 및 구 명칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '기흥역': '기흥',
  '백남준아트센터': '기흥',
  '강남대역': '강남대',
  '지석역': '지석',
  '어정역': '어정',
  '동백역': '동백',
  '초당역': '초당',
  '삼가역': '삼가',
  '시청·용인대역': '시청·용인대',
  '시청용인대': '시청·용인대',
  '용인시청': '시청·용인대',
  '명지대역': '명지대',
  '김량장역': '김량장',
  '용인중앙시장역': '용인중앙시장',
  '용인예술과학대': '용인중앙시장',
  '운동장·송담대': '용인중앙시장',
  '운동장송담대': '용인중앙시장',
  '송담대': '용인중앙시장',
  '고진역': '고진',
  '보평역': '보평',
  '둔전역': '둔전',
  '전대·에버랜드역': '전대·에버랜드',
  '전대에버랜드': '전대·에버랜드',
  '에버랜드': '전대·에버랜드',
  '에버랜드역': '전대·에버랜드',
  '전대': '전대·에버랜드',
};

/**
 * 주어진 역명이 에버라인 소속 역인지 확인합니다.
 */
export function isEverlineStation(stationName: string): boolean {
  const official = resolveOfficialEverlineStationName(stationName);
  return official !== null && EVERLINE_STATION_SET.has(official);
}

/**
 * 입력된 노선 식별자가 에버라인인지 확인합니다.
 */
export function isEverlineLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim();
  return (
    s === '1079' ||
    s.includes('에버라인') ||
    s.includes('용인경전철') ||
    s.includes('에버')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialEverlineStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '') // 괄호 및 부역명 제거
    .replace(/역$/g, '')      // 끝자리 '역' 제거
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (EVERLINE_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 에버라인 기준:
 * - 상행(UP): 전대·에버랜드 -> 기흥 방면 (1)
 * - 하행(DOWN): 기흥 -> 전대·에버랜드 방면 (2)
 */
export function resolveEverlineDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim();
    if (u === '1' || u === '상행' || u.includes('기흥')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('전대') || u.includes('에버')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim();
    if (d.includes('기흥') || d.includes('강남대') || d.includes('지석') || d.includes('어정')) {
      return 'UP';
    }
    if (d.includes('전대') || d.includes('에버랜드') || d.includes('둔전') || d.includes('보평')) {
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

function resolveEverlineWeekTag(date: Date): 'DAY' | 'SAT' | 'END' {
  const { day } = getKstComponents(date);
  if (day === 0) return 'END'; // 일요일 / 공휴일
  if (day === 6) return 'SAT'; // 토요일
  return 'DAY';                 // 평일
}

function toOperationalSeconds(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const adjustedHour = h < 4 ? h + 24 : h;
  return adjustedHour * 3600 + m * 60;
}

function toOperationalMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  const adjustedHour = h < 4 ? h + 24 : h;
  return adjustedHour * 60 + m;
}

// ─── 시간표 조회 핵심 서비스 ──────────────────────────────────────────────────

/**
 * 특정 역의 시간표 해시 항목을 O(1)로 조회합니다.
 */
export function loadEverlineStationTimetable(
  stationName: string
): EverlineStationTimetableData | null {
  const db = getEverlineTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialEverlineStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

/**
 * 에버라인 인메모리 시간표에서 현재 시각 기준 다음 열차 도착 정보를 계산합니다.
 */
export function getNextTrainFromEverlineTimetable(params: {
  stationName: string;
  updnLine: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  now?: Date;
}): EverlineNextTrainResult | null {
  const { stationName, updnLine, destination, headsign, now = new Date() } = params;

  const officialStation = resolveOfficialEverlineStationName(stationName);
  if (!officialStation) return null;

  const stationData = loadEverlineStationTimetable(officialStation);
  if (!stationData) return null;

  const dir = resolveEverlineDirection(updnLine, destination || headsign);
  const weekTag = resolveEverlineWeekTag(now);
  const groupKey = `에버라인_${weekTag}_${dir}`;
  const trains = stationData[groupKey] || [];

  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const upcoming = trains.filter((tr) => toOperationalSeconds(tr.t) >= currentOpSec);
  const dirLabel = dir === 'UP' ? '기흥' : '전대·에버랜드';

  // 오늘 남은 열차가 없는 경우 (심야 미운행 시간대: 23:30 이후 ~ 05:30 첫차 이전)
  if (upcoming.length === 0) {
    const first = trains[0];
    const firstTime = first ? first.t : '05:30';
    const dest = first ? first.d : dirLabel;
    return {
      trainNo: first ? first.no : 'FIRST_TRAIN_WAITING',
      endSubwayStationNm: dest,
      minutesLeft: 999,
      arrivalTime: firstTime,
      statusText: `[시간표] 운행 종료 (첫차 ${firstTime})`,
      isApproaching: false,
      isExpress: false,
      canBoard: false,
      subwayNm: '에버라인',
    };
  }

  const next = upcoming[0];
  const targetSec = toOperationalSeconds(next.t);
  const diffSec = targetSec - currentOpSec;
  const minutesLeft = Math.max(0, Math.ceil(diffSec / 60));

  const endDest = next.d || dirLabel;
  const statusText = `[시간표] ${endDest}행 (${next.t})`;

  return {
    trainNo: next.no,
    endSubwayStationNm: endDest,
    minutesLeft,
    arrivalTime: next.t,
    statusText,
    isApproaching: minutesLeft <= 2,
    isExpress: false,
    canBoard: true,
    subwayNm: '에버라인',
  };
}

/**
 * 노선 상세 패널 / 시간표 팝업 등에서 사용하기 위해 역별 하루 전체 시각표를 조회합니다.
 */
export function getEverlineTimetableList(
  stationName: string,
  direction?: 'UP' | 'DOWN',
  now: Date = new Date(),
  limit = 50
): SubwayTimetableEntry[] {
  const official = resolveOfficialEverlineStationName(stationName);
  if (!official) return [];

  const stationData = loadEverlineStationTimetable(official);
  if (!stationData) return [];

  const weekTag = resolveEverlineWeekTag(now);
  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const entries: SubwayTimetableEntry[] = [];
  const dirs: ('UP' | 'DOWN')[] = direction ? [direction] : ['UP', 'DOWN'];

  for (const dir of dirs) {
    const gkey = `에버라인_${weekTag}_${dir}`;
    const trains = stationData[gkey] || [];

    trains.forEach((tr, index) => {
      const trSec = toOperationalSeconds(tr.t);
      const diffSec = trSec - currentOpSec;
      const minutesLeft = diffSec >= 0 ? Math.ceil(diffSec / 60) : 999;
      const isPast = diffSec < 0;

      entries.push({
        trainNo: tr.no,
        depTime: tr.t,
        destStation: tr.d,
        drctType: dir === 'UP' ? '1' : '2',
        directionName: `${tr.d} 방면 (${dir === 'UP' ? '상행' : '하행'})`,
        minutesLeft: isPast ? 999 : minutesLeft,
        statusText: isPast ? '출발 완료' : (minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후`),
        isUpcoming: !isPast && index === 0,
        isExpress: false,
      });
    });
  }

  // 출발 시각 기준 오름차순 정렬 후 limit 반환
  entries.sort((a, b) => toOperationalMinutes(a.depTime) - toOperationalMinutes(b.depTime));
  return entries.slice(0, limit);
}
