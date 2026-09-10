'use client';

import React, { useRef } from 'react';
import { MapPin, Footprints, Bus, Train, Car, Navigation, ArrowRight } from 'lucide-react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, SelectedRoute, DirectionResult, DirectionStep } from '@/types/journey';
import { formatDurationMinutes } from '@/lib/utils/journeyUtils';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';
import { calculateSegmentBounds } from '@/lib/services/naverMapRouteService';

interface HorizontalTransitRouteStepLineProps {
  route: SelectedRoute | DirectionResult | null;
  originPlace: Place;
  destPlace: Place;
  className?: string;
}

export default function HorizontalTransitRouteStepLine({
  route,
  originPlace,
  destPlace,
  className = '',
}: HorizontalTransitRouteStepLineProps) {
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const steps = route?.steps || [];

  const isOriginStageActive = (
    focusedStep?.originId === originPlace.id &&
    focusedStep?.destId === destPlace.id &&
    (focusedStep?.subType === 'start' || (focusedStep?.stepIndex === 0 && !focusedStep?.subType))
  );

  const isOriginFocused = isOriginStageActive;

  const isDestFocused = (
    focusedStep?.originId === originPlace.id &&
    focusedStep?.destId === destPlace.id &&
    focusedStep?.subType === 'dest'
  );

  // 출발지 노드 클릭 핸들러
  const handleOriginClick = () => {
    if (isOriginFocused) {
      setFocusedStep(null);
      if (route) {
        const bounds = calculateSegmentBounds(originPlace, destPlace, route);
        setFocusBounds(bounds);
      }
    } else {
      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: 0,
        subType: 'start',
      });
      setFocusBounds({
        sw: { lat: originPlace.lat - 0.0025, lng: originPlace.lng - 0.0025 },
        ne: { lat: originPlace.lat + 0.0025, lng: originPlace.lng + 0.0025 },
      });
    }
  };

  // 도착지 노드 클릭 핸들러
  const handleDestClick = () => {
    if (isDestFocused) {
      setFocusedStep(null);
      if (route) {
        const bounds = calculateSegmentBounds(originPlace, destPlace, route);
        setFocusBounds(bounds);
      }
    } else {
      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: steps.length,
        subType: 'dest',
      });
      setFocusBounds({
        sw: { lat: destPlace.lat - 0.0025, lng: destPlace.lng - 0.0025 },
        ne: { lat: destPlace.lat + 0.0025, lng: destPlace.lng + 0.0025 },
      });
    }
  };

  // 특정 스텝 클릭 핸들러
  const handleStepClick = (idx: number, step: DirectionStep, subType?: 'start' | 'end' | 'dest') => {
    const isAlreadyFocused = (
      focusedStep?.originId === originPlace.id &&
      focusedStep?.destId === destPlace.id &&
      focusedStep?.stepIndex === idx &&
      focusedStep?.subType === subType
    );

    if (isAlreadyFocused) {
      setFocusedStep(null);
      if (route) {
        const bounds = calculateSegmentBounds(originPlace, destPlace, route);
        setFocusBounds(bounds);
      }
      return;
    }

    setFocusedStep({
      originId: originPlace.id,
      destId: destPlace.id,
      stepIndex: idx,
      subType,
    });

    if (subType === 'start' && step.startLat && step.startLng) {
      setFocusBounds({
        sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
        ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
      });
    } else if (subType === 'end' && step.endLat && step.endLng) {
      setFocusBounds({
        sw: { lat: step.endLat - 0.002, lng: step.endLng - 0.002 },
        ne: { lat: step.endLat + 0.002, lng: step.endLng + 0.002 },
      });
    } else if (step.pathPoints && step.pathPoints.length > 0) {
      let minLat = step.pathPoints[0].lat;
      let maxLat = step.pathPoints[0].lat;
      let minLng = step.pathPoints[0].lng;
      let maxLng = step.pathPoints[0].lng;
      step.pathPoints.forEach(p => {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
      });
      setFocusBounds({
        sw: { lat: minLat - 0.0015, lng: minLng - 0.0015 },
        ne: { lat: maxLat + 0.0015, lng: maxLng + 0.0015 },
      });
    } else if (step.startLat && step.startLng) {
      setFocusBounds({
        sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
        ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full px-4 py-2 flex items-center overflow-x-auto scrollbar-none shrink-0 select-none ${className}`}
      style={{ height: '104px' }}
    >
      <div className="flex items-center shrink-0 gap-1.5 h-full">
        {/* 1. 출발지 노드 */}
        <div
          onClick={handleOriginClick}
          className={`flex flex-col items-center justify-between w-[78px] shrink-0 h-full py-1 cursor-pointer transition-all ${
            isOriginFocused ? 'scale-110' : 'hover:opacity-90'
          }`}
        >
          <span
            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full transition-all ${
              isOriginFocused
                ? 'text-white bg-blue-600 shadow-xs'
                : 'text-blue-600 bg-blue-50 border border-blue-200/80'
            }`}
          >
            출발
          </span>
          <div
            className={`w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center transition-all ${
              isOriginFocused ? 'ring-4 ring-blue-400/40 shadow-md' : 'shadow-xs'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <span
            className={`text-[11px] truncate max-w-full text-center transition-all ${
              isOriginFocused ? 'font-black text-blue-700' : 'font-bold text-zinc-900'
            }`}
            title={originPlace.place_name}
          >
            {originPlace.place_name}
          </span>
        </div>

        {/* 2. 스텝 노선 렌더링 */}
        {steps.length > 0 ? (
          steps.map((step, idx) => {
            const isWalk = step.type === 'walk';
            const isSubway = step.type === 'subway';
            const isBus = step.type === 'bus';
            const isCar = step.type === 'car' || step.type === 'taxi';

            const stepColor = step.color || (isSubway ? '#10B981' : isBus ? '#3B82F6' : isCar ? '#4F46E5' : '#94A3B8');
            const isStepFocused = focusedStep?.originId === originPlace.id && focusedStep?.destId === destPlace.id && focusedStep?.stepIndex === idx;
            const isThisStepActive = idx === 0 ? isOriginStageActive : isStepFocused;

            if (isWalk) {
              return (
                <div
                  key={`step-walk-${idx}`}
                  onClick={() => (idx === 0 ? handleOriginClick() : handleStepClick(idx, step))}
                  className={`flex flex-col items-center justify-between min-w-[56px] px-1 shrink-0 h-full py-1 cursor-pointer transition-all ${
                    isThisStepActive ? 'opacity-100 scale-105 ring-2 ring-blue-300/60 rounded-xl bg-blue-50/40' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  <span className="text-[10px] font-bold text-zinc-500">
                    {step.duration ? `${step.duration}분` : '도보'}
                  </span>
                  <div className="w-full flex items-center justify-center relative">
                    <div className="w-full h-0.5 border-t-2 border-dashed border-zinc-300 absolute inset-x-0 top-1/2 -translate-y-1/2" />
                    <div className="w-5 h-5 rounded-full bg-zinc-100 border border-zinc-300 text-zinc-600 flex items-center justify-center z-10">
                      <Footprints className="w-2.5 h-2.5" />
                    </div>
                  </div>
                  <span className="text-[9.5px] font-medium text-zinc-400">
                    {(step as any).distance ? ((step as any).distance >= 1000 ? `${((step as any).distance / 1000).toFixed(1)}km` : `${(step as any).distance}m`) : '도보'}
                  </span>
                </div>
              );
            }

            // 대중교통 (지하철 / 버스 / 기차 등)
            return (
              <div key={`step-transit-${idx}`} className="flex items-center shrink-0">
                {/* 탑승역 노드 */}
                <div
                  onClick={() => (idx === 0 ? handleOriginClick() : handleStepClick(idx, step, 'start'))}
                  className={`flex flex-col items-center justify-between w-[84px] shrink-0 h-full py-1 cursor-pointer transition-all ${
                    (idx === 0 && isOriginStageActive) || (isStepFocused && focusedStep?.subType === 'start')
                      ? 'scale-105 ring-2 ring-blue-300/60 rounded-xl bg-blue-50/40'
                      : 'hover:opacity-90'
                  }`}
                >
                  <span
                    style={{ color: stepColor, backgroundColor: `${stepColor}12`, borderColor: `${stepColor}25` }}
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border truncate max-w-[80px]"
                    title={step.name}
                  >
                    {isBus ? cleanBusNumber(step.name) : step.name}
                  </span>
                  <div
                    style={{ borderColor: stepColor }}
                    className="w-5.5 h-5.5 rounded-full bg-white border-2 flex items-center justify-center shadow-xs"
                  >
                    {isSubway ? (
                      <Train className="w-2.5 h-2.5" style={{ color: stepColor }} />
                    ) : isBus ? (
                      <Bus className="w-2.5 h-2.5" style={{ color: stepColor }} />
                    ) : (
                      <Navigation className="w-2.5 h-2.5" style={{ color: stepColor }} />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-zinc-900 truncate max-w-[80px] text-center" title={step.startName}>
                    {step.startName || '탑승'}
                  </span>
                </div>

                {/* 구간 이동 라인 (소요 시간 & 정거장 수) */}
                <div
                  onClick={() => handleStepClick(idx, step)}
                  className={`flex flex-col items-center justify-between min-w-[68px] px-1 shrink-0 h-full py-1 cursor-pointer transition-all ${
                    isStepFocused && !focusedStep?.subType ? 'scale-105' : 'hover:opacity-90'
                  }`}
                >
                  <span className="text-[10px] font-bold text-zinc-600 truncate max-w-[64px]">
                    {step.duration ? `${step.duration}분` : ''}
                  </span>
                  <div className="w-full flex items-center justify-center relative">
                    <div
                      style={{ backgroundColor: stepColor }}
                      className="w-full h-1 rounded-full"
                    />
                  </div>
                  <span className="text-[9.5px] font-medium text-zinc-400 truncate max-w-[64px]">
                    {step.passStopList?.stationList?.length ? `${step.passStopList.stationList.length}개역` : '이동'}
                  </span>
                </div>

                {/* 하차역 노드 */}
                {step.endName && (
                  <div
                    onClick={() => handleStepClick(idx, step, 'end')}
                    className={`flex flex-col items-center justify-between w-[80px] shrink-0 h-full py-1 cursor-pointer transition-all ${
                      isStepFocused && focusedStep?.subType === 'end' ? 'scale-105' : 'hover:opacity-90'
                    }`}
                  >
                    <span className="text-[9.5px] font-medium text-zinc-500 bg-zinc-100/80 px-1.5 py-0.5 rounded-md truncate max-w-[76px]">
                      하차
                    </span>
                    <div
                      style={{ borderColor: stepColor }}
                      className="w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center shadow-xs"
                    >
                      <div style={{ backgroundColor: stepColor }} className="w-2 h-2 rounded-full" />
                    </div>
                    <span className="text-[11px] font-bold text-zinc-900 truncate max-w-[76px] text-center" title={step.endName}>
                      {step.endName}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          /* 스텝 정보가 없는 기본 연결 라인 */
          <div className="flex flex-col items-center justify-between min-w-[100px] px-2 shrink-0 h-full py-1">
            <span className="text-[10px] font-bold text-zinc-500">
              {typeof route?.duration === 'number' ? `${route.duration}분` : '이동'}
            </span>
            <div className="w-full h-1 bg-zinc-300 rounded-full" />
            <span className="text-[9.5px] font-medium text-zinc-400">
              {typeof route?.distance === 'number' ? `${route.distance.toFixed(1)}km` : ''}
            </span>
          </div>
        )}

        {/* 3. 도착지 노드 */}
        <div
          onClick={handleDestClick}
          className={`flex flex-col items-center justify-between w-[78px] shrink-0 h-full py-1 cursor-pointer transition-all ${
            isDestFocused ? 'scale-110' : 'hover:opacity-90'
          }`}
        >
          <span
            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full transition-all ${
              isDestFocused
                ? 'text-white bg-red-600 shadow-xs'
                : 'text-red-600 bg-red-50 border border-red-200/80'
            }`}
          >
            도착
          </span>
          <div
            className={`w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center transition-all ${
              isDestFocused ? 'ring-4 ring-red-400/40 shadow-md' : 'shadow-xs'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <span
            className={`text-[11px] truncate max-w-full text-center transition-all ${
              isDestFocused ? 'font-black text-red-700' : 'font-bold text-zinc-900'
            }`}
            title={destPlace.place_name}
          >
            {destPlace.place_name}
          </span>
        </div>
      </div>
    </div>
  );
}
