import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isBusanSubwayStation,
  getBusanStationCode,
  getBusanDayType,
  fetchBusanStationTimetable,
  fetchBusanSubwayArrivals,
  fetchBusanStationUpcomingTimetable,
  BUSAN_ENDCODE_NAMES,
  getPublicSubwayApiKey,
} from '@/lib/services/busanSubwayService';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';

describe('busanSubwayService & regional routing', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUBWAY_DATA_API_KEY: 'test-busan-key',
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('getPublicSubwayApiKey', () => {
    it('SUBWAY_DATA_API_KEY가 설정되어 있으면 해당 키를 반환해야 한다', () => {
      process.env.SUBWAY_DATA_API_KEY = 'custom-subway-key';
      delete process.env.BUS_DATA_API_KEY;
      delete process.env.REAL_TIME_BUS_API_KEY;
      expect(getPublicSubwayApiKey()).toBe('custom-subway-key');
    });

    it('SUBWAY_DATA_API_KEY가 없고 BUS_DATA_API_KEY가 있으면 Fallback으로 반환해야 한다', () => {
      delete process.env.SUBWAY_DATA_API_KEY;
      process.env.BUS_DATA_API_KEY = 'shared-bus-key';
      expect(getPublicSubwayApiKey()).toBe('shared-bus-key');
    });

    it('인코딩된 키(%2B 등)는 디코딩하여 반환해야 한다', () => {
      process.env.SUBWAY_DATA_API_KEY = 'key%2Bwith%3Dpercent';
      expect(getPublicSubwayApiKey()).toBe('key+with=percent');
    });

    it('키가 모두 없으면 빈 문자열을 반환해야 한다', () => {
      delete process.env.SUBWAY_DATA_API_KEY;
      delete process.env.BUS_DATA_API_KEY;
      delete process.env.REAL_TIME_BUS_API_KEY;
      expect(getPublicSubwayApiKey()).toBe('');
    });
  });

  describe('isBusanSubwayStation', () => {
    it('부산 지하철 대표 역들을 정확히 판별해야 한다', () => {
      expect(isBusanSubwayStation('부산역')).toBe(true);
      expect(isBusanSubwayStation('부산')).toBe(true);
      expect(isBusanSubwayStation('서면')).toBe(true);
      expect(isBusanSubwayStation('해운대')).toBe(true);
      expect(isBusanSubwayStation('광안')).toBe(true);
      expect(isBusanSubwayStation('사상')).toBe(true);
      expect(isBusanSubwayStation('자갈치')).toBe(true);
      expect(isBusanSubwayStation('노포')).toBe(true);
      expect(isBusanSubwayStation('다대포해수욕장')).toBe(true);
      expect(isBusanSubwayStation('안평')).toBe(true);
    });

    it('타지역 역에 대해서는 false를 반환해야 한다', () => {
      expect(isBusanSubwayStation('강남')).toBe(false);
      expect(isBusanSubwayStation('판암')).toBe(false);
      expect(isBusanSubwayStation('반석')).toBe(false);
      expect(isBusanSubwayStation('수원')).toBe(false);
    });
  });

  describe('getBusanStationCode', () => {
    it('단일역의 코드를 정확히 반환해야 한다', () => {
      expect(getBusanStationCode('부산역')).toBe('113');
      expect(getBusanStationCode('해운대')).toBe('203');
      expect(getBusanStationCode('대저')).toBe('317');
      expect(getBusanStationCode('안평')).toBe('414');
    });

    it('환승역은 노선 힌트에 따라 해당 호선의 역코드를 반환해야 한다', () => {
      expect(getBusanStationCode('서면', '부산 1호선')).toBe('119');
      expect(getBusanStationCode('서면', '2호선')).toBe('219');
      expect(getBusanStationCode('수영', '3호선')).toBe('301');
      expect(getBusanStationCode('수영', '2호선')).toBe('208');
    });

    it('존재하지 않는 역은 null을 반환해야 한다', () => {
      expect(getBusanStationCode('강남역')).toBeNull();
    });
  });

  describe('getBusanDayType', () => {
    it('평일은 1, 토요일은 2, 일요일은 3을 반환해야 한다', () => {
      const sunday = new Date('2026-09-20T12:00:00Z'); // Sunday
      const saturday = new Date('2026-09-19T12:00:00Z'); // Saturday
      const wednesday = new Date('2026-09-16T12:00:00Z'); // Wednesday

      expect(getBusanDayType(sunday)).toBe('3');
      expect(getBusanDayType(saturday)).toBe('2');
      expect(getBusanDayType(wednesday)).toBe('1');
    });
  });

  describe('detectSubwayRegion', () => {
    it('부산 고유 역명을 가진 역은 busan으로 감지해야 한다', () => {
      expect(detectSubwayRegion({ station: '해운대' })).toBe('busan');
      expect(detectSubwayRegion({ station: '서면' })).toBe('busan');
      expect(detectSubwayRegion({ station: '자갈치' })).toBe('busan');
      expect(detectSubwayRegion({ station: '사상' })).toBe('busan');
      expect(detectSubwayRegion({ station: '부산역' })).toBe('busan');
    });

    it('노선명에 부산이 포함되면 busan으로 감지해야 한다', () => {
      expect(detectSubwayRegion({ station: '시청', subwayId: '부산 1호선' })).toBe('busan');
    });

    it('동명역(시청)에서 목적지가 부산 고유역이면 busan으로 감지해야 한다', () => {
      expect(detectSubwayRegion({ station: '시청', destination: '노포' })).toBe('busan');
      expect(detectSubwayRegion({ station: '시청', headsign: '다대포해수욕장 방면' })).toBe('busan');
    });

    it('동명역(시청)에서 목적지가 대전 고유역이면 daejeon으로 감지해야 한다', () => {
      expect(detectSubwayRegion({ station: '시청', destination: '반석' })).toBe('daejeon');
    });

    it('수도권 고유 역은 seoul로 감지해야 한다', () => {
      expect(detectSubwayRegion({ station: '강남' })).toBe('seoul');
      expect(detectSubwayRegion({ station: '홍대입구' })).toBe('seoul');
    });
  });

  describe('fetchBusanStationTimetable and arrivals', () => {
    const mockApiResponse = {
      header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
      body: {
        totalCount: 4,
        items: {
          item: [
            {
              scode: '113',
              sname: '부산',
              line: '1',
              trainno: '1001',
              arrtime: '12:05:00',
              dayType: '1',
              updown: '0',
              endcode: '95',
            },
            {
              scode: '113',
              sname: '부산',
              line: '1',
              trainno: '1003',
              arrtime: '12:15:00',
              dayType: '1',
              updown: '0',
              endcode: '95',
            },
            {
              scode: '113',
              sname: '부산',
              line: '1',
              trainno: '2002',
              arrtime: '12:08:00',
              dayType: '1',
              updown: '1',
              endcode: '134',
            },
            {
              scode: '113',
              sname: '부산',
              line: '1',
              trainno: '2004',
              arrtime: '12:20:00',
              dayType: '1',
              updown: '1',
              endcode: '134',
            },
          ],
        },
      },
    };

    it('로컬 DB를 정상 조회하여 시간표 목록을 반환해야 한다', async () => {
      const items = await fetchBusanStationTimetable('113');
      expect(items.length).toBeGreaterThan(500);
      expect(items.some((it) => it.destStation === '다대포해수욕장')).toBe(true);
      expect(items.some((it) => it.destStation === '노포')).toBe(true);
    });

    it('현재 시각 기준 다음 도착 열차 목록(SubwayArrival[])을 계산해야 한다', async () => {
      // 평일 12:00:00으로 시간 고정
      const fakeNow = new Date('2026-09-16T12:00:00'); // Wednesday
      vi.spyOn(timeOffsetManager, 'getSynchronizedNow').mockReturnValue(fakeNow.getTime());

      const arrivals = await fetchBusanSubwayArrivals('부산역');
      expect(arrivals.length).toBeGreaterThan(0);

      // 상행(노포행)과 하행(다대포해수욕장행)이 모두 포함되어야 함
      const dadaepo = arrivals.find((a) => a.updnLine.includes('다대포'));
      const nopo = arrivals.find((a) => a.updnLine.includes('노포'));

      expect(dadaepo).toBeDefined();
      expect(dadaepo?.minutesLeft).toBeGreaterThanOrEqual(0);
      expect(dadaepo?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
      expect(nopo).toBeDefined();
      expect(nopo?.minutesLeft).toBeGreaterThanOrEqual(0);
      expect(nopo?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('노선도용 시간표(SubwayTimetableEntry[])를 정상 반환해야 한다', async () => {
      const fakeNow = new Date('2026-09-16T12:00:00');
      vi.spyOn(timeOffsetManager, 'getSynchronizedNow').mockReturnValue(fakeNow.getTime());

      const timetable = await fetchBusanStationUpcomingTimetable('부산역', '1호선', 4);
      expect(timetable.length).toBe(4);
      expect(timetable[0].depTime).toMatch(/^\d{2}:\d{2}$/);
      expect(timetable[1].depTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it('부산 1~4호선의 실제 정차역 목록(getBusanLineStations)을 순서대로 반환해야 한다', async () => {
      const { getBusanLineStations } = await import('@/lib/services/busanSubwayService');
      const { getLineStationListWithBranches } = await import('@/lib/services/subway/stationDistance');

      // 1호선 (다대포해수욕장 ~ 노포)
      const line1 = getBusanLineStations('부산 1호선');
      expect(line1.length).toBe(40);
      expect(line1[0].stationName).toBe('다대포해수욕장역');
      expect(line1[line1.length - 1].stationName).toBe('노포역');

      // 2호선 (장산 ~ 양산)
      const line2 = getBusanLineStations('부산2호선');
      expect(line2.length).toBe(43);
      expect(line2[0].stationName).toBe('장산역');
      expect(line2[line2.length - 1].stationName).toBe('양산역');

      // 3호선 (수영 ~ 대저)
      const line3 = getBusanLineStations('부산 3호선');
      expect(line3.length).toBe(17);
      expect(line3[0].stationName).toBe('수영역');
      expect(line3[line3.length - 1].stationName).toBe('대저역');

      // 4호선 (미남 ~ 안평)
      const line4 = getBusanLineStations('부산 4호선');
      expect(line4.length).toBe(14);
      expect(line4[0].stationName).toBe('미남역');
      expect(line4[line4.length - 1].stationName).toBe('안평역');

      // getLineStationListWithBranches 연동 검증
      const res = getLineStationListWithBranches('부산2호선', undefined, '해운대');
      expect(res.stations.length).toBe(43);
      expect(res.stations[0].stationName).toBe('장산역');
    });
  });
});
