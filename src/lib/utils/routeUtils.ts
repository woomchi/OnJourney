import type { Place, DirectionResult, DirectionsApiResponse, SelectedRoute } from '@/types/journey';

/**
 * 특정 구간의 기본(활성화된) 경로를 결정합니다.
 * 1. 사용자가 수동으로 선택한 경로(selected_route)가 있으면 최우선으로 반환합니다.
 * 2. 없으면 transportType에 따라 캐시된 데이터 중 가장 첫 번째(최적) 경로를 반환합니다.
 * 3. transportType이 'public'인 경우, 도보가 훨씬 유리하거나 대중교통 정보가 없으면 도보 경로를 폴백으로 제공합니다.
 */
export function getDefaultRoute(
  originPlace: Place,
  destPlace: Place,
  segmentData: DirectionsApiResponse | undefined,
  transportType: 'public' | 'car' | 'walk' = 'public'
): DirectionResult | SelectedRoute | undefined {
  // 1. 수동 선택된 경로 확인
  if (originPlace.selected_route && originPlace.selected_route.destId === destPlace.id) {
    return originPlace.selected_route;
  }

  // 2. 캐시 데이터가 없으면 undefined 반환
  if (!segmentData) return undefined;

  if (transportType === 'car') {
    return segmentData.car?.[0];
  }

  if (transportType === 'walk') {
    return segmentData.walk?.[0];
  }

  // 3. transportType === 'public' 인 경우 폴백 로직
  const publicRoute = segmentData.public?.[0];
  const walkRoute = segmentData.walk?.[0];

  // 도보 경로가 존재하고,
  // 대중교통 경로가 아예 없거나, '대중교통(예상)'이면서 도보가 40분 이내이거나, 도보 자체가 15분 이내라면 도보 선택
  if (
    walkRoute &&
    (!publicRoute || (publicRoute.name === '대중교통(예상)' && walkRoute.duration <= 40) || walkRoute.duration <= 15)
  ) {
    return walkRoute;
  }

  return publicRoute || walkRoute;
}
