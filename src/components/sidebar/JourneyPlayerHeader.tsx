"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { formatJourneyDate } from '@/lib/journeyUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';

interface JourneyPlayerHeaderProps {
  activeJourney: Journey;
  isSearchMode: boolean;
  setIsEditModalOpen: (isOpen: boolean) => void;
  handleDoneEdit: () => void;
}

export default function JourneyPlayerHeader({
  activeJourney,
  isSearchMode,
  setIsEditModalOpen,
  handleDoneEdit,
}: JourneyPlayerHeaderProps) {
  const queryClient = useQueryClient();
  const {
    journeys,
    clearJourney,
    focusedStep,
    setFocusedStep,
    focusedSegment,
    setFocusedSegment,
    setFocusBounds,
    isSyncing,
    setAlternativeSegment,
    setActiveJourney,
    isEditMode,
    setEditMode,
    setDrawerSnapPoint,
  } = useJourneyStore();

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);

  useEffect(() => {
    if (!focusedSegment && !focusedStep) {
      setIsGlobalPlaying(false);
    }
  }, [focusedSegment, focusedStep]);

  const isPlaying = isGlobalPlaying && (!!focusedSegment || !!focusedStep);
  const activeIndex = journeys.findIndex(j => j.id === activeJourney.id);
  const prevJourney = activeIndex > 0 ? journeys[activeIndex - 1] : null;
  const nextJourney = activeIndex >= 0 && activeIndex < journeys.length - 1 ? journeys[activeIndex + 1] : null;

  return (
    <header className={`flex flex-col border-b border-zinc-100/80 flex-shrink-0 relative overflow-hidden drawer-drag-area cursor-grab active:cursor-grabbing touch-none ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-xl'}`}>
      {/* 왼쪽 상단 모서리: 뒤로가기 / 취소 */}
      {!isSearchMode && (
        <div className="absolute top-1.5 left-2 z-20">
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else {
                clearJourney();
              }
            }}
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700 transition-colors text-[11px] font-semibold rounded-md px-1 py-1"
          >
            {isEditMode ? (
              <div className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
            {isEditMode ? '취소' : '목록'}
          </button>
        </div>
      )}

      {/* 오른쪽 상단 모서리: 편집 및 동기화 */}
      {!isSearchMode && (
        <div className="absolute top-1.5 right-2 z-20 flex justify-end items-center gap-1">
          {isSyncing && (
            <div className="flex items-center" title="클라우드 동기화 중">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            </div>
          )}
          <button
            type="button"
            onClick={
              isEditMode
                ? handleDoneEdit
                : () => {
                    setEditMode(true);
                    setDrawerSnapPoint(1);
                  }
            }
            className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors px-1 py-1 ${isEditMode ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-700'
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
      )}

      {/* 중앙 바: 여정 정보 (버튼 사이에 위치) */}
      <div className="w-full flex justify-center px-16 pt-1">
        <button
          type="button"
          onClick={() => setIsEditModalOpen(true)}
          className="flex-1 flex flex-col items-center justify-center min-w-0 rounded-xl transition-all duration-300 hover:bg-zinc-50/80 cursor-pointer px-1 py-1 group border border-transparent hover:border-zinc-200/50"
          title="여정 정보 수정"
        >
          {/* 노래 제목 느낌 */}
          <div className="flex items-center justify-center max-w-full px-1">
            {/* 가운데 정렬 보정을 위한 빈 공간 (우측 연필 아이콘과 동일한 너비) */}
            <div className="w-3 h-3 mr-0.5 shrink-0" />

            <h2 className="text-sm font-black tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
              {activeJourney.title}
            </h2>

            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-all ml-0.5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </div>

          {/* 작사/작곡가 느낌 (생성 날짜 & 테마) */}
          <p className="text-[9px] font-medium text-zinc-400/80 mt-0.5 flex items-center gap-1 group-hover:text-zinc-500 transition-colors truncate max-w-full">
            <span className="truncate">{formatJourneyDate(activeJourney.journey_date)}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
            <span className="shrink-0">{activeJourney.transport_type === 'public' ? '대중교통' : activeJourney.transport_type === 'car' ? '차량' : '도보'}</span>
          </p>
        </button>
      </div>

      {/* 하단: 여정 이동 및 재생 조절 컨트롤 */}
      {!isEditMode && (
        <div className="flex items-center justify-center gap-6 pb-2.5 w-full">
          {/* 이전 여정 (<<) */}
          <button
            type="button"
            disabled={!prevJourney}
            onClick={() => {
              if (prevJourney) {
                setFocusedStep(null);
                setFocusedSegment(null);
                setAlternativeSegment(null);
                setFocusBounds(null);
                setActiveJourney(prevJourney);
              }
            }}
            className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
            title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
          >
            <SkipBackIcon className="w-6 h-6" />
          </button>

          {/* 여정 재생/정지 */}
          {activeJourney.places.length >= 2 ? (
            <button
              type="button"
              onClick={() => {
                if (isPlaying) {
                  setIsGlobalPlaying(false);
                  setFocusedStep(null);
                  setFocusedSegment(null);
                  setAlternativeSegment(null);
                  setFocusBounds(null);
                } else {
                  setIsGlobalPlaying(true);
                  if (!focusedSegment && !focusedStep) {
                    const firstPlace = activeJourney.places[0];
                    const secondPlace = activeJourney.places[1];

                    const queryKey = directionKeys.segment(firstPlace.id, secondPlace.id);
                    const segmentData = queryClient.getQueryData<any>(queryKey);
                    const transportType = activeJourney.transport_type || 'public';
                    const activeRoute = getDefaultRoute(firstPlace, secondPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                    if (activeRoute) {
                      setFocusedSegment({ originId: firstPlace.id, destId: secondPlace.id });
                      setFocusedStep(null);

                      const bounds = calculateSegmentBounds(firstPlace, secondPlace, activeRoute);
                      setFocusBounds(bounds);
                    }
                  }
                }
              }}
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 flex-shrink-0 group overflow-hidden ${isPlaying
                ? 'bg-white border border-zinc-200 hover:border-transparent text-zinc-950 shadow-sm'
                : 'bg-zinc-950 border border-zinc-800 hover:border-transparent text-white shadow-md'
                }`}
              title={isPlaying ? "전체 여정 보기 해제" : "전체 여정 재생"}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {isPlaying ? (
                <PauseBarsIcon className="w-3.5 h-3.5 relative z-10 group-hover:text-white transition-colors duration-300" />
              ) : (
                <PlayTriangleIcon className="w-3.5 h-3.5 ml-0.5 relative z-10 group-hover:text-white transition-colors duration-300" />
              )}
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-100 flex-shrink-0">
              <PlayTriangleIcon className="w-3.5 h-3.5 ml-0.5 text-zinc-300" />
            </div>
          )}

          {/* 다음 여정 (>>) */}
          <button
            type="button"
            disabled={!nextJourney}
            onClick={() => {
              if (nextJourney) {
                setFocusedStep(null);
                setFocusedSegment(null);
                setAlternativeSegment(null);
                setFocusBounds(null);
                setActiveJourney(nextJourney);
              }
            }}
            className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
            title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
          >
            <SkipForwardIcon className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 플레이어 하단 디자인 요소 (재생 바 같은 느낌) */}
      {!isEditMode && (() => {
        let totalSegments = 1;
        let activePlaceIndex = -1;
        let stepFraction = 0;

        if (activeJourney && activeJourney.places && activeJourney.places.length > 1) {
          totalSegments = activeJourney.places.length - 1;

          if (isPlaying) {
            const activeOriginId = focusedStep ? focusedStep.originId : focusedSegment?.originId;
            activePlaceIndex = activeJourney.places.findIndex((p: any) => p.id === activeOriginId);

            if (activePlaceIndex !== -1 && activePlaceIndex < totalSegments) {
              if (focusedStep) {
                const firstPlace = activeJourney.places[activePlaceIndex];
                const secondPlace = activeJourney.places[activePlaceIndex + 1];
                const queryKey = directionKeys.segment(firstPlace.id, secondPlace.id);
                const segmentData = queryClient.getQueryData<any>(queryKey);
                const transportType = activeJourney.transport_type || 'public';
                const activeRoute = getDefaultRoute(firstPlace, secondPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                if (activeRoute && activeRoute.steps) {
                  const getPages = () => {
                    const arr: { idx: number, subType?: 'start' | 'end' | 'dest' }[] = [];
                    activeRoute.steps.forEach((step: any, idx: number) => {
                      if (step.type === 'walk' || (!step.startName && !step.endName)) {
                        arr.push({ idx });
                      } else {
                        if (step.startName) arr.push({ idx, subType: 'start' });
                        if (step.endName) arr.push({ idx, subType: 'end' });
                      }
                    });
                    arr.push({ idx: activeRoute.steps.length, subType: 'dest' });
                    return arr;
                  };

                  const pages = getPages();
                  let currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
                  if (currentIdx === -1) currentIdx = pages.findIndex(p => p.idx === focusedStep.stepIndex);

                  const totalStepsNum = pages.length;
                  const currentStepNum = currentIdx >= 0 ? currentIdx + 1 : 0;
                  stepFraction = Math.min(1, Math.max(0, currentStepNum / totalStepsNum));
                }
              }
            }
          }
        }

        let progressPercent = 0;
        if (isPlaying && activePlaceIndex !== -1) {
          progressPercent = ((activePlaceIndex + stepFraction) / totalSegments) * 100;
        }

        return (
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-zinc-100">
            {/* 연속 물결 파동 이펙트 (채워진 영역에만 그려짐) */}
            <div 
              className={`absolute bottom-0 left-0 h-[14px] origin-bottom transition-all duration-500 ease-out ${
                isPlaying ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
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
              {/* 파동 레이어 1 */}
              <div 
                className="absolute bottom-0 left-0 w-full h-[14px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'%3E%3Cpath d='M 0 10 Q 25 0 50 10 T 100 10 L 100 20 L 0 20 Z' fill='%236366f1' opacity='0.3'/%3E%3C/svg%3E")`,
                  backgroundSize: '60px 100%',
                  backgroundRepeat: 'repeat-x',
                  animation: 'bg-wave-1 2s linear infinite'
                }}
              />
              {/* 파동 레이어 2 */}
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
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-r-full shadow-[0_1px_6px_rgba(99,102,241,0.3)] transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        );
      })()}
    </header>
  );
}
