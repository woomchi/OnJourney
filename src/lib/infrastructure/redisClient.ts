import { Redis } from '@upstash/redis';

const REDIS_TIMEOUT_MS = 1_500;

let redisInstance: Redis | null = null;

/**
 * Upstash Redis 싱글톤 인스턴스 반환
 * - 환경변수가 없으면 null을 반환하여 인메모리/unstable_cache로 자동 Fallback합니다.
 */
export function getRedisClient(): Redis | null {
  if (redisInstance) return redisInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  try {
    redisInstance = new Redis({
      url,
      token,
    });
    return redisInstance;
  } catch (err) {
    console.warn('[redisClient] Upstash Redis 초기화 실패 (Fallback 모드 동작):', err);
    return null;
  }
}

/**
 * 안전한 Redis 캐시 조회 래퍼
 * - 타임아웃(1.5초) 및 에러 격리 처리로 외부 Redis 장애 시 null을 반환합니다.
 * - clearTimeout을 보장하여 타이머 메모리 누수를 방지합니다.
 */
export async function getRedisCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  let timeoutId: NodeJS.Timeout | null = null;
  try {
    const fetchPromise = redis.get<T>(key);
    const timeoutPromise = new Promise<null>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Redis get timeout')), REDIS_TIMEOUT_MS);
    });

    const result = await Promise.race([fetchPromise, timeoutPromise]);
    return result ?? null;
  } catch (err) {
    console.warn(`[redisClient] 캐시 조회 실패 (key: ${key}):`, err);
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 안전한 Redis 캐시 저장 래퍼
 * - 타임아웃(1.5초) 및 에러 격리 처리
 * - clearTimeout을 보장하여 타이머 메모리 누수를 방지합니다.
 */
export async function setRedisCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  let timeoutId: NodeJS.Timeout | null = null;
  try {
    const setPromise = redis.set(key, value, { ex: ttlSeconds });
    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Redis set timeout')), REDIS_TIMEOUT_MS);
    });

    await Promise.race([setPromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[redisClient] 캐시 저장 실패 (key: ${key}):`, err);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
