/**
 * @fileoverview 인천 1호선(검단호수공원 ~ 송도달빛축제공원 33개 역사) 오프라인 압축 시간표 서비스
 * 공식 인천교통공사 시간표 데이터를 바탕으로 100% 로컬 인메모리에서 빠른 Fallback 제공
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

export const INCHEON_1_LINE_CODE = '1069';

/**
 * 인천 1호선 공식 역 목록 (상행 기준: 송도달빛축제공원 -> 검단호수공원 33개 역사)
 */
export const INCHEON_1_STATIONS = [
  '송도달빛축제공원',
  '국제업무지구',
  '센트럴파크',
  '인천대입구',
  '지식정보단지',
  '테크노파크',
  '캠퍼스타운',
  '동막',
  '동춘',
  '원인재',
  '신연수',
  '선학',
  '문학경기장',
  '인천터미널',
  '예술회관',
  '인천시청',
  '간석오거리',
  '부평삼거리',
  '동수',
  '부평',
  '부평시장',
  '부평구청',
  '갈산',
  '작전',
  '경인교대입구',
  '계산',
  '임학',
  '박촌',
  '귤현',
  '계양',
  '아라',
  '신검단중앙',
  '검단호수공원',
] as const;

export type Incheon1StationName = typeof INCHEON_1_STATIONS[number];

/**
 * 인천 1호선 단독 고유역 Set (28개 역)
 * 타 노선과 환승되지 않는 순수 인천 1호선 전용 역 목록입니다.
 * 환승역(5개): 계양(공항철도), 부평구청(7호선), 부평(1호선), 인천시청(인천2호선), 원인재(수인분당선)
 */
export const INCHEON_1_UNIQUE_STATIONS = new Set<string>([
  '송도달빛축제공원',
  '국제업무지구',
  '센트럴파크',
  '인천대입구',
  '지식정보단지',
  '테크노파크',
  '캠퍼스타운',
  '동막',
  '동춘',
  '신연수',
  '선학',
  '문학경기장',
  '인천터미널',
  '예술회관',
  '간석오거리',
  '부평삼거리',
  '동수',
  '부평시장',
  '갈산',
  '작전',
  '경인교대입구',
  '계산',
  '임학',
  '박촌',
  '귤현',
  '아라',
  '신검단중앙',
  '검단호수공원',
]);

const INCHEON_1_STATION_SET = new Set<string>(INCHEON_1_STATIONS);

/**
 * 부역명 및 별칭 정규화 맵
 */
const ALIAS_MAP: Record<string, string> = {
  '송도달빛축제공원역': '송도달빛축제공원',
  '송도달빛축제': '송도달빛축제공원',
  '달빛축제공원': '송도달빛축제공원',
  '국제업무지구역': '국제업무지구',
  '센트럴파크역': '센트럴파크',
  '인천대입구역': '인천대입구',
  '인천대입구(송도스타트업파크)': '인천대입구',
  '지식정보단지역': '지식정보단지',
  '테크노파크역': '테크노파크',
  '테크노파크(현대프리미엄아울렛송도점)': '테크노파크',
  '캠퍼스타운역': '캠퍼스타운',
  '캠퍼스타운(연세대학교)': '캠퍼스타운',
  '동막역': '동막',
  '동막(인천대건고등학교)': '동막',
  '동춘역': '동춘',
  '원인재역': '원인재',
  '신연수역': '신연수',
  '신연수(가천대메디컬캠퍼스)': '신연수',
  '신연수(가천대학교 메디컬캠퍼스)': '신연수',
  '선학역': '선학',
  '선학(선학별빛도서관)': '선학',
  '문학경기장역': '문학경기장',
  '인천터미널역': '인천터미널',
  '예술회관역': '예술회관',
  '인천시청역': '인천시청',
  '간석오거리역': '간석오거리',
  '부평삼거리역': '부평삼거리',
  '동수역': '동수',
  '부평역': '부평',
  '부평시장역': '부평시장',
  '부평구청역': '부평구청',
  '부평구청(세림병원)': '부평구청',
  '갈산역': '갈산',
  '갈산(인천테크노밸리U1센터)': '갈산',
  '작전역': '작전',
  '경인교대입구역': '경인교대입구',
  '경인교대역': '경인교대입구',
  '경인교대': '경인교대입구',
  '경인교대입구(상록호텔외식직업전문학교)': '경인교대입구',
  '계산역': '계산',
  '계산(인천동물의료센터)': '계산',
  '임학역': '임학',
  '박촌역': '박촌',
  '박촌(계양산소방)': '박촌',
  '귤현역': '귤현',
  '귤현(인천스마트모빌리티교통안전체험관)': '귤현',
  '계양역': '계양',
  '아라역': '아라',
  '신검단중앙역': '신검단중앙',
  '검단호수공원역': '검단호수공원',
  '검단호수': '검단호수공원',
};

