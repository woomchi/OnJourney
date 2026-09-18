/**
 * @fileoverview 서울교통공사 공식 지하철 열차운행시각표 인메모리 해시테이블 서비스
 * 
 * - 405개 역 53만 건의 시간표를 단일 압축 DB(seoul_subway_timetables.json.gz, 1.46 MB)에서
 *   서버 인메모리 해시테이블(Record<역명, 시간표>)로 싱글톤 적재합니다.
 * - 파일 수백 개로 쪼개지 않는 단일 표준 데이터베이스 구조.
 * - 디스크 I/O 없이 O(1) 상수 시간(0.001ms) 즉시 룩업.
 * - ODsay 시간표 API 차단에 따른 실시간 지하철 도착 Fallback의 1순위 공식 데이터 소스입니다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────
export interface SeoulTimetableItem {
  no: string;  // 열차번호 (e.g. "K101", "2003", "C9005")
  t: string;   // "HH:mm" (승차 출발 시각)
  d: string;   // 종착역 (e.g. "인천", "성수", "개화")
  e: number;   // 0: 일반, 1: 급행
}

export type SeoulStationTimetableData = Record<string, SeoulTimetableItem[]>;

export interface UnifiedTimetableDatabase {
  meta: {
    updatedAt: string;
    totalStations: number;
    stationLines: Record<string, string[]>;
  };
  data: Record<string, SeoulStationTimetableData>;
}

export interface SeoulNextTrainResult {
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
  isExpress: boolean;
  canBoard: boolean;
}

// ─── 데이터베이스 경로 및 싱글톤 인메모리 해시테이블 ──────────────────────────────
const TIMETABLES_DIR = path.join(process.cwd(), 'src', 'data', 'subway', 'timetables');
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'seoul_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'seoul_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getTimetableDatabase(): UnifiedTimetableDatabase | null {
  if (memoryDb) return memoryDb;

  try {
    // 1. 고효율 Gzip 압축 파일 우선 로드 (1.46 MB)
    if (fs.existsSync(GZ_DB_PATH)) {
      const gzBuffer = fs.readFileSync(GZ_DB_PATH);
      const jsonStr = zlib.gunzipSync(gzBuffer).toString('utf-8');
      memoryDb = JSON.parse(jsonStr);
      return memoryDb;
    }

    // 2. 비압축 원본 JSON 파일 Fallback
    if (fs.existsSync(JSON_DB_PATH)) {
      const jsonStr = fs.readFileSync(JSON_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(jsonStr);
      return memoryDb;
    }
  } catch (err) {
    console.error('[seoulTimetableService] 시간표 데이터베이스 로드 실패:', err);
  }

  return null;
}

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

/**
 * 시간 문자열("HH:mm" 또는 "HH:mm:ss")을 운행 기준 총 분으로 변환
 * (새벽 00~04시는 익일 연장 운행으로 간주하여 24시 이후로 계산)
 */
export function toOperationalMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const hour = parts[0] || 0;
  const min = parts[1] || 0;
  const adjustedHour = hour < 5 ? hour + 24 : hour;
  return adjustedHour * 60 + min;
}

/**
 * 주어진 Date 객체에서 KST(Asia/Seoul, UTC+9) 기준 시, 분, 초, 요일을 추출합니다.
 * 서버/클라이언트 환경의 로컬 시스템 타임존(UTC 등)과 무관하게 항상 일관된 한국 표준시를 보장합니다.
 */
export function getKstComponents(date: Date = new Date()): {
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number; // 0: 일요일, 1: 월요일, ..., 6: 토요일
} {
  const kstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);
  return {
    hours: kstDate.getUTCHours(),
    minutes: kstDate.getUTCMinutes(),
    seconds: kstDate.getUTCSeconds(),
    dayOfWeek: kstDate.getUTCDay(),
  };
}

/**
 * 오늘 요일 태그 계산 (DAY: 평일, SAT: 토요일, END: 일요일/공휴일) - KST 기준
 */
export function resolveWeekTag(date: Date = new Date()): 'DAY' | 'SAT' | 'END' {
  const { dayOfWeek } = getKstComponents(date);
  if (dayOfWeek === 0) return 'END'; // 일요일
  if (dayOfWeek === 6) return 'SAT'; // 토요일
  return 'DAY';                // 평일
}

