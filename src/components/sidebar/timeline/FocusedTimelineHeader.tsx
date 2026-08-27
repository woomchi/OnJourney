"use client";

import React from 'react';
import type { Place } from '@/types/journey';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon } from '@/components/ui/icons';

interface FocusedTimelineHeaderProps {
  focusedOrigin: Place;
  focusedDest: Place;
  hasPrevSegment: boolean;
  hasNextSegment: boolean;
  onExitFocus: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
}

export function FocusedTimelineHeader({
  focusedOrigin,
  focusedDest,
  hasPrevSegment,
  hasNextSegment,
  onExitFocus,
  onPrevSegment,
  onNextSegment,
}: FocusedTimelineHeaderProps) {
  return (
    <div className="w-full px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0 select-none border-b border-zinc-100/80">
      {/* 좌측: 전체 여정 복귀 버튼 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExitFocus();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/80 active:scale-95 transition-all text-xs font-bold rounded-lg px-1.5 py-1 shrink-0 cursor-pointer"
        title="전체 여정으로 돌아가기"
        aria-label="전체 여정으로 돌아가기"
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
        <span>뒤로</span>
      </button>

      {/* 중앙: 현재 포커스된 구간 (출발지 ➔ 도착지) */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-1">
        <div className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-xl bg-zinc-100/80 border border-zinc-200/60 text-zinc-800 text-xs font-bold truncate">
          <span className="truncate max-w-[85px]" title={focusedOrigin.place_name}>
            {focusedOrigin.place_name}
          </span>
          <ArrowRight className="w-3 h-3 text-zinc-400 shrink-0" strokeWidth={2.5} />
          <span className="truncate max-w-[85px]" title={focusedDest.place_name}>
            {focusedDest.place_name}
          </span>
        </div>
      </div>

      {/* 우측: 이전 구간 / 다음 구간 이동 네비게이션 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          disabled={!hasPrevSegment}
          onClick={(e) => {
            e.stopPropagation();
            onPrevSegment();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 active:scale-90 disabled:opacity-20 disabled:pointer-events-none transition-all rounded-md cursor-pointer"
          title="이전 구간"
          aria-label="이전 구간"
        >
          <SkipBackIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={!hasNextSegment}
          onClick={(e) => {
            e.stopPropagation();
            onNextSegment();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 active:scale-90 disabled:opacity-20 disabled:pointer-events-none transition-all rounded-md cursor-pointer"
          title="다음 구간"
          aria-label="다음 구간"
        >
          <SkipForwardIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
