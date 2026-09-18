import { describe, it, expect } from 'vitest';
import { getNextTrainFromSeoulTimetable } from '@/lib/services/subway/seoulTimetableService';
import { fetchDaejeonSubwayArrivals } from '@/lib/services/daejeonSubwayService';
import { fetchBusanSubwayArrivals } from '@/lib/services/busanSubwayService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('지하철 시간표 모드 심야 첫차 및 도착 시각 제공 검증', () => {
  it('수도권 시간표: 심야 새벽 03:00 조회 시 LAST_TRAIN_ENDED와 함께 익일 첫차 시각(05:xx)을 반환해야 한다', () => {
    const lateNightDate = new Date('2026-09-19T03:00:00+09:00'); // 새벽 3시
    const res = getNextTrainFromSeoulTimetable({
      stationName: '강남',
      updnLine: '내선',
      lineId: '2',
      referenceDate: lateNightDate,
    });

    expect(res).not.toBeNull();
    expect(res!.trainNo).toBe('LAST_TRAIN_ENDED');
    expect(res!.canBoard).toBe(false);
    expect(res!.statusText).toContain('운행 종료');
    // 첫차 시각이 제공되어야 함
    expect(res!.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(res!.minutesLeft).toBe(999);
  });

  it('Headway Fallback: 심야 운행 종료 시간대(02:00)에 첫차 05:30 대기 정보를 반환해야 한다', async () => {
    // calculateNextTrainFromTimetable의 Headway Fallback
    const res = await calculateNextTrainFromTimetable('가상역123', '상행');
    expect(res).not.toBeNull();
    // 현재 시각이 심야(00:46)이므로 운행종료 / 첫차 대기
    expect(res!.minutesLeft).toBe(999);
    expect(res!.arrivalTime).toBe('05:30');
    expect(res!.statusText).toContain('첫차 05:30 대기');
  });

  it('대전 도시철도: 심야 시간대 조회 시 수백~수천 분이 아닌 minutesLeft 999 및 첫차 시각을 반환해야 한다', async () => {
    process.env.SUBWAY_DATA_API_KEY = 'test_key';
    const originalFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: true,
        text: async () => JSON.stringify({
          response: {
            body: {
              items: {
                item: [
                  {
                    stNum: '104',
                    dayType: '1',
                    drctType: '1',
                    trainNo: '1001',
                    depTime: '05:30:00',
                    destStation: '판암',
                  },
                ],
              },
            },
          },
        }),
      } as any;
    };

    try {
      const arrivals = await fetchDaejeonSubwayArrivals('대전역', '1');
      expect(arrivals).toBeDefined();
      expect(arrivals.length).toBeGreaterThan(0);
      const first = arrivals[0];
      expect(first.isRealtime).toBe(false);
      expect(first.minutesLeft).toBe(999);
      expect(first.arrivalTime).toBe('05:30');
      expect(first.statusText).toContain('첫차');
      expect(first.canBoard).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('대구 도시철도: 심야 시간대 조회 시 minutesLeft 999 및 첫차 안내를 반환해야 한다', async () => {
    const { fetchDaeguSubwayArrivals } = await import('@/lib/services/daeguSubwayService');
    const arrivals = await fetchDaeguSubwayArrivals('반월당', '1', '대구 1호선');
    expect(arrivals).toBeDefined();
    expect(arrivals.length).toBeGreaterThan(0);
    const first = arrivals[0];
    expect(first.isRealtime).toBe(false);
    expect(first.minutesLeft).toBe(999);
    expect(first.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(first.statusText).toContain('첫차');
    expect(first.canBoard).toBe(false);
  });

  it('부산 도시철도: 심야 시간대 조회 시 minutesLeft 999 및 첫차 안내를 반환해야 한다', async () => {
    const arrivals = await fetchBusanSubwayArrivals('서면', '1', '부산 1호선');
    expect(arrivals).toBeDefined();
    expect(arrivals.length).toBeGreaterThan(0);
    const first = arrivals[0];
    expect(first.isRealtime).toBe(false);
    // 현재 새벽 심야이므로 운행종료 또는 익일 첫차
    expect(first.minutesLeft).toBe(999);
    expect(first.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(first.canBoard).toBe(false);
  });
});
