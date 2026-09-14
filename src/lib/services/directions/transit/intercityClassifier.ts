import { haversineDistance } from '../common/distanceUtils';

/**
 * 장거리/시외 이동 판정 및 좌표 정규화 서비스
 */

/** 시외 대중교통(기차/고속버스) 조회 최소 직선 거리 기준 (km) */
export const INTERCITY_MIN_DISTANCE_KM = 60;

/** 제주도 바운딩 박스 */
export const JEJU_BOUNDS = {
  minLat: 33.1,
  maxLat: 33.6,
  minLng: 126.1,
  maxLng: 127.0,
};

/** 울릉도/독도 바운딩 박스 */
export const ULLEUNG_BOUNDS = {
  minLat: 37.4,
  maxLat: 37.6,
  minLng: 130.7,
  maxLng: 131.0,
};

export interface IntercityEligibilityResult {
  isEligible: boolean;
  reason: 'LONG_DISTANCE' | 'ISLAND_OR_JEJU' | 'SHORT_DISTANCE';
  distanceKm: number;
}

/**
 * 특정 좌표가 제주도 영역인지 확인
 */
export function isJejuCoord(lat: number, lng: number): boolean {
  return (
    lat >= JEJU_BOUNDS.minLat &&
    lat <= JEJU_BOUNDS.maxLat &&
    lng >= JEJU_BOUNDS.minLng &&
    lng <= JEJU_BOUNDS.maxLng
  );
}

/**
 * 특정 좌표가 주요 섬(울릉도 등)인지 확인
 */
export function isIslandCoord(lat: number, lng: number): boolean {
  return (
    lat >= ULLEUNG_BOUNDS.minLat &&
    lat <= ULLEUNG_BOUNDS.maxLat &&
    lng >= ULLEUNG_BOUNDS.minLng &&
    lng <= ULLEUNG_BOUNDS.maxLng
  );
}

/**
 * 출발지와 도착지 간의 관계가 도서/육지 간 이동인지 확인
 */
export function isIslandIntercity(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): boolean {
  const isOriginIsland = isJejuCoord(origin.lat, origin.lng) || isIslandCoord(origin.lat, origin.lng);
  const isDestIsland = isJejuCoord(dest.lat, dest.lng) || isIslandCoord(dest.lat, dest.lng);

  // 둘 중 하나만 섬이거나, 서로 다른 섬인 경우 (예: 내륙 <-> 제주도)
  return isOriginIsland !== isDestIsland || (isOriginIsland && isDestIsland && (isJejuCoord(origin.lat, origin.lng) !== isJejuCoord(dest.lat, dest.lng)));
}

/**
 * 구간이 시외/장거리 멀티모달(기차, 고속버스, 항공) 길찾기 대상인지 판정
 */
export function isIntercityEligible(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
): IntercityEligibilityResult {
  const distanceKm = haversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);

  // 1. 제주도 및 도서 지역 연계
  if (isIslandIntercity(origin, dest)) {
    return {
      isEligible: true,
      reason: 'ISLAND_OR_JEJU',
      distanceKm,
    };
  }

  // 2. 직선거리 60km 이상 초장거리
  if (distanceKm >= INTERCITY_MIN_DISTANCE_KM) {
    return {
      isEligible: true,
      reason: 'LONG_DISTANCE',
      distanceKm,
    };
  }

  // 3. 60km 미만 시내/수도권 생활권
  return {
    isEligible: false,
    reason: 'SHORT_DISTANCE',
    distanceKm,
  };
}

/**
 * 좌표를 거점 클러스터 단위(소수점 2자리, 약 1.1km 해상도)로 반올림
 */
export function roundToHub(coord: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(coord * factor) / factor;
}

/**
 * 장거리 경로 2주 영속 캐시 키 생성 (소수점 2자리 해상도)
 */
export function generateIntercityCacheKey(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): string {
  const rsx = roundToHub(sx, 2).toFixed(2);
  const rsy = roundToHub(sy, 2).toFixed(2);
  const rex = roundToHub(ex, 2).toFixed(2);
  const rey = roundToHub(ey, 2).toFixed(2);

  return `intercity:${rsx}_${rsy}_${rex}_${rey}`;
}
