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
    <div className="relative w-full bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden flex items-center px-4 py-2.5 gap-3">
      {/* 진행바는 하단으로 이동됨 */}

      {/* 왼쪽: 컨트롤 영역 (이전, 재생/일시정지, 다음) */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={handlePrevStep}
          disabled={isPrevDisabled}
          className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
          aria-label="이전 단계"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 rotate-180">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handlePlayToggle}
          className={`relative z-10 w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-95 group shadow-sm flex-shrink-0 overflow-hidden ${
            showPlayIcon
              ? 'bg-zinc-900 border border-zinc-800 hover:border-transparent text-white'
              : 'bg-white border border-zinc-200 hover:border-transparent text-zinc-900'
          }`}
          aria-label={showPlayIcon ? "여정 재생" : "여정 일시정지"}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {!showPlayIcon ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 relative z-10 group-hover:text-white transition-colors duration-300">
              <rect x="6" y="4.5" width="4.5" height="15" rx="1.5" />
              <rect x="13.5" y="4.5" width="4.5" height="15" rx="1.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5 relative z-10 group-hover:text-white transition-colors duration-300">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={handleNextStep}
          disabled={isNextDisabled}
          className="w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:hover:text-zinc-500 transition-colors"
          aria-label="다음 단계"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* 오른쪽: 텍스트 정보 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer select-none items-end text-right pl-2" onClick={handlePlayToggle}>
        <div className="text-[13px] font-extrabold text-zinc-800 flex items-center justify-end gap-1.5 truncate w-full">
          <span className="truncate max-w-[120px]" title={originPlace.place_name}>{originPlace.place_name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-zinc-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
          <span className="truncate max-w-[120px]" title={destPlace.place_name}>{destPlace.place_name}</span>
        </div>
        <div className="text-[11px] font-bold text-zinc-500 flex items-center justify-end gap-2 mt-0.5 w-full">
          <span>{formatTime(currentStepNum)} / {formatTime(totalStepsNum)}</span>
        </div>
      </div>

      {/* 하단 진행바 및 물결 애니메이션 */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-zinc-100/80">
        <div 
          className={`absolute bottom-0 left-0 h-[16px] origin-bottom transition-all duration-500 ease-out ${
            !showPlayIcon ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
          }`}
          style={{ 
            width: `${progressPercent}%`,
            WebkitMaskImage: 'radial-gradient(ellipse 100% 100% at 100% 100%, black 98%, transparent 100%), linear-gradient(black, black), radial-gradient(ellipse 100% 100% at 0% 100%, black 98%, transparent 100%)',
            WebkitMaskSize: '15% 100%, 70% 100%, 15% 100%',
            WebkitMaskPosition: 'left bottom, center bottom, right bottom',
            WebkitMaskRepeat: 'no-repeat',
            maskImage: 'radial-gradient(ellipse 100% 100% at 100% 100%, black 98%, transparent 100%), linear-gradient(black, black), radial-gradient(ellipse 100% 100% at 0% 100%, black 98%, transparent 100%)',
            maskSize: '15% 100%, 70% 100%, 15% 100%',
            maskPosition: 'left bottom, center bottom, right bottom',
            maskRepeat: 'no-repeat'
          }}
        >
          <div 
            className="absolute bottom-0 left-0 w-full h-[16px]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'%3E%3Cpath d='M 0 10 Q 25 0 50 10 T 100 10 L 100 20 L 0 20 Z' fill='%236366f1' opacity='0.3'/%3E%3C/svg%3E")`,
              backgroundSize: '60px 100%',
              backgroundRepeat: 'repeat-x',
              animation: 'bg-wave-1 2s linear infinite'
            }}
          />
          <div 
            className="absolute bottom-0 left-0 w-full h-[10px]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'%3E%3Cpath d='M 0 10 Q 25 0 50 10 T 100 10 L 100 20 L 0 20 Z' fill='%238b5cf6' opacity='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: '40px 100%',
              backgroundRepeat: 'repeat-x',
              animation: 'bg-wave-2 1.5s linear infinite'
            }}
          />
        </div>
        <div 
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
