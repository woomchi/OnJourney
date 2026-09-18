import { describe, it, expect } from 'vitest';
import { resolveActualBoardingInfo } from '@/features/route/BusLineMapPanel';
import type { BusLineStation } from '@/types/journey';

describe('Bus Station Topology Sequence & Pass-stop Reverse Mapping (Option A)', () => {
  // Mock Bus 307 dataset (Busan BIMS pattern)
  // Total 119 stations.
  // Seq 5 (idx 4): 장산역 (arsNo: '09060', next: '동일아파트') -> Heading to Gimhae Airport / Haeundae
  // Turning seq: 58 (김해공항)
  // Seq 115 (idx 114): 장산역 (arsNo: '09338', next: '벽산아파트') -> Heading to Songjeong
  // Seq 118 (idx 117): 송정1단지주공 (arsNo: '09011')
  const mockBus307Stations: BusLineStation[] = [
    { stationSeq: 1, stationName: '송정종점', stationId: '1001', arsNo: '09001', lat: 35.178, lng: 129.201 },
    { stationSeq: 4, stationName: '해운대센트럴픽', stationId: '1004', arsNo: '09059', lat: 35.168, lng: 129.176 },
    { stationSeq: 5, stationName: '장산역', stationId: '1005', arsNo: '09060', lat: 35.169, lng: 129.177 },
    { stationSeq: 6, stationName: '동일아파트', stationId: '1006', arsNo: '09082', lat: 35.170, lng: 129.178 },
    { stationSeq: 58, stationName: '김해공항', stationId: '1058', arsNo: '12001', lat: 35.173, lng: 128.946 },
    { stationSeq: 114, stationName: '부흥고해운대백병원', stationId: '1114', arsNo: '09337', lat: 35.171, lng: 129.178 },
    { stationSeq: 115, stationName: '장산역', stationId: '1115', arsNo: '09338', lat: 35.169, lng: 129.177 },
    { stationSeq: 116, stationName: '벽산아파트', stationId: '1116', arsNo: '09256', lat: 35.172, lng: 129.179 },
    { stationSeq: 117, stationName: '송정해수욕장입구', stationId: '1117', arsNo: '09010', lat: 35.179, lng: 129.199 },
    { stationSeq: 118, stationName: '송정1단지주공', stationId: '1118', arsNo: '09011', lat: 35.180, lng: 129.200 },
    { stationSeq: 119, stationName: '송정종점', stationId: '1119', arsNo: '09002', lat: 35.178, lng: 129.201 },
  ];

  const turningStationSeq = 58;
  const startStationName = '송정종점';
  const turningStationName = '김해공항';
  const endStationName = '송정종점';

  it('should correctly select 09338 (downstream / direction 1) when heading to Songjeong with nextStationName and destination', () => {
    // User scenario: At 장산역, taking bus 307 to 송정1단지주공
    // In Kakao Transit, stationId is 'auto' (virtual)
    const result = resolveActualBoardingInfo({
      stations: mockBus307Stations,
      turningStationSeq,
      startStationName,
      endStationName,
      turningStationName,
      stationId: 'auto',
      stationName: '장산역',
      destination: '송정1단지주공',
      nextStationName: '벽산아파트',
      stationCount: 3,
    });

    expect(result.index).toBe(6); // index of stationSeq 115 in mockBus307Stations
    expect(result.seq).toBe(115);
    expect(mockBus307Stations[result.index].arsNo).toBe('09338');
    expect(result.direction).toBe('1'); // Haeng (downstream towards Songjeong)
  });

  it('should correctly select 09060 (upstream / direction 0) when heading towards Gimhae Airport', () => {
    const result = resolveActualBoardingInfo({
      stations: mockBus307Stations,
      turningStationSeq,
      startStationName,
      endStationName,
      turningStationName,
      stationId: 'auto',
      stationName: '장산역',
      destination: '김해공항',
      nextStationName: '동일아파트',
      stationCount: 2,
    });

    expect(result.index).toBe(2); // index of stationSeq 5 in mockBus307Stations
    expect(result.seq).toBe(5);
    expect(mockBus307Stations[result.index].arsNo).toBe('09060');
    expect(result.direction).toBe('0'); // Sang (upstream towards Gimhae Airport)
  });

  it('should select correct candidate based solely on downstream destination reachability even if nextStationName is missing', () => {
    const result = resolveActualBoardingInfo({
      stations: mockBus307Stations,
      turningStationSeq,
      startStationName,
      endStationName,
      turningStationName,
      stationId: 'auto',
      stationName: '장산역',
      destination: '송정1단지주공',
      stationCount: 3,
    });

    expect(result.seq).toBe(115);
    expect(mockBus307Stations[result.index].arsNo).toBe('09338');
    expect(result.direction).toBe('1');
  });

  it('should prioritize exact stationId / arsNo match when available', () => {
    const result = resolveActualBoardingInfo({
      stations: mockBus307Stations,
      turningStationSeq,
      startStationName,
      endStationName,
      turningStationName,
      stationId: '09338',
      stationName: '장산역',
    });

    expect(result.seq).toBe(115);
    expect(result.direction).toBe('1');
  });
});
