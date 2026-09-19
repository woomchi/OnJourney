import { describe, it, expect } from 'vitest';
import {
  getSeohaeTimetableDatabase,
  isSeohaeStation,
  isSeohaeLine,
  resolveOfficialSeohaeStationName,
  resolveSeohaeDirection,
  getNextTrainFromSeohaeTimetable,
  getSeohaeTimetableList,
  SEOHAE_STATIONS,
  SEOHAE_UNIQUE_STATIONS,
} from '@/lib/services/subway/seohaeTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('SeohaeTimetableService', () => {
  it('서해선 21개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getSeohaeTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('서해선');
    expect(db?.meta.subwayId).toBe('1093');
    expect(db?.meta.totalStations).toBe(21);
    expect(db?.data).toBeDefined();

    // 21개 역사 존재 확인
    for (const stn of SEOHAE_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 서해선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isSeohaeStation('원시역')).toBe(true);
    expect(isSeohaeStation('신초지')).toBe(true);
    expect(isSeohaeStation('초지역')).toBe(true);
    expect(isSeohaeStation('시흥능')).toBe(true);
    expect(isSeohaeStation('시흥능곡')).toBe(true);
    expect(isSeohaeStation('시흥청')).toBe(true);
    expect(isSeohaeStation('시흥시청')).toBe(true);
    expect(isSeohaeStation('신소사')).toBe(true);
    expect(isSeohaeStation('소사역')).toBe(true);
    expect(isSeohaeStation('부천종')).toBe(true);
    expect(isSeohaeStation('부천종합운동장')).toBe(true);
    expect(isSeohaeStation('신김포')).toBe(true);
    expect(isSeohaeStation('김포공항')).toBe(true);
    expect(isSeohaeStation('대곡역')).toBe(true);
    expect(isSeohaeStation('일산역')).toBe(true);
    expect(isSeohaeStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialSeohaeStationName('신초지')).toBe('초지');
    expect(resolveOfficialSeohaeStationName('시흥능')).toBe('시흥능곡');
    expect(resolveOfficialSeohaeStationName('시흥청')).toBe('시흥시청');
    expect(resolveOfficialSeohaeStationName('신신현')).toBe('신현');
    expect(resolveOfficialSeohaeStationName('신신천')).toBe('신천');
    expect(resolveOfficialSeohaeStationName('시흥대')).toBe('시흥대야');
    expect(resolveOfficialSeohaeStationName('신소사')).toBe('소사');
    expect(resolveOfficialSeohaeStationName('부천종')).toBe('부천종합운동장');
    expect(resolveOfficialSeohaeStationName('신김포')).toBe('김포공항');
    expect(resolveOfficialSeohaeStationName('일산역')).toBe('일산');
  });

  it('노선 식별자(isSeohaeLine)를 정확하게 판별해야 한다', () => {
    expect(isSeohaeLine('1093')).toBe(true);
    expect(isSeohaeLine('서해선')).toBe(true);
    expect(isSeohaeLine('서해')).toBe(true);
    expect(isSeohaeLine('1002')).toBe(false);
    expect(isSeohaeLine('1075')).toBe(false);
  });

  it('방향(resolveSeohaeDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveSeohaeDirection('상행')).toBe('UP');
    expect(resolveSeohaeDirection('1')).toBe('UP');
    expect(resolveSeohaeDirection(undefined, '일산')).toBe('UP');
    expect(resolveSeohaeDirection(undefined, '대곡')).toBe('UP');
    expect(resolveSeohaeDirection(undefined, '김포공항')).toBe('UP');

    expect(resolveSeohaeDirection('하행')).toBe('DOWN');
    expect(resolveSeohaeDirection('2')).toBe('DOWN');
    expect(resolveSeohaeDirection(undefined, '원시')).toBe('DOWN');
    expect(resolveSeohaeDirection(undefined, '시우')).toBe('DOWN');
  });

  it('평일 주간(08:00 KST) 시흥시청역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromSeohaeTimetable({
      stationName: '시흥시청',
      updnLine: '상행',
      now: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('서해선');
    expect(nextUp?.trainNo).toMatch(/^K7/);

    const nextDown = getNextTrainFromSeohaeTimetable({
      stationName: '시흥시청',
      updnLine: '하행',
      now: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.endSubwayStationNm).toBe('원시');
  });

  it('휴일(일요일) 14:00 KST 원시역 상행 다음 열차를 정상 반환해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromSeohaeTimetable({
      stationName: '원시',
      updnLine: '상행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.subwayNm).toBe('서해선');
    expect(nextTrain?.trainNo).toMatch(/^K7/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 (금요일) 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromSeohaeTimetable({
      stationName: '원종',
      updnLine: '상행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getSeohaeTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getSeohaeTimetableList('소사', 'UP', new Date('2026-09-18T00:00:00Z'), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^K7/);
  });

  it('고유역 집합(SEOHAE_UNIQUE_STATIONS)이 정확하게 정의되어 있어야 한다', () => {
    expect(SEOHAE_UNIQUE_STATIONS.has('원시')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('시우')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('선부')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('달미')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('시흥시청')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('원종')).toBe(true);
    expect(SEOHAE_UNIQUE_STATIONS.has('소사')).toBe(false); // 1호선 환승역
    expect(SEOHAE_UNIQUE_STATIONS.has('대곡')).toBe(false); // 3호선/경의선 환승역
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 서해선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('신천', '상행', '1093');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^K7\d{3}$/);
  });
});
