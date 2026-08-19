/**
 * @fileoverview 대전교통공사 열차시각표 조회 서비스 (TimeTableSVC)
 *
 * 공공데이터포털 대전교통공사_열차시각표 조회 서비스를 활용하여
 * 대전 도시철도 1호선(판암~반석)의 시간표 기반 지하철 도착 정보를 제공합니다.
 *
 * 엔드포인트:
 * 1. /getAllTimeTable (전역사 열차운행시각표 조회)
 * 2. /getTimeTable (특정역 열차운행시각표 조회)
 */

import { XMLParser } from 'fast-xml-parser';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival, SubwayTimetableEntry } from '@/types/journey';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

/** 대전 1호선 22개 역사 정보 (역번호 101~122) */
export const DAEJEON_LINE_1_STATIONS: Record<string, { stNum: string; name: string }> = {
  '판암': { stNum: '101', name: '판암' },
  '신흥': { stNum: '102', name: '신흥' },
  '대동': { stNum: '103', name: '대동' },
  '대전역': { stNum: '104', name: '대전역' },
  '대전': { stNum: '104', name: '대전역' },
  '중앙로': { stNum: '105', name: '중앙로' },
  '중구청': { stNum: '106', name: '중구청' },
  '서대전네거리': { stNum: '107', name: '서대전네거리' },
  '오룡': { stNum: '108', name: '오룡' },
  '용문': { stNum: '109', name: '용문' },
  '탄방': { stNum: '110', name: '탄방' },
  '시청': { stNum: '111', name: '시청' },
  '정부청사': { stNum: '112', name: '정부청사' },
  '갈마': { stNum: '113', name: '갈마' },
  '월평': { stNum: '114', name: '월평' },
  '갑천': { stNum: '115', name: '갑천' },
  '유성온천': { stNum: '116', name: '유성온천' },
  '구암': { stNum: '117', name: '구암' },
  '현충원': { stNum: '118', name: '현충원' },
  '월드컵경기장': { stNum: '119', name: '월드컵경기장' },
  '노은': { stNum: '120', name: '노은' },
  '지족': { stNum: '121', name: '지족' },
  '반석': { stNum: '122', name: '반석' },
};

/** 역번호별 표준 역명 */
export const DAEJEON_STATION_NAMES_BY_NUM: Record<string, string> = {
  '101': '판암',
  '102': '신흥',
  '103': '대동',
  '104': '대전역',
  '105': '중앙로',
  '106': '중구청',
  '107': '서대전네거리',
  '108': '오룡',
  '109': '용문',
  '110': '탄방',
  '111': '시청',
  '112': '정부청사',
  '113': '갈마',
  '114': '월평',
  '115': '갑천',
  '116': '유성온천',
  '117': '구암',
  '118': '현충원',
  '119': '월드컵경기장',
  '120': '노은',
  '121': '지족',
  '122': '반석',
};

/** 시간표 항목 인터페이스 */
export interface DaejeonTimetableItem {
  stNum: string;         // 역번호 (예: '101')
  dayType: string;       // 평일/휴일 구분 ('1': 평일, '2': 토요일/휴일)
  drctType: string;      // 상행/하행 ('1': 상행/판암방면, '2': 하행/반석방면)
  trainNo: string;       // 열차번호
  depTime: string;       // 출발시각 (HH:mm:ss 또는 HH:mm)
  arrTime?: string;      // 도착시각
  destStation?: string;  // 종착역 (판암 또는 반석)
}

/** 캐시 구조: 날짜_타입 -> 시각표 목록 */
interface TimetableCacheEntry {
  timestamp: number;
  data: DaejeonTimetableItem[];
}

let timetableCache: TimetableCacheEntry | null = null;
const CACHE_TTL_MS = 12 * 3600 * 1000; // 12시간

/**
 * 대전 지하철 역인지 여부를 확인합니다.
 */
export function isDaejeonSubwayStation(stationName: string): boolean {
  const clean = stationName.replace(/역$/, '').trim();
  return clean in DAEJEON_LINE_1_STATIONS;
}

/**
 * 역명으로 역번호(stNum)를 조회합니다.
 */
