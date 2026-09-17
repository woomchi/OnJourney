import { describe, it, expect } from 'vitest';
import {
  resolveOfficialStationName,
  resolveWeekTag,
  resolveInOutTag,
  normalizeLineNumber,
  loadStationTimetable,
  getNextTrainFromSeoulTimetable,
  getSeoulTimetableList,
  toOperationalMinutes,
} from '@/lib/services/subway/seoulTimetableService';

describe('seoulTimetableService - 서울교통공사 공식 시간표 서비스 검증', () => {
  describe('1. 헬퍼 유틸 검증', () => {
    it('toOperationalMinutes는 새벽 00~04시를 24시 이후로 계산해야 한다', () => {
      expect(toOperationalMinutes('05:30')).toBe(330);
      expect(toOperationalMinutes('23:50')).toBe(23 * 60 + 50);
      expect(toOperationalMinutes('00:15')).toBe(24 * 60 + 15);
      expect(toOperationalMinutes('01:05')).toBe(25 * 60 + 5);
    });

    it('resolveOfficialStationName은 다양한 역명 변형을 정확히 색인 키로 매핑해야 한다', () => {
      expect(resolveOfficialStationName('서울역')).toBe('서울역');
      expect(resolveOfficialStationName('강남역')).toBe('강남');
      expect(resolveOfficialStationName('강남')).toBe('강남');
      expect(resolveOfficialStationName('시청역')).toBe('시청');
      expect(resolveOfficialStationName('동대문역사문화공원(DDP)')).toBe('동대문역사문화공원');
      expect(resolveOfficialStationName('존재하지않는외계역')).toBeNull();
    });

    it('resolveWeekTag는 요일에 따라 DAY/SAT/END를 반환해야 한다', () => {
      const wednesday = new Date('2026-09-16T12:00:00Z'); // 수요일
      const saturday = new Date('2026-09-19T12:00:00Z');  // 토요일
      const sunday = new Date('2026-09-20T12:00:00Z');    // 일요일

      expect(resolveWeekTag(wednesday)).toBe('DAY');
      expect(resolveWeekTag(saturday)).toBe('SAT');
      expect(resolveWeekTag(sunday)).toBe('END');
    });

    it('resolveInOutTag는 2호선(IN/OUT)과 타 노선(UP/DOWN)을 올바르게 분기해야 한다', () => {
      expect(resolveInOutTag('2', '내선')).toBe('IN');
      expect(resolveInOutTag('2', '외선')).toBe('OUT');
      expect(resolveInOutTag('2', '1')).toBe('IN');
      expect(resolveInOutTag('2', '2')).toBe('OUT');

      expect(resolveInOutTag('1', '상행')).toBe('UP');
      expect(resolveInOutTag('1', '하행')).toBe('DOWN');
      expect(resolveInOutTag('3', '1')).toBe('UP');
      expect(resolveInOutTag('4', '2')).toBe('DOWN');
    });

    it('normalizeLineNumber는 다양한 노선 문자열에서 숫자 1~9를 추출해야 한다', () => {
      expect(normalizeLineNumber('1002')).toBe('2');
      expect(normalizeLineNumber('2호선')).toBe('2');
      expect(normalizeLineNumber('2')).toBe('2');
      expect(normalizeLineNumber(7)).toBe('7');
      expect(normalizeLineNumber('신분당선')).toBeNull();
    });
  });

  describe('2. 역별 시간표 로드 검증', () => {
    it('강남역 시간표가 정상 로드되고 2호선 내/외선 그룹을 포함해야 한다', () => {
      const timetable = loadStationTimetable('강남역');
      expect(timetable).not.toBeNull();
      expect(timetable!['2_DAY_IN']).toBeDefined();
      expect(timetable!['2_DAY_OUT']).toBeDefined();
      expect(timetable!['2_DAY_IN'].length).toBeGreaterThan(100);
    });

    it('서울역 시간표가 정상 로드되고 1호선 및 4호선 데이터를 포함해야 한다', () => {
      const timetable = loadStationTimetable('서울역');
      expect(timetable).not.toBeNull();
      expect(timetable!['1_DAY_UP']).toBeDefined();
      expect(timetable!['1_DAY_DOWN']).toBeDefined();
      expect(timetable!['4_DAY_UP']).toBeDefined();
    });
  });

  describe('3. 다음 열차 조회 (getNextTrainFromSeoulTimetable) 검증', () => {
    it('평일 아침 08:30 기준 강남역 내선 순환 다음 열차가 정확히 조회되어야 한다', () => {
      // 2026-09-16 (수요일) 08:30 KST = 2026-09-15 23:30 UTC
      const refDate = new Date('2026-09-16T08:30:00+09:00');

      const nextTrain = getNextTrainFromSeoulTimetable({
        stationName: '강남',
        updnLine: '내선',
        lineId: '1002',
        referenceDate: refDate,
      });

      expect(nextTrain).not.toBeNull();
      expect(nextTrain!.trainNo).toBeDefined();
      expect(nextTrain!.endSubwayStationNm).toBeDefined();
      expect(nextTrain!.canBoard).toBe(true);
      expect(toOperationalMinutes(nextTrain!.arrivalTime)).toBeGreaterThanOrEqual(toOperationalMinutes('08:30'));
    });

    it('심야 새벽 03:00에는 운행 종료(LAST_TRAIN_ENDED)를 반환해야 한다', () => {
      const refDate = new Date('2026-09-16T03:00:00+09:00');

      const nextTrain = getNextTrainFromSeoulTimetable({
        stationName: '강남',
        updnLine: '외선',
        lineId: '2호선',
        referenceDate: refDate,
      });

      expect(nextTrain).not.toBeNull();
      expect(nextTrain!.trainNo).toBe('LAST_TRAIN_ENDED');
      expect(nextTrain!.canBoard).toBe(false);
      expect(nextTrain!.statusText).toContain('운행 종료');
    });
  });

  describe('4. 노선도용 시간표 목록 (getSeoulTimetableList) 검증', () => {
    it('강남역의 시간표 목록을 조회하면 최대 30개의 정렬된 항목이 반환되어야 한다', () => {
      const refDate = new Date('2026-09-16T14:00:00+09:00');

      const list = getSeoulTimetableList('강남', '내선', '1002', refDate);
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(30);

      expect(list[0].isUpcoming).toBe(true);
      expect(list[0].depTime).toBeDefined();
      expect(list[0].destStation).toBeDefined();

      // 시간 오름차순 정렬 검증
      for (let i = 1; i < list.length; i++) {
        expect(toOperationalMinutes(list[i].depTime)).toBeGreaterThanOrEqual(
          toOperationalMinutes(list[i - 1].depTime)
        );
      }
    });
  });
});
