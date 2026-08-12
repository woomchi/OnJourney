/**
 * CircuitBreaker Pattern Implementation
 * 
 * [디자인 패턴: Circuit Breaker Pattern]
 * 
 * 1. 작동 방식 (How it works):
 *    - CLOSED (닫힘 - 정상): 모든 외부 API 요청을 정상적으로 수행하며 실패 횟수를 추적합니다.
 *    - OPEN (열림 - 차단): 연속 실패 횟수가 설정한 임계값(failureThreshold, 예: 3회)에 도달하면 서킷이 열립니다.
 *      서킷이 OPEN 상태일 때 들어오는 모든 요청은 즉시 외부 API 네트워크 호출을 건너뛰고,
 *      딜레이 없이 준비된 대체(Fallback) 데이터를 반환합니다 (Fail-Fast).
 *    - HALF_OPEN (반열림 - 복구 시험): 서킷 오픈 후 쿨다운 시간(cooldownMs, 예: 10초)이 지나면
 *      시험적으로 1개의 요청을 외부 API로 전달하여 서비스가 복구되었는지 테스트합니다.
 *      성공 시 CLOSED 상태로 복귀하고, 실패 시 다시 OPEN 상태로 되돌아갑니다.
 * 
 * 2. 기대 효과 (Expected Effects):
 *    - 서버 스레드 및 커넥션 고갈 방지: 동기식 딜레이(300ms, 600ms)로 인해 HTTP 라우트 작업자 스레드가 차단되는 문제를 원천 차단합니다.
 *    - 장애 전파 방지 (Fail-Fast): 장애가 발생한 외부 서비스(ODsay 등)로 불필요한 요청을 계속 보내는 캐스케이딩 고장(Cascading Failure)을 방지합니다.
 *    - 응답 속도 향상: 장애 상황 시 대기시간 없이 0ms에 가깝게 즉각적인 대체 경로(Fallback)를 응답합니다.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // 연속 실패 허용 횟수 (기본 3회)
  cooldownMs?: number;       // OPEN 상태 유지 시간 (기본 10초)
  shouldTrip?: (error: any) => boolean; // 실패 카운트에 반영할 에러 여부 판별 (기본: 모든 에러)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private failureThreshold: number;
  private cooldownMs: number;
  private shouldTrip?: (error: any) => boolean;
  private lastStateChange: number = Date.now();

  constructor(options?: CircuitBreakerOptions) {
    this.failureThreshold = options?.failureThreshold ?? 3;
    this.cooldownMs = options?.cooldownMs ?? 10000;
    this.shouldTrip = options?.shouldTrip;
  }

  public getState(): CircuitState {
    // OPEN 상태이고 쿨다운 시간이 경과했으면 HALF_OPEN 상태로 전환
    if (this.state === CircuitState.OPEN && Date.now() - this.lastStateChange >= this.cooldownMs) {
      this.state = CircuitState.HALF_OPEN;
    }
    return this.state;
  }

  /**
   * 요청을 실행하며, 서킷이 OPEN이거나 실패 시 fallbackFn 실행 (Fail-Fast)
   */
  public async execute<T>(
    requestFn: () => Promise<T>,
    fallbackFn: (error?: any) => T | Promise<T>
  ): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitState.OPEN) {
      console.warn(`[CircuitBreaker] Circuit is OPEN. Short-circuiting and returning fallback immediately.`);
      return fallbackFn(new Error('Circuit breaker is OPEN'));
    }

    try {
      const result = await requestFn();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      return fallbackFn(error);
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state !== CircuitState.CLOSED) {
      // console.info(`[CircuitBreaker] Circuit state changed to CLOSED`);
      this.state = CircuitState.CLOSED;
      this.lastStateChange = Date.now();
    }
  }

  private onFailure(error: any): void {
    if (this.shouldTrip && !this.shouldTrip(error)) {
      // console.warn(`[CircuitBreaker] Exception caught but ignored for breaker trip: ${error?.message || error}`);
      return;
    }

    this.failureCount++;
    // console.warn(`[CircuitBreaker] Execution failed (${this.failureCount}/${this.failureThreshold}): ${error?.message || error}`);

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.lastStateChange = Date.now();
      // console.error(`[CircuitBreaker] Failure threshold reached. Circuit switched to OPEN state.`);
    }
  }
}

// ODsay 전용 글로벌 서킷 브레이커 싱글톤 객체
export const odsayCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  cooldownMs: 10000,
  shouldTrip: (error: any) => {
    const msg = String(error?.message || error || '');
    const code = String(error?.code || '');
    // 429 (Too Many Requests), Rate Limit, Quota Exceeded 등은 서킷 트립에서 제외
    if (msg.includes('Too Many Requests') || msg.includes('429') || code === 'TRANSIT_QUOTA_EXCEEDED' || error?.status === 429) {
      return false;
    }
    return true;
  },
});
