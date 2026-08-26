/**
 * @fileoverview LRU(Least Recently Used) 및 TTL(Time-To-Live) 기반 인메모리 캐시 클래스
 *
 * - Map의 키 순서 보장(Insertion Order) 특성을 활용하여 O(1) 시간 복잡도로 LRU 동작
 * - 최대 캐시 크기(maxSize) 초과 시 가장 오래전에 접근된 항목(Oldest) 자동 퇴출
 * - 항목별/기본 TTL 만료 검증 및 주기적/삽입 시 만료 항목 자동 스위프(sweep)
 */

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface LruTtlCacheOptions {
  /** 최대 캐시 엔트리 개수 (기본값: 100) */
  maxSize?: number;
  /** 기본 만료 시간(ms) (0 또는 미지정 시 영구 유지) */
  defaultTtlMs?: number;
}

export class LruTtlCache<K, V> {
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private readonly cache = new Map<K, CacheEntry<V>>();

  constructor(options: LruTtlCacheOptions = {}) {
    this.maxSize = Math.max(1, options.maxSize ?? 100);
    this.defaultTtlMs = Math.max(0, options.defaultTtlMs ?? 0);
  }

  /**
   * 캐시에서 항목을 조회하고, LRU 갱신(가장 최근 접근 상태로 위치 변경)
   */
  public get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    // 만료 여부 확인
    if (entry.expiresAt > 0 && entry.expiresAt <= now) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU 순서 갱신: 삭제 후 재삽입하여 가장 최근 항목으로 이동
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 캐시에 항목을 저장하고, 필요 시 오래된 항목 퇴출
   */
  public set(key: K, value: V, ttlMs?: number): this {
    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = effectiveTtl > 0 ? Date.now() + effectiveTtl : 0;

    // 이미 존재하는 키라면 먼저 삭제 (재삽입을 통한 LRU 최신화)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 캐시가 꽉 찼으면 먼저 만료된 항목들을 스위프
      this.sweepExpired();

      // 만료 항목을 지웠음에도 여전히 꽉 차 있다면 가장 오래된 항목(Map의 첫 번째 키) 제거
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
    }

    this.cache.set(key, { value, expiresAt });
    return this;
  }

  /**
   * 캐시에 특정 키가 유효하게 존재하는지 확인 (LRU 순서 변경 없음)
   */
  public has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 특정 키 삭제
   */
  public delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 캐시 전체 비우기
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * 현재 유효한 캐시 항목 개수
   */
  public get size(): number {
    return this.cache.size;
  }

  /**
   * 캐시 내 모든 키 반환 (이터레이터)
   */
  public keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 만료된 항목들을 순회하며 즉시 삭제
   */
  public sweepExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > 0 && entry.expiresAt <= now) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }
}
