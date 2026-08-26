/**
 * @fileoverview ODsay 지하철 역 ID 및 시간표 조회, LRU 캐싱, 다음 열차 탐색 모듈
 */

import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';
import { LruTtlCache } from '@/lib/utils/lruCache';
import type { ScheduleItem } from './types';
import { normalizeStationName } from './trainMetadata';
import { resolveWayCode } from '@/lib/constants/subwayLineMap';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const MIDNIGHT_SECONDS = 24 * 3_600;
const TIMETABLE_CACHE_TTL_MS = 3 * 3_600 * 1_000;      // 3시간
const TIMETABLE_ERROR_CACHE_TTL_MS = 5 * 60 * 1_000;    // 5분

// ─── LRU 캐시 ────────────────────────────────────────────────────────────────
/** 역명 → ODsay Station ID 캐시 (최대 500개, 24시간 TTL) */
const stationIdCache = new LruTtlCache<string, string>({
  maxSize: 500,
  defaultTtlMs: 24 * 3_600 * 1_000,
});

/** 시간표 캐시 (역명_방향 → ScheduleItem[], 최대 300개, 기본 3시간 TTL) */
const timetableCache = new LruTtlCache<string, ScheduleItem[]>({
  maxSize: 300,
  defaultTtlMs: TIMETABLE_CACHE_TTL_MS,
});

/**
 * 시간 문자열("HH:mm:ss", "HH:mm", "HHMMSS" 등)을 자정 기준 총 초로 변환합니다.
 */
export function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;

  if (!timeStr.includes(':') && timeStr.length >= 6) {
    const h = parseInt(timeStr.substring(0, 2), 10);
    const m = parseInt(timeStr.substring(2, 4), 10);
    const s = parseInt(timeStr.substring(4, 6), 10);
    return h * 3_600 + m * 60 + s;
  }

  const [h = 0, m = 0, s = 0] = timeStr.split(':').map(Number);
  return h * 3_600 + m * 60 + s;
}

/**
 * ODsay searchSubwaySchedule의 시간 노드 리스트를 ScheduleItem 구조체 배열로 파싱합니다.
 */
