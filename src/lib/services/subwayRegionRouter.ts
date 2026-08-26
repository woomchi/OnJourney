/**
 * @fileoverview 지하철 지역 감지 및 라우팅 모듈 (SubwayRegionRouter)
 *
 * 역명(station)과 노선 식별자(subwayId)를 분석하여 해당 지하철이 속한 지역을 감지하고,
 * 전용 실시간/시간표 서비스(대전교통공사, 서울시 실시간 API, ODsay Fallback 등)로 정확히 라우팅합니다.
 */

import { isDaejeonSubwayStation } from './daejeonSubwayService';

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
  if (cleanSubwayId.includes('부산')) {
    return 'busan';
  }
  if (cleanSubwayId.includes('대구')) {
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

  // 3. 목적지(destination) 또는 방면(headsign)이 대전 고유역인 경우
  const isDestUniqueDaejeon =
    (cleanDest && isDaejeonSubwayStation(cleanDest) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanDest)) ||
    (cleanHeadsign && isDaejeonSubwayStation(cleanHeadsign) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanHeadsign));

  if (isDestUniqueDaejeon && isDaejeonSubwayStation(cleanStation)) {
    return 'daejeon';
  }

  // 4. 대전 1호선 고유역 (동명역 제외) 판별 (판암, 대전역, 서대전네거리, 유성온천, 반석, 정부청사, 노은 등)
  if (isDaejeonSubwayStation(cleanStation) && !AMBIGUOUS_DAEJEON_STATIONS.has(cleanStation)) {
    return 'daejeon';
  }

  // 5. 기본값: 수도권 실시간 API 대상 (1~9호선 및 동명역인 시청, 용문, 신흥, 중앙로, 대동 포함)
  if (cleanStation) {
    return 'seoul';
  }

  return 'unknown';
}
