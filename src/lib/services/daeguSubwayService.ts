/**
 * @fileoverview 대구 도시철도(1~3호선) 및 대경선 열차 도착 정보 서비스
 *
 * 로컬 압축 시간표 DB(daegu_subway_timetables.json.gz)를 기반으로
 * O(1) 상수 시간 내에 대구 지하철 및 대경선 열차 도착 정보를 생성합니다.
 */

import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival } from '@/types/journey';
import {
  getNextTrainsFromDaeguTimetable,
  normalizeDaeguLineNumber,
  resolveDaeguDirection,
  getDaeguLinesForStation,
} from './subway/daeguTimetableService';
import {
  inferDaeguDirection,
  resolveOfficialDaeguStationName,
  getDaeguLineStations,
} from './daeguSubwayStations';

export {
  inferDaeguDirection,
  resolveOfficialDaeguStationName,
  getDaeguLineStations,
};

/**
 * 대구 지하철 및 대경선 역의 도착 정보 조회 (SubwayArrival[] 반환)
 */
export async function fetchDaeguSubwayArrivals(
  stationName: string,
  wayCode?: string,
  subwayId?: string,
  destination?: string,
  headsign?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const officialStation = resolveOfficialDaeguStationName(cleanStation);
  if (!officialStation) {
    return [];
  }

  const now = new Date(timeOffsetManager.getSynchronizedNow());
  const availableLines = getDaeguLinesForStation(officialStation);

  // 호선 식별 (미지정 시 해당 역의 첫 번째 호선)
  let lineNum = normalizeDaeguLineNumber(subwayId);
  if (!lineNum || !availableLines.includes(lineNum)) {
    lineNum = availableLines[0] || '1';
  }

  // 방향 판별
  let direction: 'UP' | 'DOWN' | null = null;
  if (destination || headsign) {
    direction = inferDaeguDirection(lineNum, destination, headsign);
  }
  if (!direction && wayCode) {
    direction = resolveDaeguDirection(lineNum, wayCode);
  }

  const directions: Array<'UP' | 'DOWN'> = direction ? [direction] : ['UP', 'DOWN'];
  const arrivals: SubwayArrival[] = [];

  for (const dir of directions) {
    const trains = getNextTrainsFromDaeguTimetable(officialStation, dir, lineNum, 2, now);
    const updnText = dir === 'UP' ? '상행' : '하행';

    for (const train of trains) {
      arrivals.push({
        subwayId: subwayId || lineNum,
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
