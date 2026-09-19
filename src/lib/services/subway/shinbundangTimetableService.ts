/**
 * 신분당선(신사 ~ 강남 ~ 판교 ~ 광교 16개 역) 공식 시간표 인메모리 서비스
 *
 * 네오트랜스 공식 신분당선 열차시각표(data/역별 열차시각표_*.pdf)를 압축한
 * `shinbundang_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 1분 단위 초정밀 Fallback 도착 정보를 계산합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface ShinbundangTimetableItem {
  no: string; // 열차 번호 (예: "D1001", "D2001")
  t: string;  // 출발 시각 (예: "05:30")
  d: string;  // 종착역 (예: "신사", "광교", "정자")
}

export interface ShinbundangStationTimetableData {
  [groupKey: string]: ShinbundangTimetableItem[]; // 예: "신분당선_DAY_UP", "신분당선_DAY_DOWN"
}

export interface UnifiedShinbundangTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, ShinbundangStationTimetableData>;
}

export interface ShinbundangNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'shinbundang_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'shinbundang_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedShinbundangTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getShinbundangTimetableDatabase(): UnifiedShinbundangTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedShinbundangTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedShinbundangTimetableDatabase;
      return memoryDb;
    }

    console.warn('[ShinbundangTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[ShinbundangTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 신분당선 16개 역사 목록 및 정규화 유틸 ──────────────────────────────────────────

/** 신분당선 16개 공식 표준 역사 순서 (신사 ~ 광교) */
export const SHINBUNDANG_STATIONS = [
  '신사',
  '논현',
  '신논현',
  '강남',
  '양재',
  '양재시민의숲',
  '청계산입구',
  '판교',
  '정자',
  '미금',
  '동천',
  '수지구청',
  '성복',
  '상현',
  '광교중앙',
  '광교',
] as const;

/**
 * 신분당선에만 존재하는 고유역 Set (8개 역)
 * 환승역을 제외한 순수 신분당선 단독 역들입니다.
 */
export const SHINBUNDANG_UNIQUE_STATIONS = new Set<string>([
  '양재시민의숲',
  '청계산입구',
  '동천',
  '수지구청',
  '성복',
  '상현',
  '광교중앙',
  '광교',
]);

const SHINBUNDANG_STATION_SET = new Set<string>(SHINBUNDANG_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '신사역': '신사',
  '논현역': '논현',
  '신논현역': '신논현',
  '강남역': '강남',
  '양재역': '양재',
  '서초구청': '양재',
  '양재시민의숲역': '양재시민의숲',
  '양재시민의숲(매헌)': '양재시민의숲',
  '매헌': '양재시민의숲',
  '매헌역': '양재시민의숲',
  '청계산입구역': '청계산입구',
  '판교역': '판교',
  '정자역': '정자',
  '미금역': '미금',
  '동천역': '동천',
  '수지구청역': '수지구청',
  '성복역': '성복',
  '상현역': '상현',
  '광교중앙역': '광교중앙',
  '광교중앙(아주대)': '광교중앙',
  '아주대': '광교중앙',
  '광교역': '광교',
  '광교(경기대)': '광교',
  '경기대': '광교',
};

/**
 * 주어진 역명이 신분당선 소속 역인지 확인합니다.
 */
export function isShinbundangStation(stationName: string): boolean {
  const official = resolveOfficialShinbundangStationName(stationName);
  return official !== null && SHINBUNDANG_STATION_SET.has(official);
}

/**
 * 신분당선 전용 고유역(환승역 제외 8개 역)인지 확인합니다.
 */
export function isShinbundangExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialShinbundangStationName(stationName);
  return official !== null && SHINBUNDANG_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 신분당선인지 확인합니다.
 */
export function isShinbundangLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim();
  return (
    s === '1077' ||
    s.includes('신분당선') ||
    s.includes('신분당')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialShinbundangStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '') // 괄호 및 부역명 제거
    .replace(/역$/g, '')      // 끝자리 '역' 제거
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (SHINBUNDANG_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 신분당선 기준:
 * - 상행(UP): 광교/정자 -> 판교 -> 강남 -> 신사 방면 (1)
 * - 하행(DOWN): 신사 -> 강남 -> 판교 -> 정자 -> 광교 방면 (2)
 */
export function resolveShinbundangDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim();
    if (u === '1' || u === '상행' || u.includes('신사') || u.includes('강남') || u.includes('양재')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('광교') || u.includes('정자') || u.includes('판교')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim();
    if (d.includes('신사') || d.includes('논현') || d.includes('강남') || d.includes('양재')) {
      return 'UP';
    }
    if (d.includes('광교') || d.includes('정자') || d.includes('미금') || d.includes('수지') || d.includes('판교')) {
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

function resolveShinbundangWeekTag(date: Date): 'DAY' | 'SAT' | 'END' {
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
export function loadShinbundangStationTimetable(
  stationName: string
): ShinbundangStationTimetableData | null {
  const db = getShinbundangTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialShinbundangStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

/**
 * 신분당선 인메모리 시간표에서 현재 시각 기준 다음 열차 도착 정보를 계산합니다.
 */
export function getNextTrainFromShinbundangTimetable(params: {
  stationName: string;
  updnLine: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  now?: Date;
}): ShinbundangNextTrainResult | null {
  const { stationName, updnLine, destination, headsign, now = new Date() } = params;

  const officialStation = resolveOfficialShinbundangStationName(stationName);
  if (!officialStation) return null;

  const stationData = loadShinbundangStationTimetable(officialStation);
  if (!stationData) return null;

  const dir = resolveShinbundangDirection(updnLine, destination || headsign);
  const weekTag = resolveShinbundangWeekTag(now);
  const groupKey = `신분당선_${weekTag}_${dir}`;
  const trains = stationData[groupKey] || [];

  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const upcoming = trains.filter((tr) => toOperationalSeconds(tr.t) >= currentOpSec);
  const dirLabel = dir === 'UP' ? '신사' : '광교';

  // 오늘 남은 열차가 없는 경우 (심야 미운행 시간대: 막차 이후 ~ 익일 05:30 첫차 이전)
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
      subwayNm: '신분당선',
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
    subwayNm: '신분당선',
  };
}

/**
 * 노선 상세 패널 / 시간표 팝업 등에서 사용하기 위해 역별 하루 전체 시각표를 조회합니다.
 */
export function getShinbundangTimetableList(
  stationName: string,
  direction?: 'UP' | 'DOWN',
  now: Date = new Date(),
  limit = 50
): SubwayTimetableEntry[] {
  const official = resolveOfficialShinbundangStationName(stationName);
  if (!official) return [];

  const stationData = loadShinbundangStationTimetable(official);
  if (!stationData) return [];

  const weekTag = resolveShinbundangWeekTag(now);
  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const entries: SubwayTimetableEntry[] = [];
  const dirs: ('UP' | 'DOWN')[] = direction ? [direction] : ['UP', 'DOWN'];

  for (const dir of dirs) {
    const gkey = `신분당선_${weekTag}_${dir}`;
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
