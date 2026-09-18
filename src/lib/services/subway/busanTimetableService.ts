/**
 * @fileoverview 부산교통공사 공식 도시철도 운행시각표 인메모리 해시테이블 서비스
 *
 * - 부산 도시철도 1~4호선 108개 역의 전체 운행시간표를 단일 압축 DB(busan_subway_timetables.json.gz, 약 0.42 MB)에서
 *   서버 인메모리 해시테이블(Record<역명, 시간표>)로 싱글톤 적재합니다.
 * - 파일 수백 개로 쪼개지 않는 단일 표준 데이터베이스 구조.
 * - 외부 공공데이터 API(B551542) 네트워크 지연 없이 O(1) 상수 시간(0.001ms) 즉시 룩업.
 * - 요일: 평일, 토요일, 공휴일(일요일 통합) 지원.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { SubwayTimetableEntry } from '@/types/journey';

// ─── 타입 정의 ────────────────────────────────────────────────────────────────
export interface BusanTimetableItem {
  no: string;  // 열차번호 (예: "1001", "2002")
  t: string;   // "HH:mm" (출발/도착 시각)
  d: string;   // 종착역 (예: "노포", "다대포해수욕장", "양산", "장산")
  e: number;   // 0: 일반, 1: 급행
}

export type BusanStationTimetableData = Record<string, BusanTimetableItem[]>;

export interface UnifiedBusanTimetableDatabase {
  meta: {
    updatedAt: string;
    totalStations: number;
    stationLines: Record<string, string[]>;
  };
  data: Record<string, BusanStationTimetableData>;
}

export interface BusanNextTrainResult {
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
const GZ_DB_PATH = path.join(TIMETABLES_DIR, 'busan_subway_timetables.json.gz');
const JSON_DB_PATH = path.join(TIMETABLES_DIR, 'busan_subway_timetables.json');

/** 싱글톤 인메모리 해시테이블 캐시 */
let memoryDb: UnifiedBusanTimetableDatabase | null = null;

/**
 * 시간표 데이터베이스를 인메모리 싱글톤으로 로드합니다 (지연 로딩).
 */
