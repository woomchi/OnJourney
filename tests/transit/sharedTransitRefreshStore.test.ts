import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sharedTransitRefreshStore } from '@/lib/transit/sharedTransitRefreshStore';
import { getBusRefreshSharedKey, getSubwayRefreshSharedKey } from '@/lib/transit/transitSharedKey';

describe('transitSharedKey 헬퍼 함수', () => {
  describe('getBusRefreshSharedKey', () => {
    it('stationId 또는 cleanBusNo가 없으면 undefined를 반환한다', () => {
      expect(getBusRefreshSharedKey({ stationId: '', cleanBusNo: '100' })).toBeUndefined();
      expect(getBusRefreshSharedKey({ stationId: '123', cleanBusNo: '' })).toBeUndefined();
      expect(getBusRefreshSharedKey({})).toBeUndefined();
    });

    it('일반 정류소 ID와 버스 번호로 표준 공유 키를 생성한다', () => {
      const key = getBusRefreshSharedKey({
        region: 'gyeonggi',
        stationId: '200000001',
        cleanBusNo: '720-2',
      });
      expect(key).toBe('bus:gyeonggi:200000001:720-2');
    });

    it('region이 없으면 기본값 tago를 사용한다', () => {
      const key = getBusRefreshSharedKey({
        stationId: '12345',
        cleanBusNo: '100',
      });
      expect(key).toBe('bus:tago:12345:100');
    });

    it('stationId가 auto일 때 좌표 또는 stationName 기반 키를 생성한다', () => {
      const keyWithStation = getBusRefreshSharedKey({
        stationId: 'auto',
        stationName: '강남역',
        cleanBusNo: '146',
      });
      expect(keyWithStation).toBe('bus:tago:auto:강남역:146');

      const keyWithCoords = getBusRefreshSharedKey({
        stationId: 'auto',
        cleanBusNo: '146',
        lat: 37.497912,
        lng: 127.027612,
      });
      expect(keyWithCoords).toBe('bus:tago:auto:37.4979_127.0276:146');
    });
  });

  describe('getSubwayRefreshSharedKey', () => {
    it('stationName이 없으면 undefined를 반환한다', () => {
      expect(getSubwayRefreshSharedKey({ stationName: '' })).toBeUndefined();
      expect(getSubwayRefreshSharedKey({})).toBeUndefined();
    });

    it('지하철 파라미터로 표준 공유 키를 생성한다', () => {
      const key = getSubwayRefreshSharedKey({
        stationName: '강남',
        wayCode: '1',
        subwayId: '2호선',
        destination: '역삼방면',
        headsign: '성수행',
      });
      expect(key).toBe('subway:강남:1:2호선:역삼방면:성수행');
    });
  });
});

describe('sharedTransitRefreshStore', () => {
  const TEST_KEY = 'test:bus:session-1';

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[R-1] 하나의 sharedKey에 복수 핸들러가 등록되었을 때 triggerRefresh 호출 시 모든 핸들러가 실행된다', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const stateCallback1 = vi.fn();
    const stateCallback2 = vi.fn();

    const unsub1 = sharedTransitRefreshStore.subscribe(TEST_KEY, handler1, stateCallback1);
    const unsub2 = sharedTransitRefreshStore.subscribe(TEST_KEY, handler2, stateCallback2);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();

    // triggerRefresh 실행
    sharedTransitRefreshStore.triggerRefresh(TEST_KEY);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('[R-1] 한 핸들러에서 에러가 발생해도 다른 핸들러가 정상 실행된다 (예외 격리)', () => {
    const failingHandler = vi.fn().mockImplementation(() => {
      throw new Error('Handler 1 Failed');
    });
    const succeedingHandler = vi.fn();

    const unsub1 = sharedTransitRefreshStore.subscribe('test:error-isolation', failingHandler, vi.fn());
    const unsub2 = sharedTransitRefreshStore.subscribe('test:error-isolation', succeedingHandler, vi.fn());

    expect(() => {
      sharedTransitRefreshStore.triggerRefresh('test:error-isolation');
    }).not.toThrow();

    expect(failingHandler).toHaveBeenCalledTimes(1);
    expect(succeedingHandler).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('[R-3] maxRefreshCount(3회) 도달 시 status는 paused가 되고 buttonText는 재개로 전이된다', () => {
    const handler = vi.fn();
    let currentState: any = null;

    const unsub = sharedTransitRefreshStore.subscribe(
      'test:paused-state',
      handler,
      (state) => {
        currentState = state;
      },
      { intervalSeconds: 15, maxRefreshCount: 3 }
    );

    expect(currentState.status).toBe('active');
    expect(currentState.buttonText).toBe('15초');

    // 1회차 만료 (15초 경과) -> refreshCount 1
    vi.advanceTimersByTime(15000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(currentState.refreshCount).toBe(1);

    // fetch 완료 시뮬레이션
    sharedTransitRefreshStore.updateFetching('test:paused-state', false);

    // 2회차 만료 (15초 경과) -> refreshCount 2
    vi.advanceTimersByTime(15000);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(currentState.refreshCount).toBe(2);

    sharedTransitRefreshStore.updateFetching('test:paused-state', false);

    // 3회차 만료 (15초 경과) -> maxRefreshCount 도달하여 paused로 전이
    vi.advanceTimersByTime(15000);
    expect(currentState.status).toBe('paused');
    expect(currentState.buttonText).toBe('재개');
    expect(currentState.buttonTitle).toContain('자동 갱신 일시정지');

    // triggerRefresh 호출 시 다시 active로 재개되고 refreshCount가 0으로 리셋되는지 확인
    sharedTransitRefreshStore.triggerRefresh('test:paused-state');
    expect(currentState.status).toBe('active');
    expect(currentState.refreshCount).toBe(0);
    expect(handler).toHaveBeenCalledTimes(3);

    unsub();
  });

  it('autoStart: true로 신규 세션 등록 시 마운트 즉시 최초 1회 갱신 핸들러가 실행된다', async () => {
    const handler = vi.fn();
    const unsub = sharedTransitRefreshStore.subscribe(
      'test:autostart-immediate',
      handler,
      vi.fn(),
      { autoStart: true }
    );

    // 마이크로태스크 완료 대기
    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
  });
});
