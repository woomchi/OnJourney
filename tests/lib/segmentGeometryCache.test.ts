import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSegmentGeometry,
  evictSegmentGeometry,
  clearAllSegmentGeometry,
} from '@/lib/segmentGeometryCache';
import type { Place, BaseRouteData } from '@/types/journey';

describe('segmentGeometryCache', () => {
  const origin: Place = {
    id: 'origin-1',
    place_name: '출발지',
    address: '서울시 중구',
    category: 'cafe',
    lat: 37.5665,
    lng: 126.9780,
  };

  const dest: Place = {
    id: 'dest-1',
    place_name: '도착지',
    address: '서울시 종로구',
    category: 'restaurant',
    lat: 37.5700,
    lng: 126.9820,
  };

  const route: BaseRouteData = {
    id: 'route-1',
    type: 'public',
    name: '테스트 경로',
    duration: 20,
    fare: 1500,
    steps: [
      {
        type: 'bus',
        name: '간선 101',
        duration: 15,
        color: '#0068b7',
        startName: '출발정류소',
        endName: '도착정류소',
        startLat: 37.5670,
        startLng: 126.9785,
        endLat: 37.5695,
        endLng: 126.9815,
        pathPoints: [
          { lat: 37.5670, lng: 126.9785 },
          { lat: 37.5680, lng: 126.9795 },
          { lat: 37.5695, lng: 126.9815 },
        ],
      },
    ],
    pathPoints: [
      { lat: 37.5665, lng: 126.9780 },
      { lat: 37.5670, lng: 126.9785 },
      { lat: 37.5680, lng: 126.9795 },
      { lat: 37.5695, lng: 126.9815 },
      { lat: 37.5700, lng: 126.9820 },
    ],
  };

  beforeEach(() => {
    clearAllSegmentGeometry();
  });

  it('세그먼트 지오메트리를 계산하고 정상적으로 반환해야 한다', () => {
    const geo = getSegmentGeometry(origin, dest, route, 'public', 0, 2);

    expect(geo).toBeDefined();
    expect(geo.cacheKey).toContain('origin-1-dest-1');
    expect(Array.isArray(geo.arrowAnchors)).toBe(true);
    expect(Array.isArray(geo.transferPoints)).toBe(true);
  });

  it('동일한 파라미터로 호출 시 캐시된 결과를 재사용해야 한다', () => {
    const geo1 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);
    const geo2 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);

    expect(geo1).toBe(geo2);
  });

  it('evictSegmentGeometry 호출 시 해당 세그먼트의 캐시가 무효화되어 새로 생성되어야 한다', () => {
    const geo1 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);
    evictSegmentGeometry('origin-1', 'dest-1');
    const geo2 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);

    expect(geo1).not.toBe(geo2);
  });

  it('clearAllSegmentGeometry 호출 시 모든 캐시가 초기화되어야 한다', () => {
    const geo1 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);
    clearAllSegmentGeometry();
    const geo2 = getSegmentGeometry(origin, dest, route, 'public', 0, 2);

    expect(geo1).not.toBe(geo2);
  });
});
