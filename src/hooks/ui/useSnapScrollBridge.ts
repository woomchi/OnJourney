import React, { useRef, useEffect } from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import type { Journey } from '@/types/journey';
import { animate } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const parseSnapVal = (s: any): number => {
  if (s === 1 || s === '1') return 1;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') return parseInt(s, 10) || 0;
  return 0;
};

export interface UseSnapScrollBridgeOptions {
  scrollRef: React.RefObject<HTMLElement | null>;
  drawerSnapPoint: string | number | null;
  isDrawerMaximized: boolean;
  setDrawerSnapPoint: (snap: string | number) => void;
  activeJourney: Journey | null;
  disabled?: boolean;
  minSnap?: number;
  defaultSnap?: number;
}

export function useSnapScrollBridge({
  scrollRef,
  drawerSnapPoint,
  isDrawerMaximized,
  setDrawerSnapPoint,
  activeJourney,
  disabled = false,
  minSnap: minSnapOpt,
  defaultSnap: defaultSnapOpt
}: UseSnapScrollBridgeOptions) {
  const bottomSheet = useOptionalBottomSheet();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isBridgeDisabled = disabled || !isMobile;

  const touchStartRef = useRef<{
    y: number;
    scrollTop: number;
    startSnapY: number;
    isOverscrolling: boolean;
  } | null>(null);
  const wheelAccumulator = useRef({
    lastTime: 0,
    delta: 0,
    startedAtTop: false,
    startedAtBottom: false
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (isBridgeDisabled) return;
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
    if (isBridgeDisabled) return;
    const target = scrollRef.current || e.currentTarget;
    const startSnapY = bottomSheet ? bottomSheet.y.get() : 0;
    touchStartRef.current = {
      y: e.touches[0].clientY,
      scrollTop: target.scrollTop,
      startSnapY,
      isOverscrolling: false
    };
    // 터치 이벤트가 바텀 시트로 넘어가서 의도치 않은 드래그가 시작되는 것을 방지하기 위해 상위 전파 항상 차단
    e.stopPropagation();
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isBridgeDisabled) return;

    const handleNativeTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const currentScrollTop = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const deltaY = e.touches[0].clientY - touchStartRef.current.y;

      const isAtTop = currentScrollTop <= 2;
      const isAtBottom = maxScroll - currentScrollTop <= 3;

      const isOverscrollingTop = isAtTop && deltaY > 0;
      const isOverscrollingBottom = isAtBottom && deltaY < 0;

      if (isOverscrollingTop || isOverscrollingBottom) {
        if (e.cancelable) {
          e.preventDefault();
        }
        if (bottomSheet) {
          touchStartRef.current.isOverscrolling = true;
          const { startSnapY } = touchStartRef.current;
          const newY = startSnapY + deltaY * 0.45;
          bottomSheet.y.set(newY);
        }
      } else {
        if (touchStartRef.current.isOverscrolling && bottomSheet) {
          bottomSheet.y.set(touchStartRef.current.startSnapY);
          touchStartRef.current.isOverscrolling = false;
        }
        e.stopPropagation();
      }
    };

    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchmove', handleNativeTouchMove);
    };
  }, [scrollRef, disabled, bottomSheet]);

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    // Native event listener handles propagation and preventDefault.
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (isBridgeDisabled) {
      touchStartRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;

    const target = scrollRef.current || e.currentTarget;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const { scrollTop: startScrollTop, startSnapY, isOverscrolling } = touchStartRef.current;
    const currentScrollTop = target.scrollTop;

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTopAtStart = startScrollTop <= 2;
    const isAtBottomAtStart = isScrollable
      ? (startScrollTop > 2 && maxScroll - startScrollTop < 3)
      : true;

    const didNotScroll = Math.abs(currentScrollTop - startScrollTop) <= 2;

    if (isOverscrolling) {
      const minSnap = minSnapOpt ?? (activeJourney ? 133 : 62);
      const defaultSnap = defaultSnapOpt ?? (activeJourney ? 370 : 360);

      const parsedSnap = parseSnapVal(drawerSnapPoint);
      let currentSnap: 'min' | 'default' | 'max' = 'default';
      if (Math.abs(parsedSnap - minSnap) <= 10) {
        currentSnap = 'min';
      } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
        currentSnap = 'default';
      } else if (parsedSnap === 1 || isDrawerMaximized) {
        currentSnap = 'max';
      }

      const THRESHOLD = 35;
      let snapChanged = false;

      if (isAtTopAtStart && deltaY > THRESHOLD) {
        if (currentSnap === 'max') {
          setDrawerSnapPoint(defaultSnap);
          snapChanged = true;
        } else if (currentSnap === 'default') {
          setDrawerSnapPoint(minSnap);
          snapChanged = true;
        }
      } else if (isAtBottomAtStart && deltaY < -THRESHOLD) {
        if (currentSnap === 'min') {
          setDrawerSnapPoint(defaultSnap);
          snapChanged = true;
        } else if (currentSnap === 'default') {
          setDrawerSnapPoint(1);
          snapChanged = true;
        }
      }

      if (!snapChanged && bottomSheet) {
        animate(bottomSheet.y, startSnapY, {
          type: 'spring',
          stiffness: 320,
          damping: 30,
        });
      }

      touchStartRef.current = null;
      return;
    }

    if (didNotScroll) {
      const minSnap = minSnapOpt ?? (activeJourney ? 133 : 62);
      const defaultSnap = defaultSnapOpt ?? (activeJourney ? 370 : 360);

      const parsedSnap = parseSnapVal(drawerSnapPoint);
      let currentSnap: 'min' | 'default' | 'max' = 'default';
      if (Math.abs(parsedSnap - minSnap) <= 10) {
        currentSnap = 'min';
      } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
        currentSnap = 'default';
      } else if (parsedSnap === 1 || isDrawerMaximized) {
        currentSnap = 'max';
      }

      if (currentSnap === 'max') {
        if (isAtTopAtStart && deltaY > 20) {
          // 최대 높이 상태에서 리스트 최상단일 때 아래로 스와이프하면 기본 높이로 축소
          setDrawerSnapPoint(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      if (currentSnap === 'min') {
        if (deltaY < -20) {
          // 최소 높이 상태에서 위로 스와이프하면 기본 높이로 확장
          setDrawerSnapPoint(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      // 민감도를 다른 영역과 통일하기 위해 임계값을 20px로 변경
      if (isAtTopAtStart && deltaY > 20) {
        // 아래로 스와이프 (축소 방향)
        setDrawerSnapPoint(minSnap);
      }
      else if (isAtBottomAtStart && deltaY < -20) {
        // 위로 스와이프 (확대 방향)
        setDrawerSnapPoint(1);
      }
    }

    touchStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (isBridgeDisabled) return;
    const target = scrollRef.current || e.currentTarget;
    const now = Date.now();

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTop = target.scrollTop <= 2;
    const isAtBottom = isScrollable
      ? (target.scrollTop > 2 && maxScroll - target.scrollTop < 3)
      : true;

    const minSnap = minSnapOpt ?? (activeJourney ? 133 : 62);
    const defaultSnap = defaultSnapOpt ?? (activeJourney ? 370 : 360);

    const parsedSnap = parseSnapVal(drawerSnapPoint);
    let currentSnap: 'min' | 'default' | 'max' = 'default';
    if (Math.abs(parsedSnap - minSnap) <= 10) {
      currentSnap = 'min';
    } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
      currentSnap = 'default';
    } else if (parsedSnap === 1 || isDrawerMaximized) {
      currentSnap = 'max';
    }

    // 마우스 휠 세션의 시작 지점 판단 (가속 스크롤 중 새로운 방향성 감지용)
    if (now - wheelAccumulator.current.lastTime > 250) {
      wheelAccumulator.current.startedAtTop = isAtTop;
      wheelAccumulator.current.startedAtBottom = isAtBottom;
      wheelAccumulator.current.delta = 0;
    }
    wheelAccumulator.current.lastTime = now;

    if (currentSnap === 'max') {
      if (e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta < -70) {
          setDrawerSnapPoint(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    if (currentSnap === 'min') {
      if (e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta > 70) {
          setDrawerSnapPoint(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    // 최상단에서 시작한 세션은 축소(위로 스크롤)만, 최하단에서 시작한 세션은 팽창(아래로 스크롤)만 허용하여
    // 한 번에 강하게 스크롤했을 때 반대편 경계선에서 오버스크롤이 터지는 것을 완벽 차단(Lock)
    if (isAtTop && e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta < -70) {
        setDrawerSnapPoint(minSnap);
        wheelAccumulator.current.delta = 0;
      }
    }
    else if (isAtBottom && e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta > 70) {
        setDrawerSnapPoint(1);
        wheelAccumulator.current.delta = 0;
      }
    } else {
      wheelAccumulator.current.delta = 0;
    }
  };

  return {
    touchStartRef,
    wheelAccumulator,
    handlePointerDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel
  };
}
