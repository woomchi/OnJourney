/**
 * @fileoverview ODsay 지하철 역 ID 및 시간표 조회, LRU 캐싱, 다음 열차 탐색 모듈
 */

import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';
import { LruTtlCache } from '@/lib/utils/lruCache';
import type { ScheduleItem } from './types';
import { normalizeStationName } from './trainMetadata';
import { resolveWayCode } from '@/lib/constants/subwayLineMap';
import {
  getNextTrainFromSeoulTimetable,
  loadStationTimetable,
  resolveWeekTag,
  normalizeLineNumber,
  resolveInOutTag,
  toOperationalMinutes,
} from './seoulTimetableService';
import {
  getNextTrainFromSuinbundangTimetable,
  isSuinbundangStation,
  isSuinbundangLine,
} from './suinbundangTimetableService';
import {
  getNextTrainFromGyeonggangTimetable,
  isGyeonggangStation,
  isGyeonggangLine,
} from './gyeonggangTimetableService';
import {
  getNextTrainFromGyeonguiTimetable,
  isGyeonguiStation,
  isGyeonguiLine,
} from './gyeonguiTimetableService';
import {
  getNextTrainFromGyeongchunTimetable,
  isGyeongchunStation,
  isGyeongchunLine,
} from './gyeongchunTimetableService';
import {
  getNextTrainFromEverlineTimetable,
  isEverlineStation,
  isEverlineLine,
} from './everlineTimetableService';
import {
  getNextTrainFromSeohaeTimetable,
  isSeohaeStation,
  isSeohaeLine,
} from './seohaeTimetableService';
import {
  getNextTrainFromShinbundangTimetable,
  isShinbundangStation,
  isShinbundangLine,
} from './shinbundangTimetableService';
import {
  getNextTrainFromArexTimetable,
  isArexStation,
  isArexLine,
  isArexExclusiveStation,
} from './arexTimetableService';
import {
  getNextTrainFromSillimTimetable,
  isSillimStation,
  isSillimLine,
  isSillimExclusiveStation,
} from './sillimTimetableService';

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

      const trainNo = '';
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
 * [ODsay 30회 쿼터 보호] 외부 API 호출을 차단하고 캐시된 값만 반환합니다.
 */
export async function fetchStationId(stationName: string): Promise<string> {
  const cleanName = normalizeStationName(stationName);

  const cached = stationIdCache.get(cleanName);
  if (cached) {
    return cached;
  }

  // ODsay 일일 30회 쿼터 보호를 위해 외부 searchStation 호출 차단
  return '';
}

/**
 * 현재 역과 목적 역의 시간표를 조회하여 동적 이동 시간(초)을 계산합니다.
 */
