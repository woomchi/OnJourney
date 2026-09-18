/**
 * @fileoverview 대구 도시철도(1~3호선) 및 대경선 시간표 엔진 & 라우터 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  getDaeguTimetableDatabase,
  resolveOfficialDaeguStationName,
  getNextTrainsFromDaeguTimetable,
  resolveDaeguDirection,
  resolveDaeguDayType,
} from '@/lib/services/subway/daeguTimetableService';
import { fetchDaeguSubwayArrivals } from '@/lib/services/daeguSubwayService';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';

describe('대구 도시철도 & 대경선 시간표 DB 및 엔진 테스트', () => {
  it('단일 압축 DB(daegu_subway_timetables.json.gz)가 정상 로드되고 103개 역을 포함해야 함', () => {
    const db = getDaeguTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.totalStations).toBe(103);
    expect(db?.meta.lines['1']).toBe(35); // 2024 안심-하양 연장 반영
    expect(db?.meta.lines['2']).toBe(29);
    expect(db?.meta.lines['3']).toBe(30);
    expect(db?.meta.lines['대경선']).toBe(14);
  });

  it('역명 정규화가 정확하게 동작해야 함', () => {
    expect(resolveOfficialDaeguStationName('하양(대구가톨릭대)')).toBe('하양');
    expect(resolveOfficialDaeguStationName('하양역')).toBe('하양');
    expect(resolveOfficialDaeguStationName('청라언덕(신남)')).toBe('청라언덕');
    expect(resolveOfficialDaeguStationName('청라언덕2')).toBe('청라언덕');
    expect(resolveOfficialDaeguStationName('반월당2')).toBe('반월당');
    expect(resolveOfficialDaeguStationName('동대구역')).toBe('동대구');
    expect(resolveOfficialDaeguStationName('서대구역')).toBe('서대구');
  });

  it('대구 1호선 반월당역에서 다음 열차가 정상적으로 계산되어야 함', () => {
    // 평일 08:30 기준
    const baseDate = new Date('2026-09-18T08:30:00+09:00'); // 금요일
    const trains = getNextTrainsFromDaeguTimetable('반월당', '상행', '1', 2, baseDate);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].arrivalTime).toBeDefined();
    expect(trains[0].endSubwayStationNm).toBe('하양'); // 1호선 상선 종착역
    expect(trains[0].minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('대경선 구미역에서 하행(경산 방면) 열차가 정상 조회되어야 함', () => {
    // 평일 09:00 기준
    const baseDate = new Date('2026-09-18T09:00:00+09:00');
    const trains = getNextTrainsFromDaeguTimetable('구미', '하행', '대경선', 2, baseDate);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].trainNo.startsWith('K17')).toBe(true);
    expect(trains[0].endSubwayStationNm).toBe('경산');
  });

  it('심야 막차 이후 운행종료 및 첫차 안내가 표시되어야 함', () => {
    // 평일 03:00 (모든 열차 운행 종료 시간대)
    const midnight = new Date('2026-09-18T03:00:00+09:00');
    const trains = getNextTrainsFromDaeguTimetable('반월당', '상행', '1', 2, midnight);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].statusText.includes('운행종료')).toBe(true);
    expect(trains[0].canBoard).toBe(false);
  });
});

describe('대구 권역 감지 및 동명역 분기 테스트 (subwayRegionRouter)', () => {
  it('대구 고유역(반월당, 하양, 문양, 용지, 구미)은 daegu로 감지되어야 함', () => {
    expect(detectSubwayRegion({ station: '반월당' })).toBe('daegu');
    expect(detectSubwayRegion({ station: '하양' })).toBe('daegu');
    expect(detectSubwayRegion({ station: '문양' })).toBe('daegu');
    expect(detectSubwayRegion({ station: '칠곡경대병원' })).toBe('daegu');
    expect(detectSubwayRegion({ station: '구미' })).toBe('daegu');
    expect(detectSubwayRegion({ station: '서대구' })).toBe('daegu');
  });

  it('동명역(중앙로)에서 목적지가 대구 역인 경우 daegu로 라우팅되어야 함', () => {
    expect(
      detectSubwayRegion({
        station: '중앙로',
        destination: '반월당',
      })
    ).toBe('daegu');

    expect(
      detectSubwayRegion({
        station: '중앙로',
        headsign: '하양방면',
      })
    ).toBe('daegu');
  });

  it('동명역(중앙로)에서 목적지가 대전 역인 경우 daejeon으로 라우팅되어야 함', () => {
    expect(
      detectSubwayRegion({
        station: '중앙로',
        destination: '판암',
      })
    ).toBe('daejeon');
  });

  it('타 권역(서울, 부산, 대전) 감지가 침범되지 않아야 함', () => {
    expect(detectSubwayRegion({ station: '서면' })).toBe('busan');
    expect(detectSubwayRegion({ station: '해운대' })).toBe('busan');
    expect(detectSubwayRegion({ station: '유성온천' })).toBe('daejeon');
    expect(detectSubwayRegion({ station: '강남' })).toBe('seoul');
  });
});

describe('fetchDaeguSubwayArrivals 도착 정보 생성 테스트', () => {
  it('반월당역의 도착 정보가 표준 SubwayArrival 포맷으로 반환되어야 함', async () => {
    const arrivals = await fetchDaeguSubwayArrivals('반월당', '1', '1', '하양');
    expect(arrivals).toBeInstanceOf(Array);
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals[0]).toMatchObject({
      statnNm: '반월당',
      updnLine: '상행',
      isRealtime: false,
    });
    expect(arrivals[0].statusText).toBeDefined();
    expect(arrivals[0].minutesLeft).toBeGreaterThanOrEqual(0);
  });
});
