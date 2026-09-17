import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseSnapVal, resolveNextSnapPoint } from '@/lib/utils/snapUtils';

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

describe('resolveNextSnapPoint', () => {
  const maxHeight = 784;    // y: -784 (max)
  const defaultHeight = 520; // y: -520 (default)
  const minHeight = 224;     // y: -224 (min)

  describe('경계 조건 및 반대 극단 튕김 방지 (Clamping)', () => {
    it('[버그 방지] 이미 최대 높이(max)일 때 위로 강하게 스와이프해도 최소(min)로 떨어지지 않고 max를 유지해야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -784,
        activeSnapY: -784,
        velocityY: -800, // 위로 강한 스와이프
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('max');
      expect(result.y).toBe(-784);
    });

    it('[버그 방지] 최대 높이 이상으로 탄성 오버스크롤(-795)된 상태에서 위로 스와이프해도 max를 유지해야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -795,
        activeSnapY: -784,
        velocityY: -600,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('max');
      expect(result.y).toBe(-784);
    });

    it('[버그 방지] 이미 최소 높이(min)일 때 아래로 강하게 스와이프해도 최대(max)로 치솟지 않고 min을 유지해야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -224,
        activeSnapY: -224,
        velocityY: 800, // 아래로 강한 스와이프
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('min');
      expect(result.y).toBe(-224);
    });
  });

  describe('정상 스와이프 제스처 전이 (3단계 스냅)', () => {
    it('기본 높이(default)에서 위로 스와이프 시 max로 전이되어야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -530,
        activeSnapY: -520,
        velocityY: -700,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('max');
      expect(result.y).toBe(-784);
    });

    it('기본 높이(default)에서 아래로 스와이프 시 min으로 전이되어야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -510,
        activeSnapY: -520,
        velocityY: 700,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('min');
      expect(result.y).toBe(-224);
    });

    it('최소 높이(min)에서 위로 스와이프 시 default로 전이되어야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -230,
        activeSnapY: -224,
        velocityY: -700,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('default');
      expect(result.y).toBe(-520);
    });

    it('최대 높이(max)에서 아래로 스와이프 시 default로 전이되어야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -770,
        activeSnapY: -784,
        velocityY: 700,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('default');
      expect(result.y).toBe(-520);
    });
  });

  describe('느린 드래그 및 미세 제스처 복귀', () => {
    it('기본 높이에서 40px 이상 위로 천천히 드래그 후 놓으면 max로 이동한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -565, // 45px 위로 이동
        activeSnapY: -520,
        velocityY: 0,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('max');
      expect(result.y).toBe(-784);
    });

    it('기본 높이에서 40px 이상 아래로 천천히 드래그 후 놓으면 min으로 이동한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -475, // 45px 아래로 이동 (y값 증가)
        activeSnapY: -520,
        velocityY: 0,
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('min');
      expect(result.y).toBe(-224);
    });

    it('미세 조작(20px 미만) 후 손을 떼면 기존 activeSnapY로 복귀해야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -535, // 15px 위로 살짝만 이동
        activeSnapY: -520,
        velocityY: 50, // 속도 미미
        maxHeight,
        defaultHeight,
        minHeight,
      });

      expect(result.name).toBe('default');
      expect(result.y).toBe(-520);
    });
  });

  describe('스냅 포인트 중복 제거 정규화', () => {
    it('minHeight와 defaultHeight가 동일하게 전달된 경우에도 중복 없이 정상 동작해야 한다', () => {
      const result = resolveNextSnapPoint({
        currentY: -530,
        activeSnapY: -520,
        velocityY: -600,
        maxHeight: 784,
        defaultHeight: 520,
        minHeight: 520, // default와 min이 동일
      });

      expect(result.name).toBe('max');
      expect(result.y).toBe(-784);
    });
  });
});
