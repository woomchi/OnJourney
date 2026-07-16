"use client";

import { useEffect, useState, useRef } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';
import { CustomBottomSheet, useBottomSheet } from '@/components/common/CustomBottomSheet';
import { motion, useTransform } from 'framer-motion';
import PlaybackBar from '@/components/route/PlaybackBar';
import TransitGuideList from '@/components/route/TransitGuideList';
import CarGuideList from '@/components/route/CarGuideList';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const FloatingButtonsContainer = () => {
  const { y, maxHeight } = useBottomSheet();
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
  const [windowHeight, setWindowHeight] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

  const [snap, setSnap] = useState<number | string | null>('360px');
  const collapse = () => setSnap('210px'); // minimize when stepping

  const { setGuidePanelState } = useJourneyStore();

  const snapPx = snap === 1 || snap === '1'
    ? windowHeight
    : typeof snap === 'number'
      ? snap
      : parseInt(String(snap), 10) || 0;

  const headerHeight = 110; // 상세 경로 헤더 높이
  const contentMaxHeight = isMobile && snapPx > 0
    ? `${snapPx - 26 - headerHeight}px`
    : '100%';

  useEffect(() => {
    if (isOpen) {
      if (snap === 1 || snap === '1') {
        setGuidePanelState('expanded');
      } else if (snap === '210px') {
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

  useEffect(() => {
    if (
      animate &&
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id
    ) {
      if (skipNextScrollIntoView.current) {
        skipNextScrollIntoView.current = false;
        return;
      }
      
      const element = document.getElementById(`step-${originPlace.id}-${destPlace.id}-${focusedStep.stepIndex}`);
      if (element) {
        isAutoScrolling.current = true;
        if (autoScrollTimeout.current) clearTimeout(autoScrollTimeout.current);
        
        setTimeout(() => {
          const container = scrollContainerRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const offset = elementRect.top - containerRect.top + container.scrollTop - (containerRect.height / 2) + (elementRect.height / 2);
            container.scrollTo({ top: offset, behavior: 'smooth' });
          }
          autoScrollTimeout.current = setTimeout(() => {
            isAutoScrolling.current = false;
          }, 800);
        }, 100);
      }
    }
  }, [focusedStep, originPlace.id, destPlace.id, animate]);

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

  useEffect(() => {
    if (!scrollContainerRef.current || !isOpen || !animate) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isAutoScrolling.current) return;
        
        const visibleEntry = entries.find(entry => entry.isIntersecting);
        if (visibleEntry && focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id) {
          const id = visibleEntry.target.id;
          const parts = id.split('-');
          if (parts.length === 4) {
            const idx = parseInt(parts[3], 10);
            
            if (focusedStep.stepIndex !== idx) {
              const pages = getPages();
              const page = pages.find(p => p.idx === idx && (p.subType === 'start' || !p.subType)) || pages.find(p => p.idx === idx);
              
              if (page) {
                skipNextScrollIntoView.current = true;
                handleStepClick(page.idx, page.step, page.subType);
              }
            }
          }
        }
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.5,
      }
    );

    const stepElements = document.querySelectorAll(`[id^="step-${originPlace.id}-${destPlace.id}-"]`);
    stepElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [isOpen, animate, focusedStep, originPlace.id, destPlace.id, route]);

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
    <>
      <div className="px-5 py-4 border-b border-zinc-100 flex-shrink-0 flex items-center justify-between bg-white">
        <h2 className="text-[17px] font-black text-zinc-800 tracking-tight flex items-center gap-2">
          상세 경로 안내
          <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            {route.type === 'public' ? '대중교통' : '승용차'}
          </span>
        </h2>
        <button 
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-2 -mr-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-6 pt-5 pb-2 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 bg-zinc-50 py-2.5 px-4 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="truncate">{originPlace.place_name}</span>
          <span className="mx-1 text-zinc-300">→</span>
          <span className="truncate">{destPlace.place_name}</span>
        </div>
      </div>
    </>
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
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (snap === '210px' || snap === 210) currentSnapType = 'min';
    else if (snap === 1 || snap === '1') currentSnapType = 'max';

    return (
      <>
        <CustomBottomSheet
          isOpen={isOpen}
          minHeight={210}
          defaultHeight={360}
          maxHeight={windowHeight}
          initialSnap={currentSnapType}
          zIndex={45}
          onSnap={(snapName) => {
            if (snapName === 'min') setSnap('210px');
            else if (snapName === 'default') setSnap('360px');
            else if (snapName === 'max') setSnap(1);
          }}
          onClose={() => {
            if (onExited) onExited();
          }}
          headerContent={headerContent}
          scrollRef={scrollContainerRef as React.MutableRefObject<any>}
        >
          <FloatingButtonsContainer />
          <div className="flex flex-col relative w-full h-full pb-20 bg-white" style={{ minHeight: contentMaxHeight }}>
            {listContent}
          </div>
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
            className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-sidebar pb-20 relative bg-white"
          >
            {listContent}
          </div>
        </div>
      </div>
      {playbackBar}
    </>
  );
}

