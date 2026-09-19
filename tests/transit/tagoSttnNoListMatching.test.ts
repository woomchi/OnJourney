import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TagoBusService } from '@/lib/transit/TagoBusService';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';

describe('getSttnNoList 기반 정류소 ID 식별 간소화 파이프라인 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCandidates = [
    {
      nodeId: 'BSB510040000',
      stationName: '자갈치역.비프광장',
      arsNo: '01713',
      lat: 35.0981248,
      lng: 129.0295041,
    },
    {
      nodeId: 'BSB510050000',
      stationName: '자갈치역.비프광장',
      arsNo: '01714',
      lat: 35.0978735,
      lng: 129.0291744,
    },
    {
      nodeId: 'BSB518080000',
      stationName: '자갈치역.비프광장',
      lat: 35.0978479,
      lng: 129.0290861,
    },
    {
      nodeId: 'BSB518090000',
      stationName: '자갈치역.비프광장',
      lat: 35.0981504,
      lng: 129.029587,
    },
  ];

  it('getSttnNoList 결과 중 1순위로 getSttnThrghRoutes(경유노선)를 확인하여 9번 버스 정류소를 선택하고 getArrivalInfo 호출을 생략한다', async () => {
    vi.spyOn(TagoBusService, 'getSttnListByName').mockResolvedValueOnce(mockCandidates);

    const thrghSpy = vi.spyOn(TagoBusService, 'getSttnThrghRoutes').mockImplementation(async (_city, nodeId) => {
      if (nodeId === 'BSB510040000') return ['9', '15', '26', '87'];
      if (nodeId === 'BSB518090000') return ['서구2-2'];
      return [];
    });

    const arrivalSpy = vi.spyOn(TagoBusService, 'getArrivalInfo');

    const result = await TagoBusService.resolveStationWithTargetBus({
      cityCode: '21',
      stationName: '자갈치역.비프광장',
      busNo: '9',
      lat: 35.0981,
      lng: 129.0295,
    });

    expect(thrghSpy).toHaveBeenCalled();
    // 경유노선 조회 성공 시 불필요한 실시간 도착 정보 API 호출이 생략됨을 검증
    expect(arrivalSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.nodeId).toBe('BSB510040000');
    expect(result?.arsNo).toBe('01713');
  });

  it('경유노선 조회가 실패하거나 빈 결과일 때 2순위로 실시간 도착 정보(getArrivalInfo)로 폴백하여 판별한다', async () => {
    vi.spyOn(TagoBusService, 'getSttnListByName').mockResolvedValueOnce(mockCandidates);
    vi.spyOn(TagoBusService, 'getSttnThrghRoutes').mockResolvedValue([]); // 경유노선 없음

    const arrivalSpy = vi.spyOn(TagoBusService, 'getArrivalInfo').mockImplementation(async (params) => {
      if (params.nodeId === 'BSB510040000') {
        return {
          stationId: 'BSB510040000',
          stationName: '자갈치역.비프광장',
          nextArrivals: [{ lineName: '9', arrivedInSeconds: 300, busType: 'normal' }],
          dataSource: 'tago',
          lastUpdated: Date.now(),
          reliability: 0.8,
        };
      }
      return {
        stationId: params.nodeId,
        stationName: '자갈치역.비프광장',
        nextArrivals: [],
        dataSource: 'tago',
        lastUpdated: Date.now(),
        reliability: 0.8,
      };
    });

    const result = await TagoBusService.resolveStationWithTargetBus({
      cityCode: '21',
      stationName: '자갈치역.비프광장',
      busNo: '9',
      lat: 35.0981,
      lng: 129.0295,
    });

    expect(arrivalSpy).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.nodeId).toBe('BSB510040000');
    expect(result?.arsNo).toBe('01713');
  });

  it('서구2-2 마을버스가 타겟일 때 getSttnThrghRoutes를 통해 서구2-2 정류소를 정확히 선택한다', async () => {
    vi.spyOn(TagoBusService, 'getSttnListByName').mockResolvedValueOnce(mockCandidates);

    vi.spyOn(TagoBusService, 'getSttnThrghRoutes').mockImplementation(async (_city, nodeId) => {
      if (nodeId === 'BSB518090000') return ['서구2-2'];
      if (nodeId === 'BSB510040000') return ['9', '15', '26'];
      return [];
    });

    const result = await TagoBusService.resolveStationWithTargetBus({
      cityCode: '21',
      stationName: '자갈치역.비프광장',
      busNo: '서구2-2',
      lat: 35.0981,
      lng: 129.0295,
    });

    expect(result).not.toBeNull();
    expect(result?.nodeId).toBe('BSB518090000');
  });

  it('RealtimeTransitService에서 stationId: auto일 때 getSttnNoList 간소화 파이프라인이 호출된다', async () => {
    const resolveSpy = vi.spyOn(TagoBusService, 'resolveStationWithTargetBus').mockResolvedValueOnce({
      nodeId: 'BSB510040000',
      stationName: '자갈치역.비프광장',
      arsNo: '01713',
    });

    vi.spyOn(TagoBusService, 'getArrivalInfo').mockResolvedValueOnce({
      stationId: 'BSB510040000',
      stationName: '자갈치역.비프광장',
      nextArrivals: [{ lineName: '9', arrivedInSeconds: 450, busType: 'normal' }],
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.85,
    });

    const res = await RealtimeTransitService.getBusArrivals({
      region: 'busan',
      stationId: 'auto',
      stationName: '자갈치역.비프광장',
      busNo: '9',
      lat: 35.0981,
      lng: 129.0295,
    });

    expect(resolveSpy).toHaveBeenCalledWith({
      cityCode: '21',
      stationName: '자갈치역.비프광장',
      busNo: '9',
      lat: 35.0981,
      lng: 129.0295,
    });
    expect(res.stationId).toBe('BSB510040000');
  });
});
