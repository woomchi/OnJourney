import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { TransitAuthError, AppError, TransitRouteNotFoundError } from '@/lib/infrastructure/odsayAdapter';
import * as externalFetchModule from '@/lib/utils/externalFetch';

describe('KakaoTransitAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('API 키가 설정되지 않은 경우 TransitAuthError를 던져야 한다', async () => {
    const originalKey = process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_REST_API_KEY;

    try {
      await expect(
        KakaoTransitAdapter.fetchPublicTraffic({
          startX: 127.0694,
          startY: 37.2053,
          endX: 127.1159,
          endY: 37.2754,
        })
      ).rejects.toThrow(TransitAuthError);
    } finally {
      process.env.KAKAO_REST_API_KEY = originalKey;
    }
  });

  it('status가 OK인 정상 응답을 올바르게 반환해야 한다', async () => {
    const mockResponse = {
      status: 'OK',
      properties: {
        total: 1,
        bus: 1,
        subway: 0,
        busAndSubway: 0,
        landingURL: 'https://map.kakao.com/...',
      },
      routes: [
        {
          properties: {
            type: 'BUS',
            totalDistance: 5000,
            totalTime: 1200,
            transfers: 0,
          },
          steps: [],
        },
      ],
    };

    vi.spyOn(externalFetchModule, 'externalFetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await KakaoTransitAdapter.fetchPublicTraffic(
      {
        startX: 127.0694,
        startY: 37.2053,
        endX: 127.1159,
        endY: 37.2754,
      },
      'test-api-key'
    );

    expect(result.status).toBe('OK');
    expect(result.routes).toHaveLength(1);
    expect(result.routes?.[0].properties.totalDistance).toBe(5000);
  });

  it('status가 NO_RESULTS인 경우 예외 없이 정상 반환해야 한다 (빈 배열 처리)', async () => {
    const mockResponse = {
      status: 'NO_RESULTS',
      properties: {
        total: 0,
        bus: 0,
        subway: 0,
        busAndSubway: 0,
        landingURL: '',
      },
      routes: [],
    };

    vi.spyOn(externalFetchModule, 'externalFetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    const result = await KakaoTransitAdapter.fetchPublicTraffic(
      {
        startX: 127.0,
        startY: 37.0,
        endX: 129.0,
        endY: 35.0,
      },
      'test-api-key'
    );

    expect(result.status).toBe('NO_RESULTS');
    expect(result.routes).toEqual([]);
  });

  it('status가 EQUAL_POINTS인 경우 AppError(INVALID_COORDINATES)를 던져야 한다', async () => {
    const mockResponse = {
      status: 'EQUAL_POINTS',
    };

    vi.spyOn(externalFetchModule, 'externalFetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await expect(
      KakaoTransitAdapter.fetchPublicTraffic(
        {
          startX: 127.0694,
          startY: 37.2053,
          endX: 127.0694,
          endY: 37.2053,
        },
        'test-api-key'
      )
    ).rejects.toThrow(AppError);
  });

  it('status가 STARTNODES_NULL인 경우 TransitRouteNotFoundError를 던져야 한다', async () => {
    const mockResponse = {
      status: 'STARTNODES_NULL',
    };

    vi.spyOn(externalFetchModule, 'externalFetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 })
    );

    await expect(
      KakaoTransitAdapter.fetchPublicTraffic(
        {
          startX: 127.0,
          startY: 37.0,
          endX: 127.1,
          endY: 37.1,
        },
        'test-api-key'
      )
    ).rejects.toThrow(TransitRouteNotFoundError);
  });
});
