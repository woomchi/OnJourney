"use client";

import React from 'react';
import type { Journey } from '@/types/journey';
import { MAX_JOURNEY_PLACES } from '@/constants/journey';
import { MapPin } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';

interface TimelineSummaryBarProps {
  placesCount: number;
  totalDurationMin: number;
  totalFareSum: number;
  hasFare: boolean;
  isAnySegmentLoading: boolean;
  isEditMode: boolean;
  isPlaying: boolean;
  prevJourney: Journey | null;
  nextJourney: Journey | null;
  onPlayToggle: () => void;
  onSelectPrevJourney: () => void;
  onSelectNextJourney: () => void;
}

export function TimelineSummaryBar({
  placesCount,
  totalDurationMin,
  totalFareSum,
  hasFare,
  isAnySegmentLoading,
  isEditMode,
  isPlaying,
  prevJourney,
  nextJourney,
  onPlayToggle,
  onSelectPrevJourney,
  onSelectNextJourney,
}: TimelineSummaryBarProps) {
  const formatTotalDuration = (mins: number) => {
    if (mins < 60) return `${mins}분`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  };

  return (
    <div
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
      }}
      className="w-full px-4 pt-1.5 pb-1 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none touch-none"
    >
      {/* 좌측: 소요 시간 & 비용 */}
      <div className="flex-1 flex flex-col items-start justify-center min-w-0 leading-tight">
        {isAnySegmentLoading ? (
          <div className="flex flex-col gap-1 animate-pulse">
            <div className="h-4 w-16 bg-zinc-200 rounded-md" />
            <div className="h-3 w-12 bg-zinc-150 rounded-md" />
          </div>
        ) : (
          <>
            <span className="font-extrabold text-sm text-zinc-900 truncate">
              {totalDurationMin > 0 ? formatTotalDuration(totalDurationMin) : '0분'}
            </span>
            <span className="font-semibold text-xs text-zinc-600 truncate mt-0.5">
              {hasFare ? `${totalFareSum.toLocaleString()}원` : (totalFareSum > 0 ? `${totalFareSum.toLocaleString()}원` : '0원')}
            </span>
          </>
        )}
      </div>

      {/* 중앙: 재생 플레이어 UI */}
      {!isEditMode ? (
        <div className="flex items-center justify-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={!prevJourney}
            onClick={onSelectPrevJourney}
            className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
          >
            <SkipBackIcon className="w-5 h-5" />
          </button>

          {placesCount >= 2 ? (
            <button
              type="button"
              onClick={onPlayToggle}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 group overflow-hidden cursor-pointer shadow-sm ${
                isPlaying
                  ? 'bg-white border border-zinc-200 text-zinc-950 shadow-xs'
                  : 'bg-zinc-950 text-white shadow-xs'
              }`}
              title={isPlaying ? "전체 여정 보기 해제" : "전체 여정 재생"}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {isPlaying ? (
                <PauseBarsIcon className="w-5 h-5 relative z-10 group-hover:text-white transition-colors duration-300" />
              ) : (
                <PlayTriangleIcon className="w-5 h-5 ml-0.5 relative z-10 group-hover:text-white transition-colors duration-300" />
              )}
            </button>
          ) : (
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center bg-zinc-100 border border-zinc-200/60 text-zinc-300 shrink-0 cursor-not-allowed"
              title="장소를 2개 이상 등록해주세요"
            >
              <PlayTriangleIcon className="w-5 h-5 ml-0.5 text-zinc-300" />
            </div>
          )}

          <button
            type="button"
            disabled={!nextJourney}
            onClick={onSelectNextJourney}
            className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
          >
            <SkipForwardIcon className="w-5 h-5" />
          </button>
        </div>
      ) : null}

      {/* 우측: 목적지 N개 */}
      <div className="flex-1 flex items-center justify-end gap-1 text-xs font-bold text-zinc-900 min-w-0">
        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="shrink-0 text-zinc-900 font-bold">장소 {placesCount}/{MAX_JOURNEY_PLACES}</span>
      </div>
    </div>
  );
}
