import { describe, it, expect, beforeEach } from 'vitest';
import {
  isIntercityEligible,
  isJejuCoord,
  isIslandIntercity,
  generateIntercityCacheKey,
  roundToHub,
} from '@/lib/services/directions/transit/intercityClassifier';
import { OdsayQuotaGuard, ODSAY_DAILY_HARD_CAP } from '@/lib/infrastructure/odsayQuotaGuard';
import { IntercityRouteCache, INTERCITY_CACHE_TTL_MS } from '@/lib/infrastructure/intercityRouteCache';
import type { DirectionResult } from '@/types/journey';

describe('Intercity Transit Classifier & Quota & Cache Tests', () => {
  // ─── 1. Classifier Tests ──────────────────────────────────────────────────
  describe('isIntercityEligible & Coordinate Utilities', () => {
    it('서울역 -> 강남역 (약 10km)은 단거리로 판정되어 isEligible이 false여야 한다', () => {
      const seoulStation = { lat: 37.5559, lng: 126.9723 };
      const gangnamStation = { lat: 37.4979, lng: 127.0276 };

      const result = isIntercityEligible(seoulStation, gangnamStation);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('SHORT_DISTANCE');
      expect(result.distanceKm).toBeLessThan(60);
    });

    it('서울역 -> 부산역 (약 325km)은 장거리로 판정되어 isEligible이 true여야 한다', () => {
      const seoulStation = { lat: 37.5559, lng: 126.9723 };
      const busanStation = { lat: 35.1152, lng: 129.0422 };

      const result = isIntercityEligible(seoulStation, busanStation);
      expect(result.isEligible).toBe(true);
      expect(result.reason).toBe('LONG_DISTANCE');
      expect(result.distanceKm).toBeGreaterThan(300);
    });

    it('서울(김포) -> 제주공항은 도서 지역으로 판정되어 거리와 무관하게 isEligible이 true여야 한다', () => {
      const gimpo = { lat: 37.5583, lng: 126.7906 };
      const jejuAirport = { lat: 33.5113, lng: 126.4930 };

      expect(isJejuCoord(jejuAirport.lat, jejuAirport.lng)).toBe(true);
      expect(isIslandIntercity(gimpo, jejuAirport)).toBe(true);

      const result = isIntercityEligible(gimpo, jejuAirport);
      expect(result.isEligible).toBe(true);
      expect(result.reason).toBe('ISLAND_OR_JEJU');
    });

    it('roundToHub 및 generateIntercityCacheKey는 소수점 2자리(약 1km) 단위로 키를 정규화해야 한다', () => {
      const key1 = generateIntercityCacheKey(126.972345, 37.555912, 129.042211, 35.115233);
      const key2 = generateIntercityCacheKey(126.974111, 37.556200, 129.043999, 35.115100);

      // 반올림 시 동일한 126.97, 37.56, 129.04, 35.12 로 묶여야 함
      expect(key1).toBe('intercity:126.97_37.56_129.04_35.12');
      expect(key2).toBe('intercity:126.97_37.56_129.04_35.12');
      expect(key1).toBe(key2);
    });
  });

  // ─── 2. OdsayQuotaGuard Tests ─────────────────────────────────────────────
  describe('OdsayQuotaGuard (일일 25회 하드캡 방어)', () => {
    beforeEach(() => {
      OdsayQuotaGuard.resetForTest(0);
    });

    it('초기 상태에서는 canCall()이 true이고 used가 0이어야 한다', () => {
      expect(OdsayQuotaGuard.canCall()).toBe(true);
      const status = OdsayQuotaGuard.getStatus();
      expect(status.used).toBe(0);
      expect(status.remaining).toBe(ODSAY_DAILY_HARD_CAP);
      expect(status.isExhausted).toBe(false);
    });

    it('recordCall()을 호출하면 횟수가 증가하고, 25회 도달 시 canCall()이 false가 되어야 한다', () => {
      // 24회 호출 기록
      for (let i = 0; i < 24; i++) {
        OdsayQuotaGuard.recordCall();
      }
      expect(OdsayQuotaGuard.canCall()).toBe(true);
      expect(OdsayQuotaGuard.getStatus().remaining).toBe(1);

      // 25회차 호출 기록
      OdsayQuotaGuard.recordCall();
      expect(OdsayQuotaGuard.canCall()).toBe(false);
      expect(OdsayQuotaGuard.getStatus().remaining).toBe(0);
      expect(OdsayQuotaGuard.getStatus().isExhausted).toBe(true);
    });
  });

  // ─── 3. IntercityRouteCache Tests ─────────────────────────────────────────
  describe('IntercityRouteCache (2주 TTL 영속 캐시)', () => {
    const testKey = 'intercity:test_origin_dest';
    const mockData: DirectionResult[] = [
      {
        id: 'test-ktx-1',
        type: 'public',
        name: 'KTX 경부선',
        duration: 150,
        fare: 59800,
        distance: 325,
        steps: [],
        pathPoints: [],
        isIntercity: true,
      },
    ];

    beforeEach(() => {
      IntercityRouteCache.clear(testKey);
    });

    it('캐시가 비어있을 때는 null을 반환하고, set 후에는 데이터를 올바르게 반환해야 한다', () => {
      expect(IntercityRouteCache.get(testKey)).toBeNull();

      IntercityRouteCache.set(testKey, mockData);

      const cached = IntercityRouteCache.get(testKey);
      expect(cached).not.toBeNull();
      expect(cached?.length).toBe(1);
      expect(cached?.[0].name).toBe('KTX 경부선');
      expect(cached?.[0].fare).toBe(59800);
      expect(cached?.[0].isIntercity).toBe(true);
    });

    it('2주(14일) TTL 상수 규격이 정확히 1,209,600,000ms여야 한다', () => {
      const expectedMs = 14 * 24 * 60 * 60 * 1000;
      expect(INTERCITY_CACHE_TTL_MS).toBe(expectedMs);
    });
  });
});
