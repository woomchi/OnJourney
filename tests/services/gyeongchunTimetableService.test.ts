import { describe, it, expect } from 'vitest';
import {
  getGyeongchunTimetableDatabase,
  isGyeongchunStation,
  isGyeongchunLine,
  resolveOfficialGyeongchunStationName,
  resolveGyeongchunDirection,
  getNextTrainFromGyeongchunTimetable,
  getGyeongchunTimetableList,
  GYEONGCHUN_STATIONS,
} from '@/lib/services/subway/gyeongchunTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('GyeongchunTimetableService', () => {
  it('경춘선 25개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getGyeongchunTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('경춘선');
    expect(db?.meta.subwayId).toBe('1067');
    expect(db?.meta.totalStations).toBe(25);
    expect(db?.data).toBeDefined();

    // 25개 역사 존재 확인
    for (const stn of GYEONGCHUN_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 경춘선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isGyeongchunStation('춘천역')).toBe(true);
    expect(isGyeongchunStation('남춘천')).toBe(true);
    expect(isGyeongchunStation('김유정')).toBe(true);
    expect(isGyeongchunStation('강촌')).toBe(true);
    expect(isGyeongchunStation('가평')).toBe(true);
    expect(isGyeongchunStation('청평')).toBe(true);
    expect(isGyeongchunStation('대성리')).toBe(true);
    expect(isGyeongchunStation('마석')).toBe(true);
    expect(isGyeongchunStation('평내호평')).toBe(true);
    expect(isGyeongchunStation('평내호')).toBe(true);
    expect(isGyeongchunStation('상봉')).toBe(true);
    expect(isGyeongchunStation('청량리')).toBe(true);
    expect(isGyeongchunStation('광운대')).toBe(true);
    expect(isGyeongchunStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialGyeongchunStationName('평내호')).toBe('평내호평');
    expect(resolveOfficialGyeongchunStationName('남춘천역')).toBe('남춘천');
    expect(resolveOfficialGyeongchunStationName('가평역')).toBe('가평');
  });

  it('노선 식별자(isGyeongchunLine)를 정확하게 판별해야 한다', () => {
    expect(isGyeongchunLine('1067')).toBe(true);
    expect(isGyeongchunLine('경춘선')).toBe(true);
    expect(isGyeongchunLine('경춘')).toBe(true);
    expect(isGyeongchunLine('1002')).toBe(false);
    expect(isGyeongchunLine('1081')).toBe(false);
  });

  it('방향(resolveGyeongchunDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveGyeongchunDirection('상행')).toBe('UP');
    expect(resolveGyeongchunDirection('1')).toBe('UP');
    expect(resolveGyeongchunDirection(undefined, '상봉')).toBe('UP');
    expect(resolveGyeongchunDirection(undefined, '청량리')).toBe('UP');
    expect(resolveGyeongchunDirection(undefined, '광운대')).toBe('UP');

    expect(resolveGyeongchunDirection('하행')).toBe('DOWN');
    expect(resolveGyeongchunDirection('2')).toBe('DOWN');
    expect(resolveGyeongchunDirection(undefined, '춘천')).toBe('DOWN');
    expect(resolveGyeongchunDirection(undefined, '남춘천')).toBe('DOWN');
    expect(resolveGyeongchunDirection(undefined, '마석')).toBe('DOWN');
  });

  it('평일 주간(08:00 KST) 가평역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromGyeongchunTimetable({
      stationName: '가평',
      updnLine: '상행',
      now: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('경춘선');

    const nextDown = getNextTrainFromGyeongchunTimetable({
      stationName: '가평',
      updnLine: '하행',
      now: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.endSubwayStationNm).toBe('춘천');
  });

  it('휴일(일요일) 14:00 KST 춘천역 상행 다음 열차를 정상 반환해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromGyeongchunTimetable({
      stationName: '춘천',
      updnLine: '상행',
      now: sundayAfternoon,
    });
    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.subwayNm).toBe('경춘선');
    expect(nextTrain?.trainNo).toMatch(/^K8/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 (금요일) 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromGyeongchunTimetable({
      stationName: '청평',
      updnLine: '상행',
      now: midnight,
    });
    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('급행 열차(isExpress: true)가 올바르게 인식되어야 한다', () => {
    const list = getGyeongchunTimetableList('가평', 'UP', new Date('2026-09-18T00:00:00Z'), 100);
    expect(list.length).toBeGreaterThan(0);
    const expressTrains = list.filter((t) => t.isExpress);
    expect(expressTrains.length).toBeGreaterThan(0);
    for (const exp of expressTrains) {
      expect(exp.trainNo.startsWith('K81') || exp.trainNo.startsWith('K84')).toBe(true);
    }
  });

  it('광운대 시종착 셔틀 열차가 정상 등록되어 조회되어야 한다', () => {
    const list = getGyeongchunTimetableList('광운대', 'DOWN', new Date('2026-09-18T00:00:00Z'), 100);
    expect(list.length).toBeGreaterThan(0);
    // K8301, K8303 등 광운대 출발 열차 확인
    const shuttle = list.find((t) => t.trainNo.startsWith('K83'));
    expect(shuttle).toBeDefined();
    expect(shuttle?.destStation).toBe('춘천');
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 경춘선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('남춘천', '상행', '1067');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^K8\d{3}$/);
  });
});