export function getBusanTimetableDatabase(): UnifiedBusanTimetableDatabase | null {
  if (memoryDb) return memoryDb;

  try {
    // 1. 고효율 Gzip 압축 파일 우선 로드 (약 0.42 MB)
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
    console.error('[busanTimetableService] 시간표 데이터베이스 로드 실패:', err);
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
 * 시간 문자열("HH:mm" 또는 "HH:mm:ss")을 운행 기준 총 초(seconds)로 변환
 * (새벽 00~04시는 익일 연장 운행으로 간주하여 24시 이후로 계산)
 */
export function toOperationalSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const hour = parts[0] || 0;
  const min = parts[1] || 0;
  const sec = parts[2] || 0;
  const adjustedHour = hour < 5 ? hour + 24 : hour;
  return adjustedHour * 3600 + min * 60 + sec;
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
 * 오늘 요일 태그 계산 (평일, 토요일, 공휴일) - KST 기준
 * - 일요일(0)은 공휴일로 통합
 */
export function resolveBusanWeekTag(date: Date = new Date()): '평일' | '토요일' | '공휴일' {
  const { dayOfWeek } = getKstComponents(date);
  if (dayOfWeek === 0) return '공휴일'; // 일요일
  if (dayOfWeek === 6) return '토요일'; // 토요일
  return '평일';                  // 평일
}

/**
 * 역명 별칭 및 변형 매핑 테이블
 * (DB의 공식 키와 일치시키기 위한 매핑)
 */
const BUSAN_STATION_NAME_MAP: Record<string, string> = {
  '부산역': '부산',
  '부산': '부산',
  '시청_부산': '시청',
  '교대_부산': '교대',
  '서면_1': '서면',
  '서면_2': '서면',
  '수영_2': '수영',
  '수영_3': '수영',
  '연산_1': '연산',
  '연산_3': '연산',
  '동래_1': '동래',
  '동래_4': '동래',
  '덕천_2': '덕천',
  '덕천_3': '덕천',
  '미남_3': '미남',
  '미남_4': '미남',
  '경성대·부경대': '경성대부경대',
  '경성대.부경대': '경성대부경대',
  '국제금융센터·부산은행': '국제금융센터부산은행',
  '국제금융센터.부산은행': '국제금융센터부산은행',
  '부산대·양산캠퍼스': '부산대양산캠퍼스',
  '부산대양산': '부산대양산캠퍼스',
  '반여농산물': '반여농산물시장',
};

/**
 * 역명을 정규화하여 DB 내의 공식 역명 키(해시테이블 Key)를 찾습니다.
 */
export function resolveOfficialBusanStationName(rawStationName: string): string | null {
  const db = getBusanTimetableDatabase();
  if (!db?.data) return null;

  const trimmed = rawStationName.trim();
  if (BUSAN_STATION_NAME_MAP[trimmed] && db.data[BUSAN_STATION_NAME_MAP[trimmed]]) {
    return BUSAN_STATION_NAME_MAP[trimmed];
  }

  if (db.data[trimmed]) return trimmed;

  const clean = trimmed.replace(/역$/, '').trim();
  if (BUSAN_STATION_NAME_MAP[clean] && db.data[BUSAN_STATION_NAME_MAP[clean]]) {
    return BUSAN_STATION_NAME_MAP[clean];
  }
  if (db.data[clean]) return clean;

  const withSuffix = `${clean}역`;
  if (db.data[withSuffix]) return withSuffix;

  // 괄호 포함 역명 대응 (예: "서면(1호선)" -> "서면")
  const baseName = clean.split(/[(·.]/)[0].trim();
  if (db.data[baseName]) return baseName;

  return null;
}

/**
 * 특정 역의 시간표 해시 항목을 O(1)로 조회합니다.
 */
export function loadBusanStationTimetable(stationName: string): BusanStationTimetableData | null {
  const db = getBusanTimetableDatabase();
  if (!db?.data) return null;

  const officialName = resolveOfficialBusanStationName(stationName);
  if (!officialName) return null;

  return db.data[officialName] || null;
}

/**
 * 호선 식별자에서 1~4 추출 (예: "부산 1호선", "1호선", "1", "S2601")
 */
export function normalizeBusanLineNumber(lineId?: string | number): string | null {
  if (!lineId) return null;
  const str = String(lineId).trim();
  if (str === 'S2601' || str.includes('1호선') || str === '1') return '1';
  if (str === 'S2602' || str.includes('2호선') || str === '2') return '2';
  if (str === 'S2603' || str.includes('3호선') || str === '3') return '3';
  if (str === 'L2604' || str.includes('4호선') || str === '4') return '4';

  const match = str.match(/([1-4])호선?/);
  if (match) return match[1];
  if (/^[1-4]$/.test(str)) return str;
  return null;
}

/**
 * 호선 및 방향 파라미터로 시간표 그룹 키의 방향 태그(UP/DOWN)를 결정합니다.
 * - UP: 상행 (1호선 노포방면, 2호선 장산방면, 3호선 수영방면, 4호선 미남방면)
 * - DOWN: 하행 (1호선 다대포해수욕장방면, 2호선 양산방면, 3호선 대저방면, 4호선 안평방면)
 */
export function resolveBusanDirection(lineNum: string, updnLine: string): 'UP' | 'DOWN' {
  const cleanDir = updnLine.trim();

  // 상행 명시
  if (
    cleanDir.includes('상행') ||
    cleanDir === '1' ||
    cleanDir === 'UP' ||
    cleanDir.includes('노포') ||
    cleanDir.includes('장산') ||
    cleanDir.includes('수영') ||
    cleanDir.includes('미남')
  ) {
    return 'UP';
  }

  // 하행 명시
  if (
    cleanDir.includes('하행') ||
    cleanDir === '2' ||
    cleanDir === 'DOWN' ||
    cleanDir.includes('다대포') ||
    cleanDir.includes('신평') ||
    cleanDir.includes('양산') ||
    cleanDir.includes('호포') ||
    cleanDir.includes('대저') ||
    cleanDir.includes('안평')
  ) {
    return 'DOWN';
  }

  return 'DOWN';
}

// ─── 메인 서비스 함수 ──────────────────────────────────────────────────────────

export interface BusanNextTrainQueryOptions {
  stationName: string;
  updnLine?: string;        // '상행', '하행', 'UP', 'DOWN', '노포행', '1', '2' 등
  lineId?: string | number; // '부산 1호선', '1', 'S2601' 등
  referenceDate?: Date;     // 기준 일시 (기본: new Date())
}

/**
 * 부산교통공사 공식 시간표 해시테이블에서 다음 열차 도착 정보를 O(1)로 조회합니다.
 */
export function getBusanNextTrain(
  options: BusanNextTrainQueryOptions
): BusanNextTrainResult | null {
  const { stationName, updnLine = 'DOWN', lineId, referenceDate = new Date() } = options;

  const timetableData = loadBusanStationTimetable(stationName);
  if (!timetableData) return null;

  const weekTag = resolveBusanWeekTag(referenceDate);

  // 호선 결정: 입력된 lineId 우선, 없으면 해당 역에 존재하는 첫 번째 호선
  let lineNum = normalizeBusanLineNumber(lineId);
  if (!lineNum) {
    const db = getBusanTimetableDatabase();
    const officialName = resolveOfficialBusanStationName(stationName);
    const availableLines = officialName && db?.meta?.stationLines?.[officialName];
    lineNum = availableLines && availableLines.length > 0 ? availableLines[0] : '1';
  }

  const dir = resolveBusanDirection(lineNum, updnLine);
  const targetKey = `${lineNum}_${weekTag}_${dir}`;

  let trains = timetableData[targetKey];
  // 해당 방향 없을 경우 반대 방향 fallback 시도
  if (!trains || trains.length === 0) {
    const altKey = `${lineNum}_${weekTag}_${dir === 'UP' ? 'DOWN' : 'UP'}`;
    trains = timetableData[altKey];
  }

  if (!trains || trains.length === 0) return null;

  // 현재 시각의 운행 초(seconds) 계산 (KST 기준)
  const { hours: currentHour, minutes: currentMinute, seconds: currentSecond } = getKstComponents(referenceDate);
  const currentOpSec = toOperationalSeconds(
    `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`
  );

  // 출발 예정 시각 후 20초까지는 당역 출발 중으로 간주 ('곧 도착'),
  // 20초를 초과하여 경과한 열차는 이미 출발한 열차로 간주하여 목록에서 즉시 제외
  const DEPARTURE_GRACE_SEC = 20;

  const upcoming = trains.filter((tr) => {
    const trOpSec = toOperationalSeconds(tr.t);
    return trOpSec - currentOpSec >= -DEPARTURE_GRACE_SEC;
  });

  if (upcoming.length === 0) {
    // 당일 운행 종료 -> 익일 첫차 안내
    const firstTrain = trains[0];
    return {
      trainNo: firstTrain ? firstTrain.no : 'LAST_TRAIN_ENDED',
      endSubwayStationNm: firstTrain ? firstTrain.d : '운행 종료',
      minutesLeft: 999,
      arrivalTime: firstTrain ? firstTrain.t : '--:--',
      statusText: firstTrain ? `[시간표] 익일 첫차 (${firstTrain.t})` : '[시간표] 금일 운행 종료',
      isApproaching: false,
      isExpress: false,
      canBoard: false,
    };
  }

  const next = upcoming[0];
  const nextOpSec = toOperationalSeconds(next.t);
  const diffSec = nextOpSec - currentOpSec;

  // 45초 이하로 남았거나 출발 직후(20초 이내)는 '곧 도착'
  const minutesLeft = diffSec <= 45 ? 0 : Math.round(diffSec / 60);

  return {
    trainNo: next.no,
    endSubwayStationNm: next.d,
    minutesLeft,
    arrivalTime: next.t,
    statusText: minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후 (${next.t})`,
    isApproaching: minutesLeft <= 1,
    isExpress: next.e === 1,
    canBoard: true,
  };
}

/**
 * 지하철 노선도 패널(SubwayLineMapPanel) 등에 제공할 시간표 전체 목록을 해시테이블에서 O(1)로 조회합니다.
 */
export function getBusanTimetableList(
  stationName: string,
  updnLine?: string,
  lineId?: string | number,
  referenceDate: Date = new Date(),
  limit: number = 60
): SubwayTimetableEntry[] {
  const timetableData = loadBusanStationTimetable(stationName);
  if (!timetableData) return [];

  const weekTag = resolveBusanWeekTag(referenceDate);
  let lineNum = normalizeBusanLineNumber(lineId);
  if (!lineNum) {
    const db = getBusanTimetableDatabase();
    const officialName = resolveOfficialBusanStationName(stationName);
    const availableLines = officialName && db?.meta?.stationLines?.[officialName];
    lineNum = availableLines && availableLines.length > 0 ? availableLines[0] : '1';
  }

  // 현재 시각의 운행 초(seconds) 계산 (KST 기준)
  const { hours: currentHour, minutes: currentMinute, seconds: currentSecond } = getKstComponents(referenceDate);
  const currentOpSec = toOperationalSeconds(
    `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`
  );

  const DEPARTURE_GRACE_SEC = 20;

  const directions: Array<'UP' | 'DOWN'> = updnLine
    ? [resolveBusanDirection(lineNum, updnLine)]
    : ['UP', 'DOWN'];

  const allEntries: SubwayTimetableEntry[] = [];

  for (const dir of directions) {
    const targetKey = `${lineNum}_${weekTag}_${dir}`;
    const trains = timetableData[targetKey] || [];
    if (trains.length === 0) continue;

    const upcomingTrains = trains.filter((tr) => {
      const trOpSec = toOperationalSeconds(tr.t);
      return trOpSec - currentOpSec >= -DEPARTURE_GRACE_SEC;
    });

    const displayTrains = upcomingTrains.length > 0 ? upcomingTrains : trains;
    const drctType = dir === 'UP' ? '1' : '2';

    const dirEntries = displayTrains.slice(0, limit).map((tr, index) => {
      const trOpSec = toOperationalSeconds(tr.t);
      let diffSec = trOpSec - currentOpSec;
      if (diffSec < -DEPARTURE_GRACE_SEC && upcomingTrains.length === 0) {
        diffSec += 24 * 3600; // 익일
      }

      const safeDiff = diffSec <= 45 ? 0 : Math.round(diffSec / 60);

      return {
        trainNo: tr.no || `부산-${lineNum}-${index + 1}`,
        depTime: tr.t,
        destStation: tr.d,
        drctType,
        directionName: `${tr.d}행 (${dir === 'UP' ? '상행 방면' : '하행 방면'})`,
        minutesLeft: safeDiff,
        statusText: safeDiff === 0 ? '곧 도착' : `${safeDiff}분 후`,
        isUpcoming: index === 0,
      };
    });

    allEntries.push(...dirEntries);
  }

  allEntries.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return allEntries;
}
