import { describe, it, expect } from 'vitest';
import { getDaejeonLineStations } from '@/lib/services/daejeonSubwayService';
import { getLineStationListWithBranches } from '@/lib/services/subway/stationDistance';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';

describe('daejeonSubwayService & regional routing', () => {
  it('대전 1호선 22개 역이 판암부터 반석까지 순서대로 반환되어야 한다', () => {
    const stations = getDaejeonLineStations();
    expect(stations.length).toBe(22);
    expect(stations[0].stationName).toBe('판암역');
    expect(stations[stations.length - 1].stationName).toBe('반석역');
  });

  it('getLineStationListWithBranches가 대전 노선에 대해 정차역 목록을 반환해야 한다', () => {
    const res = getLineStationListWithBranches('대전1호선', undefined, '대전역');
    expect(res.stations.length).toBe(22);
    expect(res.stations[0].stationName).toBe('판암역');
    expect(res.stations[3].stationName).toBe('대전역');
  });

  it('동명역(시청, 중앙 등)에서 subwayId가 부산이면 대전이 아닌 부산으로 감지되어야 한다', () => {
    const regionBusan = detectSubwayRegion({
      station: '시청',
      subwayId: '부산 1호선',
    });
    expect(regionBusan).toBe('busan');

    const regionDaejeon = detectSubwayRegion({
      station: '시청',
      subwayId: '대전 1호선',
    });
    expect(regionDaejeon).toBe('daejeon');
  });
});
