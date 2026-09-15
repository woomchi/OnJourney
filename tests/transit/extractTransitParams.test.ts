import { describe, it, expect } from 'vitest';
import { extractTransitParams } from '@/components/transit/SegmentRealtimeArrivalHero';
import type { DirectionStep, Place } from '@/types/journey';

describe('extractTransitParams 환승 정류소 및 좌표 복원 테스트 (H-1)', () => {
  const mockOriginPlace: Place = {
    id: 'origin-1',
    place_name: '강남역 2번출구',
    address: '서울시 강남구',
    category: '지하철역',
    lat: 37.4979,
    lng: 127.0276,
  };

  it('1번째 스텝(currentIndex === 0)에서 정보 누락 시 originPlace를 폴백으로 사용한다', () => {
    const step: DirectionStep = {
      type: 'bus',
      name: '146',
      instruction: '146번 버스 탑승',
      distance: 2000,
      duration: 600,
    };

    const result = extractTransitParams({ step, originalIndex: 0 }, mockOriginPlace, 0);

    expect(result.busStationName).toBe('강남역 2번출구');
    expect(result.busLat).toBe(37.4979);
    expect(result.busLng).toBe(127.0276);
    expect(result.busStationId).toBe('auto');
  });

  it('환승 스텝(currentIndex === 1)에서 직전 스텝이 도보일 때 도보 도착지 정보를 탑승지로 사용한다', () => {
    const prevWalkStep: DirectionStep = {
      type: 'walk',
      name: '도보 이동',
      instruction: '정류장까지 걷기',
      distance: 100,
      duration: 120,
      endName: '역삼역 정류소',
      endY: 37.5005,
      endX: 127.0365,
    };

    const step: DirectionStep = {
      type: 'bus',
      name: '341',
      instruction: '341번 버스 탑승',
      distance: 3000,
      duration: 900,
    };

    const result = extractTransitParams({ step, originalIndex: 2, prevStep: prevWalkStep }, mockOriginPlace, 1);

    expect(result.busStationName).toBe('역삼역 정류소');
    expect(result.busLat).toBe(37.5005);
    expect(result.busLng).toBe(127.0365);
    expect(result.busStationId).toBe('auto');
  });

  it('[H-1 핵심] 직전 스텝이 지하철이고 도보 스텝이 없는 직통 환승 시, 지하철 하차역과 좌표를 환승 버스 탑승지로 복원한다', () => {
    const prevSubwayStep: DirectionStep = {
      type: 'subway',
      name: '2호선',
      instruction: '2호선 탑승 후 선릉역 하차',
      distance: 2500,
      duration: 300,
      startName: '강남',
      endName: '선릉역',
      endY: 37.5045,
      endX: 127.0490,
      pathPoints: [
        { lat: 37.4979, lng: 127.0276 },
        { lat: 37.5045, lng: 127.0490 },
      ],
    };

    // startName, startY/startX 등이 누락된 환승 버스 스텝
    const transferBusStep: DirectionStep = {
      type: 'bus',
      name: '472',
      instruction: '472번 환승 탑승',
      distance: 4000,
      duration: 1200,
    };

    const result = extractTransitParams(
      { step: transferBusStep, originalIndex: 1, prevStep: prevSubwayStep },
      mockOriginPlace,
      1 // 2번째 대중교통 스텝
    );

    // 지하철 하차지점(선릉역 및 좌표)으로 안전하게 복원되었는지 검증
    expect(result.busStationName).toBe('선릉역');
    expect(result.busLat).toBe(37.5045);
    expect(result.busLng).toBe(127.0490);
    // 출발지(강남역 2번출구, 37.4979)로 오염되지 않았는지 확인
    expect(result.busStationName).not.toBe('강남역 2번출구');
    expect(result.busLat).not.toBe(mockOriginPlace.lat);
    // 좌표 복원을 통해 busStationId가 'auto'로 생성되었는지 확인
    expect(result.busStationId).toBe('auto');
  });

  it('스텝 자체에 startName 및 좌표가 정의되어 있으면 직전 스텝보다 우선한다', () => {
    const prevSubwayStep: DirectionStep = {
      type: 'subway',
      name: '2호선',
      endName: '선릉역',
      endY: 37.5045,
      endX: 127.0490,
      distance: 1000,
      duration: 200,
    };

    const transferBusStep: DirectionStep = {
      type: 'bus',
      name: '472',
      startName: '선릉역 1번출구',
      startY: 37.5048,
      startX: 127.0493,
      distance: 4000,
      duration: 1200,
    };

    const result = extractTransitParams(
      { step: transferBusStep, originalIndex: 1, prevStep: prevSubwayStep },
      mockOriginPlace,
      1
    );

    expect(result.busStationName).toBe('선릉역 1번출구');
    expect(result.busLat).toBe(37.5048);
    expect(result.busLng).toBe(127.0493);
  });
});
