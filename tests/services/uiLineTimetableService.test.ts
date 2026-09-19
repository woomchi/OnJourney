import { describe, it, expect } from 'vitest';
import {
  getUiLineTimetableDatabase,
  isUiLineStation,
  isUiLineLine,
  isUiLineExclusiveStation,
  resolveOfficialUiLineStationName,
  resolveUiLineDirection,
  getUiLineNextTrain,
  getNextTrainFromUiLineTimetable,
  getUiLineTimetableList,
  loadUiLineStationTimetable,
  UI_LINE_STATIONS,
  UI_LINE_UNIQUE_STATIONS,
} from '@/lib/services/subway/uiLineTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('UiLineTimetableService', () => {
  it('우이신설선 13개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getUiLineTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('우이신설선');
    expect(db?.meta.subwayId).toBe('1092');
    expect(db?.meta.totalStations).toBe(13);
    expect(db?.data).toBeDefined();

    // 13개 역사 존재 확인
    for (const stn of UI_LINE_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 우이신설선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isUiLineStation('북한산우이역')).toBe(true);
    expect(isUiLineStation('솔밭공원')).toBe(true);
    expect(isUiLineStation('4.19민주묘지')).toBe(true);
    expect(isUiLineStation('419민주묘지역')).toBe(true);
    expect(isUiLineStation('4·19민주묘지')).toBe(true);
    expect(isUiLineStation('가오리역')).toBe(true);
    expect(isUiLineStation('화계')).toBe(true);
    expect(isUiLineStation('삼양역')).toBe(true);
    expect(isUiLineStation('삼양사거리')).toBe(true);
    expect(isUiLineStation('솔샘역')).toBe(true);
    expect(isUiLineStation('북한산보국문(서경대)')).toBe(true);
    expect(isUiLineStation('서경대')).toBe(true);
    expect(isUiLineStation('정릉역')).toBe(true);
    expect(isUiLineStation('성신여대입구')).toBe(true);
    expect(isUiLineStation('돈암역')).toBe(true);
    expect(isUiLineStation('보문역')).toBe(true);
    expect(isUiLineStation('신설동역')).toBe(true);
    expect(isUiLineStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialUiLineStationName('4.19민주묘지')).toBe('4·19민주묘지');
    expect(resolveOfficialUiLineStationName('419민주묘지역')).toBe('4·19민주묘지');
    expect(resolveOfficialUiLineStationName('북한산보국문(서경대)')).toBe('북한산보국문');
    expect(resolveOfficialUiLineStationName('돈암역')).toBe('성신여대입구');
    expect(resolveOfficialUiLineStationName('신설동역')).toBe('신설동');
  });

  it('우이신설선 단독 고유역(10개 역)을 정확히 식별해야 한다', () => {
    expect(isUiLineExclusiveStation('북한산우이')).toBe(true);
    expect(isUiLineExclusiveStation('솔밭공원')).toBe(true);
    expect(isUiLineExclusiveStation('4·19민주묘지')).toBe(true);
    expect(isUiLineExclusiveStation('가오리')).toBe(true);
    expect(isUiLineExclusiveStation('화계')).toBe(true);
    expect(isUiLineExclusiveStation('삼양')).toBe(true);
    expect(isUiLineExclusiveStation('삼양사거리')).toBe(true);
    expect(isUiLineExclusiveStation('솔샘')).toBe(true);
    expect(isUiLineExclusiveStation('북한산보국문')).toBe(true);
    expect(isUiLineExclusiveStation('정릉')).toBe(true);

    // 환승역은 단독 고유역이 아님
    expect(isUiLineExclusiveStation('성신여대입구')).toBe(false); // 4호선
    expect(isUiLineExclusiveStation('보문')).toBe(false);         // 6호선
    expect(isUiLineExclusiveStation('신설동')).toBe(false);       // 1, 2호선
  });

  it('노선 식별자(isUiLineLine)를 정확하게 판별해야 한다', () => {
    expect(isUiLineLine('1092')).toBe(true);
    expect(isUiLineLine('우이신설선')).toBe(true);
    expect(isUiLineLine('우이신설')).toBe(true);
    expect(isUiLineLine('우이')).toBe(true);
    expect(isUiLineLine('ui-line')).toBe(true);
    expect(isUiLineLine('1002')).toBe(false);
    expect(isUiLineLine('1095')).toBe(false);
  });

  it('방향(resolveUiLineDirection)이 올바르게 판정되어야 한다', () => {
    // 상행 (신설동 방면)
    expect(resolveUiLineDirection('상행')).toBe('UP');
    expect(resolveUiLineDirection('1')).toBe('UP');
    expect(resolveUiLineDirection(undefined, '신설동')).toBe('UP');
    expect(resolveUiLineDirection(undefined, '보문')).toBe('UP');
    expect(resolveUiLineDirection(undefined, '성신여대입구')).toBe('UP');

    // 하행 (북한산우이 방면)
    expect(resolveUiLineDirection('하행')).toBe('DOWN');
    expect(resolveUiLineDirection('2')).toBe('DOWN');
    expect(resolveUiLineDirection(undefined, '북한산우이')).toBe('DOWN');
    expect(resolveUiLineDirection(undefined, '솔밭공원')).toBe('DOWN');
    expect(resolveUiLineDirection(undefined, '정릉')).toBe('DOWN');
  });

  it('기점(북한산우이)은 상행선 전용, 종점(신설동)은 하행선 전용이어야 한다', () => {
    const db = getUiLineTimetableDatabase();
    expect(db).not.toBeNull();

    // 북한산우이역: 상행선(신설동행)만 있고 하행선은 존재하지 않음
    expect(db?.data['북한산우이']['우이신설선_DAY_UP'].length).toBeGreaterThan(200);
    expect(db?.data['북한산우이']['우이신설선_DAY_DOWN']).toBeUndefined();

    // 신설동역: 하행선(북한산우이행)만 있고 상행선은 존재하지 않음
    expect(db?.data['신설동']['우이신설선_DAY_DOWN'].length).toBeGreaterThan(200);
    expect(db?.data['신설동']['우이신설선_DAY_UP']).toBeUndefined();
  });

  it('평일 출근시간대(08:00 KST) 솔샘역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getUiLineNextTrain({
      stationName: '솔샘',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.endSubwayStationNm).toBe('신설동');
    expect(nextUp?.statusText).toContain('신설동');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('우이신설선');
    expect(nextUp?.trainNo).toMatch(/^U1/);

    const nextDown = getUiLineNextTrain({
      stationName: '솔샘',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.endSubwayStationNm).toBe('북한산우이');
    expect(nextDown?.statusText).toContain('북한산우이');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('우이신설선');
    expect(nextDown?.trainNo).toMatch(/^U2/);
  });

  it('주말(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromUiLineTimetable({
      stationName: '화계',
      updnLine: '상행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(nextSunday?.endSubwayStationNm).toBe('신설동');
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('심야 막차 이후에는 익일 첫차가 산출되어야 한다', () => {
    // 2026-09-18 (금요일) 02:00 KST = 2026-09-17T17:00:00Z (심야 종료 시간대)
    const lateNight = new Date('2026-09-17T17:00:00.000Z');

    const nextMorning = getUiLineNextTrain({
      stationName: '가오리',
      updnLine: '상행',
      baseTime: lateNight,
    });
    expect(nextMorning).not.toBeNull();
    expect(nextMorning?.canBoard).toBe(false);
    expect(nextMorning?.statusText).toContain('첫차');
    expect(nextMorning?.arrivalTime).toMatch(/^05:\d{2}$/);
  });

  it('역별 전일 시간표 목록(getUiLineTimetableList)이 정상 반환되어야 한다', () => {
    const timetable = getUiLineTimetableList('가오리', '상행', 'DAY');
    expect(timetable.length).toBeGreaterThan(200);
    expect(timetable[0].depTime).toMatch(/^\d{2}:\d{2}$/);
    expect(timetable[0].destStation).toBe('신설동');

    const loaded = loadUiLineStationTimetable('가오리');
    expect(loaded).not.toBeNull();
    expect(loaded?.['우이신설선_DAY_UP']).toBeDefined();
    expect(loaded?.['우이신설선_DAY_DOWN']).toBeDefined();
    expect(loaded?.['우이신설선_DAY_UP'].length).toBeGreaterThan(0);
    expect(loaded?.['우이신설선_DAY_DOWN'].length).toBeGreaterThan(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 우이신설선 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 우이신설선 단독 고유역 (가오리)
    const res1 = await calculateNextTrainFromTimetable('가오리', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();
    expect(res1?.endSubwayStationNm).toBe('북한산우이');

    // 2. 우이신설선 환승역 (보문 + '우이신설선' 명시)
    const res2 = await calculateNextTrainFromTimetable('보문', '상행', '우이신설선');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toBeDefined();
    expect(res2?.endSubwayStationNm).toBe('신설동');
  });
});
