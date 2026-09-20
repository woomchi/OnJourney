"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { CustomBottomSheet } from '@/components/common/CustomBottomSheet';
import { BottomSheetFloatingButtonsTarget } from '@/components/common/BottomSheetFloatingButtonsTarget';
import { BOTTOM_SHEET_SNAP } from '@/constants/layout';
import { motion } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSnapScrollBridge } from '@/hooks/ui/useSnapScrollBridge';
import { parseSnapVal } from '@/lib/utils/snapUtils';

import { useAlternativeRoutes, isRouteMatch } from './alternative/hooks/useAlternativeRoutes';
import { AlternativeRouteHeader } from './alternative/AlternativeRouteHeader';
import { AlternativeRouteTabs } from './alternative/AlternativeRouteTabs';
import { AlternativeRouteCard } from './alternative/AlternativeRouteCard';

import type { Place } from '@/types/journey';

interface AlternativeRoutePanelProps {
  originPlace: Place;
  destPlace: Place;
  onClose: (isCancel?: boolean) => void;
  isOpen?: boolean;
  onExited?: () => void;
}


export default function AlternativeRoutePanel({
  originPlace,
  destPlace,
  onClose,
  isOpen = false,
  onExited,
}: AlternativeRoutePanelProps) {
  const [animate, setAnimate] = useState(false);
  const [windowHeight, setWindowHeight] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight : 812)
  );

  useEffect(() => {
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const setGuidePanelState = useJourneyStore((state) => state.setGuidePanelState);

  const [snap, setSnap] = useState<number | string | null>(BOTTOM_SHEET_SNAP.ALTERNATIVE_DEFAULT);

  const {
    activeTab,
    setActiveTab,
    activeSubTab,
    setActiveSubTab,
    subTabs,
    publicRouteGroups,
    displayedRoutes,
    displayLimit,
    setDisplayLimit,
    loading,
    previewRoute,
    setHoveredPreviewRoute,
    isDetailLoading,
    handleWalkRouteClick,
    handleApplyRoute,
    routeTags,
    recommendedRouteIds,
    routes,
  } = useAlternativeRoutes({
    originPlace,
    destPlace,
    isOpen,
  });

  const isDraggedRef = useRef(false);

  // 모바일 터치 제스처 핸들러: 리스트 스크롤과 바텀시트 드래그 제스처 분리
  const { handlePointerDown, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel } = useSnapScrollBridge({
    scrollRef: scrollContainerRef,
    snap,
    setSnap,
    minSnap: BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX,
    defaultSnap: BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX,
    maxSnap: 1,
  });

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(175);

  useEffect(() => {
    if (!headerRef.current) return;
    const updateHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const parsedSnap = parseSnapVal(snap);
  const snapPx = parsedSnap === 1
    ? windowHeight - 16
    : (typeof snap === 'string' && snap.endsWith('vh') ? windowHeight * (parseFloat(snap) / 100) + 20 : (typeof parsedSnap === 'number' && parsedSnap > 0 ? parsedSnap : BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX));

  const contentMaxHeight = isMobile && snapPx > 0
    ? `${Math.max(0, snapPx - headerHeight - 14)}px`
    : '100%';

  const scrollToCard = useCallback((cardElement: HTMLElement) => {
    const container = scrollContainerRef.current;
    if (!container || !cardElement) return;

    const containerRect = container.getBoundingClientRect();
    const cardRect = cardElement.getBoundingClientRect();

    // scrollContainerRef 내부에서의 상대적 Y 위치 계산 (상단 패딩 pt-1: 4px 오프셋 감안)
    const relativeOffset = cardRect.top - containerRect.top;
    const targetScrollTop = container.scrollTop + relativeOffset - 4;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (snap === 1 || snap === '1') {
        setGuidePanelState('expanded');
      } else {
        setGuidePanelState('default');
      }
    } else {
      setGuidePanelState('default');
    }
  }, [isOpen, snap, setGuidePanelState]);

  useEffect(() => {
    if (isOpen) {
      setAnimate(true);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  const handleCancel = () => {
    setHoveredPreviewRoute(null);
    onClose(true);
  };

  const handleApply = () => {
    handleApplyRoute();
    onClose();
  };

  const headerContent = (
    <div ref={headerRef} className="flex flex-col w-full flex-shrink-0">
      <AlternativeRouteHeader
        originPlace={originPlace}
        destPlace={destPlace}
        onCancel={handleCancel}
        onApply={handleApply}
      />
      <AlternativeRouteTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        subTabs={subTabs}
        publicRouteGroups={publicRouteGroups}
        recommendedRouteCount={recommendedRouteIds.size}
        totalPublicRoutesCount={routes.length}
        setDisplayLimit={setDisplayLimit}
        isMobile={isMobile}
      />
    </div>
  );

  const listContent = (
    <div
      ref={scrollContainerRef}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none scrollbar-sidebar relative bg-white px-5 pt-1"
      style={{
        height: isMobile ? contentMaxHeight : undefined,
        maxHeight: contentMaxHeight,
        paddingBottom: isMobile ? '1.5rem' : '2.5rem',
      }}
      onPointerDown={isMobile ? handlePointerDown : undefined}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onWheel={isMobile ? handleWheel : undefined}
    >
      {previewRoute?.isEstimated && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs font-semibold">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>네트워크 지연으로 인한 예상 경로입니다.</span>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse flex flex-col gap-3 mt-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-3.5 bg-white rounded-xl border border-zinc-150 shadow-2xs w-full flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 shrink-0" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-4 bg-zinc-200 rounded-md w-20" />
                    <div className="h-3 bg-zinc-150 rounded-md w-14" />
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full bg-zinc-100 shrink-0" />
              </div>
              <div className="h-2.5 bg-zinc-100 rounded-full w-full mt-1" />
            </div>
          ))}
        </div>
      ) : displayedRoutes.length === 0 ? (
        <div className="text-center py-12 text-sm font-medium text-zinc-400">
          선택 가능한 경로가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          {(activeSubTab === '추천' ? displayedRoutes : displayedRoutes.slice(0, displayLimit)).map((route) => (
            <AlternativeRouteCard
              key={route.id}
              route={route}
              originPlace={originPlace}
              isSelected={isRouteMatch(previewRoute, route)}
              activeTab={activeTab}
              tags={routeTags ? (routeTags[route.id] || []) : []}
              isDetailLoading={!!isDetailLoading[route.id]}
              onClick={(e) => {
                if (isDraggedRef.current) return;
                if (e?.currentTarget) {
                  scrollToCard(e.currentTarget);
                }
                if (route.type === 'walk') {
                  handleWalkRouteClick(route);
                } else {
                  setHoveredPreviewRoute(route);
                }
              }}
            />
          ))}

          {activeSubTab !== '추천' && displayedRoutes.length > displayLimit && (
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => prev + 5)}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full py-2.5 mt-1 text-[13px] font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-150 flex items-center justify-center gap-1.5 shadow-sm"
            >
              대안 더보기 (남은 대안: {displayedRoutes.length - displayLimit}개)
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (isMobile) {
    const altHeight = BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX;
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (snap === BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX || (typeof snap === 'number' && Math.abs(snap - altHeight) < 5)) currentSnapType = 'default';
    else if (snap === 1 || snap === '1') currentSnapType = 'max';

    return (
      <>
        <CustomBottomSheet
          isOpen={isOpen}
          minHeight={altHeight}
          defaultHeight={altHeight}
          maxHeight={windowHeight - 16}
          initialSnap={currentSnapType}
          headerContent={headerContent}
          zIndex={45}
          onSnap={(snapName) => {
            if (snapName === 'min' || snapName === 'default') setSnap(BOTTOM_SHEET_SNAP.ALTERNATIVE_MIN_PX);
            else if (snapName === 'max') setSnap(1);
          }}
          onClose={() => {
            onClose();
          }}
          onExited={onExited}
        >
          <BottomSheetFloatingButtonsTarget id="mobile-map-buttons-target-route" />
          <div className="flex flex-col relative w-full h-full min-h-0 bg-white">
            {listContent}
          </div>
        </CustomBottomSheet>
      </>
    );
  }

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !isOpen && onExited) {
          onExited();
        }
      }}
      style={{
        zIndex: animate ? 45 : 40,
        transition: animate
          ? 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms ease-out'
          : 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out',
      }}
      className={`absolute bg-white border-t border-zinc-200 flex flex-col overflow-hidden z-[100] md:z-auto
        bottom-0 left-0 right-0 w-full rounded-t-[20px] rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
        md:top-6 md:bottom-6 md:left-4 md:right-auto md:w-[360px] md:rounded-3xl md:border md:border-zinc-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.12)]
        md:h-[calc(100%-48px)]
        ${animate
          ? 'md:translate-x-0 md:translate-y-0 opacity-100'
          : 'md:translate-y-0 md:-translate-x-[calc(100%+24px)] opacity-0'
        }
      `}
    >
      <div className="flex flex-col h-full bg-white relative">
        {headerContent}
        {listContent}
      </div>
    </div>
  );
}
