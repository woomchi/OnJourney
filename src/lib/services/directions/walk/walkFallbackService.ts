import type { DirectionResult } from '@/types/journey';
import { haversineDistance } from '../common/distanceUtils';

/**
 * 네이버/TMAP API 호출 실패 대비 도보/자전거/킥보드 Fallback 계산 함수
 */
export function buildWalkFallbackResults(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  const distanceKm = haversineDistance(sy, sx, ey, ex);
  const fallbackPath = [{ lat: sy, lng: sx }, { lat: ey, lng: ex }];

  const walkDuration = Math.round((distanceKm / 4.5) * 60);
  const bicycleDuration = Math.round((distanceKm / 15) * 60);
  const kickboardDuration = Math.round((distanceKm / 18) * 60);
  const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

  return [
    {
      id: 'walk',
      type: 'walk',
      name: '도보',
      duration: walkDuration,
      fare: 0,
      distance: distanceKm,
      steps: [{ type: 'walk', name: '도보', duration: walkDuration, color: '#E4E4E7', pathPoints: fallbackPath }],
      pathPoints: fallbackPath,
    },
    {
      id: 'bicycle',
      type: 'bicycle',
      name: '자전거',
      duration: bicycleDuration,
      fare: 0,
      distance: distanceKm,
      steps: [{ type: 'walk', name: '자전거', duration: bicycleDuration, color: '#10B981', pathPoints: fallbackPath }],
      pathPoints: fallbackPath,
    },
    {
      id: 'kickboard',
      type: 'kickboard',
      name: '공유 킥보드',
      duration: kickboardDuration,
      fare: kickboardFare,
      distance: distanceKm,
      steps: [{ type: 'walk', name: '공유 킥보드', duration: kickboardDuration, color: '#8B5CF6', pathPoints: fallbackPath }],
      pathPoints: fallbackPath,
    },
  ];
}
