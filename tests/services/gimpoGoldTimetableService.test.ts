import { describe, it, expect } from 'vitest';
import {
  getGimpoGoldTimetableDatabase,
  isGimpoGoldStation,
  isGimpoGoldLine,
  isGimpoGoldExclusiveStation,
  resolveOfficialGimpoGoldStationName,
  resolveGimpoGoldDirection,
  getGimpoGoldNextTrain,
  getNextTrainFromGimpoGoldTimetable,
  getGimpoGoldTimetableList,
  loadGimpoGoldStationTimetable,
  GIMPO_GOLD_STATIONS,
  GIMPO_GOLD_UNIQUE_STATIONS,
} from '@/lib/services/subway/gimpoGoldTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('GimpoGoldTimetableService', () => {
  it('김포골드라인 10개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getGimpoGoldTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('김포골드라인');
    expect(db?.meta.subwayId).toBe('1096');
    expect(db?.meta.totalStations).toBe(10);
    expect(db?.data).toBeDefined();

    // 10개 역사 존재 확인
    for (const stn of GIMPO_GOLD_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 김포골드라인 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isGimpoGoldStation('양촌역')).toBe(true);
    expect(isGimpoGoldStation('구래')).toBe(true);
    expect(isGimpoGoldStation('마산역')).toBe(true);
    expect(isGimpoGoldStation('장기')).toBe(true);
    expect(isGimpoGoldStation('운양역')).toBe(true);
    expect(isGimpoGoldStation('걸포북변')).toBe(true);
    expect(isGimpoGoldStation('사우(김포시청)')).toBe(true);
    expect(isGimpoGoldStation('김포시청')).toBe(true);
    expect(isGimpoGoldStation('풍무역')).toBe(true);
    expect(isGimpoGoldStation('고촌')).toBe(true);
    expect(isGimpoGoldStation('김포공항역')).toBe(true);
    expect(isGimpoGoldStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialGimpoGoldStationName('사우(김포시청)')).toBe('사우');
    expect(resolveOfficialGimpoGoldStationName('김포시청')).toBe('사우');
    expect(resolveOfficialGimpoGoldStationName('걸포북변역')).toBe('걸포북변');
    expect(resolveOfficialGimpoGoldStationName('김포공항')).toBe('김포공항');
  });

  it('김포골드라인 단독 고유역(9개 역)을 정확히 식별해야 한다', () => {
    expect(isGimpoGoldExclusiveStation('양촌')).toBe(true);
    expect(isGimpoGoldExclusiveStation('구래')).toBe(true);
    expect(isGimpoGoldExclusiveStation('마산')).toBe(true);
    expect(isGimpoGoldExclusiveStation('장기')).toBe(true);
    expect(isGimpoGoldExclusiveStation('운양')).toBe(true);
    expect(isGimpoGoldExclusiveStation('걸포북변')).toBe(true);
    expect(isGimpoGoldExclusiveStation('사우')).toBe(true);
    expect(isGimpoGoldExclusiveStation('풍무')).toBe(true);
    expect(isGimpoGoldExclusiveStation('고촌')).toBe(true);

    // 김포공항역은 다중 환승역(5, 9, 공항철도, 서해선)이므로 단독 고유역 아님
    expect(isGimpoGoldExclusiveStation('김포공항')).toBe(false);
  });

  it('노선 식별자(isGimpoGoldLine)를 정확하게 판별해야 한다', () => {
    expect(isGimpoGoldLine('1096')).toBe(true);
    expect(isGimpoGoldLine('1017')).toBe(true);
    expect(isGimpoGoldLine('김포골드라인')).toBe(true);
    expect(isGimpoGoldLine('김포골드')).toBe(true);
    expect(isGimpoGoldLine('김포')).toBe(true);
    expect(isGimpoGoldLine('1002')).toBe(false);
    expect(isGimpoGoldLine('1065')).toBe(false);
  });

  it('방향(resolveGimpoGoldDirection)이 올바르게 판정되어야 한다', () => {
    // 상행 (김포공항 방면)
    expect(resolveGimpoGoldDirection('상행')).toBe('UP');
    expect(resolveGimpoGoldDirection('1')).toBe('UP');
    expect(resolveGimpoGoldDirection(undefined, '김포공항')).toBe('UP');
    expect(resolveGimpoGoldDirection(undefined, '고촌')).toBe('UP');

    // 하행 (양촌 / 구래 방면)
    expect(resolveGimpoGoldDirection('하행')).toBe('DOWN');
    expect(resolveGimpoGoldDirection('2')).toBe('DOWN');
    expect(resolveGimpoGoldDirection(undefined, '구래')).toBe('DOWN');
    expect(resolveGimpoGoldDirection(undefined, '양촌')).toBe('DOWN');
  });

  it('기점(양촌)은 상행선 전용, 종점(김포공항)은 하행선 전용이어야 한다', () => {
    const db = getGimpoGoldTimetableDatabase();
    expect(db).not.toBeNull();

    // 양촌역: 상행선(김포공항행)만 있고 하행선은 존재하지 않음
    expect(db?.data['양촌']['김포골드라인_DAY_UP'].length).toBeGreaterThan(50);
    expect(db?.data['양촌']['김포골드라인_DAY_DOWN']).toBeUndefined();

    // 김포공항역: 하행선(구래/양촌행)만 있고 상행선은 0건
    expect(db?.data['김포공항']['김포골드라인_DAY_DOWN'].length).toBeGreaterThan(100);
    expect(db?.data['김포공항']['김포골드라인_SAT_UP']?.length ?? 0).toBe(0);
  });

  it('하행선 운행편 중 구래행과 양촌행이 모두 존재해야 한다', () => {
    const db = getGimpoGoldTimetableDatabase();
    expect(db).not.toBeNull();

    const guraeTrains = db?.data['김포공항']['김포골드라인_DAY_DOWN'].filter(t => t.d === '구래');
    const yangchonTrains = db?.data['김포공항']['김포골드라인_DAY_DOWN'].filter(t => t.d === '양촌');

    expect(guraeTrains?.length).toBeGreaterThan(100);
    expect(yangchonTrains?.length).toBeGreaterThan(30);
  });

  it('평일 출근시간대(08:00 KST) 사우역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getGimpoGoldNextTrain({
      stationName: '사우',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('김포공항');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('김포골드라인');
    expect(nextUp?.trainNo).toMatch(/^G1/);

    const nextDown = getGimpoGoldNextTrain({
      stationName: '사우',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(['구래', '양촌']).toContain(nextDown?.endSubwayStationNm);
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('김포골드라인');
    expect(nextDown?.trainNo).toMatch(/^G2/);
  });

  it('주말(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromGimpoGoldTimetable({
      stationName: '장기',
      updnLine: '상행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(nextSunday?.endSubwayStationNm).toBe('김포공항');
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('심야 막차 이후에는 익일 첫차가 산출되어야 한다', () => {
    // 2026-09-18 (금요일) 23:58:00 KST (심야 막차 종료 이후 시간대)
    // 김포공항 출발 막차는 24시 이후(익일 00:40 등)까지 운행하므로, 02:00 KST로 테스트
    const lateNight = new Date('2026-09-18T17:00:00.000Z'); // 02:00 KST 토요일

    const nextMorning = getGimpoGoldNextTrain({
      stationName: '구래',
      updnLine: '상행',
      baseTime: lateNight,
    });
    expect(nextMorning).not.toBeNull();
    expect(nextMorning?.canBoard).toBe(false);
    expect(nextMorning?.statusText).toContain('첫차');
    expect(nextMorning?.arrivalTime).toMatch(/^05:\d{2}$/);
  });

  it('역별 전일 시간표 목록(getGimpoGoldTimetableList)이 정상 반환되어야 한다', () => {
    const timetable = getGimpoGoldTimetableList('풍무', '상행', 'DAY');
    expect(timetable.length).toBeGreaterThan(150);
    expect(timetable[0].depTime).toMatch(/^\d{2}:\d{2}$/);
    expect(timetable[0].destStation).toBe('김포공항');

    const loaded = loadGimpoGoldStationTimetable('풍무');
    expect(loaded).not.toBeNull();
    expect(loaded?.['김포골드라인_DAY_UP']).toBeDefined();
    expect(loaded?.['김포골드라인_DAY_DOWN']).toBeDefined();
    expect(loaded?.['김포골드라인_DAY_UP'].length).toBeGreaterThan(0);
    expect(loaded?.['김포골드라인_DAY_DOWN'].length).toBeGreaterThan(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 김포골드라인 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 김포골드라인 단독 고유역 (사우)
    const res1 = await calculateNextTrainFromTimetable('사우', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();

    // 2. 김포골드라인 환승역 (김포공항 + '김포골드라인' 명시)
    const res2 = await calculateNextTrainFromTimetable('김포공항', '하행', '김포골드라인');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toBeDefined();
    expect(['구래', '양촌']).toContain(res2?.endSubwayStationNm);
  });
});
