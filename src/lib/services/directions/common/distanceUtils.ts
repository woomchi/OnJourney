/**
 * 두 좌표 간 직선 거리 계산 (Haversine 공식)
 * @returns 거리 (단위: km)
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 좌표 정밀도 반올림 (차량/도보 통합 4자리 - 약 11m 정밀도)
 */
export function roundCoord(val: number, precision: number = 4): number {
  const factor = Math.pow(10, precision);
  return Math.round(val * factor) / factor;
}
