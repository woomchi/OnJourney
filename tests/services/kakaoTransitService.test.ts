import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchKakaoTransitOptions } from '@/lib/services/directions/transit/kakaoTransitService';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { TransitRouteNotFoundError, AppError } from '@/lib/infrastructure/odsayAdapter';

// Next.js unstable_cache 모킹: 단순히 콜백 비동기 함수를 즉시 실행
vi.mock('next/cache', () => ({
  unstable_cache: (fn: any) => fn,
}));

describe('kakaoTransitService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('카카오 대중교통 경로가 정상적으로 검색되면 DirectionResult[]를 반환해야 한다', async () => {
    const mockKakaoResponse: any = {
      status: 'OK',
      properties: {
        total: 1,
        bus: 1,
        subway: 0,
        busAndSubway: 0,
        landingURL: '',
      },
      routes: [
        {
          properties: {
            type: 'BUS',
            totalDistance: 4500,
            totalTime: 900,
            transfers: 0,
            fare: { value: 1450 },
          },
          steps: [
            {
              properties: {
                type: 'BUS',
                guidance: '일반 73 (동탄 > 기흥)',
                distance: 4500,
                time: 900,
                stops: [{ name: '동탄' }, { name: '기흥' }],
                vehicles: [{ name: '73', type: '일반' }],
              },
              path: {
                points: [
                  [127.06, 37.20],
                  [127.11, 37.27],
                ],
              },
            },
          ],
        },
      ],
    };

    vi.spyOn(KakaoTransitAdapter, 'fetchPublicTraffic').mockResolvedValueOnce(mockKakaoResponse);

    const results = await fetchKakaoTransitOptions(127.06, 37.20, 127.11, 37.27);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('public');
    expect(results[0].duration).toBe(15);
    expect(results[0].distance).toBe(4.5);
    expect(results[0].fare).toBe(1450);
  });

  it('NO_RESULTS인 경우 빈 배열을 안전하게 반환해야 한다', async () => {
    const mockResponse: any = {
      status: 'NO_RESULTS',
      routes: [],
    };

    vi.spyOn(KakaoTransitAdapter, 'fetchPublicTraffic').mockResolvedValueOnce(mockResponse);

    const results = await fetchKakaoTransitOptions(127.0, 37.0, 129.0, 35.0);

    expect(results).toEqual([]);
  });

  it('출발지/도착지 주변 정류장이 없는 경우(TransitRouteNotFoundError) 빈 배열을 반환해야 한다', async () => {
    vi.spyOn(KakaoTransitAdapter, 'fetchPublicTraffic').mockRejectedValueOnce(
      new TransitRouteNotFoundError('출발지 주변에서 대중교통 정류장을 찾을 수 없습니다.')
    );

    const results = await fetchKakaoTransitOptions(127.0, 37.0, 127.1, 37.1);

    expect(results).toEqual([]);
  });

  it('시스템 기타 에러 발생 시 AppError를 던져야 한다', async () => {
    vi.spyOn(KakaoTransitAdapter, 'fetchPublicTraffic').mockRejectedValueOnce(
      new Error('서버 내부 장애')
    );

    await expect(
      fetchKakaoTransitOptions(127.0, 37.0, 127.1, 37.1)
    ).rejects.toThrow(AppError);
  });
});
