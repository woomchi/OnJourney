import React, { useRef } from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';

export interface PanelScrollBridgeOptions {
  scrollRef: React.RefObject<HTMLElement | null>;
  snap: number | string | null;
  setSnap: (snap: number | string) => void;
  minSnap: number;
  defaultSnap: number;
  maxSnap?: number; // 보통 1
  disabled?: boolean;
  bottomThreshold?: number; // 하단 오버스크롤 감지 마진 임계값
}

export function useScrollDragBridge({
  scrollRef,
  snap,
  setSnap,
  minSnap,
  defaultSnap,
  maxSnap = 1,
  disabled = false,
  bottomThreshold
}: PanelScrollBridgeOptions) {
  const bottomSheet = useOptionalBottomSheet();
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const wheelAccumulator = useRef({
    lastTime: 0,
    delta: 0,
    startedAtTop: false,
    startedAtBottom: false
  });

  const parseSnapVal = (s: any): number => {
    if (s === 1 || s === '1') return 1;
    if (typeof s === 'number') return s;
    if (typeof s === 'string') {
      if (s.endsWith('vh')) {
        if (typeof window !== 'undefined') {
          const vh = parseFloat(s) || 0;
          return window.innerHeight * (vh / 100);
        }
      }
      return parseInt(s, 10) || 0;
    }
    return 0;
  };

  const getCurrentSnapType = (): 'min' | 'default' | 'max' => {
    const parsed = parseSnapVal(snap);
    const parsedMin = parseSnapVal(minSnap);
    const parsedDefault = parseSnapVal(defaultSnap);
    const parsedMax = parseSnapVal(maxSnap);

    const diffMin = Math.abs(parsed - parsedMin);
    const diffDefault = Math.abs(parsed - parsedDefault);
    const diffMax = Math.abs(parsed - parsedMax);

    if (diffMax < 10 || parsed === 1) return 'max';
    if (parsedMin === parsedDefault) return 'default'; // 2단계 스냅 구성인 경우
    if (diffMin < diffDefault) return 'min';
    return 'default';
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return;
    const target = scrollRef.current || e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    if (!isScrollable && bottomSheet) {
      const isDragHandle = (e.target as HTMLElement).closest('.drag-handle');
      const isButton = (e.target as HTMLElement).closest('button');
      const isInput = (e.target as HTMLElement).closest('input, textarea, select');
      if (!isDragHandle && !isButton && !isInput) {
        bottomSheet.dragControls.start(e);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    touchStartRef.current = {
      y: e.touches[0].clientY,
      scrollTop: target.scrollTop
    };
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    // 스크롤 중 터치 이동 이벤트가 바텀 시트로 전파되어 시트가 움직이는 것 항상 차단
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    console.log('useScrollDragBridge: handleTouchEnd', {
      disabled,
      touchStart: touchStartRef.current
    });
    if (disabled) {
      touchStartRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;

    const target = scrollRef.current || e.currentTarget;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const { scrollTop: startScrollTop } = touchStartRef.current;
    const currentScrollTop = target.scrollTop;

    console.log('useScrollDragBridge: touchEnd values', {
      deltaY,
      startScrollTop,
      currentScrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight
    });

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTopAtEnd = currentScrollTop <= 5;
    const threshold = bottomThreshold ?? 20;
    // 리스트가 스크롤 불가능하더라도 최상단에 머물러 있는 상태라면 최하단 상태로 보지 않습니다.
    const isAtBottomAtEnd = isScrollable
      ? (maxScroll - currentScrollTop < threshold)
      : false;

    // 스크롤이 거의 발생하지 않았다는 것은 스크롤의 끝(최상단/최하단) 상태에서 드래그 제스처가 발생했음을 의미
    const didNotScroll = Math.abs(currentScrollTop - startScrollTop) <= 2;

    // 최상단/최하단 경계 오버스크롤 판단 (탄성 바운스로 인해 didNotScroll이 거짓으로 인식되어도 강제 트리거하도록 보강)
    const isOverscrollingTop = isAtTopAtEnd && deltaY > 20;
    const isOverscrollingBottom = isAtBottomAtEnd && deltaY < -20;

    console.log('useScrollDragBridge: touchEnd evaluation', {
      isAtTopAtEnd,
      isAtBottomAtEnd,
      isOverscrollingTop,
      isOverscrollingBottom,
      didNotScroll,
      currentSnap: getCurrentSnapType()
    });

    if (didNotScroll || isOverscrollingTop || isOverscrollingBottom) {
      const currentSnap = getCurrentSnapType();

      if (currentSnap === 'max') {
        if (isOverscrollingTop) {
          // 최대 높이 상태에서 리스트 최상단일 때 아래로 스와이프하면 기본 높이로 축소
          setSnap(defaultSnap);
        }
      } else if (currentSnap === 'min') {
        if (isOverscrollingBottom) {
          // 최소 높이 상태에서 위로 스와이프하면 기본 높이로 확장
          setSnap(defaultSnap);
        }
      } else {
        // default 상태
        if (isOverscrollingTop) {
          // 아래로 스와이프 (축소 방향)
          setSnap(minSnap);
        } else if (isOverscrollingBottom) {
          // 위로 스와이프 (확대 방향)
          setSnap(maxSnap);
        }
      }
    }

    touchStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (disabled) return;
    const target = scrollRef.current || e.currentTarget;
    const now = Date.now();

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTop = target.scrollTop <= 2;
    const threshold = bottomThreshold ?? 20;
    const isAtBottom = isScrollable
      ? (target.scrollTop > 2 && maxScroll - target.scrollTop < threshold)
      : true;

    if (now - wheelAccumulator.current.lastTime > 250) {
      wheelAccumulator.current.startedAtTop = isAtTop;
      wheelAccumulator.current.startedAtBottom = isAtBottom;
      wheelAccumulator.current.delta = 0;
    }
    wheelAccumulator.current.lastTime = now;

    const currentSnap = getCurrentSnapType();

    if (currentSnap === 'max') {
      if (e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta < -70) {
          setSnap(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    if (currentSnap === 'min') {
      if (e.deltaY > 0 && wheelAccumulator.current.startedAtBottom && minSnap !== defaultSnap) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta > 70) {
          setSnap(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    // default 상태
    if (isAtTop && e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta < -70) {
        setSnap(minSnap);
        wheelAccumulator.current.delta = 0;
      }
    } else if (isAtBottom && e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta > 70) {
        setSnap(maxSnap);
        wheelAccumulator.current.delta = 0;
      }
    } else {
      wheelAccumulator.current.delta = 0;
    }
  };

  return {
    handlePointerDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel
  };
}
