"use client";

import React from 'react';
import type { Journey } from '@/types/journey';
import { formatShortDate } from '@/lib/utils/journeyUtils';
import { Loader2, ChevronLeft, Pencil, Check, Bus, Car, Footprints, Calendar } from 'lucide-react';

interface TimelineHeaderProps {
  activeJourney: Journey;
  isEditMode: boolean;
  isSyncing: boolean;
  onBackOrCancel: () => void;
  onOpenEditModal: () => void;
  onToggleEditMode: () => void;
}

export function TimelineHeader({
  activeJourney,
  isEditMode,
  isSyncing,
  onBackOrCancel,
  onOpenEditModal,
  onToggleEditMode,
}: TimelineHeaderProps) {
  const formattedDate = formatShortDate(activeJourney.journey_date);

  const transportTypeLabel =
    activeJourney.transport_type === 'car' ? '차량' :
      activeJourney.transport_type === 'walk' ? '도보' : '대중교통';

  return (
    <div
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
      }}
      className="w-full px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0 select-none touch-none"
    >
      {/* 좌측: 목록 / 취소 버튼 */}
      <button
        type="button"
        onClick={onBackOrCancel}
        className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-xs font-semibold rounded-md px-1 py-0.5 shrink-0 cursor-pointer"
        title={isEditMode ? "편집 취소" : "여정 목록으로 돌아가기"}
        aria-label={isEditMode ? "편집 취소" : "여정 목록으로 돌아가기"}
      >
        {isEditMode ? (
          '취소'
        ) : (
          <>
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            <span>목록</span>
          </>
        )}
      </button>

      {/* 중앙: 여정 정보 수정 영역 (제목, 날짜, 이동수단 설정 정보 전체 포함 버튼) */}
      <div className="flex-1 flex justify-center min-w-0 px-1">
        <button
          type="button"
          onClick={onOpenEditModal}
          className="inline-flex flex-col items-center max-w-full px-2.5 py-1 rounded-xl hover:bg-zinc-100/90 active:bg-zinc-200/80 transition-all cursor-pointer group shrink border border-transparent hover:border-zinc-200/80"
          title="여정 정보 수정"
        >
          {/* 1행: [Pencil 아이콘] 여정 제목 & 이동 수단 설정 정보 */}
          <div className="flex items-center gap-1.5 max-w-full">
            <Pencil className="w-3 h-3 text-zinc-400 group-hover:text-blue-600 transition-colors shrink-0" strokeWidth={2} />
            <h2 className="text-sm font-extrabold tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
              {activeJourney.title}
            </h2>
            <span className="text-zinc-300 font-light select-none shrink-0">·</span>
            <div className="flex items-center gap-1 shrink-0 text-xs font-semibold text-zinc-600">
              {activeJourney.transport_type === 'car' ? (
                <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              ) : activeJourney.transport_type === 'walk' ? (
                <Footprints className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Bus className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              )}
              <span>{transportTypeLabel}</span>
            </div>
          </div>

          {/* 2행: 여정 제목 밑: 날짜 */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 mt-0.5 truncate max-w-full transition-colors">
            <div className="flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 shrink-0 transition-colors" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </button>
      </div>

      {/* 우측: 동기화 & 편집 버튼 */}
      <div className="flex items-center gap-1 shrink-0">
        {isSyncing && (
          <div className="flex items-center mr-0.5" title="동기화 중">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          </div>
        )}

        <button
          type="button"
          onClick={onToggleEditMode}
          className={`flex items-center gap-0.5 text-xs font-semibold transition-colors px-1 py-0.5 rounded-md cursor-pointer ${
            isEditMode ? 'text-blue-600 font-bold' : 'text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {isEditMode ? (
            <>
              <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              완료
            </>
          ) : (
            <>
              <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              편집
            </>
          )}
        </button>
      </div>
    </div>
  );
}
