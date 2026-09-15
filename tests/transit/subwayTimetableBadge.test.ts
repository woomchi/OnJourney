import { describe, it, expect } from 'vitest';
import { BUS_LIVE_STATIONS_TTL_MS } from '@/constants/transit';
import { GESTURE_THRESHOLDS } from '@/constants/layout';

describe('P2 상수 정의 검증 (B-5, H-2)', () => {
  it('[B-5] BUS_LIVE_STATIONS_TTL_MS 상수가 3분(180,000ms)으로 정의되어야 한다', () => {
    expect(BUS_LIVE_STATIONS_TTL_MS).toBe(180_000);
    expect(typeof BUS_LIVE_STATIONS_TTL_MS).toBe('number');
  });

  it('[H-2] GESTURE_THRESHOLDS.HERO_SWIPE_MIN_PX 상수가 35px로 정의되어야 한다', () => {
    expect(GESTURE_THRESHOLDS.HERO_SWIPE_MIN_PX).toBe(35);
    expect(typeof GESTURE_THRESHOLDS.HERO_SWIPE_MIN_PX).toBe('number');
  });
});

describe('비수도권 지하철 시간표(isRealtime: false) 분기 로직 검증 (S-3)', () => {
  interface MockSubwayItem {
    isRealtime?: boolean;
    canBoard?: boolean;
    isExpress?: boolean;
    minutesLeft?: number;
    statusText?: string;
    arvlMsg2?: string;
    updnLine?: string;
  }

  // SegmentSubwayRealtimeChip 내부 배지 레이블 분기 함수 시뮬레이션
  function resolveBadgeLabel(item: MockSubwayItem): string {
    const isCanBoard = item.canBoard !== false;
    const isExpress = Boolean(item.isExpress);
    const isRealtime = item.isRealtime !== false;

    if (!isCanBoard) return '종착';
    if (isExpress) return '급행';
    if (!isRealtime) return '시간표';
    return '일반';
  }

  // Hero 뷰 배지 레이블 분기
  function resolveHeroBadgeLabel(item: MockSubwayItem): string {
    const isCanBoard = item.canBoard !== false;
    const isExpress = Boolean(item.isExpress);
    const isRealtime = item.isRealtime !== false;

    if (!isCanBoard) return '당역종착';
    if (isExpress) return '급행';
    if (!isRealtime) return '시간표';
    return '일반';
  }

  // 툴팁 분기 함수 시뮬레이션
  function resolveTooltipText(isRealtime: boolean, canBoard: boolean): string {
    if (!canBoard) {
      return '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기';
    }
    return isRealtime
      ? '클릭하여 실시간 노선도 및 열차 위치 확인'
      : '시간표 기준 운행 정보 - 클릭하여 지하철 노선도 보기';
  }

  // 링크 힌트 분기 함수 시뮬레이션
  function resolveLinkHint(isRealtime: boolean): string {
    return isRealtime ? '실시간 노선도 ↗' : '노선도 확인 ↗';
  }

  it('isRealtime이 false인 경우 "시간표" 배지가 반환되어야 한다', () => {
    const timetableItem: MockSubwayItem = {
      isRealtime: false,
      canBoard: true,
      isExpress: false,
      minutesLeft: 7,
      statusText: '7분 후',
    };

    expect(resolveBadgeLabel(timetableItem)).toBe('시간표');
    expect(resolveHeroBadgeLabel(timetableItem)).toBe('시간표');
  });

  it('isRealtime이 true인 일반 열차는 "일반" 배지가 반환되어야 한다', () => {
    const realtimeItem: MockSubwayItem = {
      isRealtime: true,
      canBoard: true,
      isExpress: false,
      minutesLeft: 3,
      statusText: '3분 후',
    };

    expect(resolveBadgeLabel(realtimeItem)).toBe('일반');
    expect(resolveHeroBadgeLabel(realtimeItem)).toBe('일반');
  });

  it('canBoard가 false이면 실시간 여부와 무관하게 종착 배지가 우선한다', () => {
    const terminatingTimetableItem: MockSubwayItem = {
      isRealtime: false,
      canBoard: false,
      isExpress: false,
    };

    expect(resolveBadgeLabel(terminatingTimetableItem)).toBe('종착');
    expect(resolveHeroBadgeLabel(terminatingTimetableItem)).toBe('당역종착');
  });

  it('isExpress가 true이면 시간표 모드에서도 급행 배지가 우선한다', () => {
    const expressTimetableItem: MockSubwayItem = {
      isRealtime: false,
      canBoard: true,
      isExpress: true,
    };

    expect(resolveBadgeLabel(expressTimetableItem)).toBe('급행');
    expect(resolveHeroBadgeLabel(expressTimetableItem)).toBe('급행');
  });

  it('isRealtime 여부에 따라 툴팁 및 링크 힌트가 정확히 분기되어야 한다', () => {
    expect(resolveTooltipText(true, true)).toBe('클릭하여 실시간 노선도 및 열차 위치 확인');
    expect(resolveTooltipText(false, true)).toBe('시간표 기준 운행 정보 - 클릭하여 지하철 노선도 보기');
    expect(resolveTooltipText(false, false)).toBe('목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기');

    expect(resolveLinkHint(true)).toBe('실시간 노선도 ↗');
    expect(resolveLinkHint(false)).toBe('노선도 확인 ↗');
  });
});
