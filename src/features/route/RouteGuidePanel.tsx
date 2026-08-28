"use client";

import { useEffect, useState, useRef } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { BOTTOM_SHEET_SNAP } from '@/constants/layout';
import PlaybackBar from '@/components/route/PlaybackBar';
import TransitGuideList from '@/components/route/TransitGuideList';
import CarGuideList from '@/components/route/CarGuideList';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import RouteSegmentCardStack from '@/components/route/RouteSegmentCardStack';
import { calculateStepBounds } from '@/lib/services/naverMapRouteService';
import { parseSnapVal } from '@/lib/utils/snapUtils';

import { useRouteGuideNavigation } from './guide/hooks/useRouteGuideNavigation';
import { RouteGuideHeader } from './guide/RouteGuideHeader';
import { MobileSegmentHeader } from './guide/MobileSegmentHeader';

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
  isOpen = false,
  onExited,
}: RouteGuidePanelProps) {
  const [animate, setAnimate] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const setGuidePanelState = useJourneyStore((state) => state.setGuidePanelState);
  const setFocusBounds = useJourneyStore((state) => state.setFocusBounds);

  const [snap, setSnap] = useState<number | string | null>(BOTTOM_SHEET_SNAP.GUIDE_DEFAULT);

  const collapse = () => {
    const parsedSnap = parseSnapVal(snap);
    if (parsedSnap !== BOTTOM_SHEET_SNAP.GUIDE_DEFAULT) {
      setSnap(BOTTOM_SHEET_SNAP.GUIDE_DEFAULT);
    }
  };

  const {
    focusedStep,
    isPanelFocused,
    activeCardIndex,
    steps,
    hasGuide,
    getPages,
    handleStepClick,
    handlePrevStep,
    handleNextStep,
    handleZoomToPoint,
    handleIndexChange,
    handleChangePlace,
    handleOpenAlternative,
  } = useRouteGuideNavigation({
    route,
    originPlace,
    destPlace,
    onNextSegment,
    onPrevSegment,
    scrollContainerRef,
    bottomSpacerRef,
    collapse,
  });

  useEffect(() => {
    if (isOpen) {
      if (snap === BOTTOM_SHEET_SNAP.FULL_EXPANDED || snap === '1') {
        setGuidePanelState('expanded');
      } else if (snap === BOTTOM_SHEET_SNAP.GUIDE_MINIMIZED || snap === `${BOTTOM_SHEET_SNAP.GUIDE_MINIMIZED}px`) {
        setGuidePanelState('minimized');
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

  const playbackBar = (
    <div
      style={{
        zIndex: animate ? 105 : 40,
        transition: animate
          ? 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms ease-out'
          : 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out',
      }}
      className={`fixed md:absolute z-[105] 
        bottom-[25px] left-3 right-3 max-w-[480px] mx-auto
        md:bottom-10 md:left-8 md:right-auto md:w-[328px] md:max-w-none md:mx-0
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
        currentCardIndex={activeCardIndex}
      />
    </div>
  );

  if (isMobile) {
    if (!isOpen) return null;

    return (
      <>
        {/* Mobile Map Floating Buttons Target */}
        <div
          id="mobile-map-buttons-target-route"
          className="fixed bottom-[328px] right-4 flex flex-col gap-2.5 z-[2000] pointer-events-auto"
        />

        {/* All-in-One Mobile Segment Card Stack Container */}
        <div className="fixed bottom-[97px] left-0 right-0 z-[100] pointer-events-none px-0">
          <div className="relative w-full max-w-[480px] mx-auto pointer-events-auto">
            <MobileSegmentHeader
              originPlace={originPlace}
              destPlace={destPlace}
              onClose={onClose}
              onOpenAlternative={handleOpenAlternative}
              onChangePlace={handleChangePlace}
            />

            {/* All-in-One Integrated Card Stack */}
            <RouteSegmentCardStack
              steps={route.steps || []}
              currentIndex={activeCardIndex}
              originPlace={originPlace}
              destPlace={destPlace}
              onIndexChange={handleIndexChange}
              focusedStep={focusedStep}
              onSelectStartPoint={(cardIdx) => {
                if (steps[cardIdx]) {
                  handleStepClick(cardIdx, steps[cardIdx], 'start');
                }
              }}
              onSelectEndPoint={(cardIdx) => {
                if (steps[cardIdx]) {
                  const targetStep = steps[cardIdx];
                  const subType = (targetStep.type === 'car' || targetStep.type === 'taxi') ? 'dest' : 'end';
                  handleStepClick(cardIdx, targetStep, subType);
                }
              }}
            />
          </div>
        </div>

        {/* 하단 재생 플로팅바 */}
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
          transition: animate
            ? 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms ease-out'
            : 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out',
        }}
        className={`absolute bg-white border-t border-zinc-200 flex flex-col overflow-hidden z-[100] md:z-auto
          bottom-0 left-0 right-0 w-full rounded-t-[20px] rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.15)] pb-[80px] md:pb-[88px]
          md:top-6 md:bottom-6 md:left-4 md:right-auto md:w-[360px] md:rounded-3xl md:border md:border-zinc-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.12)]
          md:h-[calc(100%-48px)]
          ${animate
            ? 'md:translate-x-0 md:translate-y-0 opacity-100'
            : 'md:translate-y-0 md:-translate-x-[calc(100%+24px)] opacity-0'
          }
        `}
      >
        <div className="flex flex-col h-full bg-white relative">
          <RouteGuideHeader
            route={route}
            originPlace={originPlace}
            destPlace={destPlace}
            onClose={onClose}
            onOpenAlternative={handleOpenAlternative}
          />
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