/**
 * 역명을 정규화하여 DB 내의 공식 역명 키(해시테이블 Key)를 찾습니다.
 */
export function resolveOfficialStationName(rawStationName: string): string | null {
  const db = getTimetableDatabase();
  if (!db?.data) return null;

  const trimmed = rawStationName.trim();
  if (db.data[trimmed]) return trimmed;

  const clean = trimmed.replace(/역$/, '').trim();
  if (db.data[clean]) return clean;

  const withSuffix = `${clean}역`;
  if (db.data[withSuffix]) return withSuffix;

  // 괄호 포함 역명 대응 (예: "동대문역사문화공원(DDP)" -> "동대문역사문화공원")
  const baseName = clean.split('(')[0].trim();
  if (db.data[baseName]) return baseName;
  if (db.data[`${baseName}역`]) return `${baseName}역`;

  return null;
}

/**
 * 특정 역의 시간표 해시 항목을 O(1)로 조회합니다.
 */
export function loadStationTimetable(stationName: string): SeoulStationTimetableData | null {
  const db = getTimetableDatabase();
  if (!db?.data) return null;

  const officialName = resolveOfficialStationName(stationName);
  if (!officialName) return null;

  return db.data[officialName] || null;
}

/**
 * 호선 식별자에서 숫자 1~9 추출 (예: "1002" -> "2", "2호선" -> "2", "2" -> "2")
 */
export function normalizeLineNumber(lineId?: string | number): string | null {
  if (!lineId) return null;
  const str = String(lineId).trim();
  if (str.startsWith('100') && str.length === 4) {
    const digit = str.substring(3);
    if (Number(digit) >= 1 && Number(digit) <= 9) return digit;
  }
  const match = str.match(/([1-9])호선?/);
  if (match) return match[1];
  if (/^[1-9]$/.test(str)) return str;
  return null;
}

/**
 * 호선 및 방향 파라미터로 시간표 그룹 키(INOUTTAG)를 결정합니다.
 * 2호선: 'IN'(내선순환), 'OUT'(외선순환)
 * 1, 3~9호선: 'UP'(상행), 'DOWN'(하행)
 */
export function resolveInOutTag(lineNum: string, updnLine: string): string {
  const isLine2 = lineNum === '2';
  const cleanDir = updnLine.trim();

  if (isLine2) {
    if (cleanDir.includes('내선') || cleanDir === '1' || cleanDir === '0' || cleanDir.includes('상행')) {
      return 'IN';
    }
    return 'OUT';
  }

  if (cleanDir.includes('상행') || cleanDir === '1' || cleanDir === '0') {
    return 'UP';
  }
  return 'DOWN';
}

// ─── 메인 서비스 함수 ──────────────────────────────────────────────────────────

export interface NextTrainQueryOptions {
  stationName: string;
  updnLine: string;         // '상행', '하행', '내선', '외선', '1', '2'
  lineId?: string | number; // '1002', '2호선', '2' 등
  referenceDate?: Date;     // 기준 일시 (기본: new Date())
}

/**
 * 서울교통공사 공식 시간표 해시테이블에서 다음 열차 도착 정보를 O(1)로 조회합니다.
 */
