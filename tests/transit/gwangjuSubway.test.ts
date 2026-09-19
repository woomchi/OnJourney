import { describe, it, expect } from 'vitest';
import {
  GWANGJU_LINE_1_STATIONS,
  resolveOfficialGwangjuStationName,
  isGwangjuSubwayStation,
  inferGwangjuDirection,
  getGwangjuLineStations,
} from '@/lib/services/gwangjuSubwayStations';
import {
  getGwangjuTimetableDatabase,
  getNextTrainsFromGwangjuTimetable,
  resolveGwangjuDayType,
  getGwangjuTimetableList,
} from '@/lib/services/subway/gwangjuTimetableService';
import { fetchGwangjuSubwayArrivals } from '@/lib/services/gwangjuSubwayService';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';

describe('광주 지하철(1호선) 도착 정보 시스템 테스트', () => {
  describe('1. 역사 메타데이터 및 유틸리티 (gwangjuSubwayStations)', () => {
    it('광주 1호선은 총 20개 역(녹동~평동)으로 구성되어야 한다', () => {
      expect(GWANGJU_LINE_1_STATIONS.length).toBe(20);
      expect(GWANGJU_LINE_1_STATIONS[0]).toBe('녹동');
      expect(GWANGJU_LINE_1_STATIONS[19]).toBe('평동');
    });

    it('역명 정규화가 정확히 작동해야 한다', () => {
      expect(resolveOfficialGwangjuStationName('광주송정역')).toBe('광주송정');
      expect(resolveOfficialGwangjuStationName('김대중컨벤션센터(마륵)')).toBe('김대중컨벤션센터');
      expect(resolveOfficialGwangjuStationName('마륵')).toBe('김대중컨벤션센터');
      expect(resolveOfficialGwangjuStationName('학동·증심사입구')).toBe('학동증심사입구');
      expect(resolveOfficialGwangjuStationName('문화전당(구도청)')).toBe('문화전당');
      expect(resolveOfficialGwangjuStationName('상무역')).toBe('상무');
      expect(resolveOfficialGwangjuStationName('평동')).toBe('평동');
      expect(resolveOfficialGwangjuStationName('강남역')).toBeNull();
    });

    it('광주 지하철 역 여부를 정확히 판별해야 한다', () => {
      expect(isGwangjuSubwayStation('금남로4가')).toBe(true);
      expect(isGwangjuSubwayStation('남광주역')).toBe(true);
      expect(isGwangjuSubwayStation('판암')).toBe(false);
      expect(isGwangjuSubwayStation('반월당')).toBe(false);
    });

    it('방향 추론이 올바르게 작동해야 한다', () => {
      // 종착역 명시
      expect(inferGwangjuDirection('평동')).toBe('UP');
      expect(inferGwangjuDirection('소태')).toBe('DOWN');
      expect(inferGwangjuDirection('녹동')).toBe('DOWN');

      // 방면 텍스트 명시
      expect(inferGwangjuDirection(undefined, '광주송정 방면')).toBe('UP');
      expect(inferGwangjuDirection(undefined, '남광주 방면')).toBe('DOWN');

      // 출발역과 도착역의 인덱스 비교
      // 상무(13) -> 평동(19): UP
      expect(inferGwangjuDirection('도산', undefined, '상무')).toBe('UP');
      // 상무(13) -> 남광주(3): DOWN
      expect(inferGwangjuDirection('남광주', undefined, '상무')).toBe('DOWN');
    });

    it('노선도 및 역간거리용 정차역 목록이 올바르게 생성되어야 한다', () => {
      const stations = getGwangjuLineStations();
      expect(stations.length).toBe(20);
      expect(stations[0].stationName).toBe('녹동');
      expect(stations[0].index).toBe(0);
      expect(stations[0].stationId).toBe('100');
      expect(stations[19].stationName).toBe('평동');
    });
  });

  describe('2. 인메모리 시간표 서비스 (gwangjuTimetableService)', () => {
    it('압축 DB가 20개 역 전체를 포함하여 정상 로드되어야 한다', () => {
      const db = getGwangjuTimetableDatabase();
      expect(db).not.toBeNull();
      expect(db?.meta.totalStations).toBe(20);
      expect(db?.meta.lines['1']).toBe(20);

      // 20개 역 모두 데이터 존재 확인
      for (const stn of GWANGJU_LINE_1_STATIONS) {
        expect(db?.data[stn]).toBeDefined();
      }
    });

    it('요일 타입이 올바르게 분류되어야 한다', () => {
      // 2026-09-21 (월요일)
      const monday = new Date('2026-09-21T09:00:00');
      expect(resolveGwangjuDayType(monday)).toBe('WEEKDAY');

      // 2026-09-19 (토요일)
      const saturday = new Date('2026-09-19T09:00:00');
      expect(resolveGwangjuDayType(saturday)).toBe('SATURDAY');

      // 2026-09-20 (일요일)
      const sunday = new Date('2026-09-20T09:00:00');
      expect(resolveGwangjuDayType(sunday)).toBe('HOLIDAY');
    });

    it('특정 시점(평일 출근시간 08:30) 기준 다음 열차가 정확히 조회되어야 한다', () => {
      const date = new Date('2026-09-21T08:30:00');
      const trains = getNextTrainsFromGwangjuTimetable('상무', 'UP', 2, date);

      expect(trains.length).toBe(2);
      expect(trains[0].minutesLeft).toBeGreaterThanOrEqual(0);
      expect(trains[0].endSubwayStationNm).toBe('평동');
      expect(trains[0].canBoard).toBe(true);

      const [hour, min] = trains[0].arrivalTime.split(':').map(Number);
      const trainMins = hour * 60 + min;
      expect(trainMins).toBeGreaterThanOrEqual(8 * 60 + 30);
    });

    it('SubwayTimetableEntry 형태의 시간표 리스트 조회가 정상 작동해야 한다', () => {
      const date = new Date('2026-09-21T12:00:00');
      const list = getGwangjuTimetableList('광주송정', 'UP', date, 10);

      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).toHaveProperty('trainNo');
      expect(list[0]).toHaveProperty('depTime');
      expect(list[0]).toHaveProperty('destStation');
      expect(list[0].destStation).toBe('평동');
      expect(list[0].directionName).toBe('평동 방면');
    });
  });

  describe('3. 도착 정보 서비스 (gwangjuSubwayService)', () => {
    it('fetchGwangjuSubwayArrivals가 표준 SubwayArrival 모델을 반환해야 한다', async () => {
      const arrivals = await fetchGwangjuSubwayArrivals('상무', '1', '광주1호선', '평동');

      expect(arrivals.length).toBeGreaterThan(0);
      const first = arrivals[0];
      expect(first.statnNm).toBe('상무');
      expect(first.destinationStationNm).toBe('평동');
      expect(first.subwayId).toBe('광주1호선');
      expect(first.isRealtime).toBe(false);
      expect(typeof first.minutesLeft).toBe('number');
      expect(first.updnLine).toBe('상행');
    });

    it('하행(소태/녹동 방면) 요청 시 하행 도착 정보가 반환되어야 한다', async () => {
      const arrivals = await fetchGwangjuSubwayArrivals('상무', '2', '광주1호선', '소태');

      expect(arrivals.length).toBeGreaterThan(0);
      const first = arrivals[0];
      expect(first.updnLine).toBe('하행');
      expect(['소태', '녹동']).toContain(first.destinationStationNm);
    });
  });

  describe('4. 지역 감지 라우팅 (subwayRegionRouter)', () => {
    it('광주 고유역은 gwangju로 즉시 판별되어야 한다', () => {
      expect(detectSubwayRegion({ station: '녹동' })).toBe('gwangju');
      expect(detectSubwayRegion({ station: '문화전당' })).toBe('gwangju');
      expect(detectSubwayRegion({ station: '김대중컨벤션센터' })).toBe('gwangju');
      expect(detectSubwayRegion({ station: '광주송정' })).toBe('gwangju');
      expect(detectSubwayRegion({ station: '평동' })).toBe('gwangju');
    });

    it('subwayId에 "광주"가 명시된 경우 gwangju로 판별되어야 한다', () => {
      expect(detectSubwayRegion({ station: '화정', subwayId: '광주 1호선' })).toBe('gwangju');
      expect(detectSubwayRegion({ station: '공항', subwayId: '광주도시철도' })).toBe('gwangju');
    });

    it('동명역(화정) - 수도권 3호선 목적지 시 seoul, 광주 목적지 시 gwangju로 분기되어야 한다', () => {
      // 수도권 3호선 일산선 화정역 -> 대화행
      expect(detectSubwayRegion({ station: '화정', destination: '대화' })).toBe('seoul');
      // 광주 1호선 화정역 -> 평동행
      expect(detectSubwayRegion({ station: '화정', destination: '평동' })).toBe('gwangju');
      // 광주 1호선 화정역 -> 소태행
      expect(detectSubwayRegion({ station: '화정', destination: '소태' })).toBe('gwangju');
    });

    it('동명역(공항) - 광주 목적지 또는 광주 노선 시 gwangju로 분기되어야 한다', () => {
      // 광주 1호선 공항역 -> 평동행
      expect(detectSubwayRegion({ station: '공항', destination: '평동' })).toBe('gwangju');
      // 광주 1호선 공항역 -> 소태행
      expect(detectSubwayRegion({ station: '공항', destination: '소태' })).toBe('gwangju');
      // 광주 명시 시
      expect(detectSubwayRegion({ station: '공항', subwayId: '광주 1호선' })).toBe('gwangju');
    });
  });
});
