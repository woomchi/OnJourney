/**
 * @fileoverview 지하철 지역 감지 및 라우팅 모듈 (SubwayRegionRouter)
 *
 * 역명(station)과 노선 식별자(subwayId)를 분석하여 해당 지하철이 속한 지역을 감지하고,
 * 전용 실시간/시간표 서비스(대전교통공사, 서울시 실시간 API, ODsay Fallback 등)로 정확히 라우팅합니다.
 */

import { isDaejeonSubwayStation } from './daejeonSubwayService';
import { isBusanSubwayStation } from './busanSubwayStations';
import { resolveOfficialDaeguStationName } from './subway/daeguTimetableService';
import { isDonghaeSubwayStation, DONGHAE_UNIQUE_STATIONS } from './subway/donghaeTimetableService';

export type SubwayRegion = 'daejeon' | 'seoul' | 'busan' | 'daegu' | 'gwangju' | 'unknown';

/**
 * 대전 1호선 22개 역 중 수도권/타지역과 이름이 겹칠 수 있는 동명역 목록
 * - 시청: 서울 1/2호선, 부산 1호선, 대전 1호선
 * - 용문: 수도권 경의중앙선, 대전 1호선
 * - 신흥: 수도권 8호선, 대전 1호선
 * - 중앙로: 대구 1호선, 대전 1호선
 * - 대동: 부산 4호선(동래 인근), 대전 1호선
 */
const AMBIGUOUS_DAEJEON_STATIONS = new Set(['시청', '용문', '신흥', '중앙로', '대동']);

/**
 * 부산 도시철도 역 중 수도권/타지역과 이름이 겹칠 수 있는 동명역 목록
 * - 시청: 서울 1/2호선, 대전 1호선, 부산 1호선
 * - 교대: 서울 2/3호선, 부산 1호선, 대구 1호선
 * - 중앙: 수도권 4호선, 부산 1호선
 */
const AMBIGUOUS_BUSAN_STATIONS = new Set(['시청', '교대', '중앙']);

/**
 * 대구 도시철도 및 대경선 역 중 수도권/타지역과 이름이 겹칠 수 있는 동명역 목록
 * - 중앙로: 대전 1호선, 대구 1호선
 * - 신천: 수도권 서해선, 대구 1호선
 * - 교대: 서울 2/3호선, 부산 1호선, 대구 1호선
 */
const AMBIGUOUS_DAEGU_STATIONS = new Set(['중앙로', '신천', '교대']);

/**
 * 역명과 노선 식별자 및 방면/목적지를 바탕으로 지하철 서비스 지역을 감지합니다.
 */
