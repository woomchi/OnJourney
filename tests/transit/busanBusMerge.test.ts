import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';
import { BusanBusService } from '@/lib/transit/BusanBusService';
import { TagoBusService } from '@/lib/transit/TagoBusService';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';

describe('부산 권역 버스 도착 정보 지능형 병합 (Hybrid Merge) 검증', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('부산 BIMS(마을버스)와 TAGO(일반 시내버스)가 병렬로 병합되어 모든 버스가 누락 없이 반환되어야 한다', async () => {
    // 1. 부산 BIMS 모의 데이터 (마을버스만 제공하는 상황)
    const mockBusanData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'busan',
      lastUpdated: Date.now(),
      reliability: 0.85,
      nextArrivals: [
        {
          lineId: 'BUSAN_사하1',
          lineName: '사하1',
          arrivedInSeconds: 300,
          busType: 'circulation',
          destination: '종점 방향',
        },
      ],
    };

    // 2. TAGO 모의 데이터 (일반 시내버스/급행버스 제공)
    const mockTagoData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.8,
      nextArrivals: [
        {
          lineId: 'TAGO_1001',
          lineName: '1001',
          arrivedInSeconds: 180,
          busType: 'express',
          destination: '기장교리',
        },
        {
          lineId: 'TAGO_20',
          lineName: '20',
          arrivedInSeconds: 420,
          busType: 'normal',
          destination: '용호동',
        },
      ],
    };

    vi.spyOn(BusanBusService, 'getArrivalInfo').mockResolvedValue(mockBusanData);
    vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger').mockResolvedValue(mockTagoData);

    const result = await RealtimeTransitService.getBusArrivals({
      region: 'busan',
      stationId: 'BSB219000257',
      stationName: '부산역',
    });

    expect(result).toBeDefined();
    // 마을버스 1개 + 일반버스 2개 = 총 3개 노선이 모두 존재해야 함
    expect(result.nextArrivals.length).toBe(3);

    const lineNames = result.nextArrivals.map((it) => it.lineName);
    expect(lineNames).toContain('사하1');
    expect(lineNames).toContain('1001');
    expect(lineNames).toContain('20');

    // 시간 순 정렬 확인 (180초(1001) -> 300초(사하1) -> 420초(20))
    expect(result.nextArrivals[0].lineName).toBe('1001');
    expect(result.nextArrivals[1].lineName).toBe('사하1');
    expect(result.nextArrivals[2].lineName).toBe('20');

    // 머지 소스 확인
    expect(result.mergedSources).toContain('busan');
    expect(result.mergedSources).toContain('tago');
  });

  it('동일 노선이 양쪽에 존재할 때 중복 없이 병합되며 모호한 종점 정보가 TAGO 정보로 보강되어야 한다', async () => {
    const mockBusanData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'busan',
      lastUpdated: Date.now(),
      reliability: 0.85,
      nextArrivals: [
        {
          lineId: 'BUSAN_1001',
          lineName: '1001',
          arrivedInSeconds: 240,
          busType: 'express',
          destination: '종점 방향', // 모호한 종점 방향
        },
      ],
    };

    const mockTagoData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.8,
      nextArrivals: [
        {
          lineId: 'TAGO_1001',
          lineName: '1001',
          arrivedInSeconds: 230,
          busType: 'express',
          destination: '기장교리차고지', // 구체적 행선지
          currentStationSequence: 2,
        },
      ],
    };

    vi.spyOn(BusanBusService, 'getArrivalInfo').mockResolvedValue(mockBusanData);
    vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger').mockResolvedValue(mockTagoData);

    const result = await RealtimeTransitService.getBusArrivals({
      region: 'busan',
      stationId: 'BSB219000257',
      stationName: '부산역',
    });

    // 중복 제거되어 1개만 존재
    expect(result.nextArrivals.length).toBe(1);
    expect(result.nextArrivals[0].lineName).toBe('1001');
    // 모호했던 '종점 방향'이 TAGO의 구체적 행선지로 보강되었는지 검증
    expect(result.nextArrivals[0].destination).toBe('기장교리차고지');
    expect(result.nextArrivals[0].currentStationSequence).toBe(2);
  });

  it('부산 BIMS API가 오류로 실패해도 TAGO 시내버스 데이터가 정상 반환되어야 한다 (내결함성)', async () => {
    const mockTagoData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.8,
      nextArrivals: [
        {
          lineId: 'TAGO_1001',
          lineName: '1001',
          arrivedInSeconds: 180,
          busType: 'express',
          destination: '기장교리',
        },
      ],
    };

    vi.spyOn(BusanBusService, 'getArrivalInfo').mockRejectedValue(new Error('부산 BIMS 타임아웃'));
    vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger').mockResolvedValue(mockTagoData);

    const result = await RealtimeTransitService.getBusArrivals({
      region: 'busan',
      stationId: 'BSB219000257',
      stationName: '부산역',
    });

    expect(result).toBeDefined();
    expect(result.nextArrivals.length).toBe(1);
    expect(result.nextArrivals[0].lineName).toBe('1001');
    expect(result.dataSource).toBe('tago');
  });

  it('TAGO API에 결과가 없고 부산 BIMS에만 마을버스가 있을 때도 정상 반환되어야 한다', async () => {
    const mockBusanData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'busan',
      lastUpdated: Date.now(),
      reliability: 0.85,
      nextArrivals: [
        {
          lineId: 'BUSAN_사하1',
          lineName: '사하1',
          arrivedInSeconds: 300,
          busType: 'circulation',
          destination: '종점 방향',
        },
      ],
    };

    const emptyTagoData: NormalizedRealtimeData = {
      stationId: 'BSB219000257',
      stationName: '부산역',
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.4,
      nextArrivals: [],
    };

    vi.spyOn(BusanBusService, 'getArrivalInfo').mockResolvedValue(mockBusanData);
    vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger').mockResolvedValue(emptyTagoData);

    const result = await RealtimeTransitService.getBusArrivals({
      region: 'busan',
      stationId: 'BSB219000257',
      stationName: '부산역',
    });

    expect(result).toBeDefined();
    expect(result.nextArrivals.length).toBe(1);
    expect(result.nextArrivals[0].lineName).toBe('사하1');
  });
});
