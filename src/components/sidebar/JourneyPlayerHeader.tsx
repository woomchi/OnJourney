"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
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
    closeSearchMode,
  } = useJourneyStore();

  const bottomSheet = useOptionalBottomSheet();

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

  const isMobile = useMediaQuery('(max-width: 767px)');
  const HeaderComponent = 'header';

  let totalDistanceKm = 0;
  let totalDurationMin = 0;
  let hasRouteStats = false;

  if (activeJourney?.places && activeJourney.places.length > 1) {
    const transportType = activeJourney.transport_type || 'public';
    for (let i = 0; i < activeJourney.places.length - 1; i++) {
      const origin = activeJourney.places[i];
      const dest = activeJourney.places[i + 1];
      if (!origin || !dest) continue;

      if (origin.selected_route && origin.selected_route.destId === dest.id) {
        if (typeof origin.selected_route.distance === 'number') {
          totalDistanceKm += origin.selected_route.distance;
          hasRouteStats = true;
        }
        if (typeof origin.selected_route.duration === 'number') {
          totalDurationMin += origin.selected_route.duration;
          hasRouteStats = true;
        }
      } else {
        const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
        const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));
        const segmentData = {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || []
        };
        const route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk');
        if (route) {
          if (typeof route.distance === 'number') {
            totalDistanceKm += route.distance;
            hasRouteStats = true;
          }
          if (typeof route.duration === 'number') {
            totalDurationMin += route.duration;
            hasRouteStats = true;
          }
        }
      }
    }
  }

  const formatTotalDuration = (mins: number) => {
    if (mins < 60) return `${mins}분`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  };

  if (isMobile) {
    return (
      <HeaderComponent
        onPointerDown={(e: any) => {
          if (bottomSheet?.dragControls) {
            bottomSheet.dragControls.start(e);
          }
        }}
        className="w-full h-8 flex items-center justify-between px-3 border-b border-zinc-100/80 bg-white flex-shrink-0 relative drawer-drag-area cursor-grab active:cursor-grabbing touch-none"
      >
        {/* 왼쪽: 목록 / 취소 / 여정 상세 */}
        {isSearchMode ? (
          <button
            type="button"
            onClick={closeSearchMode}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-[11px] font-semibold rounded-md px-1.5 py-0.5 cursor-pointer"
            title="여정 상세로 돌아가기"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            여정 상세
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else {
                clearJourney();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-[11px] font-semibold rounded-md px-1.5 py-0.5"
          >
            {!isEditMode && <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {isEditMode ? '취소' : '목록'}
          </button>
        )}

        {/* 우측: 편집 및 동기화 */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5">
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
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors px-1.5 py-0.5 ${isEditMode ? 'text-blue-600' : 'text-zinc-500 hover:text-zinc-800'
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
      </HeaderComponent>
    );
  }

  return (
    <HeaderComponent
      onPointerDown={(e: any) => {
        if (isMobile && bottomSheet?.dragControls) {
          bottomSheet.dragControls.start(e);
        }
      }}
      className={`flex flex-col border-b border-zinc-100/80 flex-shrink-0 relative overflow-hidden drawer-drag-area cursor-grab active:cursor-grabbing touch-none ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-xl'} ${isMobile ? 'pt-0.5' : 'pt-1'}`}
    >
      {/* 왼쪽 상단 모서리: 뒤로가기 / 취소 / 여정 상세 */}
      {isSearchMode ? (
        <div className="absolute top-1 left-2 z-20">
          <button
            type="button"
            onClick={closeSearchMode}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-400 hover:text-zinc-700 transition-colors text-xs font-semibold rounded-md px-1 py-0.5 cursor-pointer"
            title="닫기"
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
            닫기
          </button>
        </div>
      ) : (
        <div className="absolute top-1 left-2 z-20">
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else {
                clearJourney();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-400 hover:text-zinc-700 transition-colors text-xs font-semibold rounded-md px-1 py-0.5"
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
        <div className={`absolute top-1 right-2 z-20 flex justify-end items-center gap-1`}>
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
            onPointerDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-0.5 text-xs font-semibold transition-colors px-1 py-0.5 ${isEditMode ? 'text-blue-600 font-bold' : 'text-zinc-400 hover:text-zinc-700'
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

      {/* 중앙 바: 여정 정보 수정 영역 (제목, 날짜, 이동수단 정보 전체 포함 수정 영역) */}
      <div className="w-full flex justify-center px-14 pt-0 min-w-0">
        <button
          type="button"
          onClick={() => setIsEditModalOpen(true)}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex flex-col items-center max-w-full px-2.5 py-1 rounded-xl hover:bg-zinc-100/90 active:bg-zinc-200/80 transition-all cursor-pointer group border border-transparent hover:border-zinc-200/80 shrink"
          title="여정 정보 수정"
        >
          {/* 1행: [Pencil 아이콘] 여정 제목 */}
          <div className="flex items-center gap-1.5 max-w-full">
            <Pencil className="w-3 h-3 text-zinc-400 group-hover:text-blue-600 transition-colors shrink-0" strokeWidth={2} />
            <h2 className="text-xs font-bold tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
              {activeJourney.title}
            </h2>
          </div>

          {/* 2행: 요약 정보 (날짜, 대표 이동수단 등) */}
          <p className="text-[9px] font-medium text-zinc-400/80 group-hover:text-zinc-600 mt-0.5 flex items-center gap-1 truncate max-w-full transition-colors">
            <span className="truncate">{formatJourneyDate(activeJourney.journey_date)}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
            <span className="shrink-0">{activeJourney.transport_type === 'public' ? '대중교통' : activeJourney.transport_type === 'car' ? '차량' : '도보'}</span>
            <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
            <span className="shrink-0 text-zinc-600 font-semibold">장소 {activeJourney.places?.length || 0}개</span>
            {hasRouteStats && totalDistanceKm > 0 && (
              <>
                <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
                <span className="shrink-0">{totalDistanceKm.toFixed(1)}km</span>
              </>
            )}
            {hasRouteStats && totalDurationMin > 0 && (
              <>
                <span className="w-0.5 h-0.5 rounded-full bg-zinc-300 shrink-0"></span>
                <span className="shrink-0">{formatTotalDuration(totalDurationMin)}</span>
              </>
            )}
          </p>
        </button>
      </div>

      {/* 하단: 여정 이동 및 재생 조절 컨트롤 */}
      {!isEditMode && (
        <div className="flex items-center justify-center gap-4 pt-0.5 pb-1.5 w-full">
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
            onPointerDown={(e) => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
            title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
          >
            <SkipBackIcon className="w-5 h-5" />
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

                    const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(firstPlace.id, secondPlace.id));
                    const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(firstPlace.id, secondPlace.id));
                    const segmentData = {
                      public: publicData?.public || [],
                      car: carData?.car || [],
                      walk: carData?.walk || []
                    };
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
              onPointerDown={(e) => e.stopPropagation()}
              className={`relative z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 flex-shrink-0 group overflow-hidden ${isPlaying
                ? 'bg-white border border-zinc-200 hover:border-transparent text-zinc-950 shadow-sm'
                : 'bg-zinc-950 border border-zinc-800 hover:border-transparent text-white shadow-md'
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
            <div className="w-11 h-11 rounded-full flex items-center justify-center bg-zinc-100 flex-shrink-0">
              <PlayTriangleIcon className="w-5 h-5 ml-0.5 text-zinc-300" />
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
            onPointerDown={(e) => e.stopPropagation()}
            className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none transition-colors"
            title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
          >
            <SkipForwardIcon className="w-5 h-5" />
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
              className={`absolute bottom-0 left-0 h-[14px] origin-bottom transition-all duration-500 ease-out ${isPlaying ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0'
                }`}
              style={{
                width: `${progressPercent}%`,
                contain: 'layout style paint'
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
    </HeaderComponent>
  );
}
