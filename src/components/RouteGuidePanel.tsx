"use client";

import { useEffect, useState } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';






interface RouteGuidePanelProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
  onNextSegment?: () => void;
  onPrevSegment?: () => void;
  nextDestPlace?: Place;
}

export default function RouteGuidePanel({
  route,
  originPlace,
  destPlace,
  onClose,
  onNextSegment,
  onPrevSegment,
  nextDestPlace,
}: RouteGuidePanelProps) {
  const [mounted, setMounted] = useState(false);
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

  useEffect(() => {
    // Small delay to trigger the slide-in transition
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (
      mounted &&
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
  }, [focusedStep, originPlace.id, destPlace.id, mounted]);

  const formatDistance = (meters: number) => {
    if (meters < 10) return '';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return '';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}분`;
  };

  const guide = route.guide || [];
  const steps = route.steps || [];
  const hasGuide = guide.length > 0;

  const getPages = () => {
    const arr: { idx: number, step: any, subType?: 'start' | 'end' | 'dest' }[] = [];
    steps.forEach((step, idx) => {
      if (step.type === 'walk' || (!step.startName && !step.endName)) {
        arr.push({ idx, step });
      } else {
        if (step.startName) arr.push({ idx, step, subType: 'start' });
        if (step.endName) arr.push({ idx, step, subType: 'end' });
      }
    });
    // 도착지 페이지 추가 (idx는 steps.length로 할당)
    arr.push({ idx: steps.length, step: { isDestinationPage: true }, subType: 'dest' });
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

    if (isThisStepFocused) {
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, route);
      setFocusBounds(bounds);
    } else {
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
    if (!focusedStep || focusedStep.originId !== originPlace.id || focusedStep.destId !== destPlace.id) {
      const lastPage = pages[pages.length - 1];
      if (lastPage) handleStepClick(lastPage.idx, lastPage.step, lastPage.subType);
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
      // 첫 세부 구간에서 이전 버튼을 누르면 전체 경로 보기로 전환
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

  const handleZoomToPoint = (idx: number, step: any, type: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();

    setFocusedStep({
      originId: originPlace.id,
      destId: destPlace.id,
      stepIndex: idx,
      subType: type
    });

    let lat = type === 'start' ? step.startLat : step.endLat;
    let lng = type === 'start' ? step.startLng : step.endLng;

    if (lat === undefined || lng === undefined) {
      if (step.pathPoints && step.pathPoints.length > 0) {
        const pt = type === 'start' ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
        lat = pt.lat;
        lng = pt.lng;
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
      className={`absolute top-6 bottom-6 left-4 z-40 w-[360px] bg-white/95 backdrop-blur-md rounded-3xl border border-zinc-150/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col transition-all duration-300 ease-out transform ${
        mounted ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="p-5 border-b border-zinc-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-bold tracking-wide uppercase select-none">
            {route.type === 'public' ? (
              <>
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-blue-500 to-indigo-500 shadow shadow-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white translate-x-[0.5px]">
                    <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                  </svg>
                </div>
                대중교통 경로 안내
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-emerald-500 to-teal-500 shadow shadow-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                  </svg>
                </div>
                상세 경로 안내
              </>
            )}
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
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {hasGuide ? (
          // 차량 turn-by-turn 안내 노출
          <div className="relative pl-1 flex flex-col gap-5">
            {/* 세로 연결선 */}
            <div className="absolute left-[9px] top-2.5 bottom-2.5 w-0.5 bg-zinc-100" />

            {guide.map((step, idx) => {
              const distStr = formatDistance(step.distance);
              const durStr = formatDuration(step.duration);

              // 아이콘과 색상 매핑
              let icon = '•';
              let iconColor = 'text-zinc-400 bg-white border-zinc-200';
              let iconSize = 'w-5 h-5 text-[10px]';

              const text = step.instructions;
              if (text.includes('출발')) {
                icon = '🏁';
                iconColor = 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm';
                iconSize = 'w-6 h-6 text-[11px]';
              } else if (text.includes('도착')) {
                icon = '📍';
                iconColor = 'text-rose-600 bg-rose-50 border-rose-200 shadow-sm';
                iconSize = 'w-6 h-6 text-[11px]';
              } else if (text.includes('우회전') || text.includes('우측')) {
                icon = '→';
                iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
              } else if (text.includes('좌회전') || text.includes('좌측')) {
                icon = '←';
                iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
              } else if (text.includes('유턴')) {
                icon = '↶';
                iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
              } else if (text.includes('직진')) {
                icon = '↑';
                iconColor = 'text-zinc-600 bg-zinc-50 border-zinc-200';
              } else if (text.includes('지하차도') || text.includes('터널') || text.includes('고속도로')) {
                icon = '🛣️';
                iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
              }

              return (
                <div key={idx} className="relative flex gap-4 pl-8 items-start group">
                  {/* 타임라인 노드 아이콘 */}
                  <div
                    className={`absolute left-0 top-0.5 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 ${iconColor} ${iconSize}`}
                    style={{ left: iconSize === 'w-6 h-6' ? '-2px' : '0px' }}
                  >
                    {icon}
                  </div>

                  {/* 경로 설명 및 거리/시간 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-600 leading-snug group-hover:text-zinc-800 transition-colors">
                      {step.instructions}
                    </p>
                    {(distStr || durStr) && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 font-semibold select-none">
                        {distStr && <span>{distStr}</span>}
                        {distStr && durStr && <span className="text-zinc-300">·</span>}
                        {durStr && <span>{durStr}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : steps.length > 0 ? (
          // 대중교통 또는 도보 step-by-step 노선 리스트 노출
          <div className="relative pl-1 flex flex-col gap-6">
            {/* 세로 연결선 */}
            <div className="absolute left-[24.5px] top-4 bottom-4 w-[3px] bg-zinc-100" />

            {/* 최초 출발지 마커 (리스트 시작) */}
            {(() => {
              const isOriginFocused = !focusedStep || (focusedStep.originId !== originPlace.id) || (focusedStep.destId !== destPlace.id);

              return (
                <div
                  id={`step-${originPlace.id}-${destPlace.id}-origin`}
                  onClick={() => {
                    setFocusedStep(null);
                    const bounds = calculateSegmentBounds(originPlace, destPlace, route);
                    setFocusBounds(bounds);
                  }}
                  className={`relative flex gap-4 pl-12 pr-3 py-2 rounded-2xl border transition-all duration-200 cursor-pointer select-none mb-1 ${
                    isOriginFocused
                      ? 'bg-blue-50/60 border-blue-200 shadow-sm scale-[1.01]'
                      : 'opacity-40 hover:opacity-100 border-transparent hover:bg-zinc-50'
                  }`}
                >
                  {/* 타임라인 노드 아이콘 */}
                  <div className="absolute left-1.5 top-2 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0 flex items-center pt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded flex-shrink-0">
                        출발
                      </span>
                      <h4 className="text-[14px] font-bold text-zinc-800 transition-colors truncate">
                        {originPlace.place_name}
                      </h4>
                    </div>
                  </div>
                </div>
              );
            })()}

            {steps.map((step, idx) => {
              const stepColor = step.color || '#A1A1AA';

              // 아이콘과 색상 매핑
              let icon = '•';
              let iconColor = 'text-zinc-500 bg-white border-zinc-200';

              if (step.type === 'walk') {
                icon = '🚶';
                iconColor = 'text-zinc-500 bg-zinc-50 border-zinc-200';
              } else if (step.type === 'subway') {
                icon = '🚇';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'bus') {
                icon = '🚌';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'car') {
                icon = '🚗';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'train') {
                icon = '🚄';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'expressbus') {
                icon = '🚌';
                iconColor = 'text-white border-transparent';
              }

              const isThisStepFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id &&
                focusedStep.stepIndex === idx
              );
              const isAnyStepFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id
              );

              return (
                <div
                  key={idx}
                  id={`step-${originPlace.id}-${destPlace.id}-${idx}`}
                  onClick={() => {
                     if (step.type !== 'walk' && step.startName) {
                       handleStepClick(idx, step, 'start');
                     } else {
                       handleStepClick(idx, step);
                     }
                  }}
                  className={`relative flex gap-4 pl-12 pr-3 py-2 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
                    isThisStepFocused
                      ? 'bg-blue-50/60 border-blue-200 shadow-sm scale-[1.01]'
                      : isAnyStepFocused
                      ? 'bg-transparent border-transparent opacity-40 hover:opacity-100 hover:bg-zinc-50/50'
                      : 'bg-transparent border-transparent hover:bg-zinc-50/50 hover:border-zinc-100'
                  }`}
                >
                  {/* 타임라인 노드 아이콘 */}
                  <div
                    className={`absolute left-2.5 top-2.5 w-6 h-6 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 shadow-sm ${iconColor} ${
                      isThisStepFocused ? 'ring-2 ring-blue-500/30' : ''
                    }`}
                    style={{
                      backgroundColor: step.type === 'walk' ? '#F4F4F5' : stepColor,
                      borderColor: step.type === 'walk' ? '#E4E4E7' : 'transparent',
                    }}
                  >
                    <span className="text-xs leading-none">{icon}</span>
                  </div>

                  {/* 경로 설명 및 거리/시간 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="text-[14px] font-bold text-zinc-800 group-hover:text-blue-600 transition-colors truncate">
                          {step.type === 'walk' ? '도보 이동' : step.name}
                        </h4>

                      </div>
                      <span className="text-[12px] font-bold text-zinc-600 flex-shrink-0">
                        {step.duration}분
                      </span>
                    </div>

                    {/* 승차 / 하차 정보 */}
                    {(step.startName || step.endName) && (() => {
                      const isStartFocused = isThisStepFocused && focusedStep.subType === 'start';
                      const isEndFocused = isThisStepFocused && focusedStep.subType === 'end';
                      return (
                      <div className="mt-1.5 p-1 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col gap-0.5 select-none">
                        {step.startName && (
                          <div
                            onClick={(e) => handleZoomToPoint(idx, step, 'start', e)}
                            className={`flex items-center justify-between gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer p-2 rounded-xl transition-all duration-200 group/sub ${
                              isStartFocused
                                ? 'bg-blue-100/70 ring-1 ring-blue-300 shadow-sm scale-[1.01]'
                                : 'hover:bg-blue-50/70'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              <span className={`font-bold ${isStartFocused ? 'text-blue-600' : 'text-zinc-400'}`}>승차</span>
                              <span className={`truncate transition-colors ${isStartFocused ? 'text-blue-800' : 'text-zinc-700 group-hover/sub:text-blue-700'}`}>{step.startName}</span>
                            </div>
                            <div className={`flex-shrink-0 transition-opacity duration-200 text-blue-500 flex items-center justify-center ${isStartFocused ? 'opacity-100' : 'opacity-0 group-hover/sub:opacity-100'}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 animate-pulse">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                              </svg>
                            </div>
                          </div>
                        )}
                        {step.startName && step.endName && (
                          <div className="w-px h-2 bg-zinc-200 ml-[13px]" />
                        )}
                        {step.endName && (
                          <div
                            onClick={(e) => handleZoomToPoint(idx, step, 'end', e)}
                            className={`flex items-center justify-between gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer p-2 rounded-xl transition-all duration-200 group/sub ${
                              isEndFocused
                                ? 'bg-rose-100/70 ring-1 ring-rose-300 shadow-sm scale-[1.01]'
                                : 'hover:bg-rose-50/70'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                              <span className={`font-bold ${isEndFocused ? 'text-rose-600' : 'text-zinc-400'}`}>하차</span>
                              <span className={`truncate transition-colors ${isEndFocused ? 'text-rose-800' : 'text-zinc-700 group-hover/sub:text-rose-700'}`}>{step.endName}</span>
                            </div>
                            <div className={`flex-shrink-0 transition-opacity duration-200 text-rose-500 flex items-center justify-center ${isEndFocused ? 'opacity-100' : 'opacity-0 group-hover/sub:opacity-100'}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 animate-pulse">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })()}

                    {/* 예약 링크 추가 */}
                    {(step.type === 'train' || step.type === 'expressbus') && (
                      <div className="mt-2 flex justify-end">
                        <a
                          href={
                            step.type === 'train'
                              ? (step.name.includes('SRT') ? 'https://etk.srail.kr/' : 'https://www.letskorail.com/')
                              : (step.name.includes('고속') ? 'https://www.kobus.co.kr/' : 'https://www.bustago.or.kr/')
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100/50 hover:bg-blue-100/50 transition-colors"
                        >
                          <span>{step.name} 예매</span>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    )}

                    {step.type === 'walk' && !step.startName && !step.endName && (
                      <p className="text-xs text-zinc-400 font-semibold mt-1">
                        약 {step.duration}분 동안 도보로 이동합니다.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 최종 목적지 마커 (리스트 마지막) */}
            {(() => {
              const isDestFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id &&
                focusedStep.subType === 'dest'
              );
              const isAnyStepFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id
              );

              return (
                <div
                  id={`step-${originPlace.id}-${destPlace.id}-${steps.length}`}
                  onClick={() => handleStepClick(steps.length, { isDestinationPage: true }, 'dest')}
                  className={`relative flex gap-4 pl-12 pr-3 py-2 rounded-2xl border transition-all duration-200 cursor-pointer select-none mt-2 ${
                    isDestFocused
                      ? 'bg-blue-50/60 border-blue-200 shadow-sm scale-[1.01]'
                      : isAnyStepFocused
                      ? 'opacity-40 hover:opacity-100 border-transparent hover:bg-zinc-50'
                      : 'border-transparent hover:bg-zinc-50'
                  }`}
                >
                  {/* 타임라인 노드 아이콘 */}
                  <div className="absolute left-1.5 top-2 w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shadow-sm z-10 transition-transform group-hover:scale-110">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-white">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0 flex items-center pt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded flex-shrink-0">
                        도착
                      </span>
                      <h4 className="text-[14px] font-bold text-zinc-800 transition-colors truncate">
                        {destPlace.place_name}
                      </h4>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
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
      <div className="flex-shrink-0 p-5 bg-white/60 backdrop-blur-md border-t border-zinc-100 rounded-b-3xl flex flex-col items-center">
        {/* 컨트롤 버튼부 */}
        <div className="flex items-center justify-center gap-4 mb-3">
          {/* 이전 이동 정보 (<<) */}
          <button
            type="button"
            onClick={onPrevSegment}
            disabled={!onPrevSegment}
            className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
            aria-label="이전 이동 정보"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M11.5 12l8.5 6V6l-8.5 6zM2 12l8.5 6V6L2 12z" />
            </svg>
          </button>

          {/* 이전 세부 구간 (<) */}
          {(() => {
            const pages = getPages();
            let currentIdx = pages.findIndex(p => p.idx === focusedStep?.stepIndex && p.subType === focusedStep?.subType);
            if (currentIdx === -1 && focusedStep) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);
            const isPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);
            return (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={!isPanelFocused || pages.length === 0}
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
                aria-label="이전 세부 구간"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 rotate-180">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              </button>
            );
          })()}

          {/* 재생/일시정지 버튼 (Play/Pause) */}
          {(() => {
            const isPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);
            const pages = getPages();
            let currentIdx = pages.findIndex(p => p.idx === focusedStep?.stepIndex && p.subType === focusedStep?.subType);
            if (currentIdx === -1 && focusedStep) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);
            
            const isAtEnd = isPanelFocused && currentIdx === pages.length - 1;
            const showPlayIcon = !isPanelFocused || isAtEnd;

            return (
              <button
                type="button"
                onClick={() => {
                  if (isPanelFocused && !isAtEnd) {
                    setFocusedStep(null);
                    const bounds = calculateSegmentBounds(originPlace, destPlace, route);
                    setFocusBounds(bounds);
                  } else {
                    if (pages.length > 0) handleStepClick(pages[0].idx, pages[0].step, pages[0].subType);
                  }
                }}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] transition-all active:scale-95 border border-blue-400 group"
                aria-label={showPlayIcon ? "여정 재생" : "여정 일시정지"}
              >
                {!showPlayIcon ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <rect x="6" y="4.5" width="4.5" height="15" rx="1.5" />
                    <rect x="13.5" y="4.5" width="4.5" height="15" rx="1.5" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 ml-1">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })()}

          {/* 다음 세부 구간 (>) */}
          {(() => {
            const pages = getPages();
            let currentIdx = pages.findIndex(p => p.idx === focusedStep?.stepIndex && p.subType === focusedStep?.subType);
            if (currentIdx === -1 && focusedStep) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);
            const isDisabled = pages.length === 0 || currentIdx >= pages.length - 1;
            return (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={isDisabled}
                className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
                aria-label="다음 세부 구간"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              </button>
            );
          })()}

          {/* 다음 이동 정보 (>>) */}
          <button
            type="button"
            onClick={onNextSegment}
            disabled={!onNextSegment}
            className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
            aria-label="다음 이동 정보"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M12.5 12L4 6v12l8.5-6zM22 12l-8.5-6v12L22 12z" />
            </svg>
          </button>
        </div>

        {/* 곡 제목 영역 (Origin -> Dest) */}
        <div className="flex flex-col items-center justify-center w-full mb-3">
          <div className="text-[13px] font-extrabold text-zinc-800 flex items-center gap-1.5 truncate max-w-full px-2">
            <span className="truncate max-w-[120px]" title={originPlace.place_name}>{originPlace.place_name}</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-zinc-400 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
            <span className="truncate max-w-[120px]" title={destPlace.place_name}>{destPlace.place_name}</span>
          </div>
        </div>

        {/* 타임라인 바 (Progress Bar) */}
        {(() => {
          const pages = getPages();
          const isPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);
          let currentIdx = pages.findIndex(p => p.idx === focusedStep?.stepIndex && p.subType === focusedStep?.subType);
          if (currentIdx === -1 && focusedStep) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);
          
          const totalStepsNum = pages.length;
          const currentStepNum = isPanelFocused && currentIdx >= 0 ? currentIdx + 1 : 0;
          const progressPercent = totalStepsNum > 0 ? (currentStepNum / totalStepsNum) * 100 : 0;

          const formatTime = (stepNum: number) => {
            const min = Math.floor(stepNum / 60);
            const sec = stepNum % 60;
            return `${min}:${sec.toString().padStart(2, '0')}`;
          };

          return (
            <div className="w-full flex items-center gap-2.5 px-2">
              <span className="text-[10px] font-bold text-zinc-400 w-7 text-right select-none">
                {formatTime(currentStepNum)}
              </span>
              <div className="relative flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-zinc-400 w-7 select-none">
                {formatTime(totalStepsNum)}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
