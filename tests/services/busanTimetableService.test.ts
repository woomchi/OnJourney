import { describe, it, expect } from 'vitest';
import {
  getBusanTimetableDatabase,
  getBusanNextTrain,
  getBusanTimetableList,
  resolveBusanWeekTag,
  resolveOfficialBusanStationName,
  normalizeBusanLineNumber,
} from '@/lib/services/subway/busanTimetableService';
import {
  fetchBusanSubwayArrivals,
  fetchBusanStationUpcomingTimetable,
  getBusanLineStations,
  isBusanSubwayStation,
} from '@/lib/services/busanSubwayService';

describe('busanTimetableService (로컬 DB 기반 부산 자체 시간표)', () => {
  it('단일 압축 DB(busan_subway_timetables.json.gz)가 인메모리로 정상 로드되어야 한다', () => {
    const db = getBusanTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.totalStations).toBeGreaterThanOrEqual(100);
    expect(db?.data['부산']).toBeDefined();
    expect(db?.data['서면']).toBeDefined();
    expect(db?.data['해운대']).toBeDefined();
  });

  it('역명 별칭 및 정규화가 정확히 수행되어야 한다', () => {
    expect(resolveOfficialBusanStationName('부산역')).toBe('부산');
    expect(resolveOfficialBusanStationName('부산')).toBe('부산');
    expect(resolveOfficialBusanStationName('서면역')).toBe('서면');
    expect(resolveOfficialBusanStationName('서면_1')).toBe('서면');
    expect(resolveOfficialBusanStationName('해운대역')).toBe('해운대');
  });

  it('호선 식별자 정규화가 올바르게 동작해야 한다', () => {
    expect(normalizeBusanLineNumber('부산 1호선')).toBe('1');
    expect(normalizeBusanLineNumber('S2601')).toBe('1');
    expect(normalizeBusanLineNumber('2호선')).toBe('2');
    expect(normalizeBusanLineNumber('3')).toBe('3');
    expect(normalizeBusanLineNumber('L2604')).toBe('4');
  });

  it('요일 태그가 평일, 토요일, 공휴일(일요일 포함)로 올바르게 계산되어야 한다', () => {
    // 2026-09-18 (금요일) -> 평일
    expect(resolveBusanWeekTag(new Date('2026-09-18T10:00:00'))).toBe('평일');
    // 2026-09-19 (토요일) -> 토요일
    expect(resolveBusanWeekTag(new Date('2026-09-19T10:00:00'))).toBe('토요일');
    // 2026-09-20 (일요일) -> 공휴일
    expect(resolveBusanWeekTag(new Date('2026-09-20T10:00:00'))).toBe('공휴일');
  });

  it('getBusanNextTrain이 기준 시각에 맞는 다음 열차 정보를 반환해야 한다', () => {
    // 평일 오전 8시 00분 기준
    const refDate = new Date('2026-09-18T08:00:00');
    const result = getBusanNextTrain({
      stationName: '부산역',
      updnLine: 'DOWN', // 다대포해수욕장 방면
      lineId: '1호선',
      referenceDate: refDate,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(true);
    expect(result?.arrivalTime).toBeDefined();
    expect(result?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(result?.statusText).toContain('분 후');
  });

  it('getBusanTimetableList가 노선도용 시간표 목록을 올바르게 반환해야 한다', () => {
    const refDate = new Date('2026-09-18T08:00:00');
    const list = getBusanTimetableList('서면', 'UP', '2호선', refDate, 5);

    expect(list.length).toBeGreaterThan(0);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].destStation).toBeDefined();
    expect(list[0].directionName).toContain('방면');
  });

  it('fetchBusanSubwayArrivals가 API 호출 없이 로컬 DB로부터 도착 정보를 생성해야 한다', async () => {
    const arrivals = await fetchBusanSubwayArrivals('부산역', '1', '부산 1호선');
    expect(arrivals).toBeDefined();
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals[0].statnNm).toBe('부산역');
    expect(arrivals[0].isRealtime).toBe(false);
  });

  it('fetchBusanStationUpcomingTimetable이 시간표 엔트리 목록을 반환해야 한다', async () => {
    const list = await fetchBusanStationUpcomingTimetable('서면', '부산 2호선', 4);
    expect(list).toBeDefined();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].depTime).toBeDefined();
  });

  it('전포역에 대해 상행/하행 시간표를 정상 반환해야 한다', async () => {
    const list = await fetchBusanStationUpcomingTimetable('전포', '부산 2호선', 30);
    expect(list.length).toBeGreaterThan(0);
    const up = list.filter((t) => t.drctType === '1');
    const down = list.filter((t) => t.drctType === '2');
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
  });

  it('부산 1~4호선 정차역 목록이 정상 반환되어야 한다', () => {
    expect(isBusanSubwayStation('부산역')).toBe(true);
    expect(isBusanSubwayStation('서면')).toBe(true);

    const line1 = getBusanLineStations('1호선');
    expect(line1.length).toBe(40);
    expect(line1[0].stationName).toBe('다대포해수욕장역');
    expect(line1[line1.length - 1].stationName).toBe('노포역');

    const line4 = getBusanLineStations('4호선');
    expect(line4.length).toBe(14);
  });

  it('서버가 UTC 환경일 때도 한국 시각(KST) 낮 11:45 기준으로 다음 열차를 정확히 계산해야 한다 (186분 후 첫차 버그 방지)', () => {
    // UTC 02:45:00Z -> 한국 표준시(KST) 11:45:00
    const mockUtcDate = new Date('2026-09-18T02:45:00Z');
    const result = getBusanNextTrain({
      stationName: '부산역',
      updnLine: 'DOWN',
      lineId: '1',
      referenceDate: mockUtcDate,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(true);
    // 11시 45분 기준 다음 열차는 11:46(1분 후) 또는 근접 열차여야 하며, 익일 첫차(186분 후)가 아니어야 함
    expect(result?.minutesLeft).toBeLessThan(15);
    expect(result?.arrivalTime).toBe('11:46');
  });
});
