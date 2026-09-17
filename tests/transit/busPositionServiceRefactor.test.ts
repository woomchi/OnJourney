import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusPositionService, normalizeStationName } from '@/lib/services/busPositionService';
import { BusanBusService } from '@/lib/transit/BusanBusService';
import { GyeonggiBusService } from '@/lib/transit/GyeonggiBusService';
import { TagoBusService } from '@/lib/transit/TagoBusService';
import { BusRoutePersistentCache } from '@/lib/infrastructure/busRoutePersistentCache';

describe('BusPositionService 리팩토링 및 최적화 검증', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeStationName 정규화 유틸리티', () => {
    it('접미사(정류소, 정류장, 역) 및 공백을 일관되게 제거해야 한다', () => {
      expect(normalizeStationName('강남역')).toBe('강남');
      expect(normalizeStationName('수원역정류소')).toBe('수원');
      expect(normalizeStationName('판교역정류장')).toBe('판교');
      expect(normalizeStationName('서울역버스환승센터')).toBe('서울역버스환승센터');
      expect(normalizeStationName('사당역 ')).toBe('사당');
      expect(normalizeStationName('')).toBe('');
      expect(normalizeStationName(undefined)).toBe('');
    });
  });

  describe('타 권역(부산 등) 선제 라우팅 검증', () => {
    it('부산 좌표나 권역이 전달된 경우, 경기도 findBestRoute를 호출하지 않고 부산 BIMS를 최우선 호출해야 한다', async () => {
      const ggbSpy = vi.spyOn(GyeonggiBusService, 'findBestRoute');
      const busanSpy = vi.spyOn(BusanBusService, 'getBusLinePositions').mockResolvedValueOnce({
        busNo: '1001',
        busId: '52001',
        routeId: '52001001',
        stations: [
          { stationId: 'BSB1', stationName: '부산역', stationSeq: 1, lat: 35.115, lng: 129.04, isTurningPoint: false, edgePoints: null },
          { stationId: 'BSB2', stationName: '서면역', stationSeq: 2, lat: 35.157, lng: 129.05, isTurningPoint: false, edgePoints: null },
        ],
        positions: [],
        timestamp: Date.now(),
      });

      const result = await BusPositionService.getBusLinePositions({
        busNo: '1001',
        region: 'busan',
        stationName: '부산역',
        lat: 35.115,
        lng: 129.04,
      });

      expect(busanSpy).toHaveBeenCalled();
      expect(ggbSpy).not.toHaveBeenCalled();
      expect(result?.busNo).toBe('1001');
      expect(result?.stations.length).toBe(2);
    });
  });

  describe('캐시 우선(Cache-First) 구조 검증', () => {
    it('영속 캐시에 노선 정보가 존재하는 경우, findBestRoute나 외부 API 호출 없이 즉시 캐시 데이터를 반환해야 한다', async () => {
      const ggbSpy = vi.spyOn(GyeonggiBusService, 'findBestRoute');
      const tagoPosSpy = vi.spyOn(TagoBusService, 'getBusLocationInfoMulti').mockResolvedValueOnce([]);

      const mockCachedRoute = {
        busNo: '7770',
        busId: 'GGB200000078',
        routeId: 'GGB200000078',
        stations: [
          { stationId: '1', stationName: '수원역', stationSeq: 1, lat: 37.266, lng: 127.000, isTurningPoint: false, edgePoints: null },
          { stationId: '2', stationName: '사당역', stationSeq: 2, lat: 37.476, lng: 126.981, isTurningPoint: false, edgePoints: null },
        ],
        stationIndexMap: new Map<string, number>([
          ['1', 0],
          ['seq:1', 0],
          ['name:수원역', 0],
          ['2', 1],
          ['seq:2', 1],
          ['name:사당역', 1],
        ]),
        upStationIndexMap: new Map<string, number>(),
        downStationIndexMap: new Map<string, number>(),
      };

      vi.spyOn(BusRoutePersistentCache, 'get').mockResolvedValueOnce(mockCachedRoute);

      const result = await BusPositionService.getBusLinePositions({
        busNo: '7770',
        routeId: 'GGB200000078',
        stationName: '수원역',
        cityCode: '31',
      });

      // 캐시 적중 시 findBestRoute가 절대 호출되지 않아야 함
      expect(ggbSpy).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.busNo).toBe('7770');
      expect(result?.stations.length).toBe(2);
    });
  });

  describe('실시간 버스 위치 매핑 시 차량 중복 필터링 검증', () => {
    it('TAGO 실시간 버스 위치 목록에서 동일한 차량번호가 중복 수신되어도 1대만 반환해야 한다', async () => {
      const mockCachedRoute = {
        busNo: '100',
        busId: '100100001',
        routeId: '100100001',
        stations: [
          { stationId: '1', stationName: '하계동', stationSeq: 1, lat: 37.64, lng: 127.07, isTurningPoint: false, edgePoints: null },
          { stationId: '2', stationName: '용산역', stationSeq: 2, lat: 37.52, lng: 126.96, isTurningPoint: false, edgePoints: null },
        ],
        stationIndexMap: new Map<string, number>([
          ['1', 0],
          ['seq:1', 0],
          ['name:하계동', 0],
          ['2', 1],
          ['seq:2', 1],
          ['name:용산역', 1],
        ]),
        upStationIndexMap: new Map<string, number>(),
        downStationIndexMap: new Map<string, number>(),
      };

      vi.spyOn(BusRoutePersistentCache, 'get').mockResolvedValue(mockCachedRoute as any);

      // 동일 차량 서울74사1234가 2건 전달된 상황 모킹
      vi.spyOn(TagoBusService, 'getBusLocationInfoMulti').mockResolvedValueOnce([
        { vehicleno: '서울74사1234', nodeord: 1, nodenm: '하계동', gpslati: 37.64, gpslong: 127.07 },
        { vehicleno: '서울74사1234', nodeord: 1, nodenm: '하계동', gpslati: 37.64, gpslong: 127.07 },
        { vehicleno: '서울74사5678', nodeord: 2, nodenm: '용산역', gpslati: 37.52, gpslong: 126.96 },
      ]);

      const result = await BusPositionService.getBusLinePositions({
        busNo: '100',
        routeId: '100100001',
        cityCode: '11',
      });

      expect(result?.positions.length).toBe(2);
      expect(result?.positions.map(p => p.vehicleno)).toEqual(['서울74사1234', '서울74사5678']);
    });
  });
});
