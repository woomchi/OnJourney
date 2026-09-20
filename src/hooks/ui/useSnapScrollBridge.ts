import React, { useRef, useEffect } from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import type { Journey } from '@/types/journey';
import { animate } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { parseSnapVal } from '@/lib/utils/snapUtils';

export interface UseSnapScrollBridgeOptions {
  scrollRef: React.RefObject<HTMLElement | null>;
  drawerSnapPoint?: string | number | null;
  snap?: string | number | null;
  isDrawerMaximized?: boolean;
  setDrawerSnapPoint?: (snap: string | number) => void;
  setSnap?: (snap: string | number) => void;
  activeJourney?: Journey | null;
  disabled?: boolean;
  minSnap?: number;
  defaultSnap?: number;
  maxSnap?: number;
  disableBottomOverscroll?: boolean;
}

export function useSnapScrollBridge({
  scrollRef,
  drawerSnapPoint,
  snap,
  isDrawerMaximized,
  setDrawerSnapPoint,
  setSnap,
  activeJourney = null,
  disabled = false,
  minSnap: minSnapOpt,
  defaultSnap: defaultSnapOpt,
  maxSnap: maxSnapOpt = 1,
  disableBottomOverscroll = false,
}: UseSnapScrollBridgeOptions) {
  const bottomSheet = useOptionalBottomSheet();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isBridgeDisabled = disabled || !isMobile;

  const currentSnapPoint = snap !== undefined ? snap : drawerSnapPoint;
  const handleSetSnap = setSnap || setDrawerSnapPoint || (() => {});
  const isMaximized = isDrawerMaximized !== undefined
    ? isDrawerMaximized
    : (currentSnapPoint === 1 || currentSnapPoint === '1');

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
      const isButton = (e.target as HTMLElement).closest('button, [role="button"]');
      const isInput = (e.target as HTMLElement).closest('input, textarea, select');
      if (!isDragHandle && !isButton && !isInput) {
        bottomSheet.dragControls.start(e);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (isBridgeDisabled) return;
    const target = scrollRef.current || e.currentTarget;
    const touch = e.touches[0];
    const currentY = bottomSheet?.y?.get() ?? 0;

    touchStartRef.current = {
      y: touch.clientY,
      scrollTop: target.scrollTop,
      startSnapY: currentY,
      isOverscrolling: false,
    };
  };

  // 모바일 네이티브 스크롤과 바텀시트 드래그 제스처 바인딩
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isBridgeDisabled || !bottomSheet) return;

    const handleNativeTouchMove = (e: TouchEvent) => {
      const state = touchStartRef.current;
      if (!state) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - state.y;
      const currentScrollTop = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;

      const isAtTop = currentScrollTop <= 0;
      const isAtBottom = currentScrollTop >= maxScroll - 1;

      // 1. 오버스크롤 상태 진입 감지: 최상단에서 아래로 당기거나 최하단에서 위로 당길 때
      if (!state.isOverscrolling) {
        const allowBottom = !disableBottomOverscroll;
        if ((isAtTop && deltaY > 5) || (allowBottom && isAtBottom && deltaY < -5)) {
          state.isOverscrolling = true;
        }
      }

      // 2. 오버스크롤 중일 때는 브라우저 기본 바운스 스크롤을 막고 바텀시트 직접 이동
      if (state.isOverscrolling) {
        if (e.cancelable) {
          e.preventDefault();
        }
        // 물리적 손가락 이동에 저항감(0.5x 댐핑)을 부여하여 자연스러운 제스처 구현
        const newY = state.startSnapY + deltaY * 0.5;
        bottomSheet.y.set(newY);
      }
    };

    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchmove', handleNativeTouchMove);
    };
  }, [scrollRef, isBridgeDisabled, bottomSheet]);

  const handleTouchMove = (_e: React.TouchEvent<HTMLElement>) => {
    // 네이티브 이벤트 리스너(passive: false)에서 바텀시트 y 이동을 처리하므로 별도 동작 없음
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (isBridgeDisabled) return;
    const state = touchStartRef.current;
    if (!state) return;

    const target = scrollRef.current || e.currentTarget;
    const currentScrollTop = target.scrollTop;
    const startScrollTop = state.scrollTop;
    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - state.y;
    const { startSnapY, isOverscrolling } = state;

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isAtTopAtStart = startScrollTop <= 2;
    const isAtBottomAtStart = startScrollTop >= maxScroll - 2;

    const didNotScroll = Math.abs(currentScrollTop - startScrollTop) <= 2;

    if (isOverscrolling) {
      const minSnap = minSnapOpt ?? (activeJourney ? 133 : 62);
      const defaultSnap = defaultSnapOpt ?? (activeJourney ? 370 : 360);

      const parsedSnap = parseSnapVal(currentSnapPoint);
      let currentSnap: 'min' | 'default' | 'max' = 'default';
      if (Math.abs(parsedSnap - minSnap) <= 10) {
        currentSnap = 'min';
      } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
        currentSnap = 'default';
      } else if (parsedSnap === 1 || isMaximized) {
        currentSnap = 'max';
      }

      const THRESHOLD = 35;
      let snapChanged = false;

      if (isAtTopAtStart && deltaY > THRESHOLD) {
        if (currentSnap === 'max') {
          handleSetSnap(defaultSnap);
          snapChanged = true;
        } else if (currentSnap === 'default') {
          handleSetSnap(minSnap);
          snapChanged = true;
        }
      } else if (!disableBottomOverscroll && isAtBottomAtStart && deltaY < -THRESHOLD) {
        if (currentSnap === 'min') {
          handleSetSnap(defaultSnap);
          snapChanged = true;
        } else if (currentSnap === 'default') {
          handleSetSnap(maxSnapOpt);
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

      const parsedSnap = parseSnapVal(currentSnapPoint);
      let currentSnap: 'min' | 'default' | 'max' = 'default';
      if (Math.abs(parsedSnap - minSnap) <= 10) {
        currentSnap = 'min';
      } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
        currentSnap = 'default';
      } else if (parsedSnap === 1 || isMaximized) {
        currentSnap = 'max';
      }

      if (currentSnap === 'max') {
        if (isAtTopAtStart && deltaY > 20) {
          // 최대 높이 상태에서 리스트 최상단일 때 아래로 스와이프하면 기본 높이로 축소
          handleSetSnap(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      if (currentSnap === 'min') {
        if (deltaY < -20) {
          // 최소 높이 상태에서 위로 스와이프하면 기본 높이로 확장
          handleSetSnap(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      // 민감도를 다른 영역과 통일하기 위해 임계값을 20px로 변경
      if (isAtTopAtStart && deltaY > 20) {
        // 아래로 스와이프 (축소 방향)
        handleSetSnap(minSnap);
      }
      else if (!disableBottomOverscroll && isAtBottomAtStart && deltaY < -20) {
        // 위로 스와이프 (확대 방향)
        handleSetSnap(maxSnapOpt);
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

    const parsedSnap = parseSnapVal(currentSnapPoint);
    let currentSnap: 'min' | 'default' | 'max' = 'default';
    if (Math.abs(parsedSnap - minSnap) <= 10) {
      currentSnap = 'min';
    } else if (Math.abs(parsedSnap - defaultSnap) <= 10) {
      currentSnap = 'default';
    } else if (parsedSnap === 1 || isMaximized) {
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
          handleSetSnap(defaultSnap);
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
          handleSetSnap(defaultSnap);
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
        handleSetSnap(minSnap);
        wheelAccumulator.current.delta = 0;
      }
    }
    else if (!disableBottomOverscroll && isAtBottom && e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta > 70) {
        handleSetSnap(maxSnapOpt);
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
