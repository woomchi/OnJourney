/**
 * 서해선(일산 ~ 대곡 ~ 소사 ~ 원시 21개 역) 공식 시간표 인메모리 서비스
 *
 * 코레일 공식 서해선 열차시간표(data/서해선_열차시간표.xlsx)를 압축한
 * `seohae_subway_timetables.json.gz`를 인메모리 싱글톤으로 로드하여,
 * 실시간 API 장애 또는 미제공 시 완벽한 Fallback 도착 정보를 계산합니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface SeohaeTimetableItem {
  no: string; // 열차 번호 (예: "K7102", "K7202")
  t: string;  // 출발 시각 (예: "05:05")
  d: string;  // 종착역 (예: "일산", "대곡", "원시")
  e?: number; // 급행 여부 (서해선은 전 역 일반, 0 또는 생략)
}

export interface SeohaeStationTimetableData {
  [groupKey: string]: SeohaeTimetableItem[]; // 예: "서해선_DAY_UP", "서해선_DAY_DOWN"
}

export interface UnifiedSeohaeTimetableDatabase {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalTimetableEntries: number;
    stations: string[];
    source?: string;
  };
  data: Record<string, SeohaeStationTimetableData>;
}

export interface SeohaeNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'seohae_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'seohae_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedSeohaeTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getSeohaeTimetableDatabase(): UnifiedSeohaeTimetableDatabase | null {
  if (memoryDb) {
    return memoryDb;
  }

  try {
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzippedBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonBuffer = zlib.gunzipSync(gzippedBuffer);
      memoryDb = JSON.parse(jsonBuffer.toString('utf-8')) as UnifiedSeohaeTimetableDatabase;
      return memoryDb;
    }

    if (fs.existsSync(JSON_DB_PATH)) {
      const rawText = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(rawText) as UnifiedSeohaeTimetableDatabase;
      return memoryDb;
    }

    console.warn('[SeohaeTimetable] 시간표 데이터베이스 파일을 찾을 수 없습니다.');
    return null;
  } catch (error) {
    console.error('[SeohaeTimetable] 시간표 데이터베이스 로드 실패:', error);
    return null;
  }
}

// ─── 서해선 21개 역사 목록 및 정규화 유틸 ──────────────────────────────────────────

/** 서해선 21개 공식 표준 역사 순서 (원시 ~ 일산) */
export const SEOHAE_STATIONS = [
  '원시',
  '시우',
  '초지',
  '선부',
  '달미',
  '시흥능곡',
  '시흥시청',
  '신현',
  '신천',
  '시흥대야',
  '소새울',
  '소사',
  '부천종합운동장',
  '원종',
  '김포공항',
  '능곡',
  '대곡',
  '곡산',
  '백마',
  '풍산',
  '일산',
] as const;

/**
 * 서해선에만 존재하는 고유역 Set (11개 역)
 * 타 노선과 환승/공용되지 않는 역들입니다.
 */
export const SEOHAE_UNIQUE_STATIONS = new Set<string>([
  '원시',
  '시우',
  '선부',
  '달미',
  '시흥능곡',
  '시흥시청',
  '신현',
  '신천',
  '시흥대야',
  '소새울',
  '원종',
]);

const SEOHAE_STATION_SET = new Set<string>(SEOHAE_STATIONS);

/**
 * 코레일 엑셀 구 역명 및 축약 역명 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '신초지': '초지',
  '초지역': '초지',
  '선부역': '선부',
  '달미역': '달미',
  '시흥능': '시흥능곡',
  '시흥능곡역': '시흥능곡',
  '시흥청': '시흥시청',
  '시흥시청역': '시흥시청',
  '신신현': '신현',
  '신현역': '신현',
  '신신천': '신천',
  '신천역': '신천',
  '시흥대': '시흥대야',
  '시흥대야역': '시흥대야',
  '소새울역': '소새울',
  '신소사': '소사',
  '소사역': '소사',
  '부천종': '부천종합운동장',
  '부천종합운동장역': '부천종합운동장',
  '원종역': '원종',
  '신김포': '김포공항',
  '김포공항역': '김포공항',
  '능곡역': '능곡',
  '대곡역': '대곡',
  '곡산역': '곡산',
  '백마역': '백마',
  '풍산역': '풍산',
  '일산역': '일산',
  '원시역': '원시',
  '시우역': '시우',
};

/**
 * 주어진 역명이 서해선 소속 역인지 확인합니다.
 */
export function isSeohaeStation(stationName: string): boolean {
  const official = resolveOfficialSeohaeStationName(stationName);
  return official !== null && SEOHAE_STATION_SET.has(official);
}

