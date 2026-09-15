/**
 * 대중교통 실시간 도착 정보 공유 타이머(sharedTransitRefreshStore) 세션 키 생성 유틸리티
 */

export interface BusSharedKeyParams {
  region?: string;
  stationId?: string | number | null;
  stationName?: string | null;
  cleanBusNo?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface SubwaySharedKeyParams {
  stationName?: string | null;
  wayCode?: string | number | null;
  subwayId?: string | number | null;
  destination?: string | null;
  headsign?: string | null;
}

/**
 * 버스 실시간 도착 정보 세션 공유 키 생성
 * - stationId와 cleanBusNo가 모두 존재해야 유효한 키를 생성합니다.
 * - 누락된 경우 undefined를 반환하여 안전하게 단독 타이머로 폴백하거나 가드를 수행합니다.
 */
export function getBusRefreshSharedKey(params: BusSharedKeyParams): string | undefined {
  const { region, stationId, stationName, cleanBusNo, lat, lng } = params;
  const rawStationId = stationId != null ? String(stationId).trim() : '';
  const rawBusNo = cleanBusNo != null ? String(cleanBusNo).trim() : '';

  if (!rawStationId || !rawBusNo) {
    return undefined;
  }

  const resolvedRegion = region?.trim() || 'tago';

  if (rawStationId === 'auto') {
    const locIdent = stationName?.trim() || (lat != null && lng != null ? `${lat.toFixed(4)}_${lng.toFixed(4)}` : 'unknown');
    return `bus:${resolvedRegion}:auto:${locIdent}:${rawBusNo}`;
  }

  return `bus:${resolvedRegion}:${rawStationId}:${rawBusNo}`;
}

/**
 * 지하철 실시간 도착 정보 세션 공유 키 생성
 * - stationName이 존재해야 유효한 키를 생성합니다.
 */
export function getSubwayRefreshSharedKey(params: SubwaySharedKeyParams): string | undefined {
  const { stationName, wayCode, subwayId, destination, headsign } = params;
  const rawStationName = stationName?.trim();

  if (!rawStationName) {
    return undefined;
  }

  const rawWay = wayCode != null ? String(wayCode).trim() : '';
  const rawSubway = subwayId != null ? String(subwayId).trim() : '';
  const rawDest = destination?.trim() || '';
  const rawHeadsign = headsign?.trim() || '';

  return `subway:${rawStationName}:${rawWay}:${rawSubway}:${rawDest}:${rawHeadsign}`;
}
