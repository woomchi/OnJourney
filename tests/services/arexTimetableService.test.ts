import { describe, it, expect } from 'vitest';
import {
  getArexTimetableDatabase,
  isArexStation,
  isArexLine,
  isArexExclusiveStation,
  resolveOfficialArexStationName,
  resolveArexDirection,
  getArexNextTrain,
  getNextTrainFromArexTimetable,
  getArexTimetableList,
  loadArexStationTimetable,
  AREX_STATIONS,
  AREX_UNIQUE_STATIONS,
} from '@/lib/services/subway/arexTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('ArexTimetableService', () => {
  it('공항철도 14개 여객 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getArexTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('공항철도');
    expect(db?.meta.subwayId).toBe('1065');
    expect(db?.meta.totalStations).toBe(14);
    expect(db?.data).toBeDefined();

    // 14개 역사 존재 확인
    for (const stn of AREX_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 공항철도 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isArexStation('서울역')).toBe(true);
    expect(isArexStation('서울')).toBe(true);
    expect(isArexStation('공덕')).toBe(true);
    expect(isArexStation('홍대입구역')).toBe(true);
    expect(isArexStation('홍대')).toBe(true);
    expect(isArexStation('디지털미디어시티')).toBe(true);
    expect(isArexStation('DMC')).toBe(true);
    expect(isArexStation('마곡나루역')).toBe(true);
    expect(isArexStation('김포공항')).toBe(true);
    expect(isArexStation('계양역')).toBe(true);
    expect(isArexStation('검암')).toBe(true);
    expect(isArexStation('청라국제도시')).toBe(true);
    expect(isArexStation('영종')).toBe(true);
    expect(isArexStation('운서역')).toBe(true);
    expect(isArexStation('공항화물청사')).toBe(true);
    expect(isArexStation('화물청사')).toBe(true);
    expect(isArexStation('인천공항1터미널')).toBe(true);
    expect(isArexStation('인천국제공항1터미널')).toBe(true);
    expect(isArexStation('인천공항2터미널')).toBe(true);
    expect(isArexStation('인천공항T2')).toBe(true);
    expect(isArexStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialArexStationName('서울역')).toBe('서울');
    expect(resolveOfficialArexStationName('홍대')).toBe('홍대입구');
    expect(resolveOfficialArexStationName('DMC역')).toBe('디지털미디어시티');
    expect(resolveOfficialArexStationName('청라역')).toBe('청라국제도시');
    expect(resolveOfficialArexStationName('인천공항T1')).toBe('인천공항1터미널');
    expect(resolveOfficialArexStationName('인천공항T2')).toBe('인천공항2터미널');
  });

  it('공항철도 단독 고유역(6개 역)을 정확히 식별해야 한다', () => {
    expect(isArexExclusiveStation('청라국제도시')).toBe(true);
    expect(isArexExclusiveStation('영종')).toBe(true);
    expect(isArexExclusiveStation('운서')).toBe(true);
    expect(isArexExclusiveStation('공항화물청사')).toBe(true);
    expect(isArexExclusiveStation('인천공항1터미널')).toBe(true);
    expect(isArexExclusiveStation('인천공항2터미널')).toBe(true);

    // 환승역은 false
    expect(isArexExclusiveStation('서울')).toBe(false);
    expect(isArexExclusiveStation('공덕')).toBe(false);
    expect(isArexExclusiveStation('홍대입구')).toBe(false);
    expect(isArexExclusiveStation('김포공항')).toBe(false);
    expect(isArexExclusiveStation('검암')).toBe(false);
  });

  it('노선 식별자(isArexLine)를 정확하게 판별해야 한다', () => {
    expect(isArexLine('1065')).toBe(true);
    expect(isArexLine('공항철도')).toBe(true);
    expect(isArexLine('공항선')).toBe(true);
    expect(isArexLine('arex')).toBe(true);
    expect(isArexLine('AREX')).toBe(true);
    expect(isArexLine('1002')).toBe(false);
    expect(isArexLine('1077')).toBe(false);
  });

  it('방향(resolveArexDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveArexDirection('상행')).toBe('UP');
    expect(resolveArexDirection('1')).toBe('UP');
    expect(resolveArexDirection(undefined, '서울')).toBe('UP');
    expect(resolveArexDirection(undefined, '서울역')).toBe('UP');
    expect(resolveArexDirection(undefined, '디지털미디어시티')).toBe('UP');

    expect(resolveArexDirection('하행')).toBe('DOWN');
    expect(resolveArexDirection('2')).toBe('DOWN');
    expect(resolveArexDirection(undefined, '인천공항2터미널')).toBe('DOWN');
    expect(resolveArexDirection(undefined, '검암')).toBe('DOWN');
  });

  it('직통열차는 서울역 및 인천공항 터미널에서만 정차하고 중간역에서는 정차하지 않아야 한다', () => {
    // 서울역 출발 시각표에는 직통열차(e=1)가 포함되어야 함
    const seoulList = getArexTimetableList('서울', '하행', 'DAY');
    const seoulExpress = seoulList.filter(it => it.isExpress);
    expect(seoulExpress.length).toBeGreaterThan(0);

    // 김포공항역 출발 시각표에는 직통열차(e=1)가 전혀 없어야 함 (무정차 통과)
    const gimpoList = getArexTimetableList('김포공항', '하행', 'DAY');
    const gimpoExpress = gimpoList.filter(it => it.isExpress);
    expect(gimpoExpress.length).toBe(0);

    // 공덕역에도 직통열차가 없어야 함
    const gongdeokList = getArexTimetableList('공덕', '상행', 'DAY');
    const gongdeokExpress = gongdeokList.filter(it => it.isExpress);
    expect(gimpoExpress.length).toBe(0);

    // 인천공항1터미널에는 직통열차가 정차해야 함
    const t1List = getArexTimetableList('인천공항1터미널', '상행', 'DAY');
    const t1Express = t1List.filter(it => it.isExpress);
    expect(t1Express.length).toBeGreaterThan(0);
  });

  it('평일 출근시간대(08:00 KST) 김포공항역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getArexNextTrain({
      stationName: '김포공항',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('서울');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('공항철도');
    expect(nextUp?.isExpress).toBe(false); // 김포공항은 직통 미정차

    const nextDown = getArexNextTrain({
      stationName: '김포공항',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('공항철도');
    expect(nextDown?.isExpress).toBe(false);
  });

  it('주말(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromArexTimetable({
      stationName: '청라국제도시',
      updnLine: '하행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(nextSunday?.endSubwayStationNm).toBe('인천공항2터미널');
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 공항철도 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 공항철도 고유역 (청라국제도시)
    const res1 = await calculateNextTrainFromTimetable('청라국제도시', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();

    // 2. 공항철도 lineId ('1065') 명시적 호출
    const res2 = await calculateNextTrainFromTimetable('김포공항', '하행', '1065');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toBeDefined();

    // 3. 영종역 상행
    const res3 = await calculateNextTrainFromTimetable('영종', '상행');
    expect(res3).not.toBeNull();
    expect(res3?.statusText).toContain('서울');
  });

  it('운행종료 심야 시간대(03:00 KST)에 첫차 대기 상태가 올바르게 반환되어야 한다', () => {
    // 2026-09-18 03:00:00 KST = 2026-09-17T18:00:00Z
    const lateNight = new Date('2026-09-17T18:00:00.000Z');

    const nextTrain = getArexNextTrain({
      stationName: '검암',
      updnLine: '하행',
      baseTime: lateNight,
    });
    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.canBoard).toBe(false);
    expect(nextTrain?.minutesLeft).toBe(999);
    expect(nextTrain?.statusText).toContain('운행종료');
    expect(nextTrain?.arrivalTime).toBe('05:08'); // 검암 하행 첫차 05:08
  });
});
