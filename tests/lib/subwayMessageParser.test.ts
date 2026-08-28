import { describe, it, expect } from 'vitest';
import {
  normalizeSubwayMessage,
  parseSubwayArrivalMessage,
  extractCurrentStationRobust,
  extractRemainingStationsRobust,
} from '@/lib/services/subwayMessageParser';

describe('subwayMessageParser', () => {
  describe('normalizeSubwayMessage', () => {
    it('유니코드 NFC 정규화 및 특수문자/자모 오타를 제거한다', () => {
      const input = '부평ㅡ연신ㅠ ';
      expect(normalizeSubwayMessage(input)).toBe('부평연신');
    });

    it('연속 공백을 단일 공백으로 치환하고 trim 처리한다', () => {
      const input = '  서울역    진입   ';
      expect(normalizeSubwayMessage(input)).toBe('서울역 진입');
    });

    it('빈 문자열이 들어오면 빈 문자열을 반환한다', () => {
      expect(normalizeSubwayMessage('')).toBe('');
    });
  });

  describe('parseSubwayArrivalMessage', () => {
    it('목적지 역(cleanTarget) 직전 상태(진입)를 1.0 신뢰도로 감지한다', () => {
      const result = parseSubwayArrivalMessage('서울역진입', '서울역');
      expect(result.status).toBe('entering');
      expect(result.stationName).toBe('서울');
      expect(result.remainingStations).toBe(0);
      expect(result.confidence).toBe(1.0);
    });

    it('목적지 역 도착/출발 상태를 올바르게 판별한다', () => {
      const arrived = parseSubwayArrivalMessage('강남역 도착', '강남');
      expect(arrived.status).toBe('arrived');
      expect(arrived.remainingStations).toBe(0);

      const departed = parseSubwayArrivalMessage('강남역 출발', '강남');
      expect(departed.status).toBe('departed');
      expect(departed.remainingStations).toBe(0);
    });

    it('괄호 내 역명을 추출하고 [N]번째 전역 패턴에서 남은 역 수를 계산한다', () => {
      const result = parseSubwayArrivalMessage('[4]번째 전역 (진위)');
      expect(result.status).toBe('approaching');
      expect(result.stationName).toBe('진위');
      expect(result.remainingStations).toBe(4);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('괄호 안의 급행/특급 태그를 제거하고 순수 역명만 추출한다', () => {
      const result1 = parseSubwayArrivalMessage('[3]전역 (천안급행)');
      expect(result1.stationName).toBe('천안');
      expect(result1.remainingStations).toBe(3);

      const result2 = parseSubwayArrivalMessage('[5]전역 (동인천(급))');
      expect(result2.stationName).toBe('동인천');
      expect(result2.remainingStations).toBe(5);
    });

    it('일반 텍스트의 "X역 진입/도착/출발" 패턴을 파싱한다', () => {
      const result = parseSubwayArrivalMessage('시청역 도착');
      expect(result.status).toBe('arrived');
      expect(result.stationName).toBe('시청');
    });

    it('"X분 후 도착" 메시지에서 대략적인 남은 역 수를 추정한다', () => {
      const result = parseSubwayArrivalMessage('4분 후 도착');
      expect(result.status).toBe('approaching');
      expect(result.remainingStations).toBe(2); // 4분 / 2 = 2역
    });

    it('빈 메시지 입력 시 기본 unknown 결과를 반환한다', () => {
      const result = parseSubwayArrivalMessage('');
      expect(result.status).toBe('unknown');
      expect(result.stationName).toBeNull();
      expect(result.remainingStations).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('extractCurrentStationRobust & extractRemainingStationsRobust', () => {
    it('extractCurrentStationRobust는 파싱된 역명을 반환한다', () => {
      expect(extractCurrentStationRobust('[2]전역 (신도림)', '신도림')).toBe('신도림');
      expect(extractCurrentStationRobust('알 수 없는 정보', '신도림')).toBe('');
    });

    it('extractRemainingStationsRobust는 남은 역 수를 반환한다', () => {
      expect(extractRemainingStationsRobust('[3]전역')).toBe(3);
      expect(extractRemainingStationsRobust('전역')).toBe(1);
      expect(extractRemainingStationsRobust('당역 진입')).toBe(0);
    });
  });
});
