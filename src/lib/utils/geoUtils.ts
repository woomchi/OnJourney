/**
 * @fileoverview 지리적 GPS 위경도 좌표 계산 유틸리티
 */

/**
 * 지구 반지름 (미터 단위)
 */
const EARTH_RADIUS_METERS = 6371000;

/**
 * 도(degree)를 라디안(radian)으로 변환합니다.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 두 GPS 위경도 좌표 (lat1, lng1)과 (lat2, lng2) 사이의 실시간 지표면 거리를 하버사인(Haversine) 공식을 적용하여 미터(m) 단위로 구합니다.
 *
 * @param lat1 지점 1 위도
 * @param lng1 지점 1 경도
 * @param lat2 지점 2 위도
 * @param lng2 지점 2 경도
 * @returns 두 지점 간의 미터(m) 단위 직선 거리
 */
export function calculateHaversineDistanceMeter(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}
