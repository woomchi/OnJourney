"use client";

import { useEffect, useState, useRef } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';
import { CustomBottomSheet, useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { motion, useTransform, AnimatePresence, useMotionValue } from 'framer-motion';
import PlaybackBar from '@/components/route/PlaybackBar';
import TransitGuideList from '@/components/route/TransitGuideList';
import CarGuideList from '@/components/route/CarGuideList';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useScrollDragBridge } from '@/hooks/ui/useScrollDragBridge';

const FloatingButtonsContainer = () => {
  const bottomSheet = useOptionalBottomSheet();
  const fallbackY = useMotionValue(0);
  const y = bottomSheet?.y || fallbackY;
  const maxHeight = bottomSheet?.maxHeight ?? 800;
  const opacity = useTransform(y, [-360, -maxHeight + 100], [1, 0]);
  // Use a transform to dynamically disable pointer events when hidden
  const pointerEvents = useTransform(y, (latest: number) => latest < -400 ? 'none' : 'auto');
  
  return (
    <motion.div 
      id="mobile-map-buttons-target-route"
      className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] *:pointer-events-auto"
      style={{ opacity, pointerEvents: pointerEvents as any }}
    />
  );
};

interface RouteGuidePanelProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
  onNextSegment?: (jumpToStart?: boolean) => void;
  onPrevSegment?: (jumpToDest?: boolean) => void;
  nextDestPlace?: Place;
  isOpen?: boolean;
  onExited?: () => void;
}

const parseSnapVal = (s: any): number => {
  if (s === 1 || s === '1') return 1;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') return parseInt(s, 10) || 0;
  return 0;
};

