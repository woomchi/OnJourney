import { describe, it, expect } from 'vitest';
import {
  getSillimTimetableDatabase,
  isSillimStation,
  isSillimLine,
  isSillimExclusiveStation,
  resolveOfficialSillimStationName,
  resolveSillimDirection,
  getSillimNextTrain,
  getNextTrainFromSillimTimetable,
  getSillimTimetableList,
  loadSillimStationTimetable,
  SILLIM_STATIONS,
  SILLIM_UNIQUE_STATIONS,
} from '@/lib/services/subway/sillimTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('SillimTimetableService', () => {
  it('신림선 11개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getSillimTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('신림선');
    expect(db?.meta.subwayId).toBe('1095');
    expect(db?.meta.totalStations).toBe(11);
    expect(db?.data).toBeDefined();

    // 11개 역사 존재 확인
    for (const stn of SILLIM_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 신림선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isSillimStation('샛강역')).toBe(true);
    expect(isSillimStation('대방(성애병원)')).toBe(true);
    expect(isSillimStation('성애병원')).toBe(true);
    expect(isSillimStation('서울지방병무청')).toBe(true);
    expect(isSillimStation('병무청역')).toBe(true);
    expect(isSillimStation('보라매역')).toBe(true);
    expect(isSillimStation('보라매공원')).toBe(true);
    expect(isSillimStation('보라매병원(전문건설회관)')).toBe(true);
    expect(isSillimStation('당곡')).toBe(true);
    expect(isSillimStation('신림역')).toBe(true);
    expect(isSillimStation('서원')).toBe(true);
    expect(isSillimStation('서울대벤처타운')).toBe(true);
    expect(isSillimStation('벤처타운')).toBe(true);
    expect(isSillimStation('관악산(서울대)')).toBe(true);
    expect(isSillimStation('서울대(관악산)')).toBe(true);
    expect(isSillimStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialSillimStationName('대방(성애병원)')).toBe('대방');
    expect(resolveOfficialOfficialSillimStationName('성애병원')).toBe('대방');
    expect(resolveOfficialSillimStationName('보라매병원(전문건설회관)')).toBe('보라매병원');
    expect(resolveOfficialSillimStationName('관악산(서울대)')).toBe('관악산');
    expect(resolveOfficialSillimStationName('벤처타운역')).toBe('서울대벤처타운');
  });

  function resolveOfficialOfficialSillimStationName(raw: string) {
    return resolveOfficialSillimStationName(raw);
  }

  it('신림선 단독 고유역(7개 역)을 정확히 식별해야 한다', () => {
    expect(isSillimExclusiveStation('서울지방병무청')).toBe(true);
    expect(isSillimExclusiveStation('보라매공원')).toBe(true);
    expect(isSillimExclusiveStation('보라매병원')).toBe(true);
    expect(isSillimExclusiveStation('당곡')).toBe(true);
    expect(isSillimExclusiveStation('서원')).toBe(true);
    expect(isSillimExclusiveStation('서울대벤처타운')).toBe(true);
    expect(isSillimExclusiveStation('관악산')).toBe(true);

    // 환승역은 false
    expect(isSillimExclusiveStation('샛강')).toBe(false);
    expect(isSillimExclusiveStation('대방')).toBe(false);
    expect(isSillimExclusiveStation('보라매')).toBe(false);
    expect(isSillimExclusiveStation('신림')).toBe(false);
  });

  it('노선 식별자(isSillimLine)를 정확하게 판별해야 한다', () => {
    expect(isSillimLine('1095')).toBe(true);
    expect(isSillimLine('신림선')).toBe(true);
    expect(isSillimLine('신림')).toBe(true);
    expect(isSillimLine('1002')).toBe(false);
    expect(isSillimLine('1077')).toBe(false);
  });

  it('방향(resolveSillimDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveSillimDirection('상행')).toBe('UP');
    expect(resolveSillimDirection('1')).toBe('UP');
    expect(resolveSillimDirection(undefined, '샛강')).toBe('UP');
    expect(resolveSillimDirection(undefined, '대방')).toBe('UP');

    expect(resolveSillimDirection('하행')).toBe('DOWN');
    expect(resolveSillimDirection('2')).toBe('DOWN');
    expect(resolveSillimDirection(undefined, '관악산')).toBe('DOWN');
    expect(resolveSillimDirection(undefined, '신림')).toBe('DOWN');
  });

  it('기점(샛강)은 하행선 전용, 종점(관악산)은 상행선 전용이어야 한다', () => {
    const db = getSillimTimetableDatabase();
    expect(db).not.toBeNull();

    // 샛강역: 하행선만 있고 상행선은 0
    expect(db?.data['샛강']['신림선_DAY_DOWN'].length).toBeGreaterThan(100);
    expect(db?.data['샛강']['신림선_DAY_UP'].length).toBe(0);

    // 관악산역: 상행선만 있고 하행선은 0
    expect(db?.data['관악산']['신림선_DAY_UP'].length).toBeGreaterThan(100);
    expect(db?.data['관악산']['신림선_DAY_DOWN'].length).toBe(0);
  });

  it('평일 출근시간대(08:00 KST) 보라매역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getSillimNextTrain({
      stationName: '보라매',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('샛강');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('신림선');
    expect(nextUp?.trainNo).toMatch(/^S1/);

    const nextDown = getSillimNextTrain({
      stationName: '보라매',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('관악산');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('신림선');
    expect(nextDown?.trainNo).toMatch(/^S2/);
  });

  it('주말(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromSillimTimetable({
      stationName: '당곡',
      updnLine: '상행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(nextSunday?.endSubwayStationNm).toBe('샛강');
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 신림선 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 신림선 단독 고유역 (당곡)
    const res1 = await calculateNextTrainFromTimetable('당곡', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();

    // 2. 신림선 lineId ('1095') 명시적 호출 (보라매)
    const res2 = await calculateNextTrainFromTimetable('보라매', '상행', '1095');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toContain('샛강');

    // 3. 서원역 하행
    const res3 = await calculateNextTrainFromTimetable('서원', '하행');
    expect(res3).not.toBeNull();
    expect(res3?.statusText).toContain('관악산');
  });

  it('운행종료 심야 시간대(03:00 KST)에 첫차 대기 상태가 올바르게 반환되어야 한다', () => {
    // 2026-09-18 03:00:00 KST = 2026-09-17T18:00:00Z
    const lateNight = new Date('2026-09-17T18:00:00.000Z');

    const nextTrain = getSillimNextTrain({
      stationName: '신림',
      updnLine: '하행',
      baseTime: lateNight,
    });
    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.canBoard).toBe(false);
    expect(nextTrain?.minutesLeft).toBe(999);
    expect(nextTrain?.statusText).toContain('운행종료');
    expect(nextTrain?.arrivalTime).toBe('05:41'); // 신림역 하행 첫차 05:41
  });
});
