import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as redisClientModule from '@/lib/infrastructure/redisClient';
import {
  fetchCachedTotalArrivals,
  fetchCachedPositionsByLine,
} from '@/lib/infrastructure/subwayCacheService';

describe('redisClient 모듈 검증 (S-2)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('환경변수가 누락된 경우 getRedisClient는 null을 반환한다', () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const client = redisClientModule.getRedisClient();
    expect(client).toBeNull();
  });

  it('Redis가 비활성화된 상태에서 getRedisCache는 null을 안전하게 반환한다', async () => {
    vi.spyOn(redisClientModule, 'getRedisClient').mockReturnValue(null);

    const result = await redisClientModule.getRedisCache('test:key');
    expect(result).toBeNull();
  });

  it('Redis get 호출 시 에러가 발생해도 throw하지 않고 null을 반환한다 (예외 격리)', async () => {
    const mockRedis = {
      get: vi.fn().mockRejectedValue(new Error('Connection error')),
      set: vi.fn(),
    } as any;

    vi.spyOn(redisClientModule, 'getRedisClient').mockReturnValue(mockRedis);

    const result = await redisClientModule.getRedisCache('test:failing-key');
    expect(result).toBeNull();
  });
});

describe('subwayCacheService 분산 캐시 파이프라인 검증 (S-2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Upstash Redis에 캐시가 존재할 경우(HIT) 공공 API 호출 없이 Redis 데이터를 반환한다', async () => {
    const mockRows = [
      {
        subwayId: '1002',
        statnNm: '강남',
        trainLineNm: '2호선 역삼방면',
        barvlDt: '120',
      },
    ] as any;

    const getRedisSpy = vi.spyOn(redisClientModule, 'getRedisCache').mockResolvedValue(mockRows);

    const result = await fetchCachedTotalArrivals('dummy-api-key', '0', '10');

    expect(result).toEqual(mockRows);
    expect(getRedisSpy).toHaveBeenCalledWith('subway:total-arrivals:0:10');
  });

  it('Upstash Redis 노선별 위치 캐시가 존재할 경우(HIT) Redis 데이터를 즉시 반환한다', async () => {
    const mockPositions = [
      {
        trainNo: '2105',
        stationName: '역삼',
        statnTnm: '성수',
      },
    ] as any;

    const getRedisSpy = vi.spyOn(redisClientModule, 'getRedisCache').mockResolvedValue(mockPositions);

    const result = await fetchCachedPositionsByLine('dummy-api-key', '2호선');

    expect(result).toEqual(mockPositions);
    expect(getRedisSpy).toHaveBeenCalledWith('subway:positions:2호선');
  });
});
