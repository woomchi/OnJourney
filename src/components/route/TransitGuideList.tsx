"use client";

import { useState } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';

interface TransitGuideListProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  handleStepClick: (idx: number, step: any, subType?: 'start' | 'end' | 'dest') => void;
  handleZoomToPoint: (idx: number, step: any, type: 'start' | 'end' | 'dest', e: React.MouseEvent) => void;
}

export default function TransitGuideList({
  route,
  originPlace,
  destPlace,
  handleStepClick,
  handleZoomToPoint,
}: TransitGuideListProps) {
  const { focusedStep } = useJourneyStore();
  const steps = route.steps || [];
  const [expandedSteps, setExpandedSteps] = useState<number[]>([]);

  const toggleAccordion = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSteps(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  return (
    <div className="relative pl-1 flex flex-col gap-6">
      {/* 세로 연결선 */}
      <div className="absolute left-[24.5px] top-4 bottom-4 w-[3px] bg-zinc-100" />

      {steps.map((step, idx) => {
        let defaultColor = '#A1A1AA';
        if (step.type === 'train') defaultColor = '#4F46E5';
        else if (step.type === 'expressbus') defaultColor = '#0EA5E9';
        else if (step.type === 'bus') defaultColor = '#3B82F6';
        else if (step.type === 'subway') defaultColor = '#10B981';
        else if (step.type === 'car' || step.type === 'taxi') defaultColor = '#4F46E5';

        const stepColor = step.type === 'walk' 
          ? (step.color === '#A1A1AA' ? '#E4E4E7' : (step.color || '#E4E4E7')) 
          : (step.color || defaultColor);

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
                const isStartFocused = isThisStepFocused && focusedStep?.subType === 'start';
                const isEndFocused = isThisStepFocused && focusedStep?.subType === 'end';
                return (
                <div className="mt-1.5 p-1 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col gap-0.5 select-none" onClick={(e) => e.stopPropagation()}>
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
                        <span className={`flex-shrink-0 whitespace-nowrap font-bold ${isStartFocused ? 'text-blue-600' : 'text-zinc-400'}`}>승차</span>
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
                        <span className={`flex-shrink-0 whitespace-nowrap font-bold ${isEndFocused ? 'text-rose-600' : 'text-zinc-400'}`}>하차</span>
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

              {/* 경유 정류장 아코디언 UI */}
              {step.passStopList && step.passStopList.stationList && step.passStopList.stationList.length > 0 && (
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => toggleAccordion(idx, e)}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 font-medium transition-colors"
                  >
                    <span>{step.passStopList.stationList.length}개 정류장 이동</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        expandedSteps.includes(idx) ? 'rotate-180' : ''
                      }`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {expandedSteps.includes(idx) && (
                    <div className="mt-2 pl-3 border-l-2 border-zinc-100 flex flex-col gap-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
                      {step.passStopList.stationList.map((station: any, sIdx: number) => (
                        <div key={sIdx} className="text-[11px] text-zinc-400 truncate">
                          {station.stationName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 예약 링크 추가 */}
              {(step.type === 'train' || step.type === 'expressbus') && (
                <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
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

              {step.type === 'walk' && idx === steps.length - 1 && (() => {
                const isDestFocused = isThisStepFocused && focusedStep?.subType === 'dest';
                return (
                <div className="mt-2.5 p-1 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col gap-0.5 select-none" onClick={(e) => e.stopPropagation()}>
                  <div
                    onClick={(e) => handleZoomToPoint(idx, step, 'dest', e)}
                    className={`flex items-center justify-between gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer p-2 rounded-xl transition-all duration-200 group/sub ${
                      isDestFocused
                        ? 'bg-rose-100/70 ring-1 ring-rose-300 shadow-sm scale-[1.01]'
                        : 'hover:bg-rose-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                      <span className={`flex-shrink-0 whitespace-nowrap font-bold ${isDestFocused ? 'text-rose-600' : 'text-zinc-400'}`}>도착</span>
                      <span className={`truncate transition-colors ${isDestFocused ? 'text-rose-800' : 'text-zinc-700 group-hover/sub:text-blue-700'}`}>{destPlace.place_name}</span>
                    </div>
                    <div className={`flex-shrink-0 transition-opacity duration-200 text-rose-500 flex items-center justify-center ${isDestFocused ? 'opacity-100' : 'opacity-0 group-hover/sub:opacity-100'}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 animate-pulse">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                      </svg>
                    </div>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
