import React, { useRef } from 'react';

/**
 * 그룹 A용 터치 브릿지 훅 (RouteGuidePanel, AlternativeRoutePanel)
 * 내부 스크롤뷰가 최상단에 머물 때만 부모 바텀시트로 드래그 제스처 전파를 허용합니다.
 */
export function useScrollDragBridge(
  scrollContainerRef: React.RefObject<HTMLElement | null>
) {
  const touchStartY = useRef<number | null>(null);
  const touchStartScrollTop = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    touchStartY.current = e.touches[0].clientY;
    const container = scrollContainerRef.current;
    if (container) {
      touchStartScrollTop.current = container.scrollTop;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (touchStartY.current === null || touchStartScrollTop.current === null) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    
    // 터치 시작 시점에 이미 스크롤이 아래로 내려가 있었다면(scrollTop > 0),
    // 이 터치 동작 중에는 리스트 도달 여부와 무관하게 스크롤만 수행하도록 전파 차단
    if (touchStartScrollTop.current > 0) {
      e.stopPropagation();
      return;
    } 

    // 터치 시작 시점에 최상단(scrollTop === 0)이었던 경우
    if (touchStartScrollTop.current === 0) {
      // 위로 스와이프 (즉, 아래로 리스트 스크롤 시도)인 경우 전파 차단하여 스크롤 작동
      if (deltaY < 0) {
        e.stopPropagation();
      }
      // 아래로 스와이프 (즉, 바텀시트를 접으려는 시도)인 경우 전파를 허용하여 바텀시트 드래그 작동
    }
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
    touchStartScrollTop.current = null;
  };

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  };
}
