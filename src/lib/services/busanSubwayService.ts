/**
 * @fileoverview 부산교통공사 열차시각표 조회 서비스 (trainTime/getTrainTime)
 *
 * 공공데이터포털 부산교통공사_부산도시철도 열차시각표 조회 서비스_GW(B551542)를 활용하여
 * 부산 도시철도 1~4호선의 시간표 기반 지하철 도착 정보를 제공합니다.
 *
 * 엔드포인트:
 * https://apis.data.go.kr/B551542/trainTime/getTrainTime
 */

import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival, SubwayTimetableEntry, SubwayLineStation } from '@/types/journey';
import {
  loadBusanStationTimetable,
  getBusanTimetableList,
  resolveOfficialBusanStationName,
  normalizeBusanLineNumber,
  resolveBusanDirection,
} from './subway/busanTimetableService';

import {
  BUSAN_SUBWAY_STATIONS,
  getBusanStationCode,
  getBusanDayType,
  inferBusanDirection,
  isBusanSubwayStation,
  type BusanTimetableItem,
  type BusanStationMeta,
} from './busanSubwayStations';
import {
  fetchDonghaeSubwayArrivals,
  fetchDonghaeStationUpcomingTimetable,
} from './donghaeSubwayService';
import { isDonghaeSubwayStation } from './subway/donghaeTimetableService';
export * from './busanSubwayStations';
export * from './donghaeSubwayService';

/**
 * 시간 문자열("HH:mm:ss" 또는 "HH:mm")을 초로 변환
 */
function parseTimeToSeconds(timeStr: string): number {
  const str = String(timeStr || '').trim().replace(/:/g, '');
  if (!str) return 0;
  const h = parseInt(str.substring(0, 2), 10) || 0;
  const m = parseInt(str.substring(2, 4), 10) || 0;
  const s = str.length >= 6 ? parseInt(str.substring(4, 6), 10) || 0 : 0;
  return h * 3600 + m * 60 + s;
}

/**
 * 초를 "HH:mm" 포맷으로 변환
 */
