import { describe, it, expect } from 'vitest';
import { getDefaultRoute, ensureWalkSections } from '@/lib/utils/routeUtils';
import type { Place, DirectionResult, DirectionsApiResponse, SelectedRoute } from '@/types/journey';

describe('routeUtils', () => {
  const origin: Place = {
    id: 'place-1',
    place_name: '출발지',
    address: '서울시 중구',
    category: 'cafe',
    lat: 37.5665,
    lng: 126.9780,
  };

  const dest: Place = {
    id: 'place-2',
    place_name: '도착지',
    address: '서울시 종로구',
    category: 'restaurant',
    lat: 37.5700,
    lng: 126.9820,
  };

  const samplePublicRoute: DirectionResult = {
    id: 'public-1',
    type: 'public',
    name: '간선 101번',
    duration: 20,
    fare: 1500,
    steps: [],
    pathPoints: [{ lat: 37.5665, lng: 126.9780 }, { lat: 37.5700, lng: 126.9820 }],
  };

  const sampleCarRoute: DirectionResult = {
    id: 'car-1',
    type: 'car',
    name: '추천 경로',
    duration: 10,
    fare: 0,
    steps: [],
    pathPoints: [{ lat: 37.5660, lng: 126.9775 }, { lat: 37.5705, lng: 126.9825 }],
  };

  const sampleWalkRoute: DirectionResult = {
    id: 'walk-1',
    type: 'walk',
    name: '도보',
    duration: 15,
    fare: 0,
    steps: [],
    pathPoints: [{ lat: 37.5665, lng: 126.9780 }, { lat: 37.5700, lng: 126.9820 }],
  };

  const segmentData: DirectionsApiResponse = {
    public: [samplePublicRoute],
    car: [sampleCarRoute],
    walk: [sampleWalkRoute],
  };

  it('사용자가 수동 선택한 경로가 있으면 최우선으로 반환해야 한다', () => {
    const selectedRoute: SelectedRoute = {
      ...samplePublicRoute,
      id: 'user-selected-1',
      destId: dest.id,
    };

    const originWithSelection: Place = {
      ...origin,
      selected_route: selectedRoute,
    };

    const result = getDefaultRoute(originWithSelection, dest, segmentData, 'car');
    expect(result?.id).toBe('user-selected-1');
  });

  it('수동 선택 경로가 없을 때 car 모드이면 첫 번째 차량 경로를 반환해야 한다', () => {
    const result = getDefaultRoute(origin, dest, segmentData, 'car');
    expect(result?.type).toBe('car');
    expect(result?.id).toBe('car-1');
  });

  it('수동 선택 경로가 없을 때 walk 모드이면 첫 번째 도보 경로를 반환해야 한다', () => {
    const result = getDefaultRoute(origin, dest, segmentData, 'walk');
    expect(result?.type).toBe('walk');
    expect(result?.id).toBe('walk-1');
  });

  it('대중교통 정보가 없거나 도보가 5분 이내로 매우 짧으면 도보 경로를 우선 제공해야 한다', () => {
    const shortWalkData: DirectionsApiResponse = {
      public: [samplePublicRoute],
      car: [sampleCarRoute],
      walk: [{ ...sampleWalkRoute, duration: 4 }],
    };

    const result = getDefaultRoute(origin, dest, shortWalkData, 'public');
    expect(result?.type).toBe('walk');
  });
});
