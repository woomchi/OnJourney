import { describe, it, expect, beforeEach } from 'vitest';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';

describe('timeOffsetManager', () => {
  beforeEach(() => {
    // 오프셋 0으로 초기화
    timeOffsetManager.setOffset(0);
  });

  it('setOffset 및 getOffset이 정상 동작한다', () => {
    timeOffsetManager.setOffset(1500);
    expect(timeOffsetManager.getOffset()).toBe(1500);
  });

  it('syncWithServerTime은 RTT/2를 보정하여 정확한 시각 오프셋을 계산한다', () => {
    const requestStartMs = 10000;
    const responseEndMs = 10200; // RTT = 200ms
    const serverTimeMs = 15000;

    // estimatedServerTime = 15000 + (200 / 2) = 15100
    // offset = 15100 - 10200 = 4900ms
    const offset = timeOffsetManager.syncWithServerTime(
      serverTimeMs,
      requestStartMs,
      responseEndMs
    );

    expect(offset).toBe(4900);
    expect(timeOffsetManager.getOffset()).toBe(4900);
  });

  it('getSynchronizedNow는 현재 로컬 시간에 오프셋을 더한 값을 반환한다', () => {
    timeOffsetManager.setOffset(2000);
    const now = Date.now();
    const syncedNow = timeOffsetManager.getSynchronizedNow();

    // 약간의 실행 시간 허용 오차 (±50ms)
    expect(syncedNow - now).toBeGreaterThanOrEqual(1950);
    expect(syncedNow - now).toBeLessThanOrEqual(2050);
  });

  it('getSyncConfidence는 오프셋 크기에 따라 신뢰도를 감점한다', () => {
    // 오프셋이 0일 때 신뢰도 1.0
    timeOffsetManager.setOffset(0);
    expect(timeOffsetManager.getSyncConfidence()).toBe(1.0);

    // 오프셋이 3000ms일 때 (1.0 - 3000/10000 = 0.7)
    timeOffsetManager.setOffset(3000);
    expect(timeOffsetManager.getSyncConfidence()).toBe(0.7);

    // 오프셋이 -5000ms일 때 (1.0 - 5000/10000 = 0.5)
    timeOffsetManager.setOffset(-5000);
    expect(timeOffsetManager.getSyncConfidence()).toBe(0.5);

    // 큰 오프셋이어도 최소 0.5 하한선 유지
    timeOffsetManager.setOffset(15000);
    expect(timeOffsetManager.getSyncConfidence()).toBe(0.5);
  });
});
