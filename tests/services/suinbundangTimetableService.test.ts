import { describe, it, expect } from 'vitest';
import {
  getSuinbundangTimetableDatabase,
  isSuinbundangStation,
  isSuinbundangLine,
  resolveOfficialSuinbundangStationName,
  resolveSuinbundangDirection,
  getNextTrainFromSuinbundangTimetable,
  getSuinbundangTimetableList,
  SUINBUNDANG_STATIONS,
} from '@/lib/services/subway/suinbundangTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('SuinbundangTimetableService', () => {
  it('수인분당선 63개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getSuinbundangTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('수인분당선');
    expect(db?.meta.subwayId).toBe('1075');
    expect(db?.meta.totalStations).toBe(63);
    expect(db?.data).toBeDefined();

    // 주요 역 확인
    expect(db?.data['수원']).toBeDefined();
    expect(db?.data['기흥']).toBeDefined();
    expect(db?.data['모란']).toBeDefined();
    expect(db?.data['왕십리']).toBeDefined();
    expect(db?.data['인천']).toBeDefined();
    expect(db?.data['압구정로데오']).toBeDefined();
  });

  it('역명 정규화 및 수인분당선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isSuinbundangStation('수원역')).toBe(true);
    expect(isSuinbundangStation('기흥')).toBe(true);
    expect(isSuinbundangStation('압구정로데오')).toBe(true);
    expect(isSuinbundangStation('신인천')).toBe(true);
    expect(isSuinbundangStation('인천논')).toBe(true);
    expect(isSuinbundangStation('대모산')).toBe(true);
    expect(isSuinbundangStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialSuinbundangStationName('신인천')).toBe('인천');
    expect(resolveOfficialSuinbundangStationName('신수원')).toBe('수원');
    expect(resolveOfficialSuinbundangStationName('로데오')).toBe('압구정로데오');
    expect(resolveOfficialSuinbundangStationName('인천논')).toBe('인천논현');
    expect(resolveOfficialSuinbundangStationName('강남구')).toBe('강남구청');
    expect(resolveOfficialSuinbundangStationName('기흥역')).toBe('기흥');
  });

  it('노선 식별자(isSuinbundangLine)를 정확하게 판별해야 한다', () => {
    expect(isSuinbundangLine('1075')).toBe(true);
    expect(isSuinbundangLine('수인분당선')).toBe(true);
    expect(isSuinbundangLine('수인선')).toBe(true);
    expect(isSuinbundangLine('분당선')).toBe(true);
    expect(isSuinbundangLine('1002')).toBe(false);
    expect(isSuinbundangLine('2호선')).toBe(false);
  });

  it('방향(resolveSuinbundangDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveSuinbundangDirection('상행')).toBe('UP');
    expect(resolveSuinbundangDirection('1')).toBe('UP');
    expect(resolveSuinbundangDirection(undefined, '왕십리')).toBe('UP');
    expect(resolveSuinbundangDirection(undefined, '청량리')).toBe('UP');

    expect(resolveSuinbundangDirection('하행')).toBe('DOWN');
    expect(resolveSuinbundangDirection('2')).toBe('DOWN');
    expect(resolveSuinbundangDirection(undefined, '인천')).toBe('DOWN');
    expect(resolveSuinbundangDirection(undefined, '고색')).toBe('DOWN');
  });

  it('평일 주간(08:00 KST) 기흥역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromSuinbundangTimetable({
      stationName: '기흥',
      updnLine: '상행',
      now: fridayMorning,
    });

    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(Number(nextUp?.arrivalTime.split(':')[0])).toBeGreaterThanOrEqual(8);

    const nextDown = getNextTrainFromSuinbundangTimetable({
      stationName: '기흥',
      updnLine: '하행',
      now: fridayMorning,
    });

    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('휴일(일요일) 14:00 KST 수원역 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromSuinbundangTimetable({
      stationName: '수원',
      updnLine: '상행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromSuinbundangTimetable({
      stationName: '정자',
      updnLine: '하행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getSuinbundangTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getSuinbundangTimetableList('모란', 'UP', new Date(), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^K/);
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 수인분당선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('기흥', '상행', '1075');
    expect(result).not.toBeNull();
    // 가상 배차간격 "[예상]"이 아니라 공식 시간표 "[시간표]" 텍스트여야 함
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^K\d{4}$/);
  });
});
