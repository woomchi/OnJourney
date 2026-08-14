import type { Place, DirectionResult, DirectionsApiResponse, SelectedRoute, BaseRouteData } from '@/types/journey';
import { haversineDistance } from '@/lib/services/directions/common/distanceUtils';

/**
 * 차량 경로 객체에 대해 출발지/도착지 마커와 차량 차도 진입/탈출점 사이의 거리가 5m 이상이면
 * startWalkSection / endWalkSection 필드를 실시간(On-the-fly)으로 보장 생성합니다.
 */
export function ensureWalkSections<T extends BaseRouteData>(
  route: T,
  originPlace: Place,
  destPlace: Place
): T {
  if (route.type !== 'car' || !route.pathPoints || route.pathPoints.length === 0) {
    return route;
  }

  const firstPt = route.pathPoints[0];
  const lastPt = route.pathPoints[route.pathPoints.length - 1];

  const startDist = haversineDistance(originPlace.lat, originPlace.lng, firstPt.lat, firstPt.lng);
  const endDist = haversineDistance(destPlace.lat, destPlace.lng, lastPt.lat, lastPt.lng);

  const startWalkSection = startDist >= 0.005
    ? [{ lat: originPlace.lat, lng: originPlace.lng }, { lat: firstPt.lat, lng: firstPt.lng }]
    : route.startWalkSection;

  const endWalkSection = endDist >= 0.005
    ? [{ lat: lastPt.lat, lng: lastPt.lng }, { lat: destPlace.lat, lng: destPlace.lng }]
    : route.endWalkSection;

  return {
    ...route,
    startWalkSection,
    endWalkSection,
  };
}

/**
 * 특정 구간의 기본(활성화된) 경로를 결정합니다.
 * 1. 사용자가 수동으로 선택한 경로(selected_route)가 있으면 최우선으로 반환합니다.
 * 2. 없으면 transportType에 따라 캐시된 데이터 중 가장 첫 번째(최적) 경로를 반환합니다.
 * 3. transportType이 'public'인 경우, 도보가 훨씬 유리하거나 대중교통 정보가 없으면 도보 경로를 폴백으로 제공합니다.
 * 4. 차량 경로 반환 시 startWalkSection / endWalkSection 동적 생성을 무조건 보장합니다.
 */
export function getDefaultRoute(
  originPlace: Place,
  destPlace: Place,
  segmentData: DirectionsApiResponse | undefined,
  transportType: 'public' | 'car' | 'walk' = 'public'
): DirectionResult | SelectedRoute | undefined {
  let targetRoute: DirectionResult | SelectedRoute | undefined = undefined;

  // 1. 수동 선택된 경로 확인
  if (originPlace.selected_route && originPlace.selected_route.destId === destPlace.id) {
    targetRoute = originPlace.selected_route;
  } else if (segmentData) {
    if (transportType === 'car') {
      targetRoute = segmentData.car?.[0];
    } else if (transportType === 'walk') {
      targetRoute = segmentData.walk?.[0];
    } else {
      const publicRoute = segmentData.public?.[0];
      const walkRoute = segmentData.walk?.[0];

      if (
        walkRoute &&
        (!publicRoute || (publicRoute.name === '대중교통(예상)' && walkRoute.duration <= 10) || walkRoute.duration <= 5)
      ) {
        targetRoute = walkRoute;
      } else {
        targetRoute = publicRoute || walkRoute;
      }
    }
  }

  if (!targetRoute) return undefined;

  // 차량 경로일 경우 startWalkSection / endWalkSection 동적 보장
  return ensureWalkSections(targetRoute, originPlace, destPlace);
}
