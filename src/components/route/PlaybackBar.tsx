"use client";

import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';

interface PlaybackBarProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  pages: { idx: number, step: any, subType?: 'start' | 'end' | 'dest' }[];
  handlePrevStep: () => void;
  handleNextStep: () => void;
  handleStepClick: (idx: number, step: any, subType?: 'start' | 'end' | 'dest') => void;
  onPrevSegment?: (jumpToDest?: boolean) => void;
  onNextSegment?: (jumpToStart?: boolean) => void;
}

export default function PlaybackBar({
  route,
  originPlace,
  destPlace,
  pages,
  handlePrevStep,
  handleNextStep,
  handleStepClick,
  onPrevSegment,
  onNextSegment,
}: PlaybackBarProps) {
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

  const isPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);
  let currentIdx = pages.findIndex(p => p.idx === focusedStep?.stepIndex && p.subType === focusedStep?.subType);
  if (currentIdx === -1 && focusedStep) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);

  const totalStepsNum = pages.length;
  const currentStepNum = isPanelFocused && currentIdx >= 0 ? currentIdx + 1 : 0;
  const progressPercent = totalStepsNum > 0 ? (currentStepNum / totalStepsNum) * 100 : 0;

  const isAtEnd = isPanelFocused && currentIdx === pages.length - 1;
  const showPlayIcon = !isPanelFocused || isAtEnd;

  const isPrevDisabled = pages.length === 0 || (!isPanelFocused && !onPrevSegment);
  const isNextDisabled = pages.length === 0 || (currentIdx >= pages.length - 1 && !onNextSegment);

  const formatTime = (stepNum: number) => {
    const min = Math.floor(stepNum / 60);
    const sec = stepNum % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const handlePlayToggle = () => {
    if (isPanelFocused && !isAtEnd) {
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, route);
      setFocusBounds(bounds);
    } else {
      if (pages.length > 0) {
        handleStepClick(pages[0].idx, pages[0].step, pages[0].subType);
      }
    }
  };

  return (
    <div className="flex-shrink-0 p-5 bg-white border-t border-zinc-100 rounded-b-3xl flex flex-col items-center shadow-[0_-4px_20px_rgba(0,0,0,0.03)] w-full">
      {/* 컨트롤 버튼부 */}
      <div className="flex items-center justify-center gap-6 mb-3">
        {/* 이전 단계 (<) */}
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={isPrevDisabled}
          className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
          aria-label="이전 단계"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 rotate-180">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
          </svg>
        </button>

        {/* 재생/일시정지 버튼 (Play/Pause) */}
        <button
          type="button"
          onClick={handlePlayToggle}
          className={`w-14 h-14 flex items-center justify-center rounded-full transition-all active:scale-95 group shadow-md flex-shrink-0 ${
            showPlayIcon
              ? 'bg-zinc-950 border border-zinc-800 hover:bg-zinc-900 text-white shadow-md'
              : 'bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-950 shadow-sm'
          }`}
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

        {/* 다음 단계 (>) */}
        <button
          type="button"
          onClick={handleNextStep}
          disabled={isNextDisabled}
          className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
          aria-label="다음 단계"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
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
      <div className="w-full flex items-center gap-2.5 px-2">
        <span className="text-[10px] font-bold text-zinc-500 w-7 text-right select-none">
          {formatTime(currentStepNum)}
        </span>
        <div className="relative flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden shadow-inner">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-zinc-300 via-zinc-600 to-zinc-950 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-zinc-500 w-7 text-left select-none">
          {formatTime(totalStepsNum)}
        </span>
      </div>
    </div>
  );
}
