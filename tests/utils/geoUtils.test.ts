import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceMeter,
  extractBoundsRect,
  isPositionInBounds,
} from '@/lib/utils/geoUtils';

describe('geoUtils', () => {
  describe('calculateHaversineDistanceMeter', () => {
    it('동일한 두 지점 사이의 거리는 0m이어야 한다', () => {
      const distance = calculateHaversineDistanceMeter(37.5665, 126.9780, 37.5665, 126.9780);
      expect(distance).toBe(0);
    });

    it('서울시청(37.5665, 126.9780)과 강남역(37.4979, 127.0276) 사이의 거리는 약 8.7km 내외여야 한다', () => {
      const distance = calculateHaversineDistanceMeter(37.5665, 126.9780, 37.4979, 127.0276);
      // 오차 범위 8,000m ~ 9,500m 이내 확인
      expect(distance).toBeGreaterThan(8000);
      expect(distance).toBeLessThan(9500);
    });

    it('유효하지 않은 좌표 입력 시 0을 반환해야 한다', () => {
      expect(calculateHaversineDistanceMeter(0, 0, 37.5, 127.0)).toBe(0);
    });
  });

  describe('extractBoundsRect', () => {
    it('sw/ne 객체로부터 유효한 MapBoundsRect를 추출해야 한다', () => {
      const bounds = {
        sw: { lat: 37.0, lng: 126.0 },
        ne: { lat: 38.0, lng: 127.0 },
      };

      const rect = extractBoundsRect(bounds as any);
      expect(rect).not.toBeNull();
      expect(rect?.minLat).toBe(37.0);
      expect(rect?.maxLat).toBe(38.0);
      expect(rect?.minLng).toBe(126.0);
      expect(rect?.maxLng).toBe(127.0);
    });

    it('null/undefined 입력 시 null을 반환해야 한다', () => {
      expect(extractBoundsRect(null)).toBeNull();
      expect(extractBoundsRect(undefined)).toBeNull();
    });
  });

  describe('isPositionInBounds', () => {
    const bounds = {
      sw: { lat: 37.0, lng: 126.0 },
      ne: { lat: 38.0, lng: 127.0 },
      minLat: 37.0,
      maxLat: 38.0,
      minLng: 126.0,
      maxLng: 127.0,
    };

    it('바운드 내에 있는 좌표는 true를 반환해야 한다', () => {
      const insidePos = { lat: 37.5, lng: 126.5 };
      expect(isPositionInBounds(insidePos, bounds)).toBe(true);
    });

    it('바운드에서 멀리 벗어난 좌표는 false를 반환해야 한다', () => {
      const outsidePos = { lat: 35.0, lng: 129.0 }; // 부산 인근
      expect(isPositionInBounds(outsidePos, bounds)).toBe(false);
    });

    it('좌표나 바운드가 null/undefined인 경우 기본적으로 true를 반환해야 한다', () => {
      expect(isPositionInBounds(null, bounds)).toBe(true);
      expect(isPositionInBounds({ lat: 37.5, lng: 126.5 }, null)).toBe(true);
    });
  });
});