export function parseOdsaySubwayTimeList(timeNodes: any[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  if (!Array.isArray(timeNodes)) return items;

  for (const node of timeNodes) {
    const hour = Number(node.Idx || node.idx);
    if (isNaN(hour)) continue;

    const listStr = String(node.list || '').trim();
    if (!listStr) continue;

    const entries = listStr.split(' ');
    for (const entry of entries) {
      if (!entry.trim()) continue;

      const cleanEntry = entry.trim();
      const parenMatch = cleanEntry.match(/\((.*?)\)/);
      const isExpress = cleanEntry.includes('[') || cleanEntry.includes('급행');

      let trainNo = '';
      let endSubwayStationNm = '';

      if (parenMatch) {
        endSubwayStationNm = parenMatch[1];
      }

      const minutePart = cleanEntry.split('(')[0].replace(/[^0-9]/g, '');
      const minNum = parseInt(minutePart, 10);
      if (isNaN(minNum)) continue;

      const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minNum).padStart(2, '0')}`;

      items.push({
        trainNo: trainNo || `${hour}${String(minNum).padStart(2, '0')}`,
        depTime: timeFormatted,
        arrTime: timeFormatted,
        endSubwayStationNm: endSubwayStationNm ? normalizeStationName(endSubwayStationNm) : undefined,
        isExpress,
      });
    }
  }

  return items;
}

/**
 * 역명으로 ODsay 대중교통 정류장 검색 API(#14 searchStation)에서 지하철 Station ID를 조회합니다.
 */
export async function fetchStationId(stationName: string): Promise<string> {
  const cleanName = normalizeStationName(stationName);

  const cached = stationIdCache.get(cleanName);
  if (cached) {
    return cached;
  }

  try {
    const data = await OdsayAdapter.fetchSearchStation(cleanName, '2');
    const stations = data?.result?.station;

    let stationId = '';
    if (Array.isArray(stations) && stations.length > 0) {
      const matched =
        stations.find(
          (s: any) =>
            normalizeStationName(s.stationName) === cleanName
        ) ?? stations[0];
      stationId = String(matched.stationID);
    }

    if (stationId) {
      stationIdCache.set(cleanName, stationId);
      return stationId;
    }

    throw new Error(`ODsay 역 ID를 찾을 수 없습니다: ${cleanName}`);
  } catch (err) {
    console.warn(`[subwayService] ${cleanName} ODsay 역 ID 조회 실패:`, err);
    throw err;
  }
}

/**
 * 현재 역과 목적 역의 ODsay 시간표를 조회하여 동적 이동 시간(초)을 계산합니다.
 */
export async function fetchDynamicTravelTimeSec(
  currentStation: string,
  targetStation: string,
  trainNo: string,
  updnLine: string
): Promise<number | null> {
  try {
    const [currentSchedule, targetSchedule] = await Promise.all([
      fetchAndCacheTimetable(currentStation, updnLine),
      fetchAndCacheTimetable(targetStation, updnLine),
    ]);

    if (!currentSchedule.length || !targetSchedule.length) return null;

    const currentTrain = currentSchedule.find(
      (it) => String(it.trainNo).trim() === String(trainNo).trim()
    );
    const targetTrain = targetSchedule.find(
      (it) => String(it.trainNo).trim() === String(trainNo).trim()
    );

    if (!currentTrain?.depTime || !targetTrain?.arrTime) return null;

    const depSec = timeToSeconds(String(currentTrain.depTime));
    const arrSec = timeToSeconds(String(targetTrain.arrTime));
    let diffSec = arrSec - depSec;

    if (diffSec < 0) diffSec += MIDNIGHT_SECONDS;

    return diffSec;
  } catch {
    return null;
  }
}

/**
 * ODsay (신) 지하철역 전체 시간표 API(#12 searchSubwaySchedule)를 조회하고 3시간 캐시합니다.
 */
export async function fetchAndCacheTimetable(
  stationName: string,
  updnLine: string
): Promise<ScheduleItem[]> {
  const cleanName = normalizeStationName(stationName);
  const upDownTypeCode = resolveWayCode(updnLine);
  const cacheKey = `${cleanName}_${upDownTypeCode}`;

  const cached = timetableCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const stationId = await fetchStationId(cleanName);
    const scheduleData = await OdsayAdapter.fetchSubwaySchedule(stationId, upDownTypeCode);
    const result = scheduleData?.result;

    if (!result) {
      timetableCache.set(cacheKey, [], TIMETABLE_ERROR_CACHE_TTL_MS);
      return [];
    }

    const day = new Date().getDay();
    let dayListObj = result.WeekList;
    if (day === 0) dayListObj = result.SunList || result.WeekList;
    else if (day === 6) dayListObj = result.SatList || result.WeekList;

    const dirNode = upDownTypeCode === '1' ? dayListObj?.up : dayListObj?.down;
    const timeNodes = dirNode?.time ?? [];

    const schedule = parseOdsaySubwayTimeList(timeNodes);

    // 성공 시 기본 3시간 TTL로 캐싱
    timetableCache.set(cacheKey, schedule, TIMETABLE_CACHE_TTL_MS);
    return schedule;
  } catch (e) {
    console.warn(`[subwayService] ODsay 시간표 조회 실패 (${cleanName}):`, e);
    // 에러 시 5분 TTL로 빈 배열 캐싱
    timetableCache.set(cacheKey, [], TIMETABLE_ERROR_CACHE_TTL_MS);
    return [];
  }
}

/**
 * 정적 시간표 캐시에서 다음 열차 도착 정보를 계산합니다.
 */
export async function calculateNextTrainFromTimetable(
  stationName: string,
  updnLine: string
): Promise<{
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
} | null> {
  const schedule = await fetchAndCacheTimetable(stationName, updnLine);
  if (!schedule || schedule.length === 0) return null;

  const now = new Date();
  const currentTotalSec = now.getHours() * 3_600 + now.getMinutes() * 60 + now.getSeconds();

  const upcoming = schedule
    .filter((it) => {
      if (!it.arrTime && !it.depTime) return false;
      const sec = timeToSeconds(String(it.arrTime || it.depTime));
      return sec >= currentTotalSec;
    })
    .sort(
      (a, b) =>
        timeToSeconds(String(a.arrTime || a.depTime)) -
        timeToSeconds(String(b.arrTime || b.depTime))
    );

  if (upcoming.length === 0) {
    return {
      trainNo: 'LAST_TRAIN_ENDED',
      endSubwayStationNm: '운행 종료',
      minutesLeft: 999,
      arrivalTime: '--:--',
      statusText: '[시간표] 금일 운행 종료',
      isApproaching: false,
    };
  }

  const next = upcoming[0];
  const targetSec = timeToSeconds(String(next.arrTime || next.depTime));
  const diffSec = targetSec - currentTotalSec;
  const minutesLeft = Math.ceil(diffSec / 60);

  const h = Math.floor(targetSec / 3_600);
  const m = Math.floor((targetSec % 3_600) / 60);
  const arrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return {
    trainNo: String(next.trainNo),
    endSubwayStationNm: String(next.endSubwayStationNm || ''),
    minutesLeft,
    arrivalTime,
    statusText: `[시간표] ${String(next.endSubwayStationNm || '')} (${arrivalTime})`,
    isApproaching: false,
  };
}