/**
 * 입력된 노선 식별자가 서해선인지 확인합니다.
 */
export function isSeohaeLine(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim();
  return (
    s === '1093' ||
    s.includes('서해선') ||
    s.includes('서해')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialSeohaeStationName(rawStationName?: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '') // 괄호 및 부역명 제거
    .replace(/역$/g, '')      // 끝자리 '역' 제거
    .trim();

  if (ALIAS_MAP[clean]) {
    return ALIAS_MAP[clean];
  }
  if (SEOHAE_STATION_SET.has(clean)) {
    return clean;
  }
  if (ALIAS_MAP[rawStationName.trim()]) {
    return ALIAS_MAP[rawStationName.trim()];
  }
  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 서해선 기준:
 * - 상행(UP): 원시 -> 소사 -> 김포공항 -> 대곡 -> 일산 방면 (1)
 * - 하행(DOWN): 일산/대곡 -> 김포공항 -> 소사 -> 원시 방면 (2)
 */
export function resolveSeohaeDirection(
  updnLine?: string,
  destination?: string
): 'UP' | 'DOWN' {
  if (updnLine) {
    const u = updnLine.trim();
    if (u === '1' || u === '상행' || u.includes('일산') || u.includes('대곡') || u.includes('소사')) return 'UP';
    if (u === '2' || u === '하행' || u.includes('원시') || u.includes('초지') || u.includes('시흥')) return 'DOWN';
  }

  if (destination) {
    const d = destination.trim();
    if (d.includes('일산') || d.includes('대곡') || d.includes('능곡') || d.includes('김포공항') || d.includes('원종') || d.includes('부천종합운동장')) {
      return 'UP';
    }
    if (d.includes('원시') || d.includes('시우') || d.includes('초지') || d.includes('시흥시청') || d.includes('신천')) {
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

function resolveSeohaeWeekTag(date: Date): 'DAY' | 'SAT' | 'END' {
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
export function loadSeohaeStationTimetable(
  stationName: string
): SeohaeStationTimetableData | null {
  const db = getSeohaeTimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialSeohaeStationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

/**
 * 서해선 인메모리 시간표에서 현재 시각 기준 다음 열차 도착 정보를 계산합니다.
 */
export function getNextTrainFromSeohaeTimetable(params: {
  stationName: string;
  updnLine: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  now?: Date;
}): SeohaeNextTrainResult | null {
  const { stationName, updnLine, destination, headsign, now = new Date() } = params;

  const officialStation = resolveOfficialSeohaeStationName(stationName);
  if (!officialStation) return null;

  const stationData = loadSeohaeStationTimetable(officialStation);
  if (!stationData) return null;

  const dir = resolveSeohaeDirection(updnLine, destination || headsign);
  const weekTag = resolveSeohaeWeekTag(now);
  const groupKey = `서해선_${weekTag}_${dir}`;
  const trains = stationData[groupKey] || [];

  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const upcoming = trains.filter((tr) => toOperationalSeconds(tr.t) >= currentOpSec);
  const dirLabel = dir === 'UP' ? '일산' : '원시';

  // 오늘 남은 열차가 없는 경우 (심야 미운행 시간대: 막차 이후 ~ 익일 05:00 첫차 이전)
  if (upcoming.length === 0) {
    const first = trains[0];
    const firstTime = first ? first.t : '05:00';
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
      subwayNm: '서해선',
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
    subwayNm: '서해선',
  };
}

/**
 * 노선 상세 패널 / 시간표 팝업 등에서 사용하기 위해 역별 하루 전체 시각표를 조회합니다.
 */
export function getSeohaeTimetableList(
  stationName: string,
  direction?: 'UP' | 'DOWN',
  now: Date = new Date(),
  limit = 50
): SubwayTimetableEntry[] {
  const official = resolveOfficialSeohaeStationName(stationName);
  if (!official) return [];

  const stationData = loadSeohaeStationTimetable(official);
  if (!stationData) return [];

  const weekTag = resolveSeohaeWeekTag(now);
  const { hours, minutes, seconds } = getKstComponents(now);
  const currentOpSec = (hours < 4 ? hours + 24 : hours) * 3600 + minutes * 60 + seconds;

  const entries: SubwayTimetableEntry[] = [];
  const dirs: ('UP' | 'DOWN')[] = direction ? [direction] : ['UP', 'DOWN'];

  for (const dir of dirs) {
    const gkey = `서해선_${weekTag}_${dir}`;
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
