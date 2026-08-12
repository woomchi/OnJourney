/**
 * Ramer-Douglas-Peucker (RDP) 알고리즘 기반 위경도 좌표 단순화 유틸리티
 */

interface Point2D {
  lat: number;
  lng: number;
}

/**
 * 줌 레벨에 따른 단순화 임계값(허용 오차, 미터 단위) 반환
 * - Zoom ≤ 12: ~100m (광역/전국)
 * - Zoom 13~14: ~30m (도시 범위)
 * - Zoom 15: ~10m (동네 범위)
 * - Zoom ≥ 16: 0m (원본 유지)
 */
export function getToleranceForZoom(zoomLevel: number): number {
  if (zoomLevel <= 12) return 100;
  if (zoomLevel <= 14) return 30;
  if (zoomLevel <= 15) return 10;
  return 0;
}

/**
 * 두 점 P1-P2 직선으로부터 점 P0까지의 수직 거리 (도 단위 환산 수치)
 */
function getPerpendicularDistanceSq(p0: Point2D, p1: Point2D, p2: Point2D, cosLat: number): number {
  const x = (p0.lng - p1.lng) * cosLat;
  const y = p0.lat - p1.lat;
  
  const dx = (p2.lng - p1.lng) * cosLat;
  const dy = p2.lat - p1.lat;

  if (dx === 0 && dy === 0) {
    return x * x + y * y;
  }

  let t = (x * dx + y * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projX = p1.lng * cosLat + t * dx;
  const projY = p1.lat + t * dy;

  const diffX = x - (projX - p1.lng * cosLat);
  const diffY = y - (projY - p1.lat);

  return diffX * diffX + diffY * diffY;
}

/**
 * Ramer-Douglas-Peucker 알고리즘 재귀 실행
 */
function simplifyRDP(points: Point2D[], sqTolerance: number, cosLat: number): Point2D[] {
  const len = points.length;
  if (len <= 2) return points;

  let maxSqDist = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[len - 1];

  for (let i = 1; i < len - 1; i++) {
    const sqDist = getPerpendicularDistanceSq(points[i], first, last, cosLat);
    if (sqDist > maxSqDist) {
      maxSqDist = sqDist;
      maxIndex = i;
    }
  }

  if (maxSqDist > sqTolerance) {
    const left = simplifyRDP(points.slice(0, maxIndex + 1), sqTolerance, cosLat);
    const right = simplifyRDP(points.slice(maxIndex), sqTolerance, cosLat);
    return left.slice(0, left.length - 1).concat(right);
  }

  return [first, last];
}

/**
 * 위경도 좌표 배열을 줌 레벨에 따라 RDP 알고리즘으로 단순화
 */
export function simplifyPath<T extends { lat: number | (() => number); lng: number | (() => number) }>(
  points: T[],
  zoomLevel: number
): T[] {
  if (!points || points.length <= 2) return points;

  const toleranceMeters = getToleranceForZoom(zoomLevel);
  if (toleranceMeters <= 0) return points;

  // 미터를 경도/위도 도(degree) 제곱 단위로 환산 (1도 ≈ 111,111m)
  const toleranceDeg = toleranceMeters / 111111.0;
  const sqTolerance = toleranceDeg * toleranceDeg;

  // 입력 점들을 Point2D 구조로 추출
  const parsedPoints: Point2D[] = points.map((pt) => ({
    lat: typeof pt.lat === 'function' ? pt.lat() : pt.lat,
    lng: typeof pt.lng === 'function' ? pt.lng() : pt.lng,
  }));

  const midLat = parsedPoints[Math.floor(parsedPoints.length / 2)].lat;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const simplified2D = simplifyRDP(parsedPoints, sqTolerance, cosLat);

  // 만약 단순화 결과 개수가 변화가 거의 없으면 원본 리턴
  if (simplified2D.length === points.length) return points;

  // 원본 객체가 LatLng 또는 객체인 경우 형태 유지 매핑
  const pointMap = new Map<string, T>();
  points.forEach((pt) => {
    const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
    const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
    pointMap.set(`${lat.toFixed(6)},${lng.toFixed(6)}`, pt);
  });

  const result: T[] = [];
  simplified2D.forEach((p2d) => {
    const key = `${p2d.lat.toFixed(6)},${p2d.lng.toFixed(6)}`;
    const original = pointMap.get(key);
    if (original) {
      result.push(original);
    } else {
      result.push(p2d as unknown as T);
    }
  });

  return result;
}
