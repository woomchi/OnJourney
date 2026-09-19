import { describe, it, expect } from 'vitest';
import {
  getUijeongbuTimetableDatabase,
  isUijeongbuStation,
  isUijeongbuLine,
  isUijeongbuExclusiveStation,
  resolveOfficialUijeongbuStationName,
  resolveUijeongbuDirection,
  getUijeongbuNextTrain,
  getNextTrainFromUijeongbuTimetable,
  getUijeongbuTimetableList,
  loadUijeongbuStationTimetable,
  UIJEONGBU_STATIONS,
  UIJEONGBU_UNIQUE_STATIONS,
} from '@/lib/services/subway/uijeongbuTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('UijeongbuTimetableService', () => {
  it('의정부경전철 16개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getUijeongbuTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('의정부경전철');
    expect(db?.meta.subwayId).toBe('1010');
    expect(db?.meta.totalStations).toBe(16);
    expect(db?.data).toBeDefined();

    // 16개 역사 존재 확인
    for (const stn of UIJEONGBU_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 의정부경전철 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isUijeongbuStation('발곡역')).toBe(true);
    expect(isUijeongbuStation('회룡')).toBe(true);
    expect(isUijeongbuStation('범골역')).toBe(true);
    expect(isUijeongbuStation('경전철의정부')).toBe(true);
    expect(isUijeongbuStation('경전철의정부역')).toBe(true);
    expect(isUijeongbuStation('의정부시청')).toBe(true);
    expect(isUijeongbuStation('시청')).toBe(true);
    expect(isUijeongbuStation('흥선(하늘빛이음)')).toBe(true);
    expect(isUijeongbuStation('의정부중앙')).toBe(true);
    expect(isUijeongbuStation('중앙')).toBe(true);
    expect(isUijeongbuStation('동오역')).toBe(true);
    expect(isUijeongbuStation('새말')).toBe(true);
    expect(isUijeongbuStation('경기도청북부청사')).toBe(true);
    expect(isUijeongbuStation('경기북부청사')).toBe(true);
    expect(isUijeongbuStation('북부청사')).toBe(true);
    expect(isUijeongbuStation('효자(유디치과)')).toBe(true);
    expect(isUijeongbuStation('곤제')).toBe(true);
    expect(isUijeongbuStation('어룡(국민건강보험공단)')).toBe(true);
    expect(isUijeongbuStation('송산역')).toBe(true);
    expect(isUijeongbuStation('탑석')).toBe(true);
    expect(isUijeongbuStation('차량기지임시승강장')).toBe(true);
    expect(isUijeongbuStation('차량기지역')).toBe(true);
    expect(isUijeongbuStation('임시승강장')).toBe(true);
    expect(isUijeongbuStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialUijeongbuStationName('경기북부청사')).toBe('경기도청북부청사');
    expect(resolveOfficialUijeongbuStationName('북부청사역')).toBe('경기도청북부청사');
    expect(resolveOfficialUijeongbuStationName('흥선(하늘빛이음)')).toBe('흥선');
    expect(resolveOfficialUijeongbuStationName('효자(유디치과)')).toBe('효자');
    expect(resolveOfficialUijeongbuStationName('어룡(국민건강보험공단)')).toBe('어룡');
    expect(resolveOfficialUijeongbuStationName('차량기지역')).toBe('차량기지임시승강장');
    expect(resolveOfficialUijeongbuStationName('임시승강장')).toBe('차량기지임시승강장');
  });

  it('의정부경전철 단독 고유역(15개 역)을 정확히 식별해야 한다', () => {
    expect(isUijeongbuExclusiveStation('발곡')).toBe(true);
    expect(isUijeongbuExclusiveStation('범골')).toBe(true);
    expect(isUijeongbuExclusiveStation('경전철의정부')).toBe(true);
    expect(isUijeongbuExclusiveStation('의정부시청')).toBe(true);
    expect(isUijeongbuExclusiveStation('흥선')).toBe(true);
    expect(isUijeongbuExclusiveStation('의정부중앙')).toBe(true);
    expect(isUijeongbuExclusiveStation('동오')).toBe(true);
    expect(isUijeongbuExclusiveStation('새말')).toBe(true);
    expect(isUijeongbuExclusiveStation('경기도청북부청사')).toBe(true);
    expect(isUijeongbuExclusiveStation('효자')).toBe(true);
    expect(isUijeongbuExclusiveStation('곤제')).toBe(true);
    expect(isUijeongbuExclusiveStation('어룡')).toBe(true);
    expect(isUijeongbuExclusiveStation('송산')).toBe(true);
    expect(isUijeongbuExclusiveStation('탑석')).toBe(true);
    expect(isUijeongbuExclusiveStation('차량기지임시승강장')).toBe(true);

    // 환승역은 단독 고유역이 아님
    expect(isUijeongbuExclusiveStation('회룡')).toBe(false); // 1호선
  });

  it('노선 식별자(isUijeongbuLine)를 정확하게 판별해야 한다', () => {
    expect(isUijeongbuLine('1010')).toBe(true);
    expect(isUijeongbuLine('의정부경전철')).toBe(true);
    expect(isUijeongbuLine('의정부')).toBe(true);
    expect(isUijeongbuLine('ulrt')).toBe(true);
    expect(isUijeongbuLine('u-line')).toBe(true);
    expect(isUijeongbuLine('1001')).toBe(false);
    expect(isUijeongbuLine('1092')).toBe(false);
  });

  it('방향(resolveUijeongbuDirection)이 올바르게 판정되어야 한다', () => {
    // 상행 (탑석/차량기지 방면)
    expect(resolveUijeongbuDirection('상행')).toBe('UP');
    expect(resolveUijeongbuDirection('1')).toBe('UP');
    expect(resolveUijeongbuDirection(undefined, '탑석')).toBe('UP');
    expect(resolveUijeongbuDirection(undefined, '차량기지')).toBe('UP');
    expect(resolveUijeongbuDirection(undefined, '송산')).toBe('UP');

    // 하행 (발곡 방면)
    expect(resolveUijeongbuDirection('하행')).toBe('DOWN');
    expect(resolveUijeongbuDirection('2')).toBe('DOWN');
    expect(resolveUijeongbuDirection(undefined, '발곡')).toBe('DOWN');
    expect(resolveUijeongbuDirection(undefined, '회룡')).toBe('DOWN');
    expect(resolveUijeongbuDirection(undefined, '범골')).toBe('DOWN');

    // 기점 및 종점 전용 방향
    expect(resolveUijeongbuDirection('하행', undefined, '발곡')).toBe('UP');
    expect(resolveUijeongbuDirection('상행', undefined, '차량기지임시승강장')).toBe('DOWN');
  });

  it('기점(발곡)은 상행선 전용, 종점(차량기지임시승강장)은 하행선 전용이어야 한다', () => {
    const db = getUijeongbuTimetableDatabase();
    expect(db).not.toBeNull();

    // 발곡역: 상행선만 존재
    expect(db?.data['발곡']['의정부경전철_DAY_UP'].length).toBeGreaterThan(150);
    expect(db?.data['발곡']['의정부경전철_DAY_DOWN']).toBeUndefined();

    // 차량기지임시승강장: 하행선만 존재 (일 8~10편 운행 간이승강장)
    expect(db?.data['차량기지임시승강장']['의정부경전철_DAY_DOWN'].length).toBeGreaterThan(0);
    expect(db?.data['차량기지임시승강장']['의정부경전철_DAY_UP']).toBeUndefined();
  });

  it('평일 출근시간대(08:00 KST) 의정부시청역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getUijeongbuNextTrain({
      stationName: '의정부시청',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(['탑석', '차량기지임시승강장']).toContain(nextUp?.endSubwayStationNm);
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('의정부경전철');
    expect(nextUp?.trainNo).toMatch(/^U1/);

    const nextDown = getUijeongbuNextTrain({
      stationName: '의정부시청',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.endSubwayStationNm).toBe('발곡');
    expect(nextDown?.statusText).toContain('발곡');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('의정부경전철');
    expect(nextDown?.trainNo).toMatch(/^U2/);
  });

  it('주말(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromUijeongbuTimetable({
      stationName: '새말',
      updnLine: '상행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(['탑석', '차량기지임시승강장']).toContain(nextSunday?.endSubwayStationNm);
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('심야 막차 이후에는 익일 첫차가 산출되어야 한다', () => {
    // 2026-09-18 (금요일) 02:00 KST = 2026-09-17T17:00:00Z (심야 종료 시간대)
    const lateNight = new Date('2026-09-17T17:00:00.000Z');

    const nextMorning = getUijeongbuNextTrain({
      stationName: '동오',
      updnLine: '상행',
      baseTime: lateNight,
    });
    expect(nextMorning).not.toBeNull();
    expect(nextMorning?.canBoard).toBe(false);
    expect(nextMorning?.statusText).toContain('첫차');
    expect(nextMorning?.arrivalTime).toMatch(/^05:\d{2}$/);
  });

  it('역별 전일 시간표 목록(getUijeongbuTimetableList)이 정상 반환되어야 한다', () => {
    const timetable = getUijeongbuTimetableList('동오', '상행', 'DAY');
    expect(timetable.length).toBeGreaterThanOrEqual(150);
    expect(timetable[0].depTime).toMatch(/^\d{2}:\d{2}$/);
    expect(['탑석', '차량기지임시승강장']).toContain(timetable[0].destStation);

    const loaded = loadUijeongbuStationTimetable('동오');
    expect(loaded).not.toBeNull();
    expect(loaded?.['의정부경전철_DAY_UP']).toBeDefined();
    expect(loaded?.['의정부경전철_DAY_DOWN']).toBeDefined();
    expect(loaded?.['의정부경전철_DAY_UP'].length).toBeGreaterThan(0);
    expect(loaded?.['의정부경전철_DAY_DOWN'].length).toBeGreaterThan(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 의정부경전철 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 의정부경전철 단독 고유역 (범골)
    const res1 = await calculateNextTrainFromTimetable('범골', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();
    expect(res1?.endSubwayStationNm).toBe('발곡');

    // 2. 의정부경전철 환승역 (회룡 + '의정부경전철' 명시)
    const res2 = await calculateNextTrainFromTimetable('회룡', '상행', '의정부경전철');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toBeDefined();
    expect(['탑석', '차량기지임시승강장']).toContain(res2?.endSubwayStationNm);
  });
});
