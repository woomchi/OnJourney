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
  resolveOfficialDaeguStationName,
  getDaeguLinesForStation,
} from './subway/daeguTimetableService';

/**
 * 목적지/방면 키워드로 대구 노선의 방향(UP/DOWN)을 추론합니다.
 */
export function inferDaeguDirection(
  lineNum: string,
  destination?: string,
  headsign?: string
): 'UP' | 'DOWN' | null {
  const text = `${destination || ''} ${headsign || ''}`.trim();
  if (!text) return null;

  if (lineNum === '1') {
    if (/하양|안심|각산|반야월|신기|율하|용계|방촌|해안|동촌|아양교|동구청|동대구/.test(text)) {
      return 'UP';
    }
    if (/설화명곡|화원|대곡|진천|월배|상인|월촌|송현|서부정류장|대명|안지랑|현충로|영대병원|교대/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '2') {
    if (/영남대|임당|정평|사월|신매|고산|수성알파시티|연호|담티|만촌|수성구청|범어/.test(text)) {
      return 'UP';
    }
    if (/문양|다사|대실|강창|계명대|성서산업단지|이곡|용산|죽전|감삼|두류|내당|반고개/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '3') {
    if (/용지|범물|지산|수성못|황금|어린이세상|수성구민운동장|수성시장|대봉교|건들바위/.test(text)) {
      return 'UP';
    }
    if (/칠곡경대병원|학정|팔거|동천|칠곡운암|구암|태전|매천|매천시장|팔달|공단|만평/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '대경선') {
    if (/구미|사곡|북삼|약목|왜관|연화|신동|지천/.test(text)) {
      return 'UP';
    }
    if (/경산|가천|고모|동대구|대구|서대구/.test(text)) {
      return 'DOWN';
    }
  }

  return null;
}

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
