import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LruTtlCache } from '@/lib/utils/lruCache';

describe('LruTtlCache', () => {
  it('기본 get 및 set 동작이 정상이어야 한다', () => {
    const cache = new LruTtlCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it('maxSize를 초과하면 가장 오래 참조되지 않은 항목(LRU)이 제거되어야 한다', () => {
    const cache = new LruTtlCache<string, number>({ maxSize: 3 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // 'a'에 접근하여 'a'를 최신 상태로 갱신 (가장 오래된 항목은 이제 'b')
    cache.get('a');

    // 'd' 추가 시 가장 오래된 'b'가 퇴출되어야 함
    cache.set('d', 4);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('TTL이 만료되면 get 및 has에서 undefined/false를 반환해야 한다', () => {
    vi.useFakeTimers();

    const cache = new LruTtlCache<string, string>({ maxSize: 5, defaultTtlMs: 1000 });
    cache.set('temp', 'value');

    expect(cache.has('temp')).toBe(true);
    expect(cache.get('temp')).toBe('value');

    // 1.5초 경과
    vi.advanceTimersByTime(1500);

    expect(cache.has('temp')).toBe(false);
    expect(cache.get('temp')).toBeUndefined();

    vi.useRealTimers();
  });

  it('delete 및 clear 메서드가 정상 동작해야 한다', () => {
    const cache = new LruTtlCache<string, number>({ maxSize: 5 });
    cache.set('a', 10);
    cache.set('b', 20);

    expect(cache.delete('a')).toBe(true);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(1);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('b')).toBeUndefined();
  });

  it('sweepExpired로 만료된 항목들을 일괄 정리할 수 있어야 한다', () => {
    vi.useFakeTimers();

    const cache = new LruTtlCache<string, number>({ maxSize: 5 });
    cache.set('alive', 1, 5000); // 5초 유지
    cache.set('expired1', 2, 1000); // 1초 유지
    cache.set('expired2', 3, 1000); // 1초 유지

    vi.advanceTimersByTime(2000); // 2초 경과

    const sweptCount = cache.sweepExpired();
    expect(sweptCount).toBe(2);
    expect(cache.size).toBe(1);
    expect(cache.get('alive')).toBe(1);

    vi.useRealTimers();
  });
});
