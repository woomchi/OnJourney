/**
 * ODsay API Rate Limiter & Throttler (Concurrency & Throttle Queue)
 * 
 * ODsay 외부 API의 초당/분당 요청 제한(429 Too Many Requests)을 방지하기 위한
 * 비동기 요청 큐 및 Throttler 구현체입니다.
 */
class OdsayRateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrency: number;
  private minIntervalMs: number;
  private lastExecutionTime = 0;

  constructor(maxConcurrency = 2, minIntervalMs = 80) {
    this.maxConcurrency = maxConcurrency;
    this.minIntervalMs = minIntervalMs;
  }

  /**
   * 비동기 함수를 Rate Limiter 큐에 등록하고 순차적으로 제한에 맞춰 실행합니다.
   */
  public enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.activeCount++;
        try {
          // 요청 간 최소 시간(minIntervalMs) 보장
          const now = Date.now();
          const timeSinceLast = now - this.lastExecutionTime;
          if (timeSinceLast < this.minIntervalMs) {
            await new Promise((r) => setTimeout(r, this.minIntervalMs - timeSinceLast));
          }
          this.lastExecutionTime = Date.now();

          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.next();
        }
      };

      this.queue.push(task);
      this.next();
    });
  }

  private next() {
    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        nextTask();
      }
    }
  }
}

// ODsay 전용 글로벌 Rate Limiter 싱글톤 객체 (최대 동시 2개, 최소 80ms 시차)
export const odsayRateLimiter = new OdsayRateLimiter(2, 80);
