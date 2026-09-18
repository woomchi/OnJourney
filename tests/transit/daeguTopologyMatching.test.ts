import { describe, it, expect, vi } from 'vitest';
import { resolveActualBoardingInfo } from '@/features/route/BusLineMapPanel';
import { DaeguBusService } from '@/lib/transit/DaeguBusService';
import { BusLineStation } from '@/types/journey';

describe('대구 버스 위상 매칭(Topology Matching) 및 순환선 검증', () => {
  // 대구 401번 버스 가상 정류소 데이터 (상행 1~3, 회차 4, 하행 5~7)
  // 동일한 '동대구역' 정류소가 상행(2번)과 하행(6번)에 모두 존재
  const daegu401Stations: BusLineStation[] = [
    { stationId: 'DGB_01', stationName: '갓바위', stationSeq: 1, lat: 35.98, lng: 128.70 },
    { stationId: 'DGB_02', stationName: '동대구역복합환승센터', stationSeq: 2, lat: 35.877, lng: 128.628, arsNo: '02001' },
    { stationId: 'DGB_03', stationName: '반월당역', stationSeq: 3, lat: 35.865, lng: 128.593 },
    { stationId: 'DGB_04', stationName: '범물동종점', stationSeq: 4, lat: 35.815, lng: 128.640, isTurningPoint: true },
    { stationId: 'DGB_05', stationName: '수성못역', stationSeq: 5, lat: 35.827, lng: 128.618 },
    { stationId: 'DGB_06', stationName: '동대구역복합환승센터', stationSeq: 6, lat: 35.878, lng: 128.629, arsNo: '02002' },
    { stationId: 'DGB_07', stationName: '갓바위종점', stationSeq: 7, lat: 35.98, lng: 128.70 },
  ];

  describe('1. 동일 역명 상·하행 위상 매칭 (resolveActualBoardingInfo)', () => {
    it('다음 정류소(nextStationName: 반월당역)가 주어지면 상행 동대구역(인덱스 1)을 확정해야 한다', () => {
      const result = resolveActualBoardingInfo({
        stations: daegu401Stations,
        turningStationSeq: 4,
        startStationName: '갓바위',
        endStationName: '갓바위종점',
        turningStationName: '범물동종점',
        stationName: '동대구역복합환승센터',
        nextStationName: '반월당역',
        stationId: 'auto', // 카카오 가상 ID
      });

      expect(result.index).toBe(1);
      expect(result.seq).toBe(2);
      expect(result.direction).toBe('0'); // 상행
    });

    it('다음 정류소(nextStationName: 갓바위종점)가 주어지면 하행 동대구역(인덱스 5)을 확정해야 한다', () => {
      const result = resolveActualBoardingInfo({
        stations: daegu401Stations,
        turningStationSeq: 4,
        startStationName: '갓바위',
        endStationName: '갓바위종점',
        turningStationName: '범물동종점',
        stationName: '동대구역복합환승센터',
        nextStationName: '갓바위종점',
        stationId: 'auto',
      });

      expect(result.index).toBe(5);
      expect(result.seq).toBe(6);
      expect(result.direction).toBe('1'); // 하행
    });

    it('도착지(destination: 범물동) 방향 단서만으로도 상행 동대구역(인덱스 1)을 채점 판정해야 한다', () => {
      const result = resolveActualBoardingInfo({
        stations: daegu401Stations,
        turningStationSeq: 4,
        startStationName: '갓바위',
        endStationName: '갓바위종점',
        turningStationName: '범물동종점',
        stationName: '동대구역복합환승센터',
        destination: '범물동종점',
      });

      expect(result.index).toBe(1);
      expect(result.direction).toBe('0');
    });

    it('고유 ARS 번호(02002)가 있을 경우 즉시 하행(인덱스 5)으로 매칭해야 한다', () => {
      const result = resolveActualBoardingInfo({
        stations: daegu401Stations,
        turningStationSeq: 4,
        stationName: '동대구역복합환승센터',
        stationId: '02002',
      });

      expect(result.index).toBe(5);
      expect(result.seq).toBe(6);
      expect(result.direction).toBe('1');
    });
  });

  describe('2. 대구 순환선(순환2 등) 풀 루프 노선 회차점 보정', () => {
    it('회차점 플래그가 없는 풀 루프 노선에서 getBusLinePositions는 중간 지점을 회차점으로 설정해야 한다', async () => {
      const mockStationsResponse = {
        response: {
          body: {
            items: {
              item: [
                { BS_ID: 'C01', BS_NM: '동대구역', seq: '1', GPS_Y: '35.87', GPS_X: '128.62' },
                { BS_ID: 'C02', BS_NM: '경북대학교', seq: '2', GPS_Y: '35.89', GPS_X: '128.61' },
                { BS_ID: 'C03', BS_NM: '북구청', seq: '3', GPS_Y: '35.88', GPS_X: '128.58' },
                { BS_ID: 'C04', BS_NM: '두류역', seq: '4', GPS_Y: '35.85', GPS_X: '128.55' },
                { BS_ID: 'C05', BS_NM: '반월당역', seq: '5', GPS_Y: '35.86', GPS_X: '128.59' },
                { BS_ID: 'C06', BS_NM: '동대구역', seq: '6', GPS_Y: '35.87', GPS_X: '128.62' },
              ],
            },
          },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockStationsResponse),
      } as Response);

      process.env.BUS_DATA_API_KEY = 'test_loop_key';

      const lineData = await DaeguBusService.getBusLinePositions({
        busNo: '순환2',
        routeId: 'DGB_LOOP2',
      });

      expect(lineData).toBeDefined();
      expect(lineData?.stations.length).toBe(6);
      // 6개 정류소의 절반인 인덱스 3 (두류역, seq: 4)이 회차점으로 자동 설정되어야 함
      expect(lineData?.turningStationName).toBe('두류역');
      expect(lineData?.turningStationSeq).toBe(4);
      expect(lineData?.busType).toBe('circulation');
      expect(lineData?.busColor).toBe('#D97706'); // 대구 순환선 테마 색상 (주황)
    });
  });
});
