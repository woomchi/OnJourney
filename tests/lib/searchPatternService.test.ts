import { describe, it, expect } from 'vitest';
import {
  analyzeQuery,
  getCategoryPatternScore,
  getPatternGroupCodes,
  hasExplicitRegionKeyword,
} from '@/lib/services/searchPatternService';

describe('searchPatternService', () => {
  describe('analyzeQuery', () => {
    it('지하철역/기차역 접미사를 분석한다', () => {
      const result = analyzeQuery('강남역');
      expect(result.baseWord).toBe('강남');
      expect(result.suffix).toBe('역');
      expect(result.pattern).toBe('transit');
      expect(result.priority).toBe('high');
    });

    it('버스정류장 접미사 및 띄어쓰기를 분석한다', () => {
      const result1 = analyzeQuery('신논현역 버스정류장');
      expect(result1.suffix).toBe('버스정류장');
      expect(result1.pattern).toBe('transit');

      const result2 = analyzeQuery('합정 버스 정류장');
      expect(result2.suffix).toBe('버스정류장');
      expect(result2.pattern).toBe('transit');
    });

    it('카페/음식점 접미사를 분석한다', () => {
      const cafe = analyzeQuery('성수동 카페');
      expect(cafe.baseWord).toBe('성수동');
      expect(cafe.suffix).toBe('카페');
      expect(cafe.pattern).toBe('food');

      const food = analyzeQuery('명동 음식점');
      expect(food.baseWord).toBe('명동');
      expect(food.suffix).toBe('음식점');
      expect(food.pattern).toBe('food');
    });

    it('접미사 패턴이 없을 때는 일반 단어로 반환한다', () => {
      const result = analyzeQuery('남산타워');
      expect(result.baseWord).toBe('남산타워');
      expect(result.suffix).toBeNull();
      expect(result.pattern).toBeNull();
      expect(result.priority).toBe('normal');
    });

    it('빈 검색어일 때 기본 결과를 반환한다', () => {
      const result = analyzeQuery('   ');
      expect(result.baseWord).toBe('');
      expect(result.suffix).toBeNull();
      expect(result.pattern).toBeNull();
    });
  });

  describe('getCategoryPatternScore', () => {
    it('패턴이 없을 때는 기본 0.5를 반환한다', () => {
      expect(getCategoryPatternScore(null, 'SW8', '지하철역')).toBe(0.5);
    });

    it('카카오 GroupCode 매칭 시 적절한 가중치(1.0 또는 0.9)를 반환한다', () => {
      // transit 패턴 & SW8(지하철역)
      expect(getCategoryPatternScore('transit', 'SW8', '지하철')).toBe(1.0);
      // food 패턴 & CE7(카페)
      expect(getCategoryPatternScore('food', 'CE7', '카페')).toBe(1.0);
      // food 패턴 & FD6(음식점)
      expect(getCategoryPatternScore('food', 'FD6', '음식점')).toBe(0.9);
      // parking 패턴 & PK6(주차장)
      expect(getCategoryPatternScore('parking', 'PK6', '주차장')).toBe(1.0);
    });

    it('GroupCode가 없어도 카테고리 이름으로 대체 매칭된다', () => {
      expect(getCategoryPatternScore('transit', null, '교통편 > 지하철 > 2호선')).toBe(1.0);
      expect(getCategoryPatternScore('food', null, '음식점 > 카페 > 디저트')).toBe(1.0);
    });
  });

  describe('getPatternGroupCodes', () => {
    it('패턴에 해당하는 카카오 GroupCode 목록을 반환한다', () => {
      const foodCodes = getPatternGroupCodes('food');
      expect(foodCodes).toContain('CE7');
      expect(foodCodes).toContain('FD6');

      const transitCodes = getPatternGroupCodes('transit');
      expect(transitCodes).toContain('SW8');
    });
  });

  describe('hasExplicitRegionKeyword', () => {
    it('서울, 부산, 제주, 강릉 등 명시적 지역명이 포함된 경우 true를 반환한다', () => {
      expect(hasExplicitRegionKeyword('서울 맛집')).toBe(true);
      expect(hasExplicitRegionKeyword('부산 해운대 카페')).toBe(true);
      expect(hasExplicitRegionKeyword('제주공항')).toBe(true);
      expect(hasExplicitRegionKeyword('강릉 안목해변')).toBe(true);
    });

    it('지역 키워드가 없는 경우 false를 반환한다', () => {
      expect(hasExplicitRegionKeyword('근처 맛있는 돈까스')).toBe(false);
      expect(hasExplicitRegionKeyword('스타벅스')).toBe(false);
    });
  });
});