/**
 * 주어진 역명이 인천 1호선 소속 역인지 확인합니다.
 */
export function isIncheon1Station(stationName: string): boolean {
  const official = resolveOfficialIncheon1StationName(stationName);
  return official !== null && INCHEON_1_STATION_SET.has(official);
}

/**
 * 인천 1호선 전용 고유역(환승역 제외 28개 역)인지 확인합니다.
 */
export function isIncheon1ExclusiveStation(stationName: string): boolean {
  const official = resolveOfficialIncheon1StationName(stationName);
  return official !== null && INCHEON_1_UNIQUE_STATIONS.has(official);
}

/**
 * 입력된 노선 식별자가 인천 1호선인지 확인합니다.
 */
export function isIncheon1Line(lineOrId?: string | number): boolean {
  if (!lineOrId) return false;
  const s = String(lineOrId).trim().toLowerCase();
  return (
    s === '1069' ||
    s === '인천1호선' ||
    s === '인천 1호선' ||
    s === '인천1' ||
    s === '인천 1' ||
    s.includes('인천1호선') ||
    s.includes('인천 1호선') ||
    s.includes('인천1') ||
    s.includes('인천선') ||
    s.includes('incheon-1') ||
    s.includes('incheon1')
  );
}

/**
 * 역명에서 불필요한 공백, 괄호 부역명을 제거하고 공식 표준 역명으로 변환합니다.
 */
export function resolveOfficialIncheon1StationName(rawStationName?: string): string | null {
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

  if (INCHEON_1_STATION_SET.has(clean)) {
    return clean;
  }

  return null;
}

/**
 * 방향(상행/하행)을 판정합니다.
 * 인천 1호선 기준:
 * - 상행(UP): 송도달빛축제공원 -> 원인재 -> 인천시청 -> 부평 -> 계양 -> 검단호수공원 방면 (1)
 * - 하행(DOWN): 검단호수공원 -> 계양 -> 부평 -> 인천시청 -> 원인재 -> 송도달빛축제공원 방면 (2)
 */
