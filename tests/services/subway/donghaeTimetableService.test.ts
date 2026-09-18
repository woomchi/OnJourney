/**
 * @fileoverview 동해선 광역전철(부전~태화강) 시간표 엔진 & 라우터 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  getDonghaeTimetableDatabase,
  resolveOfficialDonghaeStationName,
  getNextTrainsFromDonghaeTimetable,
  getDonghaeLineStations,
  isDonghaeSubwayStation,
} from '@/lib/services/subway/donghaeTimetableService';
import {
  fetchDonghaeSubwayArrivals,
  inferDonghaeDirection,
} from '@/lib/services/donghaeSubwayService';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';

describe('동해선 시간표 DB 및 엔진 테스트', () => {
  it('단일 압축 DB(donghae_subway_timetables.json.gz)가 정상 로드되고 23개 역을 포함해야 함', () => {
    const db = getDonghaeTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.totalStations).toBe(23);
    expect(db?.meta.line).toBe('동해선');
    expect(db?.meta.stations.length).toBe(23);
    expect(db?.meta.stations[0]).toBe('부전');
    expect(db?.meta.stations[22]).toBe('태화강');
  });

  it('역명 정규화가 정확하게 동작해야 함', () => {
    expect(resolveOfficialDonghaeStationName('부교대')).toBe('교대');
    expect(resolveOfficialDonghaeStationName('교대역')).toBe('교대');
    expect(resolveOfficialDonghaeStationName('거제해')).toBe('거제해맞이');
    expect(resolveOfficialDonghaeStationName('거제해맞이역')).toBe('거제해맞이');
    expect(resolveOfficialDonghaeStationName('부산원')).toBe('부산원동');
    expect(resolveOfficialDonghaeStationName('신해운')).toBe('신해운대');
    expect(resolveOfficialDonghaeStationName('오시리')).toBe('오시리아');
    expect(resolveOfficialDonghaeStationName('태화강역')).toBe('태화강');
    expect(resolveOfficialDonghaeStationName('부전역')).toBe('부전');
  });

  it('부전역에서 하행(태화강 방면) 열차가 정상적으로 계산되어야 함', () => {
    // 평일 08:30 기준
    const baseDate = new Date('2026-09-18T08:30:00+09:00'); // 금요일
    const trains = getNextTrainsFromDonghaeTimetable('부전', 'DOWN', 2, baseDate);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].arrivalTime).toBeDefined();
    expect(trains[0].endSubwayStationNm).toBe('태화강');
    expect(trains[0].minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('태화강역에서 상행(부전 방면) 열차가 정상 조회되어야 함', () => {
    // 평일 07:00 기준
    const baseDate = new Date('2026-09-18T07:00:00+09:00');
    const trains = getNextTrainsFromDonghaeTimetable('태화강', 'UP', 2, baseDate);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].endSubwayStationNm).toBe('부전');
    expect(trains[0].arrivalTime).toBeDefined();
  });

  it('망양 시발/종착 중간 계통 열차가 정상 처리되어야 함', () => {
    // 망양역 평일 새벽 05:15 기준 (05:20 망양발 K8652 존재)
    const earlyMorning = new Date('2026-09-18T05:15:00+09:00');
    const mangyangTrains = getNextTrainsFromDonghaeTimetable('망양', 'UP', 2, earlyMorning);

    expect(mangyangTrains.length).toBeGreaterThan(0);
    expect(mangyangTrains[0].trainNo).toBe('K8652');
    expect(mangyangTrains[0].arrivalTime).toBe('05:20');
  });

  it('심야 막차 이후 운행종료 및 첫차 안내가 표시되어야 함', () => {
    // 평일 03:00 (운행 종료 시간대)
    const midnight = new Date('2026-09-18T03:00:00+09:00');
    const trains = getNextTrainsFromDonghaeTimetable('부전', 'DOWN', 2, midnight);

    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].statusText.includes('운행종료')).toBe(true);
    expect(trains[0].canBoard).toBe(false);
  });

  it('전체 23개 정차역 메타데이터가 올바른 순서로 제공되어야 함', () => {
    const stations = getDonghaeLineStations();
    expect(stations.length).toBe(23);
    expect(stations[0].stationName).toBe('부전');
    expect(stations[3].stationName).toBe('교대');
    expect(stations[3].stationId).toBe('DONGHAE_4');
    expect(stations[9].stationName).toBe('벡스코');
    expect(stations[9].stationId).toBe('DONGHAE_10');
    expect(stations[22].stationName).toBe('태화강');
  });
});

describe('동해선 방향 추론 및 실시간 도착정보 테스트 (donghaeSubwayService)', () => {
  it('목적지/방면 키워드로 운행 방향이 정확하게 추론되어야 함', () => {
    expect(inferDonghaeDirection('태화강역')).toBe('DOWN');
    expect(inferDonghaeDirection('일광')).toBe('DOWN');
    expect(inferDonghaeDirection('기장방면')).toBe('DOWN');
    expect(inferDonghaeDirection('부전역')).toBe('UP');
    expect(inferDonghaeDirection('벡스코방면')).toBe('UP');
    expect(inferDonghaeDirection('교대')).toBe('UP');
  });

  it('fetchDonghaeSubwayArrivals로 SubwayArrival[] 표준 규격이 반환되어야 함', async () => {
    const arrivals = await fetchDonghaeSubwayArrivals('오시리아', '1', '동해선');
    expect(arrivals).toBeDefined();
    expect(arrivals.length).toBeGreaterThan(0);
    expect(arrivals[0].statnNm).toBe('오시리아');
    expect(arrivals[0].subwayId).toBe('동해선');
    expect(arrivals[0].statusText).toBeDefined();
  });
});

describe('동해선 권역 감지 및 라우팅 테스트 (subwayRegionRouter)', () => {
  it('동해선 고유역은 busan 권역으로 자동 감지되어야 함', () => {
    expect(detectSubwayRegion({ station: '태화강' })).toBe('busan');
    expect(detectSubwayRegion({ station: '기장' })).toBe('busan');
    expect(detectSubwayRegion({ station: '일광' })).toBe('busan');
    expect(detectSubwayRegion({ station: '오시리아' })).toBe('busan');
    expect(detectSubwayRegion({ station: '송정' })).toBe('busan');
    expect(detectSubwayRegion({ station: '신해운대' })).toBe('busan');
    expect(detectSubwayRegion({ station: '망양' })).toBe('busan');
    expect(detectSubwayRegion({ station: '덕하' })).toBe('busan');
    expect(detectSubwayRegion({ station: '개운포' })).toBe('busan');
  });

  it('subwayId에 동해가 포함되면 busan 권역으로 감지되어야 함', () => {
    expect(detectSubwayRegion({ station: '교대', subwayId: '동해선' })).toBe('busan');
    expect(detectSubwayRegion({ station: '부전', subwayId: '동해선' })).toBe('busan');
    expect(detectSubwayRegion({ station: '벡스코', subwayId: '부산 동해선' })).toBe('busan');
  });

  it('목적지가 동해선 고유역인 경우 환승역에서도 busan 권역으로 라우팅되어야 함', () => {
    expect(
      detectSubwayRegion({
        station: '교대',
        destination: '태화강',
      })
    ).toBe('busan');

    expect(
      detectSubwayRegion({
        station: '부전',
        destination: '일광',
      })
    ).toBe('busan');
  });
});
