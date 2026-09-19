import { describe, it, expect } from 'vitest';
import {
  getIncheon1TimetableDatabase,
  isIncheon1Station,
  isIncheon1Line,
  isIncheon1ExclusiveStation,
  resolveOfficialIncheon1StationName,
  resolveIncheon1Direction,
  getIncheon1NextTrain,
  getNextTrainFromIncheon1Timetable,
  getIncheon1TimetableList,
  loadIncheon1StationTimetable,
  INCHEON_1_STATIONS,
  INCHEON_1_UNIQUE_STATIONS,
} from '@/lib/services/subway/incheon1TimetableService';
import { calculateNextTrainFromTimetable } from '@/lib/services/subway/timetableService';

describe('Incheon1TimetableService', () => {
  it('인천 1호선 33개 역사 압축 DB가 싱글톤으로 정상 로드되어야 한다', () => {
    const db = getIncheon1TimetableDatabase();
    expect(db).not.toBeNull();
    expect(db?.meta.line).toBe('인천1호선');
    expect(db?.meta.subwayId).toBe('1069');
    expect(db?.meta.totalStations).toBe(33);
    expect(db?.data).toBeDefined();

    // 33개 역사 존재 확인
    for (const stn of INCHEON_1_STATIONS) {
      expect(db?.data[stn]).toBeDefined();
    }
  });

  it('역명 정규화 및 인천 1호선 역사 판별이 올바르게 동작해야 한다', () => {
    // 검단 연장구간 역
    expect(isIncheon1Station('검단호수공원역')).toBe(true);
    expect(isIncheon1Station('검단호수공원')).toBe(true);
    expect(isIncheon1Station('검단호수')).toBe(true);
    expect(isIncheon1Station('신검단중앙역')).toBe(true);
    expect(isIncheon1Station('아라역')).toBe(true);

    // 기존 구간 역
    expect(isIncheon1Station('계양역')).toBe(true);
    expect(isIncheon1Station('귤현(인천스마트모빌리티교통안전체험관)')).toBe(true);
    expect(isIncheon1Station('박촌역')).toBe(true);
    expect(isIncheon1Station('경인교대')).toBe(true);
    expect(isIncheon1Station('경인교대입구역')).toBe(true);
    expect(isIncheon1Station('작전역')).toBe(true);
    expect(isIncheon1Station('부평구청(세림병원)')).toBe(true);
    expect(isIncheon1Station('인천시청역')).toBe(true);
    expect(isIncheon1Station('선학(선학별빛도서관)')).toBe(true);
    expect(isIncheon1Station('동막역')).toBe(true);
    expect(isIncheon1Station('캠퍼스타운(연세대학교)')).toBe(true);
    expect(isIncheon1Station('테크노파크역')).toBe(true);
    expect(isIncheon1Station('인천대입구(송도스타트업파크)')).toBe(true);
    expect(isIncheon1Station('송도달빛축제공원역')).toBe(true);
    expect(isIncheon1Station('달빛축제공원')).toBe(true);
    expect(isIncheon1Station('존재하지않는역')).toBe(false);

    expect(resolveOfficialIncheon1StationName('검단호수')).toBe('검단호수공원');
    expect(resolveOfficialIncheon1StationName('경인교대')).toBe('경인교대입구');
    expect(resolveOfficialIncheon1StationName('부평구청(세림병원)')).toBe('부평구청');
    expect(resolveOfficialIncheon1StationName('캠퍼스타운(연세대학교)')).toBe('캠퍼스타운');
    expect(resolveOfficialIncheon1StationName('인천대입구(송도스타트업파크)')).toBe('인천대입구');
    expect(resolveOfficialIncheon1StationName('달빛축제공원')).toBe('송도달빛축제공원');
  });

  it('인천 1호선 단독 고유역(28개 역)과 환승역(5개 역)을 정확히 식별해야 한다', () => {
    // 단독 고유역
    expect(isIncheon1ExclusiveStation('검단호수공원')).toBe(true);
    expect(isIncheon1ExclusiveStation('신검단중앙')).toBe(true);
    expect(isIncheon1ExclusiveStation('아라')).toBe(true);
    expect(isIncheon1ExclusiveStation('귤현')).toBe(true);
    expect(isIncheon1ExclusiveStation('박촌')).toBe(true);
    expect(isIncheon1ExclusiveStation('작전')).toBe(true);
    expect(isIncheon1ExclusiveStation('예술회관')).toBe(true);
    expect(isIncheon1ExclusiveStation('선학')).toBe(true);
    expect(isIncheon1ExclusiveStation('동막')).toBe(true);
    expect(isIncheon1ExclusiveStation('캠퍼스타운')).toBe(true);
    expect(isIncheon1ExclusiveStation('송도달빛축제공원')).toBe(true);

    // 환승역 5개는 단독 고유역이 아님
    expect(isIncheon1ExclusiveStation('계양')).toBe(false);       // 공항철도
    expect(isIncheon1ExclusiveStation('부평구청')).toBe(false);   // 7호선
    expect(isIncheon1ExclusiveStation('부평')).toBe(false);       // 1호선
    expect(isIncheon1ExclusiveStation('인천시청')).toBe(false);   // 인천2호선
    expect(isIncheon1ExclusiveStation('원인재')).toBe(false);     // 수인분당선
  });

  it('노선 식별자(isIncheon1Line)를 정확하게 판별해야 한다', () => {
    expect(isIncheon1Line('1069')).toBe(true);
    expect(isIncheon1Line('인천1호선')).toBe(true);
    expect(isIncheon1Line('인천 1호선')).toBe(true);
    expect(isIncheon1Line('인천1')).toBe(true);
    expect(isIncheon1Line('인천선')).toBe(true);
    expect(isIncheon1Line('incheon-1')).toBe(true);
    expect(isIncheon1Line('1001')).toBe(false);
    expect(isIncheon1Line('1070')).toBe(false);
  });

  it('방향(resolveIncheon1Direction)이 올바르게 판정되어야 한다', () => {
    // 상행 (검단호수공원/계양 방면)
    expect(resolveIncheon1Direction('상행')).toBe('UP');
    expect(resolveIncheon1Direction('1')).toBe('UP');
    expect(resolveIncheon1Direction(undefined, '검단호수공원')).toBe('UP');
    expect(resolveIncheon1Direction(undefined, '계양')).toBe('UP');
    expect(resolveIncheon1Direction(undefined, '박촌')).toBe('UP');

    // 하행 (송도달빛축제공원 방면)
    expect(resolveIncheon1Direction('하행')).toBe('DOWN');
    expect(resolveIncheon1Direction('2')).toBe('DOWN');
    expect(resolveIncheon1Direction(undefined, '송도달빛축제공원')).toBe('DOWN');
    expect(resolveIncheon1Direction(undefined, '동막')).toBe('DOWN');
    expect(resolveIncheon1Direction(undefined, '원인재')).toBe('DOWN');

    // 기점 및 종점 전용 방향
    expect(resolveIncheon1Direction('하행', undefined, '송도달빛축제공원')).toBe('UP');
    expect(resolveIncheon1Direction('상행', undefined, '검단호수공원')).toBe('DOWN');
  });

  it('기점(송도달빛축제공원)은 상행선 전용, 종점(검단호수공원)은 하행선 전용이어야 한다', () => {
    const db = getIncheon1TimetableDatabase();
    expect(db).not.toBeNull();

    // 송도달빛축제공원역: 상행선만 존재 (출발역)
    expect(db?.data['송도달빛축제공원']['인천1호선_DAY_UP'].length).toBeGreaterThan(100);
    expect(db?.data['송도달빛축제공원']['인천1호선_DAY_DOWN']).toBeUndefined();

    // 검단호수공원역: 하행선만 존재 (출발역)
    expect(db?.data['검단호수공원']['인천1호선_DAY_DOWN'].length).toBeGreaterThan(100);
    expect(db?.data['검단호수공원']['인천1호선_DAY_UP']).toBeUndefined();
  });

  it('평일 출근시간대(08:00 KST) 작전역 상행/하행 다음 열차를 정확히 산출해야 한다', () => {
    // 2026-09-18 (금요일) 08:00:00 KST = 2026-09-17T23:00:00Z
    const fridayMorning = new Date('2026-09-17T23:00:00.000Z');

    const nextUp = getIncheon1NextTrain({
      stationName: '작전',
      updnLine: '상행',
      baseTime: fridayMorning,
    });
    expect(nextUp).not.toBeNull();
    expect(nextUp?.canBoard).toBe(true);
    expect(nextUp?.endSubwayStationNm).toBe('검단호수공원');
    expect(nextUp?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextUp?.arrivalTime).toMatch(/^\d{2}:\d{2}$/);
    expect(nextUp?.subwayNm).toBe('인천1호선');

    const nextDown = getIncheon1NextTrain({
      stationName: '작전',
      updnLine: '하행',
      baseTime: fridayMorning,
    });
    expect(nextDown).not.toBeNull();
    expect(nextDown?.canBoard).toBe(true);
    expect(nextDown?.endSubwayStationNm).toBe('송도달빛축제공원');
    expect(nextDown?.statusText).toContain('송도달빛축제공원');
    expect(nextDown?.minutesLeft).toBeGreaterThanOrEqual(0);
    expect(nextDown?.subwayNm).toBe('인천1호선');
  });

  it('토휴일(일요일) 시간표가 정상적으로 조회되어야 한다', () => {
    // 2026-09-20 (일요일) 14:00:00 KST = 2026-09-20T05:00:00Z
    const sundayAfternoon = new Date('2026-09-20T05:00:00.000Z');

    const nextSunday = getNextTrainFromIncheon1Timetable({
      stationName: '예술회관',
      updnLine: '상행',
      baseTime: sundayAfternoon,
    });
    expect(nextSunday).not.toBeNull();
    expect(nextSunday?.canBoard).toBe(true);
    expect(nextSunday?.endSubwayStationNm).toBe('검단호수공원');
    expect(nextSunday?.minutesLeft).toBeGreaterThanOrEqual(0);
  });

  it('심야 막차 이후에는 익일 첫차가 산출되어야 한다', () => {
    // 2026-09-18 (금요일) 02:00 KST = 2026-09-17T17:00:00Z (심야 종료 시간대)
    const lateNight = new Date('2026-09-17T17:00:00.000Z');

    const nextMorning = getIncheon1NextTrain({
      stationName: '선학',
      updnLine: '하행',
      baseTime: lateNight,
    });
    expect(nextMorning).not.toBeNull();
    expect(nextMorning?.canBoard).toBe(false);
    expect(nextMorning?.statusText).toContain('첫차');
    expect(nextMorning?.arrivalTime).toMatch(/^05:\d{2}$/);
  });

  it('역별 전일 시간표 목록(getIncheon1TimetableList)이 정상 반환되어야 한다', () => {
    const timetable = getIncheon1TimetableList('계산', '상행', 'DAY');
    expect(timetable.length).toBeGreaterThanOrEqual(100);
    expect(timetable[0].depTime).toMatch(/^\d{2}:\d{2}$/);
    expect(timetable[0].destStation).toBe('검단호수공원');

    const loaded = loadIncheon1StationTimetable('계산');
    expect(loaded).not.toBeNull();
    expect(loaded?.['인천1호선_DAY_UP']).toBeDefined();
    expect(loaded?.['인천1호선_DAY_DOWN']).toBeDefined();
    expect(loaded?.['인천1호선_DAY_UP'].length).toBeGreaterThan(0);
    expect(loaded?.['인천1호선_DAY_DOWN'].length).toBeGreaterThan(0);
  });

  it('통합 시간표 서비스(calculateNextTrainFromTimetable)에서 인천 1호선 역사가 올바르게 분기되어야 한다', async () => {
    // 1. 인천 1호선 단독 고유역 (작전)
    const res1 = await calculateNextTrainFromTimetable('작전', '하행');
    expect(res1).not.toBeNull();
    expect(res1?.statusText).toBeDefined();
    expect(res1?.endSubwayStationNm).toBe('송도달빛축제공원');

    // 2. 검단 연장 신규 고유역 (신검단중앙)
    const res2 = await calculateNextTrainFromTimetable('신검단중앙', '하행');
    expect(res2).not.toBeNull();
    expect(res2?.statusText).toBeDefined();
    expect(res2?.endSubwayStationNm).toBe('송도달빛축제공원');

    // 3. 인천 1호선 환승역 (부평구청 + '인천1호선' 명시)
    const res3 = await calculateNextTrainFromTimetable('부평구청', '상행', '인천1호선');
    expect(res3).not.toBeNull();
    expect(res3?.statusText).toBeDefined();
    expect(res3?.endSubwayStationNm).toBe('검단호수공원');
  });
});