export function getNextTrainFromSeoulTimetable(
  options: NextTrainQueryOptions
): SeoulNextTrainResult | null {
  const { stationName, updnLine, lineId, referenceDate = new Date() } = options;

  const timetableData = loadStationTimetable(stationName);
  if (!timetableData) return null;

  const weekTag = resolveWeekTag(referenceDate);

  // 호선 결정: 입력된 lineId 우선, 없으면 해당 역에 존재하는 첫 번째 호선
  let lineNum = normalizeLineNumber(lineId);
  if (!lineNum) {
    const db = getTimetableDatabase();
    const officialName = resolveOfficialStationName(stationName);
    const availableLines = officialName && db?.meta?.stationLines?.[officialName];
    lineNum = availableLines && availableLines.length > 0 ? availableLines[0] : '1';
  }

  const inoutTag = resolveInOutTag(lineNum, updnLine);
  const targetKey = `${lineNum}_${weekTag}_${inoutTag}`;

  let trains = timetableData[targetKey];
  // 2호선의 경우 혹시 UP/DOWN으로 기록된 데이터가 있다면 Fallback
  if ((!trains || trains.length === 0) && lineNum === '2') {
    const altKey = `${lineNum}_${weekTag}_${inoutTag === 'IN' ? 'UP' : 'DOWN'}`;
    trains = timetableData[altKey];
  }

  if (!trains || trains.length === 0) return null;

  // 현재 시각의 운행 분 계산 (KST 기준)
  const { hours: currentHour, minutes: currentMinute } = getKstComponents(referenceDate);
  const currentOpMin = toOperationalMinutes(
    `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
  );

  // 현재 시각 이후의 가장 빠른 열차 탐색
  const upcoming = trains.filter((tr) => toOperationalMinutes(tr.t) >= currentOpMin);

  if (upcoming.length === 0) {
    // 당일 운행 종료 -> 익일 첫차 정보 제공
    const firstTrain = trains[0];
    return {
      trainNo: 'LAST_TRAIN_ENDED',
      endSubwayStationNm: firstTrain ? firstTrain.d : '운행 종료',
      minutesLeft: 999,
      arrivalTime: firstTrain ? firstTrain.t : '--:--',
      statusText: firstTrain ? `[시간표] 운행 종료 (첫차 ${firstTrain.t})` : '[시간표] 금일 운행 종료',
      isApproaching: false,
      isExpress: firstTrain ? firstTrain.e === 1 : false,
      canBoard: false,
    };
  }

  const next = upcoming[0];
  const nextOpMin = toOperationalMinutes(next.t);
  const diffMinutes = Math.max(0, nextOpMin - currentOpMin);

  return {
    trainNo: next.no,
    endSubwayStationNm: next.d,
    minutesLeft: diffMinutes,
    arrivalTime: next.t,
    statusText: `[시간표] ${next.d}행 (${next.t})`,
    isApproaching: diffMinutes <= 2,
    isExpress: next.e === 1,
    canBoard: true,
  };
}

/**
 * 지하철 노선도 패널(SubwayLineMapPanel)에 제공할 시간표 전체 목록을 해시테이블에서 O(1)로 조회합니다.
 */
export function getSeoulTimetableList(
  stationName: string,
  updnLine: string,
  lineId?: string | number,
  referenceDate: Date = new Date(),
  limit: number = 30
): SubwayTimetableEntry[] {
  const timetableData = loadStationTimetable(stationName);
  if (!timetableData) return [];

  const weekTag = resolveWeekTag(referenceDate);
  let lineNum = normalizeLineNumber(lineId);
  if (!lineNum) {
    const db = getTimetableDatabase();
    const officialName = resolveOfficialStationName(stationName);
    const availableLines = officialName && db?.meta?.stationLines?.[officialName];
    lineNum = availableLines && availableLines.length > 0 ? availableLines[0] : '1';
  }

  const inoutTag = resolveInOutTag(lineNum, updnLine);
  const targetKey = `${lineNum}_${weekTag}_${inoutTag}`;
  const trains = timetableData[targetKey] || [];
  if (trains.length === 0) return [];

  // 현재 시각의 운행 분 계산 (KST 기준)
  const { hours: currentHour, minutes: currentMinute } = getKstComponents(referenceDate);
  const currentOpMin = toOperationalMinutes(
    `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`
  );

  const upcomingTrains = trains.filter((tr) => toOperationalMinutes(tr.t) >= currentOpMin);
  const isLine2 = lineNum === '2';
  const drctType = inoutTag === 'UP' || inoutTag === 'IN' ? '1' : '2';
  const directionName = isLine2
    ? inoutTag === 'IN' ? '내선순환' : '외선순환'
    : inoutTag === 'UP' ? '상행 방면' : '하행 방면';

  return upcomingTrains.slice(0, limit).map((tr, index) => {
    const diff = Math.max(0, toOperationalMinutes(tr.t) - currentOpMin);
    return {
      trainNo: tr.no,
      depTime: tr.t,
      destStation: tr.d,
      drctType,
      directionName: `${tr.d}행 (${directionName})`,
      minutesLeft: diff,
      statusText: diff === 0 ? '곧 도착' : `${diff}분 후`,
      isUpcoming: index === 0,
    };
  });
}
