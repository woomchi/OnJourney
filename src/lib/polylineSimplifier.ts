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
 * Ramer-Douglas-Peucker 알고리즘 비재귀(Iterative 스택 기반) 실행
 * - 재귀 스택 오버플로우 방지 (O(1) 호출 스택)
 * - 불필요한 배열 복사(slice/concat) 제거
 */
function getRDPMarkers(points: Point2D[], sqTolerance: number, cosLat: number): Uint8Array {
  const len = points.length;
  const markers = new Uint8Array(len);
  if (len <= 2) {
    markers.fill(1);
    return markers;
  }

  markers[0] = 1;
  markers[len - 1] = 1;

  // [startIdx, endIdx] 쌍을 저장하는 스택
  const stack: number[] = [0, len - 1];

  while (stack.length > 0) {
    const end = stack.pop()!;
    const start = stack.pop()!;

    let maxSqDist = 0;
    let maxIndex = 0;

    const pStart = points[start];
    const pEnd = points[end];

    for (let i = start + 1; i < end; i++) {
      const sqDist = getPerpendicularDistanceSq(points[i], pStart, pEnd, cosLat);
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist;
        maxIndex = i;
      }
    }

    if (maxSqDist > sqTolerance) {
      markers[maxIndex] = 1;
      // 좌측 및 우측 구간을 스택에 푸시
      stack.push(start, maxIndex);
      stack.push(maxIndex, end);
    }
  }

  return markers;
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

  // 스택 기반 비재귀 RDP 실행 (O(1) 호출 스택, 메모리 무복사)
  const markers = getRDPMarkers(parsedPoints, sqTolerance, cosLat);

  // 마킹된 점들을 원본 객체에서 직접 수집 (문자열 Map 변환 비용 제거)
  const result: T[] = [];
  for (let i = 0; i < points.length; i++) {
    if (markers[i] === 1) {
      result.push(points[i]);
    }
  }

  return result.length === points.length ? points : result;
}
