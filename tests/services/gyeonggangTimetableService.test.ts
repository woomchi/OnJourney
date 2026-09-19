import { describe, it, expect } from 'vitest';
import {
  getGyeonggangTimetableDatabase,
  isGyeonggangStation,
  isGyeonggangLine,
  resolveOfficialGyeonggangStationName,
  resolveGyeonggangDirection,
  getNextTrainFromGyeonggangTimetable,
  getGyeonggangTimetableList,
  GYEONGGANG_STATIONS,
} from '@/lib/services/subway/gyeonggangTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('GyeonggangTimetableService', () => {
  it('경강선 12개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getGyeonggangTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('경강선');
    expect(db?.meta.subwayId).toBe('1081');
    expect(db?.meta.totalStations).toBe(12);
    expect(db?.data).toBeDefined();

    // 12개 역사 존재 확인
    for (const stn of GYEONGGANG_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 경강선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isGyeonggangStation('판교역')).toBe(true);
    expect(isGyeonggangStation('경기광주')).toBe(true);
    expect(isGyeonggangStation('신둔도예촌')).toBe(true);
    expect(isGyeonggangStation('세종릉')).toBe(true);
    expect(isGyeonggangStation('도예촌')).toBe(true);
    expect(isGyeonggangStation('경광주')).toBe(true);
    expect(isGyeonggangStation('신판교')).toBe(true);
    expect(isGyeonggangStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialGyeonggangStationName('신판교')).toBe('판교');
    expect(resolveOfficialGyeonggangStationName('신이매')).toBe('이매');
    expect(resolveOfficialGyeonggangStationName('경광주')).toBe('경기광주');
    expect(resolveOfficialGyeonggangStationName('도예촌')).toBe('신둔도예촌');
    expect(resolveOfficialGyeonggangStationName('세종릉')).toBe('세종대왕릉');
    expect(resolveOfficialGyeonggangStationName('이천역')).toBe('이천');
  });

  it('노선 식별자(isGyeonggangLine)를 정확하게 판별해야 한다', () => {
    expect(isGyeonggangLine('1081')).toBe(true);
    expect(isGyeonggangLine('경강선')).toBe(true);
    expect(isGyeonggangLine('1002')).toBe(false);
    expect(isGyeonggangLine('1075')).toBe(false);
  });

  it('방향(resolveGyeonggangDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveGyeonggangDirection('상행')).toBe('UP');
    expect(resolveGyeonggangDirection('1')).toBe('UP');
    expect(resolveGyeonggangDirection(undefined, '판교')).toBe('UP');

    expect(resolveGyeonggangDirection('하행')).toBe('DOWN');
    expect(resolveGyeonggangDirection('2')).toBe('DOWN');
    expect(resolveGyeonggangDirection(undefined, '여주')).toBe('DOWN');
    expect(resolveGyeonggangDirection(undefined, '부발')).toBe('DOWN');
  });

  it('평일 주간(08:00 KST) 경기광주역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromGyeonggangTimetable({
      stationName: '경기광주',
      updnLine: '상행',
      now: fridayMorning,
    });

    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.endSubwayStationNm).toBe('판교');

    const nextDown = getNextTrainFromGyeonggangTimetable({
      stationName: '경기광주',
      updnLine: '하행',
      now: fridayMorning,
    });

    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('휴일(일요일) 14:00 KST 판교역 하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromGyeonggangTimetable({
      stationName: '판교',
      updnLine: '하행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.trainNo).toMatch(/^K75/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromGyeonggangTimetable({
      stationName: '이천',
      updnLine: '상행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getGyeonggangTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getGyeonggangTimetableList('곤지암', 'UP', new Date(), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^K75/);
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 경강선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('경기광주', '상행', '1081');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^K75\d{2}$/);
  });
});