export function resolveIncheon1Direction(
  updnLine?: string,
  destination?: string,
  stationName?: string
): 'UP' | 'DOWN' {
  const officialStation = resolveOfficialIncheon1StationName(stationName);
  // 기점 송도달빛축제공원은 상행(검단/계양행)만 존재
  if (officialStation === '송도달빛축제공원') return 'UP';
  // 종점 검단호수공원은 하행(송도행)만 존재
  if (officialStation === '검단호수공원') return 'DOWN';

  if (updnLine) {
    const u = updnLine.trim().toLowerCase();
    if (
      u === '1' ||
      u === '상행' ||
      u.includes('검단') ||
      u.includes('계양') ||
      u.includes('박촌') ||
      u.includes('귤현') ||
      u.includes('임학') ||
      u.includes('계산') ||
      u.includes('작전')
    ) {
      return 'UP';
    }
    if (
      u === '2' ||
      u === '하행' ||
      u.includes('송도') ||
      u.includes('달빛축제') ||
      u.includes('센트럴파크') ||
      u.includes('동막') ||
      u.includes('동춘') ||
      u.includes('원인재') ||
      u.includes('인천시청') ||
      u.includes('예술회관')
    ) {
      return 'DOWN';
    }
  }

  if (destination) {
    const d = destination.trim().toLowerCase();
    if (
      d.includes('검단') ||
      d.includes('계양') ||
      d.includes('박촌') ||
      d.includes('귤현') ||
      d.includes('임학') ||
      d.includes('계산') ||
      d.includes('아라') ||
      d.includes('신검단')
    ) {
      return 'UP';
    }
    if (
      d.includes('송도') ||
      d.includes('달빛축제') ||
      d.includes('센트럴파크') ||
      d.includes('동막') ||
      d.includes('동춘') ||
      d.includes('원인재') ||
      d.includes('인천시청') ||
      d.includes('경인교대')
    ) {
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

export function getIncheon1WeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
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

export interface Incheon1TimetableEntry {
  t: string;  // 출발 시각 (HH:mm)
  d: string;  // 종착역
  no: string; // 열차 번호
}

export type Incheon1StationTimetableData = Record<string, Incheon1TimetableEntry[]>;

export interface Incheon1Database {
  meta: {
    line: string;
    subwayId: string;
    totalStations: number;
    totalRecords: number;
    totalTrains: number;
    source: string;
    updatedAt: string;
  };
  data: Record<string, Incheon1StationTimetableData>;
}

let cachedIncheon1Db: Incheon1Database | null = null;

export function getIncheon1TimetableDatabase(): Incheon1Database | null {
  if (cachedIncheon1Db) {
    return cachedIncheon1Db;
  }

  try {
    const gzPath = path.join(
      process.cwd(),
      'src',
      'data',
      'subway',
      'timetables',
      'incheon1_subway_timetables.json.gz'
    );

    if (!fs.existsSync(gzPath)) {
      console.warn(`[Incheon1Timetable] 시간표 압축 DB 파일이 존재하지 않습니다: ${gzPath}`);
      return null;
    }

    const gzBuffer = fs.readFileSync(gzPath);
    const jsonStr = zlib.gunzipSync(gzBuffer).toString('utf-8');
    cachedIncheon1Db = JSON.parse(jsonStr) as Incheon1Database;
    return cachedIncheon1Db;
  } catch (error) {
    console.error('[Incheon1Timetable] 시간표 압축 DB 로드 중 오류 발생:', error);
    return null;
  }
}

/**
 * 특정 역의 시간표 데이터를 O(1)로 조회합니다.
 */
export function loadIncheon1StationTimetable(
  stationName: string
): Incheon1StationTimetableData | null {
  const db = getIncheon1TimetableDatabase();
  if (!db || !db.data) return null;

  const official = resolveOfficialIncheon1StationName(stationName);
  if (!official) return null;

  return db.data[official] || null;
}

// ─── 핵심 조회 API ────────────────────────────────────────────────────────────

export interface GetIncheon1NextTrainOptions {
  stationName: string;
  updnLine?: string;
  lineId?: string | number;
  destination?: string;
  headsign?: string;
  baseTime?: Date;
}

export interface Incheon1NextTrainResult {
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
 * 인천 1호선 시간표 기반으로 현재 시각 기준 가장 빠른 다음 열차를 조회합니다.
 */
export function getIncheon1NextTrain(options: GetIncheon1NextTrainOptions): Incheon1NextTrainResult | null {
  const { stationName, updnLine, destination, baseTime = new Date() } = options;

  const officialStation = resolveOfficialIncheon1StationName(stationName);
  if (!officialStation) return null;

  const db = getIncheon1TimetableDatabase();
  if (!db || !db.data[officialStation]) return null;

  const stationData = db.data[officialStation];
  const direction = resolveIncheon1Direction(updnLine, destination, officialStation);
  const weekTag = getIncheon1WeekTag(baseTime);
  const groupKey = `인천1호선_${weekTag}_${direction}`;

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
      subwayNm: '인천1호선',
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
      subwayNm: '인천1호선',
    };
  }

  return null;
}

/** getIncheon1NextTrain 별칭 함수 */
export const getNextTrainFromIncheon1Timetable = getIncheon1NextTrain;

/**
 * 특정 역 및 방향의 운행시간표 리스트 조회 (SubwayTimetableEntry[] 반환, 노선도 및 시간표 뷰용)
 */
export function getIncheon1TimetableList(
  stationName: string,
  updnLine?: string,
  dayType: 'DAY' | 'SAT' | 'END' = 'DAY',
  options?: { baseTime?: Date }
): SubwayTimetableEntry[] {
  const officialStation = resolveOfficialIncheon1StationName(stationName);
  if (!officialStation) return [];

  const db = getIncheon1TimetableDatabase();
  if (!db || !db.data[officialStation]) return [];

  const direction = resolveIncheon1Direction(updnLine, undefined, officialStation);
  const groupKey = `인천1호선_${dayType}_${direction}`;
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
      directionName: direction === 'UP' ? '검단호수공원 방면' : '송도달빛축제공원 방면',
      minutesLeft,
      statusText: minutesLeft <= 2 ? `곧 도착` : `${minutesLeft}분 후`,
      isUpcoming,
      isExpress: false,
    });
  }

  return entries;
}
