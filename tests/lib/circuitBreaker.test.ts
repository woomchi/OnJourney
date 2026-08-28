import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '@/lib/infrastructure/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
    });
  });

  it('초기 상태는 CLOSED이며 정상 요청 시 request 결과를 반환한다', async () => {
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    const result = await breaker.execute(
      async () => 'success_data',
      () => 'fallback_data'
    );

    expect(result).toBe('success_data');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('실패 횟수가 failureThreshold 미만일 때는 CLOSED 상태를 유지하고 fallback을 반환한다', async () => {
    const errorReq = async () => {
      throw new Error('API Network Error');
    };

    const res1 = await breaker.execute(errorReq, () => 'fallback_1');
    expect(res1).toBe('fallback_1');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    const res2 = await breaker.execute(errorReq, () => 'fallback_2');
    expect(res2).toBe('fallback_2');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('연속 3회 실패 시 OPEN 상태로 전이되고 요청을 바로 차단(Fail-Fast)한다', async () => {
    const errorReq = vi.fn().mockRejectedValue(new Error('Persistent Error'));
    const fallbackFn = vi.fn().mockReturnValue('fallback_response');

    // 3회 실패 트리거
    await breaker.execute(errorReq, fallbackFn);
    await breaker.execute(errorReq, fallbackFn);
    await breaker.execute(errorReq, fallbackFn);

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // OPEN 상태에서 4번째 요청 시 requestFn은 아예 호출되지 않아야 함 (Short-circuiting)
    errorReq.mockClear();
    fallbackFn.mockClear();

    const openResult = await breaker.execute(errorReq, fallbackFn);

    expect(errorReq).not.toHaveBeenCalled();
    expect(fallbackFn).toHaveBeenCalled();
    expect(openResult).toBe('fallback_response');
  });

  it('cooldownMs 시간이 경과하면 HALF_OPEN 상태가 되고 시험 요청 성공 시 CLOSED로 복구된다', async () => {
    const errorReq = async () => {
      throw new Error('Error');
    };

    // 3회 실패로 OPEN 상태로 만듦
    await breaker.execute(errorReq, () => 'fallback');
    await breaker.execute(errorReq, () => 'fallback');
    await breaker.execute(errorReq, () => 'fallback');
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // 쿨다운 시간(1000ms) 경과 시뮬레이션
    vi.setSystemTime(Date.now() + 1100);

    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    // 복구 시험 요청 성공
    const recovered = await breaker.execute(
      async () => 'recovered_data',
      () => 'fallback'
    );

    expect(recovered).toBe('recovered_data');
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    vi.useRealTimers();
  });

  it('shouldTrip 옵션이 제공된 경우, 특정 에러는 실패 카운트에서 제외된다', async () => {
    const customBreaker = new CircuitBreaker({
      failureThreshold: 2,
      shouldTrip: (error: any) => error?.status !== 429,
    });

    const rateLimitErrorReq = async () => {
      const err: any = new Error('Too Many Requests');
      err.status = 429;
      throw err;
    };

    // 429 에러 3회 발생
    await customBreaker.execute(rateLimitErrorReq, () => 'fallback');
    await customBreaker.execute(rateLimitErrorReq, () => 'fallback');
    await customBreaker.execute(rateLimitErrorReq, () => 'fallback');

    // shouldTrip에서 제외되었으므로 여전히 CLOSED 상태
    expect(customBreaker.getState()).toBe(CircuitState.CLOSED);
  });
});
