"use client";

import { useEffect, useState, useRef } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';
import PlaybackBar from '@/components/route/PlaybackBar';
import TransitGuideList from '@/components/route/TransitGuideList';
import CarGuideList from '@/components/route/CarGuideList';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

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
      setAnimate(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (
      animate &&
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id
    ) {
      const element = document.getElementById(`step-${originPlace.id}-${destPlace.id}-${focusedStep.stepIndex}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        arr.push({ idx, step });
      } else {
        if (step.startName) arr.push({ idx, step, subType: 'start' });
        if (step.endName) arr.push({ idx, step, subType: 'end' });
      }
    });

    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.type === 'walk' || lastStep.type === 'car' || lastStep.type === 'taxi') {
        if (lastStep.type === 'walk') {
          arr.push({ idx: steps.length - 1, step: lastStep, subType: 'dest' });
        }
      }
    }

    return arr;
  };

  const handleStepClick = (idx: number, step: any, subType?: 'start' | 'end' | 'dest') => {
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
        lat = step.startLat;
        lng = step.startLng;
      } else if (subType === 'end') {
        lat = step.endLat;
        lng = step.endLng;
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
  };

  const handlePrevStep = () => {
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
      lat = type === 'start' ? step.startLat : step.endLat;
      lng = type === 'start' ? step.startLng : step.endLng;

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

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !isOpen && onExited) {
          onExited();
        }
      }}
      style={{ zIndex: animate ? 45 : 40 }}
      className={`absolute top-6 bottom-6 left-4 w-[360px] bg-white/95 backdrop-blur-md rounded-3xl border border-zinc-150/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col transition-all duration-300 ease-out transform ${
        animate ? 'translate-x-0 opacity-100' : '-translate-x-[calc(100%+24px)] opacity-0'
      }`}
    >
      {/* Header */}
      <div className="p-5 border-b border-zinc-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-bold tracking-wide uppercase select-none">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <img src="/service_logo2.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            상세 경로 안내
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 active:scale-95 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
            aria-label="닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Origin -> Destination */}
        <h3 className="text-sm font-extrabold text-zinc-800 flex items-center gap-1.5 truncate">
          <span className="truncate max-w-[130px]" title={originPlace.place_name}>{originPlace.place_name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-zinc-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
          <span className="truncate max-w-[130px]" title={destPlace.place_name}>{destPlace.place_name}</span>
        </h3>

        {/* Summary Info */}
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-black text-zinc-900 tracking-tight">{route.duration}분</span>
          <span className="text-xs font-semibold text-zinc-400">
            {route.type === 'public' ? (
              (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? '예매처 확인' : route.fare > 0 ? (route.isFareEstimated ? `요금 약 ${route.fare.toLocaleString()}원` : `요금 ${route.fare.toLocaleString()}원`) : '요금 정보 없음'
            ) : route.type === 'walk' || route.type === 'bicycle' ? (
              '무료'
            ) : (
              <>
                {route.distance ? `${route.distance.toFixed(1)}km` : ''}
                {route.taxiFare ? ` · 택시 약 ${route.taxiFare.toLocaleString()}원` : ''}
                {route.fare > 0 ? ` (통행료 ${route.fare.toLocaleString()}원)` : ''}
              </>
            )}
          </span>
        </div>

        {/* 예매처 빠른 링크 버튼 (장거리 노선이며 요금이 0인 경우 표출) */}
        {route.type === 'public' && (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {route.steps.some(s => s.type === 'train') && (
              <>
                {route.steps.some(s => s.type === 'train' && s.name.includes('SRT')) && (
                  <a
                    href="https://etk.srail.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#582E55] bg-[#582E55]/5 border border-[#582E55]/20 hover:bg-[#582E55]/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <span>SRT 예매</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
                {route.steps.some(s => s.type === 'train' && !s.name.includes('SRT')) && (
                  <a
                    href="https://www.letskorail.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#003366] bg-[#003366]/5 border border-[#003366]/20 hover:bg-[#003366]/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <span>코레일 예매</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
              </>
            )}
            {route.steps.some(s => s.type === 'expressbus') && (
              <>
                <a
                  href="https://www.kobus.co.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100/50 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <span>고속버스 예매</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <a
                  href="https://www.bustago.or.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 hover:bg-orange-100/50 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <span>시외버스 예매</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/* Guide List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-5 scrollbar-sleek">
        {hasGuide ? (
          <CarGuideList route={route} />
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
        )}
      </div>

      {/* 재생바 영역 (Playback Bar) */}
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
}