export function getDaejeonStationNum(stationName: string): string | null {
  const clean = stationName.replace(/역$/, '').trim();
  return DAEJEON_LINE_1_STATIONS[clean]?.stNum || null;
}

/**
 * 안전한 API 키 획득 (이중 인코딩 방지)
 */
function getSafeApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey = (
    env.DAEJEON_SUBWAY_API_KEY ||
    env.REAL_TIME_BUS_DAEJEON_API_KEY ||
    env.DATA_GO_KR_API_KEY ||
    env.TAGO_API_KEY ||
    env.REAL_TIME_BUS_TAGO_API_KEY ||
    env.REAL_TIME_BUS_API_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  if (!rawKey) return '';
  try {
    return rawKey.includes('%') ? decodeURIComponent(rawKey) : rawKey;
  } catch {
    return rawKey;
  }
}

/**
 * 오늘 요일 타입 계산 (대전교통공사 API 스펙: '1': 평일, '2': 토요일/휴일)
 */
function getTodayDayType(date: Date): { dayType: string; isWeekend: boolean } {
  const day = date.getDay(); // 0: 일, 6: 토
  const isWeekend = day === 0 || day === 6;
  return {
    dayType: isWeekend ? '2' : '1',
    isWeekend,
  };
}

/**
 * 시간 문자열을 초(seconds) 단위로 변환합니다.
 * "05:30:00" -> 19800, "05:30" -> 19800, "053000" -> 19800
 */
function parseTimeToSeconds(timeStr: string | number): number {
  const str = String(timeStr || '').trim().replace(/:/g, '');
  if (!str) return 0;

  if (str.length >= 6) {
    const h = parseInt(str.substring(0, 2), 10) || 0;
    const m = parseInt(str.substring(2, 4), 10) || 0;
    const s = parseInt(str.substring(4, 6), 10) || 0;
    return h * 3600 + m * 60 + s;
  } else if (str.length >= 4) {
    const h = parseInt(str.substring(0, 2), 10) || 0;
    const m = parseInt(str.substring(2, 4), 10) || 0;
    return h * 3600 + m * 60;
  }
  return 0;
}

/**
 * 초를 "HH:mm" 문자열로 변환합니다.
 */