export function detectSubwayRegion(params: {
  station: string;
  subwayId?: string;
  destination?: string;
  headsign?: string;
}): SubwayRegion {
  const { station, subwayId, destination, headsign } = params;
  const cleanStation = String(station || '').replace(/역$/, '').trim();
  const cleanSubwayId = String(subwayId || '').trim();
  const cleanDest = String(destination || '').replace(/역$/, '').trim();
  const cleanHeadsign = String(headsign || '').replace(/역$/, '').replace(/방면$/, '').trim();

  // 1. subwayId에 명시적인 지역명이 포함된 경우 (최우선)
  if (cleanSubwayId.includes('대전')) {
    return 'daejeon';
  }
  if (cleanSubwayId.includes('부산') || cleanSubwayId.includes('동해')) {
    return 'busan';
  }
  if (cleanSubwayId.includes('대구') || cleanSubwayId.includes('대경')) {
    return 'daegu';
  }
  if (cleanSubwayId.includes('광주')) {
    return 'gwangju';
  }

  // 2. subwayId에 명시적인 수도권 고유 노선명이 포함된 경우
  if (
    cleanSubwayId.includes('수도권') ||
    cleanSubwayId.includes('서울') ||
    cleanSubwayId.includes('인천') ||
    cleanSubwayId.includes('신분당') ||
    cleanSubwayId.includes('수인분당') ||
    cleanSubwayId.includes('경의중앙') ||
    cleanSubwayId.includes('공항철도') ||
    cleanSubwayId.includes('경춘') ||
    cleanSubwayId.includes('경강') ||
    cleanSubwayId.includes('서해') ||
    cleanSubwayId.includes('우이신설') ||
    cleanSubwayId.includes('신림') ||
    cleanSubwayId.includes('에버라인') ||
    cleanSubwayId.includes('의정부') ||
    cleanSubwayId.includes('GTX') ||
    cleanSubwayId.includes('gtx') ||
    /^10\d\d$/.test(cleanSubwayId) // 1001 ~ 1095 수도권 고유 코드
  ) {
    return 'seoul';
  }

  // 3. 대구 고유 판별
  const isDaeguStation = Boolean(resolveOfficialDaeguStationName(cleanStation));
  const isDestDaegu = Boolean(cleanDest && resolveOfficialDaeguStationName(cleanDest));
  const isHeadDaegu = Boolean(cleanHeadsign && resolveOfficialDaeguStationName(cleanHeadsign));

  // 목적지나 방면이 대구 고유역인 경우
  const isDestUniqueDaegu =
    (isDestDaegu && !AMBIGUOUS_DAEGU_STATIONS.has(cleanDest)) ||
    (isHeadDaegu && !AMBIGUOUS_DAEGU_STATIONS.has(cleanHeadsign));

  if (isDestUniqueDaegu && isDaeguStation) {
    return 'daegu';
  }

  // 대구 고유역 (동명역 제외: 반월당, 청라언덕, 명덕, 동대구, 하양, 문양, 영남대, 칠곡경대병원, 구미 등)
  if (isDaeguStation && !AMBIGUOUS_DAEGU_STATIONS.has(cleanStation)) {
    return 'daegu';
  }

  // 4. 부산 도시철도 및 동해선 광역전철 판별
  const isDonghaeStn = isDonghaeSubwayStation(cleanStation);
  const isDestDonghae = Boolean(cleanDest && isDonghaeSubwayStation(cleanDest));
  const isHeadDonghae = Boolean(cleanHeadsign && isDonghaeSubwayStation(cleanHeadsign));

  // 목적지나 방면이 동해선 고유역인 경우
  if ((isDestDonghae && DONGHAE_UNIQUE_STATIONS.has(cleanDest)) ||
      (isHeadDonghae && DONGHAE_UNIQUE_STATIONS.has(cleanHeadsign))) {
    if (isDonghaeStn || isBusanSubwayStation(cleanStation)) {
      return 'busan';
    }
  }

  // 동해선 고유역 판별 (태화강, 기장, 일광, 오시리아, 송정, 신해운대 등)
  if (DONGHAE_UNIQUE_STATIONS.has(cleanStation)) {
    return 'busan';
  }

  const isDestUniqueBusan =
    (cleanDest && isBusanSubwayStation(cleanDest) && !AMBIGUOUS_BUSAN_STATIONS.has(cleanDest)) ||
    (cleanHeadsign && isBusanSubwayStation(cleanHeadsign) && !AMBIGUOUS_BUSAN_STATIONS.has(cleanHeadsign));

  if (isDestUniqueBusan && isBusanSubwayStation(cleanStation)) {
    return 'busan';
  }

  // 부산 고유역 (동명역 제외) 판별 (서면, 해운대, 광안, 자갈치, 남포, 사상, 노포 등)
  if (isBusanSubwayStation(cleanStation) && !AMBIGUOUS_BUSAN_STATIONS.has(cleanStation)) {
    return 'busan';
  }

  // 5. 대전 1호선 판별
  const isDestUniqueDaejeon =
    (cleanDest && isDaejeonSubwayStation(cleanDest) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanDest)) ||
    (cleanHeadsign && isDaejeonSubwayStation(cleanHeadsign) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanHeadsign));

  if (isDestUniqueDaejeon && isDaejeonSubwayStation(cleanStation)) {
    return 'daejeon';
  }

  // 대전 1호선 고유역 (동명역 제외) 판별 (판암, 대전역, 서대전네거리, 유성온천, 반석, 정부청사, 노은 등)
  if (isDaejeonSubwayStation(cleanStation) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanStation)) {
    return 'daejeon';
  }

  // 6. 기본값: 수도권 실시간 API 대상 (1~9호선 및 동명역인 시청, 용문, 신흥, 중앙로, 대동, 신천 포함)
  if (cleanStation) {
    return 'seoul';
  }

  return 'unknown';
}
