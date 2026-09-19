import { describe, it, expect } from 'vitest';
import {
  getGyeonguiTimetableDatabase,
  isGyeonguiStation,
  isGyeonguiLine,
  resolveOfficialGyeonguiStationName,
  resolveGyeonguiDirection,
  getNextTrainFromGyeonguiTimetable,
  getGyeonguiTimetableList,
  GYEONGUI_STATIONS,
} from '@/lib/services/subway/gyeonguiTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('GyeonguiTimetableService', () => {
  it('경의중앙선 53개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getGyeonguiTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('경의중앙선');
    expect(db?.meta.subwayId).toBe('1063');
    expect(db?.meta.totalStations).toBe(53);
    expect(db?.data).toBeDefined();

    // 53개 역사 존재 확인
    for (const stn of GYEONGUI_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 경의중앙선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isGyeonguiStation('문산역')).toBe(true);
    expect(isGyeonguiStation('일산')).toBe(true);
    expect(isGyeonguiStation('효창공')).toBe(true);
    expect(isGyeonguiStation('디엠시')).toBe(true);
    expect(isGyeonguiStation('1양정')).toBe(true);
    expect(isGyeonguiStation('1양원')).toBe(true);
    expect(isGyeonguiStation('항공대')).toBe(true);
    expect(isGyeonguiStation('홍대입')).toBe(true);
    expect(isGyeonguiStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialGyeonguiStationName('1양정')).toBe('양정');
    expect(resolveOfficialGyeonguiStationName('1양원')).toBe('양원');
    expect(resolveOfficialGyeonguiStationName('효창공')).toBe('효창공원앞');
    expect(resolveOfficialGyeonguiStationName('홍대입')).toBe('홍대입구');
    expect(resolveOfficialGyeonguiStationName('디엠시')).toBe('디지털미디어시티');
    expect(resolveOfficialGyeonguiStationName('항공대')).toBe('한국항공대');
    expect(resolveOfficialGyeonguiStationName('용문역')).toBe('용문');
    expect(resolveOfficialGyeonguiStationName('문산역')).toBe('문산');
  });

  it('노선 식별자(isGyeonguiLine)를 정확하게 판별해야 한다', () => {
    expect(isGyeonguiLine('1063')).toBe(true);
    expect(isGyeonguiLine('경의중앙선')).toBe(true);
    expect(isGyeonguiLine('경의선')).toBe(true);
    expect(isGyeonguiLine('중앙선')).toBe(true);
    expect(isGyeonguiLine('1002')).toBe(false);
    expect(isGyeonguiLine('1075')).toBe(false);
  });

  it('방향(resolveGyeonguiDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveGyeonguiDirection('상행')).toBe('UP');
    expect(resolveGyeonguiDirection('1')).toBe('UP');
    expect(resolveGyeonguiDirection(undefined, '문산')).toBe('UP');
    expect(resolveGyeonguiDirection(undefined, '일산')).toBe('UP');

    expect(resolveGyeonguiDirection('하행')).toBe('DOWN');
    expect(resolveGyeonguiDirection('2')).toBe('DOWN');
    expect(resolveGyeonguiDirection(undefined, '용문')).toBe('DOWN');
    expect(resolveGyeonguiDirection(undefined, '지평')).toBe('DOWN');
    expect(resolveGyeonguiDirection(undefined, '덕소')).toBe('DOWN');
  });

  it('평일 주간(08:00 KST) 일산역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromGyeonguiTimetable({
      stationName: '일산',
      updnLine: '상행',
      now: fridayMorning,
    });

    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);

    const nextDown = getNextTrainFromGyeonguiTimetable({
      stationName: '일산',
      updnLine: '하행',
      now: fridayMorning,
    });

    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('휴일(일요일) 14:00 KST 용산역 하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromGyeonguiTimetable({
      stationName: '용산',
      updnLine: '하행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.trainNo).toMatch(/^K5/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromGyeonguiTimetable({
      stationName: '행신',
      updnLine: '상행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getGyeonguiTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getGyeonguiTimetableList('대곡', 'UP', new Date(), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^K5/);
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 경의중앙선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('문산', '하행', '1063');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^K5\d{3}$/);
  });
});
