/**
 * @fileoverview 대구 도시철도 및 대경선 프론트엔드 UI 노선 테마 & 매핑 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import { getSubwayLineTheme } from '@/lib/constants/subwayThemes';
import { SUBWAY_LINE_MAP, resolveSubwayNameForApi, resolveCandidateLineCodes } from '@/lib/constants/subwayLineMap';
import {
  getDaeguLineStations,
  DAEGU_LINE_1_STATIONS,
  DAEGU_LINE_2_STATIONS,
  DAEGU_LINE_3_STATIONS,
  DAEGYEONG_LINE_STATIONS,
} from '@/lib/services/subway/daeguTimetableService';
import { inferDaeguDirection } from '@/lib/services/daeguSubwayService';
import { getLineStationListWithBranches } from '@/lib/services/subway/stationDistance';

describe('대구 도시철도 & 대경선 UI 테마 및 색상 브랜딩 테스트', () => {
  it('대구 1호선은 공식 빨간색(#D93F30) 테마를 반환해야 함', () => {
    const theme = getSubwayLineTheme('대구1호선');
    expect(theme.primary).toBe('#D93F30');
    expect(theme.badgeBg).toBe('bg-[#D93F30]');
    expect(theme.badgeText).toBe('text-white');
  });

  it('대구 2호선은 공식 초록색(#00AA80) 테마를 반환해야 함', () => {
    const theme = getSubwayLineTheme('대구2호선');
    expect(theme.primary).toBe('#00AA80');
    expect(theme.badgeBg).toBe('bg-[#00AA80]');
    expect(theme.badgeText).toBe('text-white');
  });

  it('대구 3호선은 공식 노란색(#FFB100) 테마를 반환해야 함', () => {
    const theme = getSubwayLineTheme('대구3호선');
    expect(theme.primary).toBe('#FFB100');
    expect(theme.badgeBg).toBe('bg-[#FFB100]');
    expect(theme.badgeText).toBe('text-zinc-900');
  });

  it('대경선은 코레일 광역전철 블루(#0054A6) 테마를 반환해야 함', () => {
    const theme = getSubwayLineTheme('대경선');
    expect(theme.primary).toBe('#0054A6');
    expect(theme.badgeBg).toBe('bg-[#0054A6]');
    expect(theme.badgeText).toBe('text-white');
  });
});

describe('대구 및 대경선 식별자 해석 테스트 (subwayLineMap)', () => {
  it('SUBWAY_LINE_MAP에 대구 노선과 대경선이 등록되어 있어야 함', () => {
    expect(SUBWAY_LINE_MAP['대구1호선']).toBe('대구 1호선');
    expect(SUBWAY_LINE_MAP['대구2호선']).toBe('대구 2호선');
    expect(SUBWAY_LINE_MAP['대구3호선']).toBe('대구 3호선');
    expect(SUBWAY_LINE_MAP['대경선']).toBe('대경선');
  });

  it('resolveSubwayNameForApi에서 대구 노선과 대경선을 정확히 정규화해야 함', () => {
    expect(resolveSubwayNameForApi('대구1')).toBe('대구1호선');
    expect(resolveSubwayNameForApi('대구 2호선')).toBe('대구2호선');
    expect(resolveSubwayNameForApi('대구3')).toBe('대구3호선');
    expect(resolveSubwayNameForApi('대경선 광역철도')).toBe('대경선');
  });

  it('resolveCandidateLineCodes에 대구 및 대경선 후보 코드가 포함되어야 함', () => {
    expect(resolveCandidateLineCodes('대구1호선')).toEqual(['대구1호선']);
    expect(resolveCandidateLineCodes('대경선')).toEqual(['대경선']);
  });
});

describe('노선도 정거장 목록 및 방면 판별 테스트', () => {
  it('1호선은 35개 정거장을 올바른 순서(설화명곡 -> 하양)로 반환해야 함', () => {
    const stations = getDaeguLineStations('대구1호선');
    expect(stations.length).toBe(35);
    expect(stations[0].stationName).toBe('설화명곡역');
    expect(stations[stations.length - 1].stationName).toBe('하양역');
  });

  it('2호선은 29개 정거장을 올바른 순서(문양 -> 영남대)로 반환해야 함', () => {
    const stations = getDaeguLineStations('대구2호선');
    expect(stations.length).toBe(29);
    expect(stations[0].stationName).toBe('문양역');
    expect(stations[stations.length - 1].stationName).toBe('영남대역');
  });

  it('3호선은 30개 정거장을 올바른 순서(칠곡경대병원 -> 용지)로 반환해야 함', () => {
    const stations = getDaeguLineStations('대구3호선');
    expect(stations.length).toBe(30);
    expect(stations[0].stationName).toBe('칠곡경대병원역');
    expect(stations[stations.length - 1].stationName).toBe('용지역');
  });

  it('대경선은 14개 정거장을 올바른 순서(구미 -> 경산)로 반환해야 함', () => {
    const stations = getDaeguLineStations('대경선');
    expect(stations.length).toBe(14);
    expect(stations[0].stationName).toBe('구미역');
    expect(stations[stations.length - 1].stationName).toBe('경산역');
  });

  it('목적지/방면 키워드로 상/하선 방향이 정확히 판별되어야 함', () => {
    expect(inferDaeguDirection('1', '하양')).toBe('UP');
    expect(inferDaeguDirection('1', '설화명곡')).toBe('DOWN');
    expect(inferDaeguDirection('2', '영남대')).toBe('UP');
    expect(inferDaeguDirection('2', '문양')).toBe('DOWN');
    expect(inferDaeguDirection('3', '용지')).toBe('UP');
    expect(inferDaeguDirection('3', '칠곡경대병원')).toBe('DOWN');
    expect(inferDaeguDirection('대경선', '구미')).toBe('UP');
    expect(inferDaeguDirection('대경선', '경산')).toBe('DOWN');
  });

  it('stationDistance.ts에서 대구 노선의 정거장 정보가 노선도용으로 조회되어야 함', () => {
    const info = getLineStationListWithBranches('대구1호선');
    expect(info.stations.length).toBe(35);
    expect(info.stations[0].stationName).toBe('설화명곡역');

    const dkInfo = getLineStationListWithBranches('대경선');
    expect(dkInfo.stations.length).toBe(14);
    expect(dkInfo.stations[0].stationName).toBe('구미역');
  });
});
