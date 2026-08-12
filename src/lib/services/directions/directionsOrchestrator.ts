import type { DirectionResult, CarWalkDirectionsResult, SnapMeta } from '@/types/journey';
import { DirectionsQueryType } from '@/lib/validations/directions';
import { haversineDistance, roundCoord } from './common/distanceUtils';
import { fetchCarRoute, calculateCarFallback } from './car/carRouteService';
import { buildWalkFallbackResults } from './walk/walkFallbackService';
import { fetchOdsayWalkingRoute } from './walk/odsayWalkingService';

/**
 * 차량 + 도보 통합 오케스트레이션 함수
 */
export async function fetchCarWalkDirections(params: DirectionsQueryType): Promise<CarWalkDirectionsResult> {
  const { sx, sy, ex, ey } = params;

  // 1. 거리 계산 (도보 탐색은 10km 미만만 지원)
  const straightDistKm = haversineDistance(sy, sx, ey, ex);
  const isWalkExceedLimit = straightDistKm >= 10.0;

  const roundCoordCar = (val: number) => roundCoord(val, 6);

  const csx = roundCoordCar(sx);
  const csy = roundCoordCar(sy);
  const cex = roundCoordCar(ex);
  const cey = roundCoordCar(ey);

  // 2. 도보 탐색 (ODsay 멀티모달 도보 경로 API 및 Fallback 연동)
  let walkResults: DirectionResult[] = [];
  if (isWalkExceedLimit) {
    walkResults = [];
  } else {
    walkResults = await fetchOdsayWalkingRoute(sx, sy, ex, ey);
  }

  const snapMeta: SnapMeta = {
    snapType: 'NONE',
  };

  // 3. 차량 탐색
  let carResults: DirectionResult[];
  try {
    carResults = await fetchCarRoute(csx, csy, cex, cey, undefined, { sx, sy, ex, ey });
  } catch (error: any) {
    console.error('[directionsOrchestrator] 차량 경로 API 실패, Fallback 적용:', error?.message || error);
    carResults = [calculateCarFallback(sx, sy, ex, ey)];
  }

  return {
    car: carResults,
    walk: walkResults,
    snapMeta,
  };
}
