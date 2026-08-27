"use client";

import React from 'react';
import type { Place } from '@/types/journey';
import { ArrowRight } from 'lucide-react';
import { PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';

interface FocusedStepControlBarProps {
  focusedOrigin: Place | null;
  focusedDest: Place | null;
  currentStepIdx: number;
  totalStepsCount: number;
  hasPrevSegment: boolean;
  hasNextSegment: boolean;
  showStepPlayIcon: boolean;
  stepProgressPercent: number;
  onPrevStep: () => void;
  onNextStep: () => void;
  onPlayStepToggle: () => void;
}

export function FocusedStepControlBar({
  focusedOrigin,
  focusedDest,
  currentStepIdx,
  totalStepsCount,
  hasPrevSegment,
  hasNextSegment,
  showStepPlayIcon,
  stepProgressPercent,
  onPrevStep,
  onNextStep,
  onPlayStepToggle,
}: FocusedStepControlBarProps) {
  return (
    <div className="relative w-full bg-zinc-50/80 border border-zinc-200/70 rounded-2xl shadow-2xs overflow-hidden flex items-center px-4 py-2 gap-3 select-none">
      {/* 왼쪽: 컨트롤 영역 (이전 단계, 재생/일시정지, 다음 단계) */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onPrevStep}
          disabled={currentStepIdx <= 0 && !hasPrevSegment}
          className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-950 disabled:opacity-20 disabled:pointer-events-none active:scale-90 transition-all rounded-lg hover:bg-zinc-200/50 cursor-pointer"
          aria-label="이전 단계"
          title="이전 단계"
        >
          <PlayTriangleIcon className="w-4 h-4 rotate-180" />
        </button>

        <button
          type="button"
          onClick={onPlayStepToggle}
          className={`relative z-10 w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-95 group shadow-xs flex-shrink-0 overflow-hidden cursor-pointer ${
            showStepPlayIcon
              ? 'bg-zinc-950 text-white shadow-2xs'
              : 'bg-white border border-zinc-200 text-zinc-900 shadow-2xs'
          }`}
          aria-label={showStepPlayIcon ? "여정 재생" : "여정 일시정지"}
          title={showStepPlayIcon ? "단계별 재생" : "일시정지"}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          {!showStepPlayIcon ? (
            <PauseBarsIcon className="w-4 h-4 relative z-10 group-hover:text-white transition-colors duration-300" />
          ) : (
            <PlayTriangleIcon className="w-4 h-4 ml-0.5 relative z-10 group-hover:text-white transition-colors duration-300" />
          )}
        </button>

        <button
          type="button"
          onClick={onNextStep}
          disabled={currentStepIdx >= totalStepsCount - 1 && !hasNextSegment}
          className="w-8 h-8 flex items-center justify-center text-zinc-600 hover:text-zinc-950 disabled:opacity-20 disabled:pointer-events-none active:scale-90 transition-all rounded-lg hover:bg-zinc-200/50 cursor-pointer"
          aria-label="다음 단계"
          title="다음 단계"
        >
          <PlayTriangleIcon className="w-4 h-4" />
        </button>
      </div>

      {/* 오른쪽: 텍스트 정보 */}
      <div
        className="flex-1 min-w-0 flex flex-col justify-center cursor-pointer select-none items-end text-right pl-2"
        onClick={onPlayStepToggle}
      >
        <div className="text-xs font-extrabold text-zinc-800 flex items-center justify-end gap-1.5 truncate w-full">
          <span className="truncate max-w-[100px]" title={focusedOrigin?.place_name}>
            {focusedOrigin?.place_name}
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400 flex-shrink-0" strokeWidth={2.5} />
          <span className="truncate max-w-[100px]" title={focusedDest?.place_name}>
            {focusedDest?.place_name}
          </span>
        </div>
        <div className="text-[11px] font-bold text-zinc-500 flex items-center justify-end gap-1.5 mt-0.5 w-full">
          <span>
            {currentStepIdx >= 0 ? `${currentStepIdx + 1} / ${totalStepsCount} 단계` : `총 ${totalStepsCount}단계`}
          </span>
        </div>
      </div>

      {/* 하단 진행바 */}
      <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-zinc-200/70">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 transition-all duration-300 ease-out"
          style={{ width: `${stepProgressPercent}%` }}
        />
      </div>
    </div>
  );
}
