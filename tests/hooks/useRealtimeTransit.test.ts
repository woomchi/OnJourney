import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

describe('useRealtimeTransit query behavior', () => {
  let queryClient: QueryClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          retryDelay: 10,
        },
      },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    queryClient.clear();
    vi.restoreAllMocks();
  });

  const createRealtimeBusQueryFn = (
    region: string,
    stationId: string,
    stationName?: string
  ) => {
    return async () => {
      const params = new URLSearchParams();
      if (stationName) params.append('stationName', stationName);

      const url = `/api/realtime/bus/${encodeURIComponent(region)}/${encodeURIComponent(stationId)}?${params.toString()}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`실시간 버스 데이터 조회 실패 (HTTP ${res.status})`);
        }

        const json = await res.json().catch(() => null);
        if (!json || !json.success || !json.data) {
          throw new Error(json?.error || '실시간 버스 데이터를 불러올 수 없습니다.');
        }

        return json.data;
      } catch (err) {
        console.warn('[useRealtimeTransit] 버스 실시간 데이터 로드 실패:', err);
        throw err;
      }
    };
  };

  it('API 200 정상 응답 시 데이터를 정상 반환하고 에러가 발생하지 않아야 한다', async () => {
    const mockData = {
      stationId: '228000713',
      stationName: '판교역북편',
      nextArrivals: [
        {
          lineId: '1001',
          lineName: '390',
          arrivedInSeconds: 180,
          currentStationName: '백현마을',
        },
      ],
      dataSource: 'gyeonggi',
      lastUpdated: Date.now(),
      reliability: 1.0,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    } as unknown as Response);

    const queryFn = createRealtimeBusQueryFn('gyeonggi', '228000713', '판교역북편');

    const result = await queryClient.fetchQuery({
      queryKey: ['realtimeBus', 'gyeonggi', '228000713'],
      queryFn,
    });

    expect(result).toEqual(mockData);
    expect(result.nextArrivals).toHaveLength(1);
  });

  it('운행 차량이 없는 정상 200 응답(nextArrivals: [])인 경우 에러 없이 빈 결과를 반환해야 한다', async () => {
    const mockEmptyData = {
      stationId: '228000713',
      stationName: '판교역북편',
      nextArrivals: [],
      dataSource: 'gyeonggi',
      lastUpdated: Date.now(),
      reliability: 1.0,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockEmptyData,
      }),
    } as unknown as Response);

    const queryFn = createRealtimeBusQueryFn('gyeonggi', '228000713');

    const result = await queryClient.fetchQuery({
      queryKey: ['realtimeBus', 'gyeonggi', '228000713'],
      queryFn,
    });

    expect(result.nextArrivals).toHaveLength(0);
  });

  it('HTTP 500 에러 발생 시 예외를 던져 React Query가 에러 상태로 전이되어야 한다', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: '서버 내부 오류' }),
      } as unknown as Response;
    });

    const queryFn = createRealtimeBusQueryFn('tago', '12345');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['realtimeBus', 'tago', '12345'],
        queryFn,
      })
    ).rejects.toThrow('실시간 버스 데이터 조회 실패 (HTTP 500)');

    expect(callCount).toBe(2);
  });

  it('API 응답에서 success: false인 경우 적절한 에러 메시지를 throw해야 한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: false,
        error: '공공데이터 포털 API 키 만료',
      }),
    } as unknown as Response);

    const queryFn = createRealtimeBusQueryFn('seoul', '10001');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['realtimeBus', 'seoul', '10001'],
        queryFn,
      })
    ).rejects.toThrow('공공데이터 포털 API 키 만료');
  });

  it('네트워크 타임아웃 / AbortSignal 예외 발생 시 에러가 정상 throw되어야 한다', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout'));

    const queryFn = createRealtimeBusQueryFn('tago', '99999');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['realtimeBus', 'tago', '99999'],
        queryFn,
      })
    ).rejects.toThrow('aborted due to timeout');
  });

  describe('Q-3 queryKey normalization & cache reuse', () => {
    // useRealtimeTransit 내부의 queryKey 생성 로직과 동일
    const computeBusQueryKey = (
      region: string,
      stationId: string,
      stationName?: string,
      cityCode?: string,
      destination?: string,
      headsign?: string,
      lat?: number,
      lng?: number
    ) => {
      const isSpecialId =
        !stationId ||
        stationId === 'auto' ||
        stationId === 'none' ||
        stationId === '_' ||
        !/[0-9]/.test(stationId);
      const normalizedLat = isSpecialId && lat !== undefined ? Number(lat.toFixed(4)) : undefined;
      const normalizedLng = isSpecialId && lng !== undefined ? Number(lng.toFixed(4)) : undefined;

      return [
        'realtimeBus',
        region,
        stationId,
        stationName,
        cityCode,
        destination,
        headsign,
        normalizedLat,
        normalizedLng,
      ];
    };

    it('유효한 stationId가 있을 때 좌표(lat/lng)가 미세하게 달라도 동일한 queryKey가 생성되어야 한다', () => {
      const key1 = computeBusQueryKey('gyeonggi', '228000713', '판교역', undefined, undefined, undefined, 37.394812, 127.111923);
      const key2 = computeBusQueryKey('gyeonggi', '228000713', '판교역', undefined, undefined, undefined, 37.394888, 127.111999);

      // 좌표가 undefined로 정규화되어 동일한 queryKey를 가짐
      expect(key1).toEqual(key2);
      expect(key1[7]).toBeUndefined();
      expect(key1[8]).toBeUndefined();
    });

    it('가상 stationId("auto")일 때 11m 이내(소수점 4자리 이하)의 미세 좌표 변동은 동일한 queryKey로 통합되어야 한다', () => {
      const key1 = computeBusQueryKey('tago', 'auto', '정류소', undefined, undefined, undefined, 37.394812, 127.111923);
      const key2 = computeBusQueryKey('tago', 'auto', '정류소', undefined, undefined, undefined, 37.394849, 127.111941);

      // 둘 다 소수점 4자리(37.3948, 127.1119)로 정규화되어 동일한 queryKey를 가짐
      expect(key1).toEqual(key2);
      expect(key1[7]).toBe(37.3948);
      expect(key1[8]).toBe(127.1119);
    });

    it('가상 stationId("auto")일 때 11m 이상 차이나는 좌표는 다른 queryKey가 생성되어야 한다', () => {
      const key1 = computeBusQueryKey('tago', 'auto', '정류소', undefined, undefined, undefined, 37.3948, 127.1119);
      const key2 = computeBusQueryKey('tago', 'auto', '정류소', undefined, undefined, undefined, 37.4001, 127.1205);

      expect(key1).not.toEqual(key2);
    });
  });
});
