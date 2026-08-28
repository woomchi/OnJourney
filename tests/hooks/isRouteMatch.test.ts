import { describe, it, expect } from 'vitest';
import { isRouteMatch, getRouteEmoji } from '@/features/route/alternative/hooks/useAlternativeRoutes';
import type { DirectionResult } from '@/types/journey';

describe('useAlternativeRoutes helpers', () => {
  describe('isRouteMatch', () => {
    const route1: DirectionResult = {
      id: 'route-1',
      type: 'public',
      name: '간선 101번',
      duration: 30,
      fare: 1500,
      steps: [{ type: 'bus', name: '101', duration: 30 }],
      pathPoints: [],
    };

    it('ID가 일치하면 true를 반환해야 한다', () => {
      const route2: DirectionResult = {
        ...route1,
      };
      expect(isRouteMatch(route1, route2)).toBe(true);
    });

    it('ID가 없더라도 타입, 소요시간, 스텝이 동일하면 true를 반환해야 한다', () => {
      const r1: DirectionResult = {
        id: '',
        type: 'car',
        name: '추천',
        duration: 20,
        fare: 0,
        steps: [{ type: 'car', name: '일반도로', duration: 20 }],
        pathPoints: [],
      };
      const r2: DirectionResult = {
        id: '',
        type: 'car',
        name: '추천',
        duration: 20,
        fare: 0,
        steps: [{ type: 'car', name: '일반도로', duration: 20 }],
        pathPoints: [],
      };
      expect(isRouteMatch(r1, r2)).toBe(true);
    });

    it('타입이나 소요시간이 다르면 false를 반환해야 한다', () => {
      const diffTypeRoute: DirectionResult = { ...route1, id: 'route-2', type: 'car' };
      const diffDurationRoute: DirectionResult = { ...route1, id: 'route-3', duration: 40 };

      expect(isRouteMatch(route1, diffTypeRoute)).toBe(false);
      expect(isRouteMatch(route1, diffDurationRoute)).toBe(false);
    });

    it('null/undefined 비교 시 false를 반환해야 한다', () => {
      expect(isRouteMatch(null, route1)).toBe(false);
      expect(isRouteMatch(route1, undefined)).toBe(false);
    });
  });

  describe('getRouteEmoji', () => {
    it('지하철 경로는 지하철 이모지(🚇)를 반환해야 한다', () => {
      const subwayRoute: DirectionResult = {
        id: 'sub-1',
        type: 'public',
        name: '2호선',
        duration: 15,
        fare: 1400,
        steps: [{ type: 'subway', name: '2호선', duration: 15 }],
        pathPoints: [],
      };
      expect(getRouteEmoji(subwayRoute)).toBe('🚇');
    });

    it('기차 경로는 기차 이모지(🚄)를 반환해야 한다', () => {
      const trainRoute: DirectionResult = {
        id: 'train-1',
        type: 'public',
        name: 'KTX 산천',
        duration: 50,
        fare: 15000,
        steps: [{ type: 'train', name: 'KTX', duration: 50 }],
        pathPoints: [],
      };
      expect(getRouteEmoji(trainRoute)).toBe('🚄');
    });

    it('자동차 경로는 자동차 이모지(🚗)를 반환해야 한다', () => {
      const carRoute: DirectionResult = {
        id: 'car-1',
        type: 'car',
        name: '빠른길',
        duration: 25,
        fare: 0,
        steps: [],
        pathPoints: [],
      };
      expect(getRouteEmoji(carRoute)).toBe('🚗');
    });
  });
});