export async function fetchDynamicTravelTimeSec(
  currentStation: string,
  targetStation: string,
  trainNo: string,
  updnLine: string,
  lineId?: string | number
): Promise<number | null> {
  try {
    const curData = loadStationTimetable(currentStation);
    const tarData = loadStationTimetable(targetStation);

    if (curData && tarData) {
      const weekTag = resolveWeekTag();
      const lineNum = normalizeLineNumber(lineId) || '1';
      const inoutTag = resolveInOutTag(lineNum, updnLine);
      const key = `${lineNum}_${weekTag}_${inoutTag}`;

      const curTrains = curData[key] || [];
      const tarTrains = tarData[key] || [];

      const curTrain = curTrains.find((t) => t.no === String(trainNo).trim());
      const tarTrain = tarTrains.find((t) => t.no === String(trainNo).trim());

      if (curTrain && tarTrain) {
        const depMin = toOperationalMinutes(curTrain.t);
        const arrMin = toOperationalMinutes(tarTrain.t);
        const diffMin = arrMin - depMin;
        if (diffMin > 0 && diffMin < 180) {
          return diffMin * 60;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * ODsay (신) 지하철역 전체 시간표 API(#12 searchSubwaySchedule)를 조회하고 3시간 캐시합니다.
 * [ODsay 30회 쿼터 보호] 외부 시간표 호출을 전면 차단하여 쿼터를 보존합니다.
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

  // ODsay 일일 30회 쿼터 제한으로 인해 외부 시간표 API 호출을 차단하고 빈 배열 반환
  timetableCache.set(cacheKey, [], TIMETABLE_CACHE_TTL_MS);
  return [];
}

/**
 * 시간표 API 부재 시 배차간격(Headway) 기반 지하철 가상 예상 도착 정보를 계산합니다.
 */
function calculateHeadwayFallback(
  stationName: string,
  updnLine: string
): {
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
} {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 심야/새벽 운행 종료 판별 (00:30 ~ 05:30)
  if (currentHour >= 1 && currentHour < 5) {
    return {
      trainNo: 'FIRST_TRAIN_WAITING',
      endSubwayStationNm: '운행 종료',
      minutesLeft: 999,
      arrivalTime: '05:30',
      statusText: '[시간표] 첫차 05:30 대기',
      isApproaching: false,
    };
  }
  if (currentHour === 0 && currentMinute >= 30) {
    return {
      trainNo: 'FIRST_TRAIN_WAITING',
      endSubwayStationNm: '운행 종료',
      minutesLeft: 999,
      arrivalTime: '05:30',
      statusText: '[시간표] 첫차 05:30 대기',
      isApproaching: false,
    };
  }
  if (currentHour === 5 && currentMinute < 30) {
    return {
      trainNo: 'FIRST_TRAIN_WAITING',
      endSubwayStationNm: '첫차 대기',
      minutesLeft: 30 - currentMinute,
      arrivalTime: '05:30',
      statusText: '[시간표] 첫차 05:30 대기',
      isApproaching: false,
    };
  }

  // 시간대별 표준 배차간격 (출퇴근 4분, 심야 12분, 평시 7분)
  let headwayMin = 7;
  if ((currentHour >= 7 && currentHour < 9) || (currentHour >= 18 && currentHour < 20)) {
    headwayMin = 4;
  } else if (currentHour >= 22 || currentHour === 0) {
    headwayMin = 12;
  }

  const offset = headwayMin - (currentMinute % headwayMin);
  const minutesLeft = offset === 0 ? headwayMin : offset;

  const arrDate = new Date(now.getTime() + minutesLeft * 60 * 1000);
  const arrivalTime = `${String(arrDate.getHours()).padStart(2, '0')}:${String(arrDate.getMinutes()).padStart(2, '0')}`;
  const dirLabel = updnLine === '1' || updnLine === '상행' ? '상행' : '하행';

  return {
    trainNo: 'ESTIMATED',
    endSubwayStationNm: `${dirLabel} 방면`,
    minutesLeft,
    arrivalTime,
    statusText: `[예상] 약 ${minutesLeft}분 후 (${arrivalTime})`,
    isApproaching: minutesLeft <= 2,
  };
}

/**
 * 정적 시간표 캐시에서 다음 열차 도착 정보를 계산합니다.
 * 1. 서울교통공사 공식 시간표 (1~9호선 405개 역) 우선 조회
 * 2. 수인분당선 공식 시간표 (63개 역) 조회
 * 3. 해당 역 데이터가 없거나 비어있으면 배차간격(Headway) 기반 Fallback 반환
 */
export async function calculateNextTrainFromTimetable(
  stationName: string,
  updnLine: string,
  lineId?: string | number,
  destination?: string,
  headsign?: string
): Promise<{
  trainNo: string;
  endSubwayStationNm: string;
  minutesLeft: number;
  arrivalTime: string;
  statusText: string;
  isApproaching: boolean;
  isExpress?: boolean;
  canBoard?: boolean;
} | null> {
  const schedule = await fetchAndCacheTimetable(stationName, updnLine);

  if (schedule && schedule.length > 0) {
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
      const first = schedule[0];
      const firstTime = first ? String(first.arrTime || first.depTime || '05:30') : '05:30';
      return {
        trainNo: first ? String(first.trainNo) : 'FIRST_TRAIN_WAITING',
        endSubwayStationNm: first?.endSubwayStationNm || '운행 종료',
        minutesLeft: 999,
        arrivalTime: firstTime,
        statusText: `[시간표] 첫차 ${firstTime} 대기`,
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

  // 1. 수인분당선 노선이 명시적으로 요청되었거나 수인분당선 전용 역인 경우 수인분당선 시간표 최우선 조회
  if (isSuinbundangLine(lineId) || (isSuinbundangStation(stationName) && !normalizeLineNumber(lineId) && !isGyeonggangLine(lineId))) {
    const suinTrain = getNextTrainFromSuinbundangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (suinTrain) {
      return suinTrain;
    }
  }

  // 2. 경강선 노선이 명시적으로 요청되었거나 경강선 전용 역인 경우 경강선 시간표 최우선 조회
  if (isGyeonggangLine(lineId) || (isGyeonggangStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId))) {
    const ggTrain = getNextTrainFromGyeonggangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (ggTrain) {
      return ggTrain;
    }
  }

  // 3. 경의중앙선 노선이 명시적으로 요청되었거나 경의중앙선 전용 역인 경우 경의중앙선 시간표 최우선 조회
  if (isGyeonguiLine(lineId) || (isGyeonguiStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId) && !isGyeonggangLine(lineId) && !isGyeongchunLine(lineId))) {
    const gyTrain = getNextTrainFromGyeonguiTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (gyTrain) {
      return gyTrain;
    }
  }

  // 4. 경춘선 노선이 명시적으로 요청되었거나 경춘선 전용 역인 경우 경춘선 시간표 최우선 조회
  if (isGyeongchunLine(lineId) || (isGyeongchunStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId) && !isGyeonggangLine(lineId) && !isGyeonguiLine(lineId))) {
    const gcTrain = getNextTrainFromGyeongchunTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (gcTrain) {
      return gcTrain;
    }
  }

  // 5. 에버라인 노선이 명시적으로 요청되었거나 에버라인 전용 역인 경우 에버라인 시간표 최우선 조회
  if (isEverlineLine(lineId) || (isEverlineStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId) && !isGyeonggangLine(lineId) && !isGyeonguiLine(lineId) && !isGyeongchunLine(lineId))) {
    const evTrain = getNextTrainFromEverlineTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (evTrain) {
      return evTrain;
    }
  }

  // 6. 서해선 노선이 명시적으로 요청되었거나 서해선 전용 역인 경우 서해선 시간표 최우선 조회
  if (isSeohaeLine(lineId) || (isSeohaeStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId) && !isGyeonggangLine(lineId) && !isGyeonguiLine(lineId) && !isGyeongchunLine(lineId) && !isEverlineLine(lineId))) {
    const shTrain = getNextTrainFromSeohaeTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (shTrain) {
      return shTrain;
    }
  }

  // 7. 신분당선 노선이 명시적으로 요청되었거나 신분당선 전용 역인 경우 신분당선 시간표 최우선 조회
  if (isShinbundangLine(lineId) || (isShinbundangStation(stationName) && !normalizeLineNumber(lineId) && !isSuinbundangLine(lineId) && !isGyeonggangLine(lineId) && !isGyeonguiLine(lineId) && !isGyeongchunLine(lineId) && !isEverlineLine(lineId) && !isSeohaeLine(lineId))) {
    const sbdTrain = getNextTrainFromShinbundangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (sbdTrain) {
      return sbdTrain;
    }
  }

  // 8. 공항철도 노선이 명시적으로 요청되었거나 공항철도 전용 고유역인 경우 공항철도 시간표 최우선 조회
  if (isArexLine(lineId) || (isArexExclusiveStation(stationName) && !normalizeLineNumber(lineId))) {
    const arexTrain = getNextTrainFromArexTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (arexTrain) {
      return arexTrain;
    }
  }

  // 9. 신림선 노선이 명시적으로 요청되었거나 신림선 전용 고유역인 경우 신림선 시간표 최우선 조회
  if (isSillimLine(lineId) || (isSillimExclusiveStation(stationName) && !normalizeLineNumber(lineId))) {
    const sillimTrain = getNextTrainFromSillimTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (sillimTrain) {
      return sillimTrain;
    }
  }

  // 10. 서울교통공사 공식 시간표 조회 (1~9호선 405개 역)
  const seoulTrain = getNextTrainFromSeoulTimetable({
    stationName,
    updnLine,
    lineId,
  });
  if (seoulTrain) {
    return seoulTrain;
  }

  // 6. 서울 1~9호선에 없는 환승/공유역(왕십리, 선릉, 수서 등) 수인분당선 시간표 조회
  if (isSuinbundangStation(stationName)) {
    const suinTrain = getNextTrainFromSuinbundangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (suinTrain) {
      return suinTrain;
    }
  }

  // 7. 경강선 환승역(판교, 성남, 이매 등) 경강선 시간표 조회
  if (isGyeonggangStation(stationName)) {
    const ggTrain = getNextTrainFromGyeonggangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (ggTrain) {
      return ggTrain;
    }
  }

  // 8. 경의중앙선 환승역(용산, 청량리, 왕십리, 옥수, 이촌, 공덕, 홍대입구, 대곡 등) 경의중앙선 시간표 조회
  if (isGyeonguiStation(stationName)) {
    const gyTrain = getNextTrainFromGyeonguiTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (gyTrain) {
      return gyTrain;
    }
  }

  // 9. 경춘선 환승역(청량리, 회기, 중랑, 상봉, 망우, 신내, 별내, 광운대 등) 경춘선 시간표 조회
  if (isGyeongchunStation(stationName)) {
    const gcTrain = getNextTrainFromGyeongchunTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (gcTrain) {
      return gcTrain;
    }
  }

  // 10. 에버라인 환승역(기흥) 에버라인 시간표 조회
  if (isEverlineStation(stationName)) {
    const evTrain = getNextTrainFromEverlineTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (evTrain) {
      return evTrain;
    }
  }

  // 11. 서해선 환승/공용역(소사, 부천종합운동장, 김포공항, 능곡, 대곡, 곡산, 백마, 풍산, 일산, 초지 등) 서해선 시간표 조회
  if (isSeohaeStation(stationName)) {
    const shTrain = getNextTrainFromSeohaeTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (shTrain) {
      return shTrain;
    }
  }

  // 12. 신분당선 환승역(강남, 양재, 판교, 정자, 미금, 신사, 논현, 신논현) 신분당선 시간표 조회
  if (isShinbundangStation(stationName)) {
    const sbdTrain = getNextTrainFromShinbundangTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (sbdTrain) {
      return sbdTrain;
    }
  }

  // 13. 공항철도 환승역(서울, 공덕, 홍대입구, 디지털미디어시티, 마곡나루, 김포공항, 계양, 검암) 공항철도 시간표 조회
  if (isArexStation(stationName)) {
    const arexTrain = getNextTrainFromArexTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (arexTrain) {
      return arexTrain;
    }
  }

  // 14. 신림선 환승역(샛강, 대방, 보라매, 신림) 신림선 시간표 조회
  if (isSillimStation(stationName)) {
    const sillimTrain = getNextTrainFromSillimTimetable({
      stationName,
      updnLine,
      lineId,
      destination,
      headsign,
    });
    if (sillimTrain) {
      return sillimTrain;
    }
  }

  // 15. 공식 시간표에 없는 역의 경우 배차간격 기반 가상 도착 정보 반환
  return calculateHeadwayFallback(stationName, updnLine);
}
