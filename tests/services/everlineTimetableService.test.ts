import { describe, it, expect } from 'vitest';
import {
  getEverlineTimetableDatabase,
  isEverlineStation,
  isEverlineLine,
  resolveOfficialEverlineStationName,
  resolveEverlineDirection,
  getNextTrainFromEverlineTimetable,
  getEverlineTimetableList,
  EVERLINE_STATIONS,
  EVERLINE_UNIQUE_STATIONS,
} from '@/lib/services/subway/everlineTimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('EverlineTimetableService', () => {
  it('에버라인 15개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getEverlineTimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('에버라인');
    expect(db?.meta.subwayId).toBe('1079');
    expect(db?.meta.totalStations).toBe(15);
    expect(db?.data).toBeDefined();

    // 15개 역사 존재 확인
    for (const stn of EVERLINE_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 에버라인 역사 판별이 올바르게 동작해야 한다', () => {
    expect(isEverlineStation('기흥역')).toBe(true);
    expect(isEverlineStation('백남준아트센터')).toBe(true);
    expect(isEverlineStation('동백역')).toBe(true);
    expect(isEverlineStation('초당')).toBe(true);
    expect(isEverlineStation('시청용인대')).toBe(true);
    expect(isEverlineStation('시청·용인대')).toBe(true);
    expect(isEverlineStation('운동장송담대')).toBe(true);
    expect(isEverlineStation('용인중앙시장')).toBe(true);
    expect(isEverlineStation('전대·에버랜드')).toBe(true);
    expect(isEverlineStation('에버랜드역')).toBe(true);
    expect(isEverlineStation('존재하지않는역')).toBe(false);

    expect(resolveOfficialEverlineStationName('운동장송담대')).toBe('용인중앙시장');
    expect(resolveOfficialEverlineStationName('용인중앙시장(용인예술과학대)')).toBe('용인중앙시장');
    expect(resolveOfficialEverlineStationName('에버랜드')).toBe('전대·에버랜드');
    expect(resolveOfficialEverlineStationName('백남준아트센터')).toBe('기흥');
    expect(resolveOfficialEverlineStationName('시청용인대')).toBe('시청·용인대');
  });

  it('노선 식별자(isEverlineLine)를 정확하게 판별해야 한다', () => {
    expect(isEverlineLine('1079')).toBe(true);
    expect(isEverlineLine('에버라인')).toBe(true);
    expect(isEverlineLine('용인경전철')).toBe(true);
    expect(isEverlineLine('에버')).toBe(true);
    expect(isEverlineLine('1002')).toBe(false);
    expect(isEverlineLine('1075')).toBe(false);
  });

  it('방향(resolveEverlineDirection)이 올바르게 판정되어야 한다', () => {
    expect(resolveEverlineDirection('상행')).toBe('UP');
    expect(resolveEverlineDirection('1')).toBe('UP');
    expect(resolveEverlineDirection(undefined, '기흥')).toBe('UP');
    expect(resolveEverlineDirection(undefined, '강남대')).toBe('UP');

    expect(resolveEverlineDirection('하행')).toBe('DOWN');
    expect(resolveEverlineDirection('2')).toBe('DOWN');
    expect(resolveEverlineDirection(undefined, '전대·에버랜드')).toBe('DOWN');
    expect(resolveEverlineDirection(undefined, '에버랜드')).toBe('DOWN');
  });

  it('평일 출근시간대(08:00 KST) 동백역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getNextTrainFromEverlineTimetable({
      stationName: '동백',
      updnLine: '상행',
      now: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.statusText).toContain('[시간표]');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.endSubwayStationNm).toBe('기흥');
    expect(nextUp?.subwayNm).toBe('에버라인');

    const nextDown = getNextTrainFromEverlineTimetable({
      stationName: '동백',
      updnLine: '하행',
      now: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.statusText).toContain('[시간표]');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.endSubwayStationNm).toBe('전대·에버랜드');
  });

  it('휴일(일요일) 14:00 KST 초당역 하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextTrain = getNextTrainFromEverlineTimetable({
      stationName: '초당',
      updnLine: '하행',
      now: sundayAfternoon,
    });

    expect(nextTrain).not.toBeNull();
    expect(nextTrain?.statusText).toContain('[시간표]');
    expect(nextTrain?.canBoard).toBe(true);
    expect(nextTrain?.subwayNm).toBe('에버라인');
    expect(nextTrain?.trainNo).toMatch(/^Y2/);
  });

  it('심야 미운행 시간대(02:00 KST)에는 운행 종료 및 첫차 대기 상태를 반환해야 한다', () => {
    // 2026-09-18 (금요일) 02:00:00 KST = 2026-09-17T17:00:00Z
    const midnight = new Date('2026-09-17T17:00:00.000Z');

    const result = getNextTrainFromEverlineTimetable({
      stationName: '김량장',
      updnLine: '상행',
      now: midnight,
    });

    expect(result).not.toBeNull();
    expect(result?.canBoard).toBe(false);
    expect(result?.statusText).toContain('운행 종료');
    expect(result?.statusText).toContain('첫차');
    expect(result?.minutesLeft).toBe(999);
  });

  it('하루 전체 시간표 목록(getEverlineTimetableList) 조회가 정상 작동해야 한다', () => {
    const list = getEverlineTimetableList('전대·에버랜드', 'UP', new Date('2026-09-18T00:00:00Z'), 10);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(10);
    expect(list[0].depTime).toBeDefined();
    expect(list[0].trainNo).toMatch(/^Y1/);
    expect(list[0].destStation).toBe('기흥');
  });

  it('고유역 집합(EVERLINE_UNIQUE_STATIONS)이 정확하게 정의되어 있어야 한다', () => {
    expect(EVERLINE_UNIQUE_STATIONS.has('동백')).toBe(true);
    expect(EVERLINE_UNIQUE_STATIONS.has('초당')).toBe(true);
    expect(EVERLINE_UNIQUE_STATIONS.has('김량장')).toBe(true);
    expect(EVERLINE_UNIQUE_STATIONS.has('기흥')).toBe(false); // 기흥은 수인분당선 환승역
  });

  it('calculateNextTrainFromTimetable 통합 파이프라인에서 에버라인 역이 가상 배차간격이 아닌 공식 시간표로 반환되어야 한다', async () => {
    const result = await calculateNextTrainFromTimetable('어정', '하행', '1079');
    expect(result).not.toBeNull();
    expect(result?.statusText).toContain('[시간표]');
    expect(result?.trainNo).toMatch(/^Y2\d{3}$/);
    expect(result?.endSubwayStationNm).toBe('전대·에버랜드');
  });
});
