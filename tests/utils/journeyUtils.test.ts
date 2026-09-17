import { describe, it, expect } from 'vitest';
import {
  formatDurationMinutes,
  formatDistance,
  formatJourneyDate,
  formatShortDate,
  inferRegionFromPlace,
} from '@/lib/utils/journeyUtils';

describe('journeyUtils', () => {
  describe('formatDurationMinutes', () => {
    it('null, undefined, 0 이하 값은 "0분"을 반환해야 한다', () => {
      expect(formatDurationMinutes(null)).toBe('0분');
      expect(formatDurationMinutes(undefined)).toBe('0분');
      expect(formatDurationMinutes(0)).toBe('0분');
      expect(formatDurationMinutes(-5)).toBe('0분');
    });

    it('60분 미만은 "X분" 형식으로 반환해야 한다', () => {
      expect(formatDurationMinutes(35)).toBe('35분');
      expect(formatDurationMinutes(59)).toBe('59분');
    });

    it('60분 단위는 "X시간" 형식으로 반환해야 한다', () => {
      expect(formatDurationMinutes(60)).toBe('1시간');
      expect(formatDurationMinutes(120)).toBe('2시간');
    });

    it('60분 이상이면서 분이 남는 경우 "X시간 Y분" 형식으로 반환해야 한다', () => {
      expect(formatDurationMinutes(65)).toBe('1시간 5분');
      expect(formatDurationMinutes(171)).toBe('2시간 51분');
    });
  });

  describe('formatDistance', () => {
    it('10m 미만은 빈 문자열을 반환해야 한다', () => {
      expect(formatDistance(5)).toBe('');
      expect(formatDistance(null)).toBe('');
    });

    it('10m 이상 1km 미만은 "Xm" 형식으로 반환해야 한다', () => {
      expect(formatDistance(500)).toBe('500m');
      expect(formatDistance(950)).toBe('950m');
    });

    it('1km 이상은 "X.Xkm" 형식으로 반환해야 한다', () => {
      expect(formatDistance(1500)).toBe('1.5km');
      expect(formatDistance(10200)).toBe('10.2km');
    });
  });

  describe('formatJourneyDate & formatShortDate', () => {
    it('ISO 날짜 문자열을 한국어 날짜 형식으로 변환해야 한다', () => {
      expect(formatJourneyDate('2026-08-28')).toBe('2026년 8월 28일');
    });

    it('formatShortDate는 "YY.MM.DD" 형식으로 반환해야 한다', () => {
      expect(formatShortDate('2026-08-28')).toBe('26.08.28');
      expect(formatShortDate('')).toBe('미지정');
      expect(formatShortDate(null)).toBe('미지정');
    });
  });

  describe('inferRegionFromPlace', () => {
    it('부산 관련 지명/주소는 "busan"을 반환해야 한다', () => {
      expect(inferRegionFromPlace({ address: '부산광역시 해운대구 우동' })).toBe('busan');
      expect(inferRegionFromPlace({ place_name: '부산역' })).toBe('busan');
    });

    it('대전 관련 지명/주소는 "daejeon"을 반환해야 한다', () => {
      expect(inferRegionFromPlace({ place_name: '성심당 본점' })).toBe('daejeon');
      expect(inferRegionFromPlace({ address: '대전광역시 유성구' })).toBe('daejeon');
    });

    it('경기도 관련 도시는 "gyeonggi"를 반환해야 한다', () => {
      expect(inferRegionFromPlace({ address: '경기도 수원시 팔달구' })).toBe('gyeonggi');
      expect(inferRegionFromPlace({ address: '성남시 분당구 판교역' })).toBe('gyeonggi');
    });

    it('지명/주소에 경기도 키워드가 없어도 경기도 좌표이면 "gyeonggi"를 반환해야 한다', () => {
      // 수원역 인근 좌표 (37.2659, 127.0000)
      expect(inferRegionFromPlace({ lat: 37.2659, lng: 127.0000, place_name: '중간정류소' })).toBe('gyeonggi');
      // 화성 동탄 인근 좌표 (37.2000, 127.0700)
      expect(inferRegionFromPlace({ lat: 37.2000, lng: 127.0700, place_name: '어느정류소' })).toBe('gyeonggi');
      // 고양 일산 인근 좌표 (37.6600, 126.7700)
      expect(inferRegionFromPlace({ lat: 37.6600, lng: 126.7700, place_name: '버스정류장' })).toBe('gyeonggi');
    });

    it('서울 중심부 좌표는 "seoul"을 반환해야 한다', () => {
      // 서울 시청 좌표 (37.5665, 126.9780)
      expect(inferRegionFromPlace({ lat: 37.5665, lng: 126.9780, place_name: '서울시청' })).toBe('seoul');
    });

    it('기본값은 "seoul"을 반환해야 한다', () => {
      expect(inferRegionFromPlace({ address: '서울특별시 중구 태평로' })).toBe('seoul');
      expect(inferRegionFromPlace(null)).toBe('seoul');
    });
  });
});