function formatSecondsToTime(totalSeconds: number): string {
  const safeSec = (totalSeconds + 86400) % 86400;
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 대전교통공사 API 응답 파싱 (tmZone + tmList 구조 지원)
 */
function parseTimeTableResponse(dataText: string): DaejeonTimetableItem[] {
  const items: DaejeonTimetableItem[] = [];
  let rawList: any[] = [];

  const trimmed = dataText.trim();

  // 1. JSON 우선 파싱 (_type=json 요청)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const rawItems =
        json.response?.body?.items?.item ||
        json.response?.body?.items ||
        json.items ||
        [];
      rawList = Array.isArray(rawItems) ? rawItems : [rawItems];
    } catch (e) {
      console.warn('[daejeonSubwayService] JSON 파싱 실패:', e);
    }
  }

  // 2. XML 폴백 파싱
  if (rawList.length === 0 && (trimmed.startsWith('<') || !trimmed.startsWith('{'))) {
    try {
      const parsed = xmlParser.parse(trimmed);
      const body = parsed?.response?.body || parsed?.TimeTableSVC || parsed;
      const rawItems = body?.items?.item || body?.item || [];
      rawList = Array.isArray(rawItems) ? rawItems : [rawItems];
    } catch (e) {
      console.warn('[daejeonSubwayService] XML 파싱 실패:', e);
    }
  }

  for (const row of rawList) {
    if (!row || typeof row !== 'object') continue;

    const stNum = String(row.stNum ?? row.ST_NUM ?? row.stationNum ?? '').trim();
    // API 스펙: dayType '1'=평일, '2'=토요일/휴일. 기본값 '1'(평일)
    const dayType = String(row.dayType ?? row.DAY_TYPE ?? '1').trim();
    // API 스펙: drctType '1'=상행(판암방면), '2'=하행(반석방면). 기본값 '1'
    const drctType = String(row.drctType ?? row.DRCT_TYPE ?? '1').trim();
    const tmList = String(row.tmList ?? row.TM_LIST ?? '').trim();
    const tmZoneRaw = row.tmZone ?? row.TM_ZONE;

    // 1. tmZone + tmList (예: tmZone: 5, tmList: "36 51") 구조
    if (stNum && tmZoneRaw !== undefined && tmZoneRaw !== null && tmList) {
      const tmZone = parseInt(String(tmZoneRaw), 10);
      const minutes = tmList.split(/\s+/).filter(Boolean);

      minutes.forEach((minStr) => {
        const min = parseInt(minStr, 10);
        if (isNaN(min)) return;
        const depTime = `${String(tmZone).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        // drctType '2': 반석행 (하행), '1': 판암행 (상행)
        const destStation = drctType === '2' ? '반석' : '판암';
        const trainNo = `${drctType === '2' ? '반석' : '판암'}-${tmZone}${String(min).padStart(2, '0')}`;

        items.push({
          stNum,
          dayType,
          drctType,
          trainNo,
          depTime,
          destStation,
        });
      });
      continue;
    }

    // 2. 단일 depTime 구조 (폴백)
    const depTime = String(row.depTime || row.dptTime || row.departureTime || row.arrTime || row.DEP_TIME || '').trim();
    const destStation = String(row.destStation || row.endStation || row.DEST_STATION || '').trim();

    if (stNum && depTime) {
      items.push({
        stNum,
        dayType,
        drctType,
        trainNo: String(row.trainNum || row.trnNum || row.TRAIN_NUM || row.trainNo || '시간표열차').trim(),
        depTime,
        destStation: destStation || (drctType === '2' ? '반석' : '판암'),
      });
    }
  }

  return items;
}

/**
 * 대전교통공사 전 역 열차운행시각표 조회 (/getAllTimeTable)
 */
export async function fetchAllDaejeonTimeTable(): Promise<DaejeonTimetableItem[]> {
  const now = Date.now();
  if (timetableCache && now - timetableCache.timestamp < CACHE_TTL_MS && timetableCache.data.length > 0) {
    return timetableCache.data;
  }

  const apiKey = getSafeApiKey();
  if (!apiKey) {
    console.warn('[daejeonSubwayService] 대전 지하철 API 키 미설정');
    return [];
  }

  const baseUrl = 'https://apis.data.go.kr/B554695/TimeTableSVC/getAllTimeTable';
  const url = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&_type=json&numOfRows=9999&pageNo=1`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    const parsedItems = parseTimeTableResponse(text);

    if (parsedItems.length > 0) {
      timetableCache = {
        timestamp: now,
        data: parsedItems,
      };
      return parsedItems;
    }
  } catch (error) {
    console.warn('[daejeonSubwayService] /getAllTimeTable 조회 실패:', error);
  }

  return timetableCache?.data || [];
}

/**
 * 대전교통공사 특정 역 열차운행시각표 조회 (/getTimeTable Fallback)
 */
export async function fetchStationTimeTable(
  stNum: string,
  dayType: string,
  drctType: string
): Promise<DaejeonTimetableItem[]> {
  const apiKey = getSafeApiKey();
  if (!apiKey) return [];

  const baseUrl = 'https://apis.data.go.kr/B554695/TimeTableSVC/getTimeTable';
  const url = `${baseUrl}?serviceKey=${encodeURIComponent(apiKey)}&stNum=${stNum}&dayType=${dayType}&drctType=${drctType}&_type=json&numOfRows=999`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return parseTimeTableResponse(text);
  } catch (err) {
    console.warn(`[daejeonSubwayService] /getTimeTable (${stNum}) 조회 실패:`, err);
    return [];
  }
}

/**
 * 특정 대전 1호선 역의 시간표 기반 다음 도착 정보를 계산합니다.
 *
 * @param stationName 역명 (예: '대전역', '반석', '서대전네거리')
 * @param wayCode '1' (상행/판암방면), '2' (하행/반석방면) 또는 undefined(전체)
 * @returns SubwayArrival[]
 */
export async function fetchDaejeonSubwayArrivals(
  stationName: string,
  wayCode?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const stNum = getDaejeonStationNum(cleanStation);
  if (!stNum) return [];

  const nowMs = timeOffsetManager.getSynchronizedNow();
  const nowDate = new Date(nowMs);
  const { dayType } = getTodayDayType(nowDate);

  // 현재 초 계산 (KST 기준)
  const kstHours = (nowDate.getUTCHours() + 9) % 24;
  const kstMinutes = nowDate.getUTCMinutes();
  const kstSeconds = nowDate.getUTCSeconds();
  const currentSeconds = kstHours * 3600 + kstMinutes * 60 + kstSeconds;

  // 1. 전체 시간표 캐시 조회
  let allItems = await fetchAllDaejeonTimeTable();

  // 2. 전체 시간표가 비어있는 경우 개별 역 시간표 폴백 시도
  // API 스펙: drctType '1'=상행(판암), '2'=하행(반석)
  if (allItems.length === 0) {
    const directions = ['1', '2'];
    for (const d of directions) {
      const items = await fetchStationTimeTable(stNum, dayType, d);
      allItems.push(...items);
    }
  }

  // 3. 해당 역, 요일(또는 전체)에 맞는 스케줄 필터링
  let stationSchedules = allItems.filter((item) => item.stNum === stNum);

  // 요일 필터 (정확 매칭 우선, 없을 경우 전체)
  const dayMatched = stationSchedules.filter((item) => item.dayType === dayType);
  if (dayMatched.length > 0) {
    stationSchedules = dayMatched;
  }

  // wayCode 필터링 (wayCode '1': 상행/drctType '1'/판암방면, wayCode '2': 하행/drctType '2'/반석방면)
  if (wayCode) {
    const targetDrct = String(wayCode) === '2' ? '2' : '1';
    const filtered = stationSchedules.filter((item) => item.drctType === targetDrct);
    if (filtered.length > 0) {
      stationSchedules = filtered;
    }
  }

  // 방향별(상행/하행)로 그룹화하여 각각 다음 열차 2대 추출
  const byDirection: Record<string, DaejeonTimetableItem[]> = {};
  for (const item of stationSchedules) {
    const dirKey = item.drctType || '0';
    if (!byDirection[dirKey]) byDirection[dirKey] = [];
    byDirection[dirKey].push(item);
  }

  const results: SubwayArrival[] = [];

  for (const [dirKey, items] of Object.entries(byDirection)) {
    // 시간순 정렬
    const sorted = items
      .map((it) => ({ ...it, sec: parseTimeToSeconds(it.depTime) }))
      .filter((it) => it.sec > 0)
      .sort((a, b) => a.sec - b.sec);

    if (sorted.length === 0) continue;

    // 현재 시각 이후 열차 찾기
    let upcoming = sorted.filter((it) => it.sec >= currentSeconds);

    // 심야 막차 이후인 경우 다음날 첫차 제공 (롤오버)
    if (upcoming.length === 0) {
      upcoming = sorted.slice(0, 2).map((it) => ({
        ...it,
        sec: it.sec + 86400, // 24시간 추가
      }));
    }

    // drctType '1': 상행(판암방면), drctType '2': 하행(반석방면)
    const isDown = dirKey === '2';
    const directionName = isDown ? '하행' : '상행';
    const defaultDest = isDown ? '반석' : '판암';

    // 가장 빠른 열차 최대 2대 추출
    for (const train of upcoming.slice(0, 2)) {
      const diffSec = train.sec - currentSeconds;
      const minutesLeft = Math.max(0, Math.floor(diffSec / 60));
      const arrivalTime = formatSecondsToTime(train.sec);
      const isApproaching = minutesLeft <= 1;
      const statusText =
        minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후 (${arrivalTime})`;

      const destStation = train.destStation || defaultDest;

      results.push({
        subwayId: '대전1호선',
        updnLine: directionName,
        trainNo: train.trainNo || '시간표열차',
        statnNm: DAEJEON_STATION_NAMES_BY_NUM[stNum] || cleanStation,
        arvlMsg2: statusText,
        recptnDt: '',
        statusText,
        minutesLeft,
        arrivalTime,
        isApproaching,
        isRealtime: false,
        destinationStationNm: destStation,
        canBoard: true,
      });
    }
  }

  results.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return results;
}

/**
 * 특정 대전 1호선 역의 현재 시각 기준 다음으로 오는 전체 열차 시간표 목록을 조회합니다.
 *
 * @param stationName 역명 (예: '대전역', '반석', '서대전네거리')
 * @param wayCode '1' (상행/판암), '2' (하행/반석) 또는 undefined(전체)
 * @returns SubwayTimetableEntry[] 시간순 정렬된 이후 열차 목록
 */
export async function fetchDaejeonStationUpcomingTimetable(
  stationName: string,
  wayCode?: string
): Promise<SubwayTimetableEntry[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const stNum = getDaejeonStationNum(cleanStation);
  if (!stNum) return [];

  const nowMs = timeOffsetManager.getSynchronizedNow();
  const nowDate = new Date(nowMs);
  const { dayType } = getTodayDayType(nowDate);

  // 현재 초 계산 (KST 기준)
  const kstHours = (nowDate.getUTCHours() + 9) % 24;
  const kstMinutes = nowDate.getUTCMinutes();
  const kstSeconds = nowDate.getUTCSeconds();
  const currentSeconds = kstHours * 3600 + kstMinutes * 60 + kstSeconds;

  // 1. 전체 시간표 캐시 조회
  let allItems = await fetchAllDaejeonTimeTable();

  // 2. 캐시 부재 시 역별 조회 폴백
  // API 스펙: drctType '1'=상행(판암), '2'=하행(반석)
  if (allItems.length === 0) {
    const directions = ['1', '2'];
    for (const d of directions) {
      const items = await fetchStationTimeTable(stNum, dayType, d);
      allItems.push(...items);
    }
  }

  // 3. 해당 역 스케줄 필터링
  let stationSchedules = allItems.filter((item) => item.stNum === stNum);

  // 요일 필터 (정확 매칭 우선, 없을 경우 전체)
  const dayMatched = stationSchedules.filter((item) => item.dayType === dayType);
  if (dayMatched.length > 0) {
    stationSchedules = dayMatched;
  }

  // wayCode 필터링 (wayCode '1': 상행/drctType '1', wayCode '2': 하행/drctType '2')
  if (wayCode) {
    const targetDrct = wayCode === '2' ? '2' : '1';
    stationSchedules = stationSchedules.filter((item) => item.drctType === targetDrct);
  }

  // 방향별(상행: 0 / 하행: 1)로 그룹화
  const byDirection: Record<string, DaejeonTimetableItem[]> = {};
  for (const item of stationSchedules) {
    const dirKey = item.drctType || '0';
    if (!byDirection[dirKey]) byDirection[dirKey] = [];
    byDirection[dirKey].push(item);
  }

  const entries: SubwayTimetableEntry[] = [];

  for (const [dirKey, items] of Object.entries(byDirection)) {
    // 시간순 정렬
    const sorted = items
      .map((it) => ({ ...it, sec: parseTimeToSeconds(it.depTime) }))
      .filter((it) => it.sec > 0)
      .sort((a, b) => a.sec - b.sec);

    if (sorted.length === 0) continue;

    // 현재 시각 이후 열차들 선별
    let upcoming = sorted.filter((it) => it.sec >= currentSeconds);

    // 심야 막차 이후인 경우 익일 첫차 롤오버
    if (upcoming.length === 0) {
      upcoming = sorted.map((it) => ({
        ...it,
        sec: it.sec + 86400,
      }));
    }

    // drctType '1': 상행/판암 방면, drctType '2': 하행/반석 방면
    const isDown = dirKey === '2';
    const directionName = isDown ? '반석 방면 (하행)' : '판암 방면 (상행)';
    const defaultDest = isDown ? '반석' : '판암';

    upcoming.forEach((train, idx) => {
      const diffSec = train.sec - currentSeconds;
      const minutesLeft = Math.max(0, Math.floor(diffSec / 60));
      const depTimeStr = formatSecondsToTime(train.sec);
      const isUpcoming = idx === 0;
      const statusText =
        minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후`;

      const destStation = train.destStation || defaultDest;

      entries.push({
        trainNo: train.trainNo || `대전-${isDown ? '하' : '상'}-${idx + 1}`,
        depTime: depTimeStr,
        destStation,
        drctType: dirKey, // '1': 상행(판암방면), '2': 하행(반석방면)
        directionName,
        minutesLeft,
        statusText,
        isUpcoming,
      });
    });
  }

  // 시간순(minutesLeft 오름차순) 정렬
  entries.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return entries;
}
