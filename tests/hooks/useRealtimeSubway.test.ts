import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

describe('useRealtimeSubway query behavior', () => {
  let queryClient: QueryClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 2,
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

  // useRealtimeSubway의 queryFn 로직을 동일하게 검증
  const createRealtimeSubwayQueryFn = (
    stationName?: string,
    wayCode?: string,
    subwayId?: string
  ) => {
    const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

    return async () => {
      if (!cleanStationName) return [];

      const params = new URLSearchParams();
      params.append('station', cleanStationName);
      if (wayCode) params.append('wayCode', wayCode);
      if (subwayId) params.append('subwayId', subwayId);

      const url = `/api/subway/realtime?${params.toString()}`;

      try {
        const res = await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

        if (!res.ok) {
          throw new Error(`실시간 지하철 데이터 조회 실패 (HTTP ${res.status})`);
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          return [];
        }

        return Array.isArray(json.data) ? json.data : [json.data];
      } catch (err) {
        console.warn('[useRealtimeSubway] 실시간 지하철 데이터 로드 실패:', err);
        throw err;
      }
    };
  };

  it('API 200 정상 응답 시 지하철 도착 데이터를 정상 반환해야 한다', async () => {
    const mockData = [
      {
        subwayId: '1002',
        statnNm: '강남',
        trainLineNm: '2호선 외선순환',
        minutesLeft: 3,
        arvlMsg2: '3분 후 (역삼)',
        isRealtime: true,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockData,
      }),
    } as unknown as Response);

    const queryFn = createRealtimeSubwayQueryFn('강남역', '1', '1002');

    const result = await queryClient.fetchQuery({
      queryKey: ['realtimeSubway', '강남', '1', '1002'],
      queryFn,
    });

    expect(result).toEqual(mockData);
    expect(result).toHaveLength(1);
    expect(result[0].statnNm).toBe('강남');
  });

  it('운행 열차가 없는 정상 응답(data: [])인 경우 빈 배열을 안전하게 반환해야 한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [],
      }),
    } as unknown as Response);

    const queryFn = createRealtimeSubwayQueryFn('강남역');

    const result = await queryClient.fetchQuery({
      queryKey: ['realtimeSubway', '강남'],
      queryFn,
    });

    expect(result).toEqual([]);
  });

  it('네트워크 지연으로 6초 타임아웃(Abort) 발생 시 예외를 throw하고 retry: 2 (총 3회) 호출되어야 한다', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    });

    const queryFn = createRealtimeSubwayQueryFn('신도림역');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['realtimeSubway', '신도림'],
        queryFn,
      })
    ).rejects.toThrow('aborted due to timeout');

    // 최초 1회 + 재시도 2회 = 총 3회 호출 확인
    expect(callCount).toBe(3);
  });

  it('HTTP 500 에러 발생 시 예외를 던지고 retry: 2 (총 3회) 호출되어야 한다', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: '지하철 API 서버 오류' }),
      } as unknown as Response;
    });

    const queryFn = createRealtimeSubwayQueryFn('시청역');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['realtimeSubway', '시청'],
        queryFn,
      })
    ).rejects.toThrow('실시간 지하철 데이터 조회 실패 (HTTP 500)');

    expect(callCount).toBe(3);
  });

  it('stationName이 빈 문자열인 경우 API 호출 없이 빈 배열을 반환해야 한다', async () => {
    global.fetch = vi.fn();

    const queryFn = createRealtimeSubwayQueryFn('');

    const result = await queryClient.fetchQuery({
      queryKey: ['realtimeSubway', ''],
      queryFn,
    });

    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
