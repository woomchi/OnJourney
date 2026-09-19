/**
 * @fileoverview 광주 도시철도(1호선) 열차 도착 정보 서비스
 *
 * 로컬 압축 시간표 DB(gwangju_subway_timetables.json.gz)를 기반으로
 * O(1) 상수 시간 내에 광주 지하철 열차 도착 정보를 생성합니다.
 */

import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival } from '@/types/journey';
import {
  getNextTrainsFromGwangjuTimetable,
  resolveGwangjuDirection,
} from './subway/gwangjuTimetableService';
import {
  inferGwangjuDirection,
  resolveOfficialGwangjuStationName,
  getGwangjuLineStations,
  isGwangjuSubwayStation,
} from './gwangjuSubwayStations';

export {
  inferGwangjuDirection,
  resolveOfficialGwangjuStationName,
  getGwangjuLineStations,
  isGwangjuSubwayStation,
};

/**
 * 광주 지하철 역의 도착 정보 조회 (SubwayArrival[] 반환)
 */
export async function fetchGwangjuSubwayArrivals(
  stationName: string,
  wayCode?: string,
  subwayId?: string,
  destination?: string,
  headsign?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const officialStation = resolveOfficialGwangjuStationName(cleanStation);
  if (!officialStation) {
    return [];
  }

  const now = new Date(timeOffsetManager.getSynchronizedNow());

  // 방향 판별
  let direction: 'UP' | 'DOWN' | null = null;
  if (destination || headsign) {
    direction = inferGwangjuDirection(destination, headsign, officialStation);
  }
  if (!direction && wayCode) {
    direction = resolveGwangjuDirection(wayCode);
  }

  const directions: Array<'UP' | 'DOWN'> = direction ? [direction] : ['UP', 'DOWN'];
  const arrivals: SubwayArrival[] = [];

  for (const dir of directions) {
    const trains = getNextTrainsFromGwangjuTimetable(officialStation, dir, 2, now);
    const updnText = dir === 'UP' ? '상행' : '하행';

    for (const train of trains) {
      arrivals.push({
        subwayId: subwayId || '광주1호선',
        updnLine: updnText,
        trainNo: train.trainNo,
        statnNm: officialStation,
        destinationStationNm: train.endSubwayStationNm,
        arvlMsg2: train.statusText,
        recptnDt: '',
        statusText: train.statusText,
        minutesLeft: train.minutesLeft,
        arrivalTime: train.arrivalTime,
        isApproaching: train.isApproaching,
        isExpress: train.isExpress,
        canBoard: train.canBoard,
        isRealtime: false, // 시간표 기반
      });
    }
  }

  arrivals.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return arrivals;
}