function formatSecondsToTime(totalSec: number): string {
  const safe = (totalSec + 86400) % 86400;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 특정 역의 하루 전체 열차운행 시각표를 조회합니다 (로컬 압축 DB 기반 싱글톤 해시테이블 O(1) 조회).
 */
export async function fetchBusanStationTimetable(scode: string): Promise<BusanTimetableItem[]> {
  // scode로 역 메타 찾기
  const meta = Object.values(BUSAN_SUBWAY_STATIONS).find((m) => m.scode === String(scode));
  const stationName = meta?.name || scode;

  const stationData = loadBusanStationTimetable(stationName);
  if (!stationData) {
    return [];
  }

  const items: BusanTimetableItem[] = [];
  // targetKey 형식: {lineNum}_{dayType}_{direction}
  for (const [groupKey, trains] of Object.entries(stationData)) {
    const [line, dayType, dir] = groupKey.split('_');
    const updown = dir === 'UP' ? '0' : '1';

    // dayType: '평일', '토요일', '공휴일'
    // 기존 busanSubwayService dayType: '1': 평일, '2': 토요일, '3': 일요일/공휴일
    let legacyDayType = '1';
    if (dayType === '토요일') legacyDayType = '2';
    else if (dayType === '공휴일') legacyDayType = '3';

    for (const tr of trains) {
      items.push({
        scode: String(scode),
        sname: meta?.name || stationName,
        line: line || meta?.line || '1',
        trainno: tr.no || '부산열차',
        arrtime: tr.t.length === 5 ? `${tr.t}:00` : tr.t,
        dayType: legacyDayType,
        updown,
        endcode: '',
        destStation: tr.d,
      });
    }
  }

  return items;
}

/**
 * 부산 지하철 역의 실시간/시간표 기반 도착 정보 조회 (SubwayArrival[] 반환)
 */
export async function fetchBusanSubwayArrivals(
  stationName: string,
  wayCode?: string,
  subwayId?: string,
  destination?: string,
  headsign?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();

  // 0. 동해선 전용 노선 또는 동해선 고유역 분기
  const isDonghaeExplicit = Boolean(subwayId && subwayId.includes('동해'));
  const isDonghaeStn = isDonghaeSubwayStation(cleanStation);
  const isBusanMetro = isBusanSubwayStation(cleanStation);

  if (isDonghaeExplicit || (isDonghaeStn && !isBusanMetro)) {
    return fetchDonghaeSubwayArrivals(stationName, wayCode, subwayId, destination, headsign);
  }

  const scode = getBusanStationCode(cleanStation, subwayId);
  const meta = scode
    ? Object.values(BUSAN_SUBWAY_STATIONS).find((m) => m.scode === scode)
    : undefined;

  const now = new Date(timeOffsetManager.getSynchronizedNow());
  const lineNum = normalizeBusanLineNumber(subwayId || meta?.line) || '1';

  // 1. 방향 판별 (destination/headsign 하차역 정밀 추론 -> 종착역 키워드 -> wayCode)
  let targetDir: 'UP' | 'DOWN' | undefined = undefined;

  const cleanDest = destination ? destination.replace(/역$/, '').trim() : '';
  const cleanHead = headsign ? headsign.replace(/역$/, '').replace(/방면$/, '').trim() : '';

  // 1-1. headsign에서 목적역 추출 (예: '1호선 (부산역 > 토성역)', '부산역 > 토성역', '다대포해수욕장방면')
  let parsedHeadDest = cleanHead;
  const arrowMatch = cleanHead.match(/>\s*([가-힣0-9a-zA-Z]+)/);
  if (arrowMatch) {
    parsedHeadDest = arrowMatch[1].replace(/역$/, '').trim();
  }

  // 1-2. 출발역과 도착역(하차역) 역코드로 정밀 방향 판별
  if (cleanDest) {
    targetDir = inferBusanDirection(lineNum, cleanStation, cleanDest) || undefined;
  }
  if (!targetDir && parsedHeadDest) {
    targetDir = inferBusanDirection(lineNum, cleanStation, parsedHeadDest) || undefined;
  }

  // 1-3. 종착역 키워드 힌트 기반 판별
  if (!targetDir) {
    const destHint = `${destination || ''} ${headsign || ''}`.trim();
    if (destHint) {
      if (/노포|장산|광안|전포|수영|미남/.test(destHint)) {
        targetDir = 'UP';
      } else if (/다대포|신평|양산|호포|대저|안평/.test(destHint)) {
        targetDir = 'DOWN';
      }
    }
  }

  // 1-3. wayCode 기반 판별
  if (!targetDir && wayCode) {
    targetDir = resolveBusanDirection(lineNum, wayCode);
  }

  // 2. 인메모리 시간표 해시테이블에서 조회
  const timetableList = getBusanTimetableList(
    cleanStation,
    targetDir,
    lineNum,
    now,
    30
  );

  if (timetableList && timetableList.length > 0) {
    // depTime 및 trainNo 기준 중복 제거하며 상위 2대 추출 (다음 열차, 다다음 열차)
    const selectedTrains: SubwayTimetableEntry[] = [];
    const seenTimes = new Set<string>();

    if (targetDir) {
      // 1) 방향이 지정된 경우: 해당 방향 열차들만 정확히 2대 수집 (상/하행 혼합 방지)
      for (const t of timetableList) {
        const isUpTrain = t.drctType === '1' || t.directionName.includes('상행');
        if (targetDir === 'UP' && !isUpTrain) continue;
        if (targetDir === 'DOWN' && isUpTrain) continue;

        const key = `${t.depTime}_${t.trainNo}`;
        if (!seenTimes.has(key)) {
          seenTimes.add(key);
          selectedTrains.push(t);
        }
        if (selectedTrains.length >= 2) break;
      }
    } else {
      // 2) 방향이 미지정된 일반 역 조회: 상행 1~2대 + 하행 1~2대를 균형 있게 수집 (각 방향 내 순차 정렬)
      const upTrains = timetableList.filter((t) => t.drctType === '1' || t.directionName.includes('상행'));
      const downTrains = timetableList.filter((t) => t.drctType === '2' || t.directionName.includes('하행'));

      if (upTrains[0]) selectedTrains.push(upTrains[0]);
      if (downTrains[0]) selectedTrains.push(downTrains[0]);
      if (upTrains[1] && selectedTrains.length < 4) selectedTrains.push(upTrains[1]);
      if (downTrains[1] && selectedTrains.length < 4) selectedTrains.push(downTrains[1]);
    }

    if (selectedTrains.length > 0) {
      const lineName = `부산 ${lineNum}호선`;

      return selectedTrains.map((tr) => {
        const dest = tr.destStation || (tr.drctType === '1' ? '종점' : '기점');
        const directionName = `${dest}행`;
        const minutesLeft = tr.minutesLeft;
        const arrivalTime = tr.depTime;
        const isApproaching = minutesLeft <= 1;
        const statusText =
          minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후 (${arrivalTime})`;

        return {
          subwayId: lineName,
          updnLine: directionName,
          trainNo: tr.trainNo || '부산열차',
          statnNm: meta?.name || cleanStation,
          arvlMsg2: statusText,
          recptnDt: '',
          statusText,
          minutesLeft,
          arrivalTime,
          isApproaching,
          isRealtime: false,
          destinationStationNm: dest,
          canBoard: true,
        };
      });
    }
  }

  // 3. Fallback: scode 기반 조회 (외부 공공데이터/하위 호환)
  if (!scode) return [];

  const timetable = await fetchBusanStationTimetable(scode);
  if (!timetable || timetable.length === 0) return [];

  const currentDayType = getBusanDayType(now);
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const todayItems = timetable.filter((item) => item.dayType === currentDayType);
  const activeItems = todayItems.length > 0 ? todayItems : timetable;

  // fetchBusanStationTimetable의 updown 체계: UP = '0', DOWN = '1'
  let targetUpdown: string | null = null;
  if (targetDir) {
    targetUpdown = targetDir === 'UP' ? '0' : '1';
  } else if (wayCode === '1' || wayCode === 'UP' || wayCode === '상행') {
    targetUpdown = '0';
  } else if (wayCode === '2' || wayCode === 'DOWN' || wayCode === '하행') {
    targetUpdown = '1';
  }

  const arrivals: SubwayArrival[] = [];

  const filteredItems = targetUpdown !== null
    ? activeItems.filter((it) => it.updown === targetUpdown)
    : activeItems;

  const sorted = filteredItems
    .map((it) => ({
      ...it,
      seconds: parseTimeToSeconds(it.arrtime),
    }))
    .sort((a, b) => a.seconds - b.seconds);

  let upcoming = sorted.filter((it) => it.seconds >= currentSec - 20);
  if (upcoming.length === 0 && sorted.length > 0) {
    upcoming = sorted.slice(0, 2);
  }

  const seenKeys = new Set<string>();
  for (const train of upcoming) {
    const key = `${train.arrtime}_${train.trainno}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    let diffSec = train.seconds - currentSec;
    if (diffSec < -20 && upcoming.length > 0) {
      diffSec = 0;
    }

    const minutesLeft = diffSec <= 45 ? 0 : Math.round(diffSec / 60);
    const arrivalTime = formatSecondsToTime(train.seconds);
    const isApproaching = minutesLeft <= 1;
    const statusText =
      minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후 (${arrivalTime})`;

    const dest = train.destStation || (train.updown === '0' ? '종점' : '기점');
    const lineName = train.line ? `부산 ${train.line}호선` : '부산도시철도';
    const directionName = `${dest}행`;

    arrivals.push({
      subwayId: lineName,
      updnLine: directionName,
      trainNo: train.trainno || '부산열차',
      statnNm: meta?.name || cleanStation,
      arvlMsg2: statusText,
      recptnDt: '',
      statusText,
      minutesLeft,
      arrivalTime,
      isApproaching,
      isRealtime: false,
      destinationStationNm: dest,
      canBoard: true,
    });

    if (arrivals.length >= 2) break;
  }

  return arrivals;
}

/**
 * 노선도 뷰어용 역별 다음 시각표 조회 (SubwayTimetableEntry[] 반환)
 */
export async function fetchBusanStationUpcomingTimetable(
  stationName: string,
  subwayId?: string,
  count: number = 60
): Promise<SubwayTimetableEntry[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();

  // 0. 동해선 전용 노선 또는 동해선 고유역 분기
  const isDonghaeExplicit = Boolean(subwayId && subwayId.includes('동해'));
  const isDonghaeStn = isDonghaeSubwayStation(cleanStation);
  const isBusanMetro = isBusanSubwayStation(cleanStation);

  if (isDonghaeExplicit || (isDonghaeStn && !isBusanMetro)) {
    return fetchDonghaeStationUpcomingTimetable(cleanStation, subwayId, count);
  }

  const now = new Date(timeOffsetManager.getSynchronizedNow());

  const list = getBusanTimetableList(cleanStation, undefined, subwayId, now, count);
  if (list && list.length > 0) {
    return list.slice(0, count);
  }

  // fallback: scode 기반
  const scode = getBusanStationCode(cleanStation, subwayId);
  if (!scode) return [];

  const timetable = await fetchBusanStationTimetable(scode);
  if (!timetable || timetable.length === 0) return [];

  const currentDayType = getBusanDayType(now);
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const todayItems = timetable.filter((item) => item.dayType === currentDayType);
  const activeItems = todayItems.length > 0 ? todayItems : timetable;

  const sorted = activeItems
    .map((it) => ({
      ...it,
      seconds: parseTimeToSeconds(it.arrtime),
    }))
    .sort((a, b) => a.seconds - b.seconds);

  let upcoming = sorted.filter((it) => it.seconds >= currentSec - 20);
  if (upcoming.length === 0) {
    upcoming = sorted.map((it) => ({
      ...it,
      seconds: it.seconds + 86400,
    }));
  }

  return upcoming.slice(0, count).map((train, idx) => {
    let diffSec = train.seconds - currentSec;
    const minutesLeft = diffSec <= 45 ? 0 : Math.round(diffSec / 60);
    const depTimeStr = formatSecondsToTime(train.seconds);
    const dest = train.destStation || '종착';
    const isDown = train.updown === '1';

    return {
      trainNo: train.trainno || `부산-${train.line}-${idx + 1}`,
      depTime: depTimeStr,
      destStation: dest,
      drctType: isDown ? '2' : '1',
      directionName: `${dest} 방면 (${isDown ? '하행' : '상행'})`,
      minutesLeft,
      statusText: minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후`,
      isUpcoming: idx === 0,
    };
  });
}
