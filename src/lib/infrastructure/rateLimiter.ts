/**
 * ServerRateLimiter & RequestQueue (Token Bucket + Message Queue Pattern)
 * 
 * [디자인 패턴: Rate Limiter & Message Queue Pattern]
 * 
 * 1. 작동 방식 (How it works):
 *    - Token Bucket 알고리즘: 설정된 최대 토큰 수(maxTokens)와 일정 시간마다 토큰을 충전하는 초당 충전율(refillRate)을 기반으로 동작합니다.
 *    - Request Queue (메시지 큐): 토큰 부족 시 요청을 즉시 거절하거나 무차별 재시도하지 않고, 비동기 작업 큐에 대기(Queueing)시킨 뒤 토큰이 보충되면 순차 처리합니다.
 *    - 초당 요청 수(TPS) 제한을 완벽하게 준수하여 외부 API 호출을 서버 단에서 중앙 집중적으로 통제합니다.
 * 
 * 2. 기대 효과 (Expected Effects):
 *    - 보안 및 통제력 강화: 클라이언트 임의의 딜레이(150ms)에 의존하던 취약성을 완전히 제거하고 서버 인프라 레벨에서 호출율을 중앙 통제합니다.
 *    - 429 Too Many Requests / ApiKeyAuthFailed 방지: 외부 API(ODsay 등) 초당 쿼리 한도를 초과하지 않도록 보장하여 서비스 안정성을 극대화합니다.
 *    - 다중 클라이언트 동시 요청 과부하 방지: 서버 전체에서 공유되는 토큰 버킷으로 동시 접속자 급증 시에도 안정적인 외부 API 통신을 유지합니다.
 */

interface QueuedTask<T> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class ServerRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // 토큰/초
  private lastRefill: number;
  private queue: QueuedTask<any>[] = [];
  private isProcessing = false;

  constructor(maxTokens = 10, refillRate = 5) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  /**
   * 토큰 보충 (Refill Tokens)
   */
  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsedSeconds * this.refillRate);
      this.lastRefill = now;
    }
  }

  /**
   * 외부 API 실행 요청을 큐에 등록하고 스로틀링된 시점에 실행
   */
  public schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        const item = this.queue.shift();
        if (item) {
          try {
            const result = await item.task();
            item.resolve(result);
          } catch (error) {
            item.reject(error);
          }
        }
      } else {
        // 토큰이 부족하면 토큰 1개가 채워질 때까지 대기
        const waitMs = Math.ceil((1 / this.refillRate) * 1000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.isProcessing = false;
  }
}

// ODsay 전용 글로벌 서버 싱글톤 Rate Limiter (초당 5회 제한 안전 마진 설정)
export const odsayRateLimiter = new ServerRateLimiter(5, 5);
