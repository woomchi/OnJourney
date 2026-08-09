import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeQuery,
  getGroupCodeMatchScore,
  getCategoryPatternScore,
  getPatternGroupCodes,
} from '../searchPatternService';

describe('searchPatternService - 마이그레이션 및 개선 검증', () => {
  describe('analyzeQuery - 띄어쓰기 정규화 및 패턴 인식', () => {
    it('단일 키워드 패턴을 정상적으로 인식해야 한다 ("기흥역")', () => {
      const res = analyzeQuery('기흥역');
      assert.strictEqual(res.pattern, 'transit');
      assert.strictEqual(res.baseWord, '기흥');
      assert.strictEqual(res.suffix, '역');
    });

    it('띄어쓰기가 포함된 패턴을 정규화하여 인식해야 한다 ("버스 정류장")', () => {
      const res = analyzeQuery('버스 정류장');
      assert.strictEqual(res.pattern, 'transit');
      assert.strictEqual(res.suffix, '버스정류장');
    });

    it('붙여 쓴 패턴도 동일하게 인식해야 한다 ("버스정류장")', () => {
      const res = analyzeQuery('버스정류장');
      assert.strictEqual(res.pattern, 'transit');
      assert.strictEqual(res.suffix, '버스정류장');
    });

    it('카페 키워드를 정상 인식해야 한다 ("강남 카페")', () => {
      const res = analyzeQuery('강남 카페');
      assert.strictEqual(res.pattern, 'food');
      assert.strictEqual(res.baseWord, '강남');
      assert.strictEqual(res.suffix, '카페');
    });
  });

  describe('getGroupCodeMatchScore & GROUP_CODE_PATTERN_MAP', () => {
    it('지하철역(SW8)과 transit 패턴 매칭 시 1.0을 반환해야 한다', () => {
      const score = getGroupCodeMatchScore('transit', 'SW8');
      assert.strictEqual(score, 1.0);
    });

    it('주차장(PK6)과 transit 패턴은 매칭되지 않아야 한다 (0 반환)', () => {
      const score = getGroupCodeMatchScore('transit', 'PK6');
      assert.strictEqual(score, 0);
    });

    it('카페(CE7)와 food 패턴 매칭 시 1.0을 반환해야 한다', () => {
      const score = getGroupCodeMatchScore('food', 'CE7');
      assert.strictEqual(score, 1.0);
    });
  });

  describe('getCategoryPatternScore - GroupCode 우선순위 적용', () => {
    it('GroupCode SW8 지정 시 categoryName과 상관없이 transit 점수 1.0을 부여해야 한다', () => {
      const score = getCategoryPatternScore('transit', 'SW8', '주거시설 > 아파트');
      assert.strictEqual(score, 1.0);
    });

    it('GroupCode가 없는 경우 기존 categoryName 기반으로 판단해야 한다', () => {
      const score = getCategoryPatternScore('transit', null, '교통,수송 > 지하철역');
      assert.strictEqual(score, 1.0);
    });
  });

  describe('getPatternGroupCodes', () => {
    it('transit 패턴에 해당하는 GroupCode 목록을 반환해야 한다', () => {
      const codes = getPatternGroupCodes('transit');
      assert.ok(codes.includes('SW8'));
    });

    it('food 패턴에 해당하는 GroupCode 목록을 반환해야 한다', () => {
      const codes = getPatternGroupCodes('food');
      assert.ok(codes.includes('CE7'));
      assert.ok(codes.includes('FD6'));
    });
  });
});

