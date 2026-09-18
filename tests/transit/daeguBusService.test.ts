import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaeguBusService } from '@/lib/transit/DaeguBusService';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';
import { TagoBusService } from '@/lib/transit/TagoBusService';
import { BusPositionService } from '@/lib/services/busPositionService';

describe('DaeguBusService 단위 및 연동 테스트', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BUS_DATA_API_KEY = 'test_mock_service_key';
  });

  describe('1. 대구 버스 유형 및 테마 색상 분류', () => {
    it('급행 버스(급행1~9)를 올바르게 판정하고 빨간색 테마를 반환해야 한다', () => {
      expect(DaeguBusService.parseDaeguBusType(undefined, '급행1')).toBe('express');
      expect(DaeguBusService.parseDaeguBusType('1', '급행5')).toBe('express');
      expect(DaeguBusService.resolveBusColor('express', '급행1')).toBe('#DC2626');
    });

    it('3자리 간선 버스(401, 726 등)를 올바르게 판정하고 파란색 테마를 반환해야 한다', () => {
      expect(DaeguBusService.parseDaeguBusType(undefined, '401')).toBe('normal');
      expect(DaeguBusService.parseDaeguBusType('2', '726')).toBe('normal');
      expect(DaeguBusService.resolveBusColor('normal', '401')).toBe('#2563EB');
    });

    it('순환 버스(순환2, 순환3)를 올바르게 판정하고 주황색 테마를 반환해야 한다', () => {
      expect(DaeguBusService.parseDaeguBusType(undefined, '순환2')).toBe('circulation');
      expect(DaeguBusService.parseDaeguBusType(undefined, '순환3-1')).toBe('circulation');
      expect(DaeguBusService.resolveBusColor('circulation', '순환2')).toBe('#D97706');
    });

    it('지선 버스(동구1, 수성1-1 등)를 올바르게 판정하고 초록색 테마를 반환해야 한다', () => {
      expect(DaeguBusService.parseDaeguBusType(undefined, '동구1')).toBe('circulation');
      expect(DaeguBusService.parseDaeguBusType(undefined, '수성1-1')).toBe('circulation');
      expect(DaeguBusService.resolveBusColor('circulation', '동구1')).toBe('#16A34A');
    });
  });

  describe('2. 실시간 도착 정보 조회 및 정규화 (getArrivalInfo)', () => {
    it('대구 API JSON 응답을 NormalizedRealtimeData 규격으로 올바르게 변환해야 한다', async () => {
      const mockApiResponse = {
        response: {
          header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
          body: {
            items: {
              item: [
                {
                  routeNo: '401',
                  routeId: 'DGB401',
                  arrvTime: '240',
                  remainStation: '2',
                  routeType: '2',
                  destination: '범물동',
                  lowBus: '1',
                  vehicleNo: '대구70자1234',
                },
                {
                  routeNo: '급행1',
                  routeId: 'DGB_EXP1',
                  arrvTime: '120',
                  remainStation: '1',
                  routeType: '1',
                  destination: '동호동',
                  lowBus: '0',
                  vehicleNo: '대구70자5678',
                },
              ],
            },
          },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockApiResponse),
      } as Response);

      const result = await DaeguBusService.getArrivalInfo('70110001', '동대구역복합환승센터');

      expect(result).toBeDefined();
      expect(result.dataSource).toBe('daegu');
      expect(result.stationId).toBe('70110001');
      expect(result.stationName).toBe('동대구역복합환승센터');
      expect(result.nextArrivals.length).toBe(2);

      // 도착 시간 오름차순 정렬 확인 (120초 급행1 -> 240초 401)
      expect(result.nextArrivals[0].lineName).toBe('급행1');
      expect(result.nextArrivals[0].arrivedInSeconds).toBe(120);
      expect(result.nextArrivals[0].busType).toBe('express');

      expect(result.nextArrivals[1].lineName).toBe('401');
      expect(result.nextArrivals[1].arrivedInSeconds).toBe(240);
      expect(result.nextArrivals[1].destination).toBe('범물동');
    });

    it('In-Memory L1 캐시 히트 시 외부 fetch 호출 없이 캐시 데이터를 반환해야 한다 (호출 0회)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // 이전 테스트에서 '70110001' 정류소 데이터가 캐시되었음
      const cachedResult = await DaeguBusService.getArrivalInfo('70110001', '동대구역복합환승센터');

      expect(cachedResult).toBeDefined();
      expect(cachedResult.nextArrivals.length).toBe(2);
      // fetch가 호출되지 않아야 함
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. 권역 라우터(RealtimeTransitService) 대구 분기 및 폴백', () => {
    it('대구 정류소(DGB 접두사 또는 daegu 권역) 요청 시 DaeguBusService를 최우선 호출해야 한다', async () => {
      const daeguSpy = vi.spyOn(DaeguBusService, 'getArrivalInfo').mockResolvedValueOnce({
        stationId: '700100',
        stationName: '반월당역',
        nextArrivals: [
          {
            lineId: '401',
            lineName: '401',
            arrivedInSeconds: 180,
            busType: 'normal',
          },
        ],
        dataSource: 'daegu',
        lastUpdated: Date.now(),
        reliability: 0.85,
      });

      const tagoSpy = vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger');

      const result = await RealtimeTransitService.getBusArrivals({
        region: 'daegu',
        stationId: 'DGB700100',
        stationName: '반월당역',
      });

      expect(daeguSpy).toHaveBeenCalled();
      expect(tagoSpy).not.toHaveBeenCalled();
      expect(result.dataSource).toBe('daegu');
      expect(result.nextArrivals[0].lineName).toBe('401');
    });

    it('대구 API 호출 실패 시 즉시 TAGO(cityCode: 22)로 스마트 폴백해야 한다', async () => {
      vi.spyOn(DaeguBusService, 'getArrivalInfo').mockRejectedValueOnce(new Error('Network timeout'));

      const tagoSpy = vi.spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger').mockResolvedValueOnce({
        stationId: '700100',
        stationName: '반월당역',
        nextArrivals: [
          {
            lineId: 'TAGO_401',
            lineName: '401',
            arrivedInSeconds: 200,
            busType: 'normal',
          },
        ],
        dataSource: 'tago',
        lastUpdated: Date.now(),
        reliability: 0.8,
      });

      const result = await RealtimeTransitService.getBusArrivals({
        region: 'daegu',
        stationId: '700100',
        stationName: '반월당역',
      });

      expect(tagoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cityCode: '22',
          region: 'daegu',
        })
      );
      expect(result.dataSource).toBe('tago');
    });
  });

  describe('4. 노선 뷰(BusPositionService) 대구 전용 파이프라인 연동', () => {
    it('대구 버스 노선 요청 시 DaeguBusService.getBusLinePositions를 최우선 호출해야 한다', async () => {
      const daeguSpy = vi.spyOn(DaeguBusService, 'getBusLinePositions').mockResolvedValueOnce({
        busNo: '401',
        routeId: 'DGB401',
        stations: [
          { stationId: 'ST1', stationName: '기점', stationSeq: 1, lat: 35.8, lng: 128.5 },
          { stationId: 'ST2', stationName: '종점', stationSeq: 2, lat: 35.9, lng: 128.6 },
        ],
        positions: [
          {
            vehicleno: '대구70자1234',
            nodeord: 1,
            stage: 'at_station',
          },
        ],
        busType: 'normal',
        busColor: '#2563EB',
        timestamp: Date.now(),
      });

      const result = await BusPositionService.getBusLinePositions({
        busNo: '401',
        region: 'daegu',
        cityCode: '22',
      });

      expect(daeguSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.busNo).toBe('401');
      expect(result?.busColor).toBe('#2563EB');
      expect(result?.stations.length).toBe(2);
      expect(result?.positions.length).toBe(1);
    });
  });
});
