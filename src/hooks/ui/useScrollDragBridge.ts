import React, { useRef } from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { parseSnapVal } from '@/lib/utils/snapUtils';

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
  const touchStartRef = useRef<{ y: number; scrollTop: number; isInteractive: boolean } | null>(null);
  const wheelAccumulator = useRef({
    lastTime: 0,
    delta: 0,
    startedAtTop: false,
    startedAtBottom: false
  });

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
      const isButton = (e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]');
      if (!isDragHandle && !isButton) {
        bottomSheet.dragControls.start(e);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    const isInteractive = !!(e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]');
    touchStartRef.current = {
      y: e.touches[0].clientY,
      scrollTop: target.scrollTop,
      isInteractive,
    };
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;
    // 스크롤 가능한 상태일 때만 리스트 스크롤 영역 외부로의 터치 이벤트 전파를 차단
    if (isScrollable) {
      e.stopPropagation();
    }
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

    const { isInteractive } = touchStartRef.current;
    if (isInteractive) {
      touchStartRef.current = null;
      return;
    }

    const target = scrollRef.current || e.currentTarget;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const { scrollTop: startScrollTop } = touchStartRef.current;
    const currentScrollTop = target.scrollTop;

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    // 리스트 스크롤이 불가능한 영역(!isScrollable)은 Framer Motion dragControls에 유연하게 위임하고 오버스크롤 강제 스냅 억제
    if (!isScrollable) {
      touchStartRef.current = null;
      return;
    }

    console.log('useScrollDragBridge: touchEnd values', {
      deltaY,
      startScrollTop,
      currentScrollTop,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight
    });

    const isAtTopAtEnd = currentScrollTop <= 5;
    const threshold = bottomThreshold ?? 20;
    const isAtBottomAtEnd = maxScroll - currentScrollTop < threshold;

    // 스크롤이 거의 발생하지 않았다는 것은 스크롤의 끝(최상단/최하단) 상태에서 드래그 제스처가 발생했음을 의미
    const didNotScroll = Math.abs(currentScrollTop - startScrollTop) <= 2;

    // 최상단/최하단 경계 오버스크롤 판단
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