export default function RouteGuidePanel({
  route,
  originPlace,
  destPlace,
  onClose,
  onNextSegment,
  onPrevSegment,
  nextDestPlace,
  isOpen = false,
  onExited,
}: RouteGuidePanelProps) {
  const [animate, setAnimate] = useState(false);
  const [windowHeight, setWindowHeight] = useState(
    () => typeof window !== 'undefined' ? window.innerHeight : 812
  );
  const [activeTooltip, setActiveTooltip] = useState<'origin' | 'dest' | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!activeTooltip) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tooltip-trigger') && !target.closest('.tooltip-content')) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [activeTooltip]);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

  const [snap, setSnap] = useState<number | string | null>(370);
  
  const parsedSnapForLog = parseSnapVal(snap);
  let currentSnapTypeForLog: 'min' | 'default' | 'max' = 'default';
  if (parsedSnapForLog === 200) currentSnapTypeForLog = 'min';
  else if (parsedSnapForLog === 1) currentSnapTypeForLog = 'max';
  console.log('RouteGuidePanel render:', { snap, currentSnapType: currentSnapTypeForLog });

  const collapse = () => {
    const parsedSnap = parseSnapVal(snap);
    if (parsedSnap !== 370) {
      setSnap(370);
    }
  };

  const { setGuidePanelState } = useJourneyStore();


  useEffect(() => {
    if (isOpen) {
      if (snap === 1 || snap === '1') {
        setGuidePanelState('expanded');
      } else if (snap === 200 || snap === '200px') {
        setGuidePanelState('minimized');
      } else {
        setGuidePanelState('default');
      }
    } else {
      setGuidePanelState('default');
    }
  }, [isOpen, snap, setGuidePanelState]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [originPlace.id, destPlace.id]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(timer);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimate(false);
    }
  }, [isOpen]);

  const isAutoScrolling = useRef(false);
  const autoScrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const skipNextScrollIntoView = useRef(false);

  // 모바일 터치 제스처 핸들러: 리스트 스크롤과 바텀시트 드래그 제스처 분리
  const { handlePointerDown, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel } = useScrollDragBridge({
    scrollRef: scrollContainerRef,
    snap,
    setSnap,
    minSnap: 200,
    defaultSnap: 370,
    maxSnap: 1
  });

  // 여정 재생 시 특정 세부 이동 정보가 자동으로 스크롤 중앙에 오도록 조절하는 기능 활성화
  useEffect(() => {
    if (!focusedStep || focusedStep.originId !== originPlace.id || focusedStep.destId !== destPlace.id) {
      if (bottomSpacerRef.current) {
        bottomSpacerRef.current.style.height = '112px'; // 기본값 (h-28 = 112px)
      }
      return;
    }

    const elementId = `step-${originPlace.id}-${destPlace.id}-${focusedStep.stepIndex}`;
    
    const timer = setTimeout(() => {
      const element = document.getElementById(elementId);
      const container = scrollContainerRef.current;
      if (element && container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        // 동적 하단 여백 계산: (컨테이너 내부 실질적 높이) - 5px - (선택된 카드의 높이)
        const containerHeight = container.clientHeight;
        const cardHeight = element.clientHeight;
        const paddingNeeded = Math.max(112, containerHeight - 5 - cardHeight);
        
        if (bottomSpacerRef.current) {
          bottomSpacerRef.current.style.height = `${paddingNeeded}px`;
        }
        
        // 상단 스냅을 정렬하기 위해 offsetTop을 계산해 직접 scrollTo 처리합니다.
        // elementRect.top - containerRect.top은 컨테이너 내부 뷰포트 기준 상대 y좌표입니다.
        // 최상단 여백 5px을 만들기 위해 -5px 보정합니다.
        const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 5;
        
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [focusedStep, originPlace.id, destPlace.id]);

  const steps = route.steps || [];
  const hasGuide = (route.guide || []).length > 0;

  const getPages = () => {
    const arr: { idx: number, step: any, subType?: 'start' | 'end' | 'dest' }[] = [];
    steps.forEach((step, idx) => {
      if (step.type === 'car' || step.type === 'taxi') {
        arr.push({ idx, step, subType: 'start' });
        arr.push({ idx, step, subType: 'dest' });
      } else if (step.type === 'walk' || (!step.startName && !step.endName)) {
        arr.push({ idx, step, subType: 'start' });
        arr.push({ idx, step, subType: 'end' });
      } else {
        if (step.startName) arr.push({ idx, step, subType: 'start' });
        if (step.endName) arr.push({ idx, step, subType: 'end' });
      }
    });

    return arr;
  };

  // 스크롤 시 화면 중앙의 세부 이동 정보를 자동으로 감지해서 focusedStep을 변경하는 기능 비활성화

  function handleStepClick(idx: number, step: any, subType?: 'start' | 'end' | 'dest') {
    collapse();
    const isThisStepFocused = !!(
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id &&
      focusedStep.stepIndex === idx &&
      focusedStep.subType === subType
    );

    if (!isThisStepFocused) {
      let lat: number | undefined;
      let lng: number | undefined;

      if (subType === 'dest') {
        lat = destPlace.lat;
        lng = destPlace.lng;
      } else if (subType === 'start') {
        lat = idx === 0 ? originPlace.lat : step.startLat;
        lng = idx === 0 ? originPlace.lng : step.startLng;
      } else if (subType === 'end') {
        lat = idx === steps.length - 1 ? destPlace.lat : step.endLat;
        lng = idx === steps.length - 1 ? destPlace.lng : step.endLng;
      } else {
        lat = step.startLat;
        lng = step.startLng;
      }

      if (lat === undefined || lng === undefined) {
        if (step && step.pathPoints && step.pathPoints.length > 0) {
          if (subType === 'end') {
            lat = step.pathPoints[step.pathPoints.length - 1].lat;
            lng = step.pathPoints[step.pathPoints.length - 1].lng;
          } else {
            lat = step.pathPoints[0].lat;
            lng = step.pathPoints[0].lng;
          }
        }
      }

      if (lat !== undefined && lng !== undefined) {
        setFocusBounds({
          sw: { lat, lng },
          ne: { lat, lng }
        });
      } else if (step && !step.isDestinationPage) {
        const bounds = calculateStepBounds(step);
        if (bounds) {
          setFocusBounds(bounds);
        }
      }

      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: idx,
        subType
      });
    }
  }

  const handlePrevStep = () => {
    collapse();
    const pages = getPages();
    const isPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);

    if (!isPanelFocused) {
      if (onPrevSegment) {
        onPrevSegment(true);
      }
      return;
    }

    let currentIndex = pages.findIndex(p => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
    if (currentIndex === -1) {
      currentIndex = pages.findIndex(p => p.idx === focusedStep.stepIndex);
    }

    if (currentIndex > 0) {
      const prevPage = pages[currentIndex - 1];
      handleStepClick(prevPage.idx, prevPage.step, prevPage.subType);
    } else if (currentIndex === 0) {
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, route);
      setFocusBounds(bounds);
    }
  };

  const handleNextStep = () => {
    collapse();
    const pages = getPages();
    if (!focusedStep || focusedStep.originId !== originPlace.id || focusedStep.destId !== destPlace.id) {
      const firstPage = pages[0];
      if (firstPage) handleStepClick(firstPage.idx, firstPage.step, firstPage.subType);
      return;
    }

    let currentIndex = pages.findIndex(p => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
    if (currentIndex === -1) {
      currentIndex = pages.findIndex(p => p.idx === focusedStep.stepIndex);
    }

    if (currentIndex >= 0 && currentIndex < pages.length - 1) {
      const nextPage = pages[currentIndex + 1];
      handleStepClick(nextPage.idx, nextPage.step, nextPage.subType);
    } else if (currentIndex === pages.length - 1 && onNextSegment) {
      onNextSegment();
    }
  };

  const handleZoomToPoint = (idx: number, step: any, type: 'start' | 'end' | 'dest', e: React.MouseEvent) => {
    e.stopPropagation();
    collapse();

    setFocusedStep({
      originId: originPlace.id,
      destId: destPlace.id,
      stepIndex: idx,
      subType: type
    });

    let lat: number | undefined;
    let lng: number | undefined;

    if (type === 'dest') {
      lat = destPlace.lat;
      lng = destPlace.lng;
    } else {
      lat = type === 'start' ? (idx === 0 ? originPlace.lat : step.startLat) : (idx === steps.length - 1 ? destPlace.lat : step.endLat);
      lng = type === 'start' ? (idx === 0 ? originPlace.lng : step.startLng) : (idx === steps.length - 1 ? destPlace.lng : step.endLng);

      if (lat === undefined || lng === undefined) {
        if (step.pathPoints && step.pathPoints.length > 0) {
          const pt = type === 'start' ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
          lat = pt.lat;
          lng = pt.lng;
        }
      }
    }

    if (lat !== undefined && lng !== undefined) {
      setFocusBounds({
        sw: { lat, lng },
        ne: { lat, lng }
      });
    }
  };

  const listContent = hasGuide ? (
    <CarGuideList 
      route={route} 
      originPlace={originPlace}
      destPlace={destPlace}
      handleStepClick={handleStepClick}
    />
  ) : steps.length > 0 ? (
    <TransitGuideList
      route={route}
      originPlace={originPlace}
      destPlace={destPlace}
      handleStepClick={handleStepClick}
      handleZoomToPoint={handleZoomToPoint}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 text-zinc-400">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 text-zinc-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
      </svg>
      <p className="text-xs font-medium">세부 경로 안내 정보가 없습니다.</p>
    </div>
  );

  const headerContent = (
    <div className="border-b border-zinc-100 flex-shrink-0 bg-white w-full">
      {/* 첫 번째 행: 태그와 닫기 버튼을 우측 끝으로 밀어서 배치 */}
      <div className="px-5 pt-3 pb-0.5 flex items-center justify-end gap-2">
        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0">
          {route.type === 'public' ? '대중교통' : '승용차'}
        </span>
        <button 
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1.5 -mr-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 두 번째 행: 출발지 → 도착지 */}
      <div className="px-5 pb-3.5 pt-0.5">
        <div className="flex items-center w-full min-w-0">
          {/* 출발지 */}
          <div className="flex-1 min-w-0 text-center relative tooltip-trigger">
            <span 
              onClick={() => setActiveTooltip(activeTooltip === 'origin' ? null : 'origin')}
              className="block text-[15px] font-bold text-zinc-800 truncate cursor-pointer hover:text-blue-600 transition-colors select-none"
              title={originPlace.place_name}
            >
              {originPlace.place_name}
            </span>
            <AnimatePresence>
              {activeTooltip === 'origin' && (
                <>
                  {/* Tooltip Body: 서비스 시그니처 그라데이션 테마 적용 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] left-0 bottom-full mb-2.5 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15"
                  >
                    <p className="font-bold text-[13px] mb-1">{originPlace.place_name}</p>
                    {originPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{originPlace.address}</p>
                    )}
                  </motion.div>
                  {/* Tooltip Arrow: 그라데이션 중앙 색상인 indigo-500 적용 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/2 -translate-x-1/2 bottom-full mb-[4px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-indigo-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>

          {/* 화살표 */}
          <div className="flex-shrink-0 px-3 flex justify-center items-center">
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* 도착지 */}
          <div className="flex-1 min-w-0 text-center relative tooltip-trigger">
            <span 
              onClick={() => setActiveTooltip(activeTooltip === 'dest' ? null : 'dest')}
              className="block text-[15px] font-bold text-zinc-800 truncate cursor-pointer hover:text-blue-600 transition-colors select-none"
              title={destPlace.place_name}
            >
              {destPlace.place_name}
            </span>
            <AnimatePresence>
              {activeTooltip === 'dest' && (
                <>
                  {/* Tooltip Body: 서비스 시그니처 그라데이션 테마 적용 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] right-0 bottom-full mb-2.5 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15"
                  >
                    <p className="font-bold text-[13px] mb-1">{destPlace.place_name}</p>
                    {destPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{destPlace.address}</p>
                    )}
                  </motion.div>
                  {/* Tooltip Arrow: 그라데이션 중앙 색상인 indigo-500 적용 */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/2 -translate-x-1/2 bottom-full mb-[4px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-indigo-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      {route.isEstimated && (
        <div className="mx-5 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-xs font-semibold">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>네트워크 지연으로 인한 예상 경로입니다.</span>
        </div>
      )}
    </div>
  );

  const playbackBar = (
    <div 
      style={{ 
        zIndex: animate ? 105 : 40,
        transition: 'all 400ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
      className={`absolute z-[105] 
        bottom-4 left-4 right-4 
        md:bottom-10 md:left-8 md:right-auto md:w-[328px] 
        ${animate 
          ? 'translate-y-0 md:translate-x-0 opacity-100'
          : 'translate-y-[150%] md:-translate-x-[calc(100%+24px)] opacity-0'
        }
      `}
      onClickCapture={() => collapse()}
    >
      <PlaybackBar
        route={route}
        originPlace={originPlace}
        destPlace={destPlace}
        pages={getPages()}
        handlePrevStep={handlePrevStep}
        handleNextStep={handleNextStep}
        handleStepClick={handleStepClick}
        onPrevSegment={onPrevSegment}
        onNextSegment={onNextSegment}
      />
    </div>
  );

  if (isMobile) {
    const parsedSnap = parseSnapVal(snap);
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (parsedSnap === 200) currentSnapType = 'min';
    else if (parsedSnap === 1) currentSnapType = 'max';

    const snapPx = parsedSnap === 1
      ? windowHeight - 16
      : parsedSnap;

    const contentMaxHeight = snapPx > 0
      ? `${snapPx - 110}px`
      : '100%';

    return (
      <>
        <CustomBottomSheet
          isOpen={isOpen}
          minHeight={200}
          defaultHeight={370}
          maxHeight={windowHeight - 16}
          initialSnap={currentSnapType}
          zIndex={45}
          onSnap={(snapName) => {
            if (snapName === 'min') setSnap(200);
            else if (snapName === 'default') setSnap(370);
            else if (snapName === 'max') setSnap(1);
          }}
          onClose={() => {
            if (onExited) onExited();
          }}
          headerContent={headerContent}
        >
          <FloatingButtonsContainer />
          <motion.div 
            ref={scrollContainerRef}
            variants={{
              min: { opacity: 1, y: 0, pointerEvents: 'auto' as const, transition: { duration: 0.2, ease: 'easeOut' } },
              default: { opacity: 1, y: 0, pointerEvents: 'auto' as const, transition: { duration: 0.3, ease: 'easeOut' } },
              max: { opacity: 1, y: 0, pointerEvents: 'auto' as const, transition: { duration: 0.3, ease: 'easeOut' } },
            }}
            animate={currentSnapType}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none scrollbar-sidebar relative w-full px-5 pt-[9px] bg-white snap-y snap-mandatory scroll-pt-[5px] scroll-pb-4" 
            style={{ maxHeight: contentMaxHeight }}
            onPointerDown={handlePointerDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {listContent}
            {/* 하단 재생바 등에 의해 가려지지 않도록 여백 배치 */}
            <div ref={bottomSpacerRef} className="h-28 w-full flex-shrink-0 pointer-events-none" />
          </motion.div>
        </CustomBottomSheet>
        {playbackBar}
      </>
    );
  }

  return (
    <>
      <div
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !isOpen && onExited) {
            onExited();
          }
        }}
        style={{ 
          zIndex: animate ? 45 : 40,
          transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms',
        }}
        className={`absolute bg-white border-t border-zinc-200 flex flex-col z-[100] md:z-auto
          bottom-0 left-0 right-0 w-full rounded-t-[20px] rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.15)] pb-[80px] md:pb-[88px]
          md:top-6 md:bottom-6 md:left-4 md:right-auto md:w-[360px] md:rounded-3xl md:border md:border-zinc-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.12)]
          md:h-auto
          ${animate 
            ? 'md:translate-x-0 md:translate-y-0 opacity-100'
            : 'md:translate-y-0 md:-translate-x-[calc(100%+24px)] opacity-0'
          }
        `}
      >
        <div className="flex flex-col h-full bg-white relative">
          {headerContent}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-sidebar px-5 pt-[9px] relative bg-white snap-y snap-mandatory scroll-pt-[5px] scroll-pb-4"
          >
            {listContent}
            <div ref={bottomSpacerRef} className="h-28 w-full flex-shrink-0 pointer-events-none" />
          </div>
        </div>
      </div>
      {playbackBar}
    </>
  );
}

