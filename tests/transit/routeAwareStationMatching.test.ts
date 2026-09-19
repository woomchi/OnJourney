import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusanBusService } from '@/lib/transit/BusanBusService';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';
import { TagoBusService } from '@/lib/transit/TagoBusService';

describe('노선 인식형 정류소 매칭 (Route-Aware Station Matching) 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BusanBusService.findStationInRoute', () => {
    it('9번 버스 노선의 경유 정류소 목록에서 정류소명 일치 정류소 ID를 정확히 찾아낸다', async () => {
      vi.spyOn(BusanBusService, 'getBusLinePositions').mockResolvedValueOnce({
        busNo: '9',
        busId: '5200009000',
        routeId: '5200009000',
        stations: [
          { stationId: '1001', stationName: '청학동', stationSeq: 1, lat: 35.09, lng: 129.06 },
          { stationId: '1002', stationName: '자갈치역.비프광장', stationSeq: 2, lat: 35.0982, lng: 129.0289, arsNo: '01713' },
          { stationId: '1003', stationName: '남포동', stationSeq: 3, lat: 35.099, lng: 129.03 },
        ],
        positions: [],
        timestamp: Date.now(),
      });

      const matched = await BusanBusService.findStationInRoute('9', '자갈치역.비프광장');
      expect(matched).not.toBeNull();
      expect(matched?.stationId).toBe('1002');
      expect(matched?.stationName).toBe('자갈치역.비프광장');
    });

    it('동일 명칭 정류소가 복수(상행/하행) 존재할 때 좌표와 가장 가까운 정류소를 선택한다', async () => {
      vi.spyOn(BusanBusService, 'getBusLinePositions').mockResolvedValueOnce({
        busNo: '9',
        busId: '5200009000',
        routeId: '5200009000',
        stations: [
          // 하행 정류소 (서쪽 충무동 방면)
          { stationId: '2001', stationName: '자갈치역.비프광장', stationSeq: 5, lat: 35.0975, lng: 129.027 },
          // 상행 가변 정류소 (남포동 방면, 타겟 좌표와 더 가까움)
          { stationId: '2002', stationName: '자갈치역.비프광장', stationSeq: 20, lat: 35.0982, lng: 129.0289 },
        ],
        positions: [],
        timestamp: Date.now(),
      });

      const targetLat = 35.0982;
      const targetLng = 129.0289;
      const matched = await BusanBusService.findStationInRoute('9', '자갈치역.비프광장', targetLat, targetLng);

      expect(matched).not.toBeNull();
      expect(matched?.stationId).toBe('2002');
    });
  });

  describe('RealtimeTransitService 노선 인식형 역조회 연계', () => {
    it('부산 권역에서 stationId가 auto이고 busNo가 9일 때 노선 기반 정류소 매칭을 1순위로 실행한다', async () => {
      const resolveSpy = vi.spyOn(TagoBusService, 'resolveStationWithTargetBus').mockResolvedValueOnce({
        nodeId: 'BSB167000100',
        stationName: '자갈치역.비프광장',
      });

      const arrivalSpy = vi.spyOn(BusanBusService, 'getArrivalInfo').mockResolvedValueOnce({
        stationId: 'BSB167000100',
        stationName: '자갈치역.비프광장',
        nextArrivals: [
          {
            lineId: 'BUSAN_9',
            lineName: '9',
            arrivedInSeconds: 480,
            busType: 'normal',
          },
        ],
        dataSource: 'busan',
        lastUpdated: Date.now(),
        reliability: 0.85,
      });

      const result = await RealtimeTransitService.getBusArrivals({
        region: 'busan',
        stationId: 'auto',
        stationName: '자갈치역.비프광장',
        busNo: '9',
        lat: 35.0982,
        lng: 129.0289,
      });

      expect(resolveSpy).toHaveBeenCalledWith({
        cityCode: '21',
        stationName: '자갈치역.비프광장',
        busNo: '9',
        lat: 35.0982,
        lng: 129.0289,
      });
      expect(arrivalSpy).toHaveBeenCalledWith('BSB167000100', '자갈치역.비프광장');
      expect(result.nextArrivals.length).toBeGreaterThan(0);
      expect(result.nextArrivals[0].lineName).toBe('9');
    });

    it('busNo가 없거나 노선 매칭 실패 시 기존 좌표 역조회로 정상 폴백한다', async () => {
      const coordsLookupSpy = vi.spyOn(TagoBusService, 'lookupTagoNodeIdByCoords').mockResolvedValueOnce({
        nodeId: 'BSB167000999',
      });

      vi.spyOn(BusanBusService, 'getArrivalInfo').mockResolvedValueOnce({
        stationId: 'BSB167000999',
        stationName: '자갈치역.비프광장',
        nextArrivals: [],
        dataSource: 'busan',
        lastUpdated: Date.now(),
        reliability: 0.85,
      });

      const result = await RealtimeTransitService.getBusArrivals({
        region: 'busan',
        stationId: 'auto',
        stationName: '자갈치역.비프광장',
        lat: 35.0982,
        lng: 129.0289,
      });

      expect(coordsLookupSpy).toHaveBeenCalled();
      expect(result.stationId).toBe('BSB167000999');
    });
  });
});
