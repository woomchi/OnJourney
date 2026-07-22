"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check, Plus, Calendar, MapPin, Bus, Car, Footprints } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';

interface JourneyControlFloatingBarProps {
  activeJourney: Journey;
  setIsEditModalOpen: (isOpen: boolean) => void;
  handleDoneEdit: () => void;
}

export default function JourneyControlFloatingBar({
  activeJourney,
  setIsEditModalOpen,
  handleDoneEdit,
}: JourneyControlFloatingBarProps) {
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
    openSearchMode,
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

  const formattedDate = activeJourney.journey_date
    ? activeJourney.journey_date.replace(/-/g, '.')
    : '날짜 미지정';

  const transportTypeLabel = 
    activeJourney.transport_type === 'car' ? '차량' :
    activeJourney.transport_type === 'walk' ? '도보' : '대중교통';

  const handlePlayToggle = () => {
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
  };

  const handleAddPlaceClick = () => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setAlternativeSegment(null);
    setFocusBounds(null);
    openSearchMode();
  };

  return (
    <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-[101] md:hidden pointer-events-auto">
      {/* 2배 높이 2단 레이아웃 카드 */}
      <div className="w-full bg-white/95 text-zinc-900 backdrop-blur-xl border border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.14)] rounded-2xl p-3 flex flex-col gap-2 transition-all">
        {/* 상단 1단: 조작 컨트롤러 (목록/취소, 여정 제목, 추가/편집/재생) */}
        <div className="flex items-center justify-between gap-2 w-full">
          {/* 좌측: 목록 / 취소 버튼 */}
          <button
            type="button"
            onClick={() => {
              if (isEditMode) {
                setEditMode(false);
              } else {
                clearJourney();
              }
            }}
            className="flex items-center gap-0.5 text-zinc-600 hover:text-zinc-900 transition-colors text-[11px] font-semibold rounded-lg px-2 py-1 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200/60 shrink-0 cursor-pointer"
          >
            {isEditMode ? null : <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {isEditMode ? '취소' : '목록'}
          </button>

          {/* 중앙: 여정 제목 */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-1">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg hover:bg-zinc-100/90 active:bg-zinc-200/80 transition-all cursor-pointer group shrink border border-transparent hover:border-zinc-200/80"
              title="여정 정보 수정"
            >
              <Pencil className="w-3 h-3 text-zinc-400 group-hover:text-blue-600 transition-colors shrink-0" strokeWidth={2} />
              <h2 className="text-xs sm:text-sm font-bold tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
                {activeJourney.title}
              </h2>
            </button>
          </div>

          {/* 우측: 편집 / 플레이어 컨트롤 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isSyncing && (
              <div className="flex items-center" title="동기화 중">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              </div>
            )}

            {/* 편집 버튼 */}
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
              className={`flex items-center gap-0.5 text-[11px] font-bold transition-all px-2 py-1 rounded-lg border cursor-pointer ${
                isEditMode 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-zinc-100 text-zinc-700 hover:text-zinc-900 border-zinc-200/60 hover:bg-zinc-200'
              }`}
            >
              {isEditMode ? (
                <>
                  <Check className="w-3 h-3" strokeWidth={2.5} />
                  완료
                </>
              ) : (
                <>
                  <Pencil className="w-3 h-3" strokeWidth={2} />
                  편집
                </>
              )}
            </button>

            {/* 플레이어 재생/정지 버튼 */}
            {!isEditMode && (
              <div className="flex items-center gap-1 pl-1 border-l border-zinc-200">
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
                  className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
                  title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
                >
                  <SkipBackIcon className="w-5 h-5" />
                </button>

                {activeJourney.places.length >= 2 ? (
                  <button
                    type="button"
                    onClick={handlePlayToggle}
                    className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${
                      isPlaying ? 'bg-white text-zinc-950 shadow-sm border border-zinc-200' : 'bg-blue-600 text-white shadow-sm'
                    }`}
                    title={isPlaying ? "전체 여정 보기 해제" : "전체 여정 재생"}
                  >
                    {isPlaying ? (
                      <PauseBarsIcon className="w-5 h-5" />
                    ) : (
                      <PlayTriangleIcon className="w-5 h-5 ml-0.5" />
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
                  className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 disabled:opacity-30 disabled:pointer-events-none transition-colors shrink-0"
                  title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
                >
                  <SkipForwardIcon className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 하단 2단 영역: 여정 요약 메타 정보 (날짜, 장소 수 + 장소 추가 버튼, 이동수단) */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px] font-medium text-zinc-500 w-full">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1 text-zinc-600 shrink-0">
              <Calendar className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>{formattedDate}</span>
            </div>
            <span className="text-zinc-300 text-[10px]">·</span>
            <div className="flex items-center gap-1 text-zinc-700 font-semibold shrink-0">
              <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
              <span>장소 {activeJourney.places.length}곳</span>
            </div>

            {/* 장소 개수 UI 바로 오른쪽: 장소 추가 버튼 */}
            {!isEditMode && (
              <button
                type="button"
                onClick={handleAddPlaceClick}
                className="flex items-center gap-1 text-[10px] font-bold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-95 transition-all px-2 py-0.5 rounded-md shadow-xs shrink-0 cursor-pointer ml-1"
              >
                <Plus className="w-3 h-3 text-blue-400" strokeWidth={2.5} />
                <span>장소 추가</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-zinc-100/90 text-zinc-700 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 border border-zinc-200/60">
            {activeJourney.transport_type === 'car' ? (
              <Car className="w-3 h-3 text-blue-500 shrink-0" />
            ) : activeJourney.transport_type === 'walk' ? (
              <Footprints className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : (
              <Bus className="w-3 h-3 text-indigo-500 shrink-0" />
            )}
            <span>{transportTypeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
