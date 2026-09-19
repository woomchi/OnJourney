import { describe, it, expect } from 'vitest';
import {
  getShinbundangTimetableDatabase,
  isShinbundangStation,
  isShinbundangLine,
  resolveOfficialShinbundangStationName,
  resolveShinbundangDirection,
  getNextTrainFromShinbundangTimetable,
  getShinbundangTimetableList,
  SHINBUNDANG_STATIONS,
  SHINBUNDANG_UNIQUE_STATIONS,
} from '@/lib/services/subway/shinbundangTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('ShinbundangTimetableService', () => {
  it('신분당선 16개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getShinbundangTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('신분당선');
    expect(db?.meta.subwayId).toBe('1077');
    expect(db?.meta.totalStations).toBe(16);
    expect(db?.data).toBeDefined();

    // 16개 역사 존재 확인
    for (const stn of SHINBUNDANG_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 신분당선 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isShinbundangStation('신사역')).toBe(true);
    expect(isShinbundangStation('논현')).toBe(true);
    expect(isShinbundangStation('신논현역')).toBe(true);
    expect(isShinbundangStation('강남')).toBe(true);
    expect(isShinbundangStation('양재(서초구청)')).toBe(true);
    expect(isShinbundangStation('양재시민의숲')).toBe(true);
    expect(isShinbundangStation('매헌')).toBe(true);
    expect(isShinbundangStation('청계산입구')).toBe(true);
    expect(isShinbundangStation('판교')).toBe(true);
    expect(isShinbundangStation('정자')).toBe(true);
    expect(isShinbundangStation('미금')).toBe(true);
    expect(isShinbundangStation('동천')).toBe(true);
    expect(isShinbundangStation('수지구청')).toBe(true);
    expect(isShinbundangStation('성복')).toBe(true);
    expect(isShinbundangStation('상현')).toBe(true);
    expect(isShinbundangStation('광교중앙(아주대)')).toBe(true);
    expect(isShinbundangStation('광교(경기대)')).toBe(true);
    expect(isShinbundangStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialShinbundangStationName('양재시민의숲(매헌)')).toBe('양재시민의숲');
    expect(resolveOfficialShinbundangStationName('매헌')).toBe('양재시민의숲');
    expect(resolveOfficialShinbundangStationName('광교중앙(아주대)')).toBe('광교중앙');
    expect(resolveOfficialShinbundangStationName('광교(경기대)')).toBe('광교');
    expect(resolveOfficialShinbundangStationName('서초구청')).toBe('양재');
    expect(resolveOfficialShinbundangStationName('강남역')).toBe('강남');
  });

  it('노선 식별자(isShinbundangLine)를 정확하게 판별해야 한다', () => {
    expect(isShinbundangLine('1077')).toBe(true);
    expect(isShinbundangLine('신분당선')).toBe(true);
    expect(isShinbundangLine('신분당')).toBe(true);
    expect(isShinbundangLine('1002')).toBe(false);
    expect(isShinbundangLine('1075')).toBe(false);
  });

  it('방향(resolveShinbundangDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveShinbundangDirection('상행')).toBe('UP');
    expect(resolveShinbundangDirection('1')).toBe('UP');
    expect(resolveShinbundangDirection(undefined, '신사')).toBe('UP');
    expect(resolveShinbundangDirection(undefined, '강남')).toBe('UP');

    expect(resolveShinbundangDirection('하행')).toBe('DOWN');
    expect(resolveShinbundangDirection('2')).toBe('DOWN');
    expect(resolveShinbundangDirection(undefined, '광교')).toBe('DOWN');
    expect(resolveShinbundangDirection(undefined, '정자')).toBe('DOWN');
  });

  it('평일 출근시간대(08:00 KST) 판교역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromShinbundangTimetable({
      stationName: '판교',
      updnLine: '상행',
      now: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('신분당선');
    expect(nextUp?.trainNo).toMatch(/^D1/);
    expect(nextUp?.endSubwayStationNm).toBe('신사');

    const nextDown = getNextTrainFromShinbundangTimetable({
      stationName: '판교',
      updnLine: '하행',
      now: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.endSubwayStationNm).toMatch(/^(광교|정자)$/);
  });

  it('휴일(일요일) 14:00 KST 강남역 하행 다음 열차를 정상 반환해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromShinbundangTimetable({
      stationName: '강남',
      updnLine: '하행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.subwayNm).toBe('신분당선');
    expect(nextTrain?.trainNo).toMatch(/^D2/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 (금요일) 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromShinbundangTimetable({
      stationName: '수지구청',
      updnLine: '상행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getShinbundangTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getShinbundangTimetableList('양재', 'UP', new Date('2026-09-18T00:00:00Z'), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^D1/);
    expect(list[0].destStation).toBe('신사');
  });

  it('고유역 집합(SHINBUNDANG_UNIQUE_STATIONS)이 정확하게 정의되어 있어야 한다', () => {
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('양재시민의숲')).toBe(true);
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('청계산입구')).toBe(true);
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('수지구청')).toBe(true);
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('광교')).toBe(true);
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('강남')).toBe(false); // 2호선 환승역
    expect(SHINBUNDANG_UNIQUE_STATIONS.has('판교')).toBe(false); // 경강선 환승역
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 신분당선 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('동천', '상행', '1077');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^D1\d{3}$/);
    expect(result?.endSubwayStationNm).toBe('신사');
  });
});
