import { describe, it, expect } from 'vitest';
import { resolveOdsayCid } from '@/lib/utils/busRegionUtils';

describe('버스 노드뷰 및 지역 라우팅 버그 픽스 검증', () => {
  it('인천(cityCode 23 또는 incheon)의 ODsay CID는 수도권 통합 CID인 1000이어야 한다', () => {
    expect(resolveOdsayCid('23')).toBe('1000');
    expect(resolveOdsayCid('incheon')).toBe('1000');
  });

  it('서울(11)의 ODsay CID는 1000이어야 한다', () => {
    expect(resolveOdsayCid('11')).toBe('1000');
    expect(resolveOdsayCid('seoul')).toBe('1000');
  });

  it('부산(21)의 ODsay CID는 7000이어야 한다', () => {
    expect(resolveOdsayCid('21')).toBe('7000');
    expect(resolveOdsayCid('busan')).toBe('7000');
  });

  it('대구(22)의 ODsay CID는 4000이어야 한다', () => {
    expect(resolveOdsayCid('22')).toBe('4000');
  });

  it('대전(25)의 ODsay CID는 3000이어야 한다', () => {
    expect(resolveOdsayCid('25')).toBe('3000');
  });
});
