import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusStopRepository } from '@/lib/services/busStopRepository';
import { createClient } from '@supabase/supabase-js';
import { TagoBusService } from '@/lib/transit/TagoBusService';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('BusStopRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    BusStopRepository.clearCache();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
  });

  it('유효하지 않은 좌표(0 또는 undefined) 입력 시 null을 반환해야 함', async () => {
    const res1 = await BusStopRepository.findNearestBusStop({ lat: 0, lng: 127.0 });
    const res2 = await BusStopRepository.findNearestBusStop({ lat: 37.5, lng: 0 });
    expect(res1).toBeNull();
    expect(res2).toBeNull();
  });

  it('PostGIS RPC를 호출하여 가장 인접한 정류소를 성공적으로 반환해야 함', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          node_id: 'GGB200000001',
          node_nm: '수원역.AK플라자',
          ars_no: '03015',
          city_cd: '31',
          city_name: '경기도 수원시',
          distance_meters: 18.5,
        },
      ],
      error: null,
    });

    vi.mocked(createClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as ReturnType<typeof createClient>);

    const result = await BusStopRepository.findNearestBusStop({
      lat: 37.2657,
      lng: 127.0001,
      stationName: '수원역.AK플라자',
      radiusMeters: 150.0,
    });

    expect(result).not.toBeNull();
    expect(result?.nodeId).toBe('GGB200000001');
    expect(result?.nodeNm).toBe('수원역.AK플라자');
    expect(result?.cityCd).toBe('31');
    expect(result?.arsNo).toBe('03015');
    expect(result?.distanceMeters).toBe(18.5);

    expect(mockRpc).toHaveBeenCalledWith('find_nearest_bus_stops', {
      target_lat: 37.2657,
      target_lng: 127.0001,
      target_name: 'AK플라자',
      radius_meters: 150.0,
      limit_count: 3,
    });
  });

  it('동일한 좌표 및 정류소명 재호출 시 인메모리 캐시에서 즉시 반환해야 함', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          node_id: 'DJB8001001',
          node_nm: '대전역',
          ars_no: '11010',
          city_cd: '25',
          city_name: '대전광역시 동구',
          distance_meters: 5.2,
        },
      ],
      error: null,
    });

    vi.mocked(createClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as ReturnType<typeof createClient>);

    const res1 = await BusStopRepository.findNearestBusStop({
      lat: 36.3325,
      lng: 127.4342,
      stationName: '대전역',
    });
    const res2 = await BusStopRepository.findNearestBusStop({
      lat: 36.3325,
      lng: 127.4342,
      stationName: '대전역',
    });

    expect(res1?.nodeId).toBe('DJB8001001');
    expect(res2?.nodeId).toBe('DJB8001001');
    // RPC는 첫 번째 호출에서 1번만 실행되어야 함
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('DB 에러 발생 시 예외를 던지지 않고 안전하게 null을 반환해야 함 (Fallback 보장)', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'relation bus_stops does not exist' },
    });

    vi.mocked(createClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as ReturnType<typeof createClient>);

    const result = await BusStopRepository.findNearestBusStop({
      lat: 37.5,
      lng: 127.0,
      stationName: '테스트정류장',
    });

    expect(result).toBeNull();
  });
});

describe('TagoBusService 좌표 보정 연계', () => {
  beforeEach(() => {
    BusStopRepository.clearCache();
  });

  it('BusStopRepository에서 정류소를 찾으면 TAGO 외부 API 호출 없이 즉시 반환해야 함', async () => {
    const spy = vi.spyOn(BusStopRepository, 'findNearestBusStop').mockResolvedValue({
      nodeId: 'DJB8001001',
      nodeNm: '대전역',
      arsNo: '11010',
      cityCd: '25',
      cityName: '대전광역시',
      distanceMeters: 10.0,
    });

    const result = await TagoBusService.lookupTagoNodeIdByCoords(36.3325, 127.4342, '대전역');

    expect(spy).toHaveBeenCalled();
    expect(result).toEqual({
      nodeId: 'DJB8001001',
      cityCode: '25',
      arsNo: '11010',
    });

    spy.mockRestore();
  });

  it('BusStopRepository.findBusStopByArsOrName을 통해 lookupTagoNodeId가 외부 API 없이 즉시 반환해야 함', async () => {
    const spy = vi.spyOn(BusStopRepository, 'findBusStopByArsOrName').mockResolvedValue({
      nodeId: 'SEB121000262',
      nodeNm: '강남역8번출구',
      arsNo: '22339',
      cityCd: '11',
      cityName: '서울특별시',
      distanceMeters: 0,
    });

    const nodeId = await TagoBusService.lookupTagoNodeId('11', '22339', '강남역');

    expect(spy).toHaveBeenCalledWith('11', '22339', '강남역');
    expect(nodeId).toBe('SEB121000262');

    spy.mockRestore();
  });
});
