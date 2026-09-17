import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';
import { BusPositionService } from '@/lib/services/busPositionService';
import { GyeonggiBusService } from '@/lib/transit/GyeonggiBusService';
import { TagoBusService } from '@/lib/transit/TagoBusService';

describe('경기도 stationId=auto 및 권역 자동 교정 검증', () => {
  describe('inferRegionFromPlace 경기도 좌표 판별', () => {
    it('수원, 성남, 화성, 고양, 용인 등 경기도 좌표를 정확히 gyeonggi로 판별해야 한다', () => {
      // 수원 팔달구
      expect(inferRegionFromPlace({ lat: 37.2800, lng: 127.0100 })).toBe('gyeonggi');
      // 성남 분당/판교
      expect(inferRegionFromPlace({ lat: 37.3947, lng: 127.1112 })).toBe('gyeonggi');
      // 화성 동탄
      expect(inferRegionFromPlace({ lat: 37.1994, lng: 127.0789 })).toBe('gyeonggi');
      // 고양 일산
      expect(inferRegionFromPlace({ lat: 37.6600, lng: 126.7700 })).toBe('gyeonggi');
      // 용인 수지
      expect(inferRegionFromPlace({ lat: 37.3200, lng: 127.0900 })).toBe('gyeonggi');
      // 부천
      expect(inferRegionFromPlace({ lat: 37.5000, lng: 126.7600 })).toBe('gyeonggi');
    });

    it('서울 핵심 좌표는 seoul로 판별해야 한다', () => {
      expect(inferRegionFromPlace({ lat: 37.5665, lng: 126.9780 })).toBe('seoul'); // 서울시청
      expect(inferRegionFromPlace({ lat: 37.4979, lng: 127.0276 })).toBe('seoul'); // 강남역
      expect(inferRegionFromPlace({ lat: 37.5583, lng: 126.7944 })).toBe('seoul'); // 김포공항
    });
  });

  describe('BusPositionService 경기도 노선도 선제 획득', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('stationId=auto 및 region 미지정/오지정이더라도 경기도 좌표와 버스 번호로 findBestRoute를 호출해야 한다', async () => {
      const mockRoute = {
        routeId: '200000078',
        routeName: '7770',
        startStationName: '수원역',
        endStationName: '사당역',
      };

      const findBestRouteSpy = vi
        .spyOn(GyeonggiBusService, 'findBestRoute')
        .mockResolvedValueOnce(mockRoute as any);

      vi.spyOn(GyeonggiBusService, 'getRouteStationList').mockResolvedValueOnce({
        routeId: '200000078',
        stations: [
          { stationId: '200000001', stationName: '수원역', stationSeq: 1, lat: 37.266, lng: 127.000 },
          { stationId: '200000002', stationName: '사당역', stationSeq: 2, lat: 37.476, lng: 126.981 },
        ],
      } as any);

      vi.spyOn(GyeonggiBusService, 'getBusLocationList').mockResolvedValueOnce([
        { routeId: '200000078', stationSeq: 1, plateNo: '경기70바1234' },
      ] as any);

      const result = await BusPositionService.getBusLinePositions({
        busNo: '7770',
        stationId: 'auto',
        stationName: '수원역',
        lat: 37.266,
        lng: 127.000,
        region: 'seoul', // 서울로 잘못 전달된 경우
      });

      expect(findBestRouteSpy).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.busNo).toBe('7770');
      expect(result?.routeId).toBe('GGB200000078');
      expect(result?.stations.length).toBe(2);
    });
  });

  describe('RealtimeTransitService 경기도 도착 정보 라우팅', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('stationId=auto이고 경기도 좌표가 전달되면 서울 블록 대신 경기도 API 또는 TAGO 경기도로 호출해야 한다', async () => {
      const tagoSpy = vi
        .spyOn(TagoBusService, 'getArrivalInfoSmartNodeTrigger')
        .mockResolvedValueOnce({
          stationId: 'auto',
          stationName: '수원역',
          nextArrivals: [],
          dataSource: 'tago',
          lastUpdated: Date.now(),
          reliability: 0.8,
        });

      await RealtimeTransitService.getBusArrivals({
        region: 'seoul', // 서울로 잘못 전달됨
        stationId: 'auto',
        stationName: '수원역',
        lat: 37.266, // 수원 좌표
        lng: 127.000,
      });

      expect(tagoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'gyeonggi',
          cityCode: '31',
        })
      );
    });
  });
});
