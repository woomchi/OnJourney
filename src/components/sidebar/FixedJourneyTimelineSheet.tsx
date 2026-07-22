"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey, Place } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check, Plus, Calendar, MapPin, Bus, Car, Footprints, Clock, Coins } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';

interface FixedJourneyTimelineSheetProps {
  activeJourney: Journey;
  setIsEditModalOpen: (isOpen: boolean) => void;
  handleDoneEdit: () => void;
}

export default function FixedJourneyTimelineSheet({
  activeJourney,
  setIsEditModalOpen,
  handleDoneEdit,
}: FixedJourneyTimelineSheetProps) {
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

  const places = activeJourney?.places || [];
  const transportType = activeJourney.transport_type || 'public';

  const isPlaying = isGlobalPlaying && (!!focusedSegment || !!focusedStep);
  const activeIndex = journeys.findIndex(j => j.id === activeJourney.id);
  const prevJourney = activeIndex > 0 ? journeys[activeIndex - 1] : null;
  const nextJourney = activeIndex >= 0 && activeIndex < journeys.length - 1 ? journeys[activeIndex + 1] : null;

  const formattedDate = activeJourney.journey_date
    ? activeJourney.journey_date.replace(/-/g, '.').slice(2)
    : '미지정';

  const transportTypeLabel =
    activeJourney.transport_type === 'car' ? '차량' :
    activeJourney.transport_type === 'walk' ? '도보' : '대중교통';

  // 총 소요 시간, 총 이동 거리, 총 비용 계산
  let totalDistanceKm = 0;
  let totalDurationMin = 0;
  let totalFareSum = 0;
  let hasFare = false;

  if (places && places.length > 1) {
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      if (!origin || !dest) continue;

      let route: any = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
      if (!route) {
        const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
        const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));
        const segmentData = {
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

  const handlePlayToggle = () => {
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
  };

  const handleAddPlaceClick = () => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setAlternativeSegment(null);
    setFocusBounds(null);
    openSearchMode();
  };

  const handlePlaceClick = (place: Place) => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setAlternativeSegment(null);
    setFocusBounds({
      sw: { lat: place.lat - 0.003, lng: place.lng - 0.003 },
      ne: { lat: place.lat + 0.003, lng: place.lng + 0.003 },
    });
  };

  const handleSegmentClick = (origin: Place, dest: Place, route: any) => {
    setFocusedStep(null);
    setFocusedSegment({ originId: origin.id, destId: dest.id });
    setAlternativeSegment(null);
    if (route) {
      const bounds = calculateSegmentBounds(origin, dest, route);
      setFocusBounds(bounds);
    }
  };

  const renderSegmentBadge = (origin: Place, dest: Place) => {
    let route: any = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;

    if (!route) {
      const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
      const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));
      const segmentData = {
        public: publicData?.public || [],
        car: carData?.car || [],
        walk: carData?.walk || []
      };
      route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
    }

    const duration = route?.duration ? `${route.duration}분` : '';
    const type = route?.type || transportType;

    const distanceVal = route?.distance;
    const formattedDistance = distanceVal != null
      ? (distanceVal >= 1 ? `${distanceVal.toFixed(1)}km` : `${Math.round(distanceVal * 1000)}m`)
      : '';

    const fareVal = route?.fare || route?.taxiFare;
    const formattedFare = fareVal
      ? (route?.taxiFare && !route?.fare ? `택시 ${fareVal.toLocaleString()}원` : `${fareVal.toLocaleString()}원`)
      : '';

    let transferLabel = '';
    let stepBadges: string[] = [];
    if (type === 'public' && route?.steps) {
      const transitSteps = route.steps.filter((s: any) => s.type !== 'walk');
      const transitStepsCount = transitSteps.length;
      if (transitStepsCount <= 1) {
        transferLabel = '무환승';
      } else {
        transferLabel = `환승 ${transitStepsCount - 1}회`;
      }
      stepBadges = transitSteps
        .filter((s: any) => s.name)
        .map((s: any) => s.name.replace(/지하철\s*/, ''));
    } else if (type === 'car') {
      transferLabel = '차량';
    } else if (type === 'walk') {
      transferLabel = '도보';
    }

    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;

    return (
      <button
        type="button"
        onClick={() => handleSegmentClick(origin, dest, route)}
        className={`w-[136px] h-[54px] flex flex-col justify-between p-2 rounded-xl border text-[11px] transition-all shrink-0 cursor-pointer text-left ${
          isFocused
            ? 'bg-blue-600 text-white border-blue-500 shadow-md scale-[1.01]'
            : 'bg-zinc-100/90 hover:bg-zinc-200/90 text-zinc-700 border-zinc-200/70 hover:border-zinc-300'
        }`}
        title={`${origin.place_name} → ${dest.place_name} 구간 (${duration || '이동정보'})`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <div className="flex items-center gap-1 min-w-0 truncate">
            {type === 'car' ? (
              <Car className={`w-3.5 h-3.5 shrink-0 ${isFocused ? 'text-white' : 'text-blue-500'}`} />
            ) : type === 'walk' ? (
              <Footprints className={`w-3.5 h-3.5 shrink-0 ${isFocused ? 'text-white' : 'text-emerald-500'}`} />
            ) : (
              <Bus className={`w-3.5 h-3.5 shrink-0 ${isFocused ? 'text-white' : 'text-indigo-500'}`} />
            )}
            <span className="font-extrabold text-[11px] truncate">{duration || '이동'}</span>
          </div>
          {transferLabel && (
            <span className={`text-[8.5px] px-1 py-0.5 rounded-full font-bold shrink-0 ${
              isFocused ? 'bg-white/20 text-white' : 'bg-zinc-200/90 text-zinc-700'
            }`}>
              {transferLabel}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-1 w-full min-w-0">
          {stepBadges.length > 0 ? (
            <div className="flex items-center gap-0.5 overflow-hidden min-w-0">
              {stepBadges.slice(0, 1).map((badge, bIdx) => (
                <span
                  key={bIdx}
                  className={`text-[8.5px] px-1 py-0.5 rounded font-semibold truncate max-w-[60px] ${
                    isFocused ? 'bg-white/25 text-white' : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <div className={`text-[9.5px] font-medium truncate flex items-center gap-1 ml-auto ${
            isFocused ? 'text-blue-100' : 'text-zinc-500'
          }`}>
            {formattedDistance && <span>{formattedDistance}</span>}
            {formattedDistance && formattedFare && <span>·</span>}
            {formattedFare && <span>{formattedFare}</span>}
            {!formattedDistance && !formattedFare && <span className="opacity-75">상세 경로</span>}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] md:hidden pointer-events-auto bg-white/95 text-zinc-900 backdrop-blur-xl border-t border-zinc-200/90 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] rounded-t-2xl flex flex-col transition-all">
      {/* 플로팅 버튼 타겟 (바텀시트 상단 바로 위에 위치) */}
      <div
        id="mobile-map-buttons-target"
        className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] pointer-events-none *:pointer-events-auto"
      />

      {/* 1. 슬림 상단 컨트롤 헤더 (테두리 없는 깔끔한 바텀 시트 버튼 헤더) */}
      <div className="w-full px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        {/* 좌측: 목록/취소 버튼 (테두리 및 배경 제거) */}
        <button
          type="button"
          onClick={() => {
            if (isEditMode) {
              setEditMode(false);
            } else {
              clearJourney();
            }
          }}
          className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-[11px] font-semibold rounded-md px-1 py-0.5 shrink-0 cursor-pointer"
        >
          {isEditMode ? null : <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />}
          {isEditMode ? '취소' : '목록'}
        </button>

        {/* 중앙: 여정 제목 */}
        <div className="flex-1 flex items-center justify-center min-w-0 px-1">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center min-w-0 group cursor-pointer text-center truncate"
            title="여정 정보 수정"
          >
            <h2 className="text-xs font-extrabold tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
              {activeJourney.title}
            </h2>
            <Pencil className="w-2.5 h-2.5 text-blue-500 opacity-0 group-hover:opacity-100 transition-all ml-1 shrink-0" />
          </button>
        </div>

        {/* 우측: 동기화 & 편집 버튼 (테두리 및 배경 제거) */}
        <div className="flex items-center gap-1 shrink-0">
          {isSyncing && (
            <div className="flex items-center mr-0.5" title="동기화 중">
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
            className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors px-1 py-0.5 rounded-md cursor-pointer ${
              isEditMode ? 'text-blue-600' : 'text-zinc-500 hover:text-zinc-800'
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

      {/* 1-2. 헤더 아래 정보 서브바 (상세 패널 스타일 재생 플레이어 UI) */}
      <div className="w-full px-3.5 py-1.5 flex flex-col gap-1.5 shrink-0">
        {/* 서브바 1행: [날짜] | [상세 패널 스타일 재생 플레이어] | [대표 이동수단 태그] */}
        <div className="flex items-center justify-between gap-2 w-full text-[11px] font-medium">
          {/* 좌측: 날짜 */}
          <div className="flex items-center gap-1 text-zinc-500 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>{formattedDate}</span>
          </div>

          {/* 중앙: 상세 패널 스타일 재생 플레이어 UI */}
          {!isEditMode && places.length >= 2 ? (
            <div className="flex items-center gap-3">
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
                className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
              >
                <SkipBackIcon className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handlePlayToggle}
                className={`relative w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 group overflow-hidden cursor-pointer ${
                  isPlaying
                    ? 'bg-white border border-zinc-200 text-zinc-950 shadow-xs'
                    : 'bg-zinc-950 text-white shadow-xs'
                }`}
                title={isPlaying ? "전체 여정 보기 해제" : "전체 여정 재생"}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                {isPlaying ? (
                  <PauseBarsIcon className="w-2.5 h-2.5 relative z-10 group-hover:text-white transition-colors duration-300" />
                ) : (
                  <PlayTriangleIcon className="w-2.5 h-2.5 ml-0.5 relative z-10 group-hover:text-white transition-colors duration-300" />
                )}
              </button>

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
                className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
              >
                <SkipForwardIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}

          {/* 우측: 이동 수단 태그 */}
          <div className="flex items-center gap-1 bg-white text-zinc-700 px-2 py-0.5 rounded-md text-[10.5px] font-semibold border border-zinc-200/80 shadow-2xs shrink-0">
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

        {/* 서브바 2행: [장소 개수] ➔ [소요 시간] ➔ [비용] */}
        <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
          {/* 1. 장소 개수 */}
          <div className="flex items-center gap-1 text-blue-900 bg-blue-500/10 px-2 py-0.5 rounded-md font-bold">
            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>장소 {places.length}곳</span>
          </div>

          {/* 2. 소요 시간 */}
          {totalDurationMin > 0 && (
            <div className="flex items-center gap-1 text-amber-900 bg-amber-500/10 px-2 py-0.5 rounded-md font-bold">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{formatTotalDuration(totalDurationMin)}</span>
            </div>
          )}

          {/* 3. 비용 */}
          {hasFare && totalFareSum > 0 && (
            <div className="flex items-center gap-1 text-emerald-900 bg-emerald-500/10 px-2 py-0.5 rounded-md font-bold">
              <span className="font-black text-[11px] text-emerald-600 shrink-0 leading-none">₩</span>
              <span className="font-extrabold text-emerald-700">{totalFareSum.toLocaleString()}원</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. 중단 컴팩트 가로 연결형 타임라인 (~64px) */}
      <div className="w-full px-3 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
        {places.map((place, idx) => {
          const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
          const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
          const isRelatedToFocusedSegment = focusedSegment?.originId === place.id || focusedSegment?.destId === place.id;

          return (
            <div key={place.id} className="flex items-center gap-2 shrink-0">
              {/* 컴팩트 장소 노드 카드 (w-[136px] h-[54px]) */}
              <button
                type="button"
                onClick={() => handlePlaceClick(place)}
                className={`w-[136px] h-[54px] flex flex-col justify-between p-2 rounded-xl bg-zinc-900 text-white font-bold shadow-xs hover:bg-zinc-850 transition-all shrink-0 cursor-pointer text-left border ${
                  isRelatedToFocusedSegment
                    ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-blue-900/30'
                    : 'border-zinc-800'
                }`}
                title={`${place.place_name} (${place.address || ''})`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-[9.5px] text-zinc-400 font-medium truncate text-right flex-1 min-w-0 ml-1">
                    {categoryLabel || shortAddress || '장소'}
                  </span>
                </div>

                <div className="flex flex-col min-w-0 w-full">
                  <span className="truncate text-[11px] font-bold text-white tracking-tight leading-tight">{place.place_name}</span>
                </div>
              </button>

              {/* 구간 이동 칩 */}
              {idx < places.length - 1 && renderSegmentBadge(place, places[idx + 1])}
            </div>
          );
        })}
      </div>

      {/* 3. 최하단 장소 추가 버튼 (높이 1/3 확장: ~48px) */}
      <div className="w-full px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-1 shrink-0">
        <button
          type="button"
          onClick={handleAddPlaceClick}
          className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 active:scale-[0.99] text-white font-bold text-[13px] rounded-xl shadow-xs transition-all cursor-pointer flex justify-center items-center gap-2 border border-white/10"
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
          <span className="tracking-wide">장소 추가</span>
        </button>
      </div>
    </div>
  );
}
