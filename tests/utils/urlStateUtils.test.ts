import { describe, it, expect } from 'vitest';
import { parseUrlState, serializeUrlState } from '@/lib/utils/urlStateUtils';

describe('urlStateUtils', () => {
  describe('parseUrlState', () => {
    it('빈 쿼리 스트링일 때 기본 null/false 상태를 반환한다', () => {
      const result = parseUrlState('');
      expect(result).toEqual({
        journeyId: null,
        focusedSegment: null,
        focusedStep: null,
        alternativeSegment: null,
        isSearchMode: false,
      });
    });

    it('j 파라미터가 있을 때 journeyId를 올바르게 파싱한다', () => {
      const result = parseUrlState('?j=uuid-1234-abcd');
      expect(result.journeyId).toBe('uuid-1234-abcd');
      expect(result.focusedSegment).toBeNull();
    });

    it('s (구간) 파라미터를 originId와 destId로 올바르게 분리한다', () => {
      const result = parseUrlState('?j=j1&s=origin-1:dest-2');
      expect(result.focusedSegment).toEqual({
        originId: 'origin-1',
        destId: 'dest-2',
      });
    });

    it('st (스텝) 파라미터를 originId, destId, stepIndex로 올바르게 분리한다', () => {
      const result = parseUrlState('?j=j1&st=origin-1:dest-2:3');
      expect(result.focusedStep).toEqual({
        originId: 'origin-1',
        destId: 'dest-2',
        stepIndex: 3,
      });
    });

    it('st (스텝) 파라미터의 인덱스가 숫자가 아니면 null을 반환한다', () => {
      const result = parseUrlState('?j=j1&st=origin-1:dest-2:abc');
      expect(result.focusedStep).toBeNull();
    });

    it('alt (대안 경로 구간) 파라미터를 올바르게 파싱한다', () => {
      const result = parseUrlState('?j=j1&alt=orig-a:dest-b');
      expect(result.alternativeSegment).toEqual({
        originId: 'orig-a',
        destId: 'dest-b',
      });
    });

    it('search=1 파라미터가 있으면 isSearchMode를 true로 파싱한다', () => {
      const result = parseUrlState('?search=1');
      expect(result.isSearchMode).toBe(true);
    });

    it('URLSearchParams 객체도 직접 전달하여 파싱할 수 있다', () => {
      const params = new URLSearchParams('j=j2&search=1&s=a:b');
      const result = parseUrlState(params);
      expect(result.journeyId).toBe('j2');
      expect(result.isSearchMode).toBe(true);
      expect(result.focusedSegment).toEqual({ originId: 'a', destId: 'b' });
    });
  });

  describe('serializeUrlState', () => {
    it('모든 상태가 비어있을 때 빈 URLSearchParams를 반환한다', () => {
      const params = serializeUrlState({});
      expect(params.toString()).toBe('');
    });

    it('journeyId가 주어지면 j 파라미터로 직렬화한다', () => {
      const params = serializeUrlState({ journeyId: 'my-journey-id' });
      expect(params.toString()).toBe('j=my-journey-id');
    });

    it('구간 및 스텝 정보가 주어지면 s와 st로 직렬화한다', () => {
      const params = serializeUrlState({
        journeyId: 'j1',
        focusedSegment: { originId: 'place-a', destId: 'place-b' },
        focusedStep: { originId: 'place-a', destId: 'place-b', stepIndex: 2 },
      });
      expect(params.get('j')).toBe('j1');
      expect(params.get('s')).toBe('place-a:place-b');
      expect(params.get('st')).toBe('place-a:place-b:2');
    });

    it('search 모드가 true이면 search=1을 추가한다', () => {
      const params = serializeUrlState({ isSearchMode: true });
      expect(params.get('search')).toBe('1');
    });
  });
});
