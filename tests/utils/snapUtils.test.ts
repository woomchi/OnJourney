import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSnapVal } from '@/lib/utils/snapUtils';

describe('parseSnapVal', () => {
  const originalWindow = global.window;

  afterEach(() => {
    global.window = originalWindow;
  });

  it('null 또는 undefined 입력 시 0을 반환해야 한다', () => {
    expect(parseSnapVal(null)).toBe(0);
    expect(parseSnapVal(undefined)).toBe(0);
    expect(parseSnapVal('')).toBe(0);
    expect(parseSnapVal(0)).toBe(0);
  });

  it('전체 화면 확장 값(1 또는 "1") 입력 시 1을 반환해야 한다', () => {
    expect(parseSnapVal(1)).toBe(1);
    expect(parseSnapVal('1')).toBe(1);
  });

  it('숫자 픽셀 값 입력 시 해당 숫자를 그대로 반환해야 한다', () => {
    expect(parseSnapVal(370)).toBe(370);
    expect(parseSnapVal(190)).toBe(190);
    expect(parseSnapVal(54)).toBe(54);
  });

  it('문자열 픽셀 값 입력 시 숫자로 파싱하여 반환해야 한다', () => {
    expect(parseSnapVal('370')).toBe(370);
    expect(parseSnapVal('190px')).toBe(190);
  });

  it('vh 단위 문자열 입력 시 window.innerHeight 비율로 계산하여 반환해야 한다', () => {
    // window 객체 목킹
    global.window = {
      innerHeight: 800,
    } as any;

    expect(parseSnapVal('46vh')).toBe(800 * 0.46); // 368
    expect(parseSnapVal('50vh')).toBe(400);
  });
});
