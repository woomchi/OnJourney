import { describe, it, expect } from 'vitest';
import {
  formatDurationMinutes,
  formatDistance,
  formatJourneyDate,
  formatShortDate,
  inferRegionFromPlace,
  isJourneyTitleDuplicate,
  generateUniqueJourneyTitle,
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

  describe('isJourneyTitleDuplicate', () => {
    const mockJourneys: any[] = [
      { id: 'j-1', title: '서울 나들이' },
      { id: 'j-2', title: '부산 여행 (1)' },
      { id: 'j-3', title: '제주도 힐링' },
    ];

    it('동일한 이름이 존재하면 true를 반환해야 한다', () => {
      expect(isJourneyTitleDuplicate('서울 나들이', mockJourneys)).toBe(true);
    });

    it('대소문자 및 앞뒤 공백을 무시하고 중복을 판별해야 한다', () => {
      expect(isJourneyTitleDuplicate('  서울 나들이  ', mockJourneys)).toBe(true);
    });

    it('중복되지 않은 이름은 false를 반환해야 한다', () => {
      expect(isJourneyTitleDuplicate('강릉 바다 여행', mockJourneys)).toBe(false);
      expect(isJourneyTitleDuplicate('', mockJourneys)).toBe(false);
      expect(isJourneyTitleDuplicate('   ', mockJourneys)).toBe(false);
    });

    it('excludeJourneyId가 일치하는 여정은 중복 검사에서 제외해야 한다', () => {
      // 본인 여정(j-1)의 이름을 그대로 유지하는 경우 중복이 아님
      expect(isJourneyTitleDuplicate('서울 나들이', mockJourneys, 'j-1')).toBe(false);
      // 다른 여정(j-2)의 이름과 겹치는 경우 중복
      expect(isJourneyTitleDuplicate('부산 여행 (1)', mockJourneys, 'j-1')).toBe(true);
    });
  });

  describe('generateUniqueJourneyTitle', () => {
    it('기존 목록에 중복되지 않는 이름이면 원본 이름을 반환해야 한다', () => {
      expect(generateUniqueJourneyTitle('새로운 여정', ['서울 나들이'])).toBe('새로운 여정');
    });

    it('중복되는 이름이 있으면 (1)을 붙여 반환해야 한다', () => {
      expect(generateUniqueJourneyTitle('서울 나들이', ['서울 나들이'])).toBe('서울 나들이 (1)');
    });

    it('(1)도 이미 존재하면 (2)를 반환해야 한다', () => {
      expect(
        generateUniqueJourneyTitle('서울 나들이', ['서울 나들이', '서울 나들이 (1)'])
      ).toBe('서울 나들이 (2)');
    });

    it('사용자가 이미 "이름 (1)"을 입력한 상태에서 중복되면 "이름 (2)"를 반환해야 한다', () => {
      expect(
        generateUniqueJourneyTitle('서울 나들이 (1)', ['서울 나들이', '서울 나들이 (1)'])
      ).toBe('서울 나들이 (2)');
    });

    it('비어있는 순번이 있으면 최소 번호를 찾아 반환해야 한다', () => {
      // (1)이 비어있고 (2)만 있는 경우 (1)을 채움
      expect(
        generateUniqueJourneyTitle('서울 나들이', ['서울 나들이', '서울 나들이 (2)'])
      ).toBe('서울 나들이 (1)');
    });

    it('공백만 있거나 빈 문자열일 경우 그대로 반환해야 한다', () => {
      expect(generateUniqueJourneyTitle('', ['서울 나들이'])).toBe('');
      expect(generateUniqueJourneyTitle('   ', ['서울 나들이'])).toBe('');
    });
  });
});
