"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { formatJourneyDate } from '@/lib/journeyUtils';
import { MAX_JOURNEY_PLACES } from '@/constants/journey';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check, Bus, Car, Footprints, Calendar, MapPin } from 'lucide-react';
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
    alternativeSegment,
    setAlternativeSegment,
    setActiveJourney,
    isEditMode,
    setEditMode,
    setDrawerSnapPoint,
    isCacheRestored,
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

  const places = activeJourney?.places || [];
  const directionsCache = useJourneyDirectionsCache(places);
  const transportType = activeJourney?.transport_type || 'public';

  const formattedDate = activeJourney?.journey_date
    ? activeJourney.journey_date.replace(/-/g, '.').slice(2)
    : '미지정';

  const transportTypeLabel =
    activeJourney?.transport_type === 'car' ? '차량' :
      activeJourney?.transport_type === 'walk' ? '도보' : '대중교통';

  let totalDistanceKm = 0;
  let totalDurationMin = 0;
  let totalFareSum = 0;
  let hasFare = false;
  let isAnySegmentLoading = false;

  if (places && places.length > 1) {
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      if (!origin || !dest) continue;

      let route: any = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
      if (!route) {
        const cacheKey = `${origin.id}-${dest.id}`;
        const cachedData = directionsCache[cacheKey];

        const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id));
        const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id));
        const publicData = cachedData ? { public: cachedData.public } : queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
        const carData = cachedData ? { car: cachedData.car, walk: cachedData.walk } : queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));

        const hasData = (cachedData && (cachedData.public.length > 0 || cachedData.car.length > 0 || cachedData.walk.length > 0)) || !!publicData || !!carData;

        const isSegLoading = !isCacheRestored || (
          !hasData &&
          (!publicQueryState || publicQueryState.status === 'pending' ||
           !carQueryState || carQueryState.status === 'pending')
        );

        if (isSegLoading) {
          isAnySegmentLoading = true;
        }

        const segmentData = cachedData || {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || []
        };

        route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk');
      }

      if (route) {
        if (typeof route.distance === 'number') totalDistanceKm += route.distance;
        if (typeof route.duration === 'number') totalDurationMin += route.duration;
        const fareVal = route.fare || route.taxiFare;
        if (fareVal) {
          totalFareSum += fareVal;
          hasFare = true;
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
        {/* 왼쪽: 뒤로가기 / 취소 / 목록 */}
        {!isSearchMode && (
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else if (focusedSegment || alternativeSegment) {
                setFocusedSegment(null);
                setAlternativeSegment(null);
                setFocusedStep(null);
                setFocusBounds(null);
              } else {
                clearJourney();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-[11px] font-semibold rounded-md px-1.5 py-0.5 cursor-pointer"
            title={isEditMode ? "편집 취소" : (focusedSegment || alternativeSegment) ? "이동 상세 닫기" : "여정 목록으로 돌아가기"}
            aria-label={isEditMode ? "편집 취소" : (focusedSegment || alternativeSegment) ? "이동 상세 닫기" : "여정 목록으로 돌아가기"}
          >
            {isEditMode ? (
              '취소'
            ) : (focusedSegment || alternativeSegment) ? (
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            ) : (
              <>
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span>목록</span>
              </>
            )}
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
      className={`flex flex-col border-b border-zinc-100/80 flex-shrink-0 relative overflow-hidden ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-xl'}`}
    >
      {/* 1. 슬림 상단 컨트롤 헤더 (여정 제목 + 날짜 & 이동 수단 설정 정보) */}
      {!isSearchMode && (
        <div className="w-full px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0 select-none">
          {/* 좌측: 목록 / 취소 / 뒤로가기 버튼 */}
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else if (focusedSegment || alternativeSegment) {
                setFocusedSegment(null);
                setAlternativeSegment(null);
                setFocusedStep(null);
                setFocusBounds(null);
              } else {
                clearJourney();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-xs font-semibold rounded-md px-1 py-0.5 shrink-0 cursor-pointer"
            title={isEditMode ? "편집 취소" : (focusedSegment || alternativeSegment) ? "이동 상세 닫기" : "여정 목록으로 돌아가기"}
            aria-label={isEditMode ? "편집 취소" : (focusedSegment || alternativeSegment) ? "이동 상세 닫기" : "여정 목록으로 돌아가기"}
          >
            {isEditMode ? (
              '취소'
            ) : (focusedSegment || alternativeSegment) ? (
              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
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
              onClick={() => setIsEditModalOpen(true)}
              onPointerDown={(e) => e.stopPropagation()}
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
              <div className="flex items-center mr-0.5" title="클라우드 동기화 중">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
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
              className={`flex items-center gap-0.5 text-xs font-semibold transition-colors px-1 py-0.5 rounded-md cursor-pointer ${isEditMode ? 'text-blue-600 font-bold' : 'text-zinc-500 hover:text-zinc-800'
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
      )}

      {/* 2. 가로 연결형 타임라인 바로 위에 붙은 재생 플레이어 & 요약 정보 헤더 바 */}
      <div className="w-full px-4 pt-1.5 pb-2 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none">
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
              className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
              title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
            >
              <SkipBackIcon className="w-5 h-5" />
            </button>

            {places.length >= 2 ? (
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
                    if (!focusedSegment && !focusedStep && places.length >= 2) {
                      const firstPlace = places[0];
                      const secondPlace = places[1];

                      const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(firstPlace.id, secondPlace.id));
                      const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(firstPlace.id, secondPlace.id));
                      const segmentData = {
                        public: publicData?.public || [],
                        car: carData?.car || [],
                        walk: carData?.walk || []
                      };
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
                className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 group overflow-hidden cursor-pointer shadow-sm ${isPlaying
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
              className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
              title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
            >
              <SkipForwardIcon className="w-5 h-5" />
            </button>
          </div>
        ) : null}

        {/* 우측 끝: 목적지 N개 */}
        <div className="flex-1 flex items-center justify-end gap-1 text-xs font-bold text-zinc-900 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="shrink-0 text-zinc-900 font-bold">장소 {places.length}/{MAX_JOURNEY_PLACES}</span>
        </div>
      </div>

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
