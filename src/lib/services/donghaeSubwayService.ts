/**
 * @fileoverview 동해선 광역전철(부전~태화강) 도착 정보 및 시간표 서비스
 *
 * 로컬 압축 시간표 DB(donghae_subway_timetables.json.gz)를 기반으로
 * O(1) 상수 시간 내에 동해선 열차 도착 정보를 생성합니다.
 */

import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival, SubwayTimetableEntry } from '@/types/journey';
import {
  getNextTrainsFromDonghaeTimetable,
  resolveOfficialDonghaeStationName,
  getDonghaeTimetableList,
  isDonghaeSubwayStation,
  DONGHAE_STATIONS,
} from './subway/donghaeTimetableService';

/**
 * 목적지/방면 키워드로 동해선 노선의 운행 방향(UP/DOWN)을 추론합니다.
 *
 * - UP (상행): 부전 방면 (태화강 -> 부전)
 * - DOWN (하행): 태화강 방면 (부전 -> 태화강)
 */
export function inferDonghaeDirection(
  destination?: string,
  headsign?: string
): 'UP' | 'DOWN' | null {
  const text = `${destination || ''} ${headsign || ''}`.trim();
  if (!text) return null;

  // 부전 방면 (상행) 키워드
  if (/부전|거제해맞이|거제|부교대|교대|동래|안락|부산원동|재송|센텀|벡스코/.test(text)) {
    return 'UP';
  }

  // 태화강/망양/일광 방면 (하행) 키워드
  if (/태화강|개운포|덕하|망양|남창|서생|월내|좌천|일광|기장|오시리아|송정|신해운대/.test(text)) {
    return 'DOWN';
  }

  return null;
}

/**
 * wayCode('1'=상행, '2'=하행)를 'UP' | 'DOWN'으로 변환
 */
export function resolveDonghaeDirection(wayCode?: string): 'UP' | 'DOWN' {
  if (wayCode === '1') return 'UP';
  if (wayCode === '2') return 'DOWN';
  return 'UP'; // 기본값
}

/**
 * 동해선 역의 도착 정보 조회 (SubwayArrival[] 반환)
 */
export async function fetchDonghaeSubwayArrivals(
  stationName: string,
  wayCode?: string,
  subwayId?: string,
  destination?: string,
  headsign?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const officialStation = resolveOfficialDonghaeStationName(cleanStation);
  if (!officialStation) {
    return [];
  }

  const now = new Date(timeOffsetManager.getSynchronizedNow());

  // 방향 판별
  let direction: 'UP' | 'DOWN' | null = null;
  if (destination || headsign) {
    direction = inferDonghaeDirection(destination, headsign);
  }
  if (!direction && wayCode) {
    direction = resolveDonghaeDirection(wayCode);
  }

  const directions: Array<'UP' | 'DOWN'> = direction ? [direction] : ['UP', 'DOWN'];
  const arrivals: SubwayArrival[] = [];

  for (const dir of directions) {
    const trains = getNextTrainsFromDonghaeTimetable(officialStation, dir, 2, now);
    const updnText = dir === 'UP' ? '상행' : '하행';

    for (const train of trains) {
      arrivals.push({
        subwayId: subwayId || '동해선',
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

/**
 * 특정 역의 다가오는 시간표 목록 조회 (노선도 및 시간표 뷰용)
 */
export async function fetchDonghaeStationUpcomingTimetable(
  stationName: string,
  subwayTarget?: string,
  limitMinutes = 120
): Promise<SubwayTimetableEntry[]> {
  const officialStation = resolveOfficialDonghaeStationName(stationName);
  if (!officialStation) return [];

  const now = new Date(timeOffsetManager.getSynchronizedNow());
  const nowHour = now.getHours();
  const nowMin = now.getMinutes();
  const currentTotalMin = (nowHour < 5 ? nowHour + 24 : nowHour) * 60 + nowMin;

  const fullList = getDonghaeTimetableList(officialStation);

  return fullList.filter((entry) => {
    const [h = 0, m = 0] = entry.depTime.split(':').map(Number);
    const entryMin = (h < 5 ? h + 24 : h) * 60 + m;
    const diff = entryMin - currentTotalMin;
    return diff >= -5 && diff <= limitMinutes;
  });
}
