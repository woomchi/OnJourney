import { describe, it, expect } from 'vitest';
import { ServerRateLimiter } from '@/lib/infrastructure/rateLimiter';

describe('ServerRateLimiter', () => {
  it('토큰 버킷 한도 내의 작업들을 정상적으로 처리한다', async () => {
    const limiter = new ServerRateLimiter(5, 5);

    const task1 = limiter.schedule(async () => 'result_1');
    const task2 = limiter.schedule(async () => 'result_2');

    const [res1, res2] = await Promise.all([task1, task2]);
    expect(res1).toBe('result_1');
    expect(res2).toBe('result_2');
  });

  it('작업 큐에서 오류가 발생하면 reject가 올바르게 전파된다', async () => {
    const limiter = new ServerRateLimiter(5, 5);

    const failedTask = limiter.schedule(async () => {
      throw new Error('Task Failed');
    });

    await expect(failedTask).rejects.toThrow('Task Failed');
  });

  it('연속된 요청들이 큐에 들어가 순차적으로 완료된다', async () => {
    const limiter = new ServerRateLimiter(2, 10);
    const order: number[] = [];

    const p1 = limiter.schedule(async () => {
      order.push(1);
      return 1;
    });
    const p2 = limiter.schedule(async () => {
      order.push(2);
      return 2;
    });
    const p3 = limiter.schedule(async () => {
      order.push(3);
      return 3;
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });
});
