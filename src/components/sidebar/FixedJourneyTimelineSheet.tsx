"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey, Place } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check, Plus, Calendar, MapPin, Bus, Car, Footprints, Clock, Coins } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon } from '@/components/ui/icons';
import { getSequenceTheme, getSegmentTheme } from '@/constants/colors';
import { motion, useDragControls, useMotionValue, animate } from 'framer-motion';

interface FixedJourneyTimelineSheetProps {
  activeJourney: Journey;
  setIsEditModalOpen: (isOpen: boolean) => void;
}

export default function FixedJourneyTimelineSheet({
  activeJourney,
  setIsEditModalOpen,
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
    alternativeSegment,
    setAlternativeSegment,
    setActiveJourney,
    isEditMode,
    setEditMode,
    setDrawerSnapPoint,
    openSearchMode,
  } = useJourneyStore();

  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const addPlaceRef = useRef<HTMLDivElement>(null);
  
  const [fullHeight, setFullHeight] = useState(0);
  const [addButtonHeight, setAddButtonHeight] = useState(86);
  const [activeSnap, setActiveSnap] = useState<'full' | 'reduced'>('full');

  useEffect(() => {
    setActiveSnap('full');
  }, [activeJourney?.id]);

  useEffect(() => {
    const container = containerRef.current;
    const addPlace = addPlaceRef.current;
    if (!container || !addPlace) return;

    const observer = new ResizeObserver(() => {
      setFullHeight(container.offsetHeight);
      setAddButtonHeight(addPlace.offsetHeight);
    });

    observer.observe(container);
    observer.observe(addPlace);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const isHidden = !!(focusedSegment || alternativeSegment);
    const targetY = isHidden
      ? (fullHeight > 0 ? fullHeight + 50 : 500)
      : (activeSnap === 'full' ? 0 : addButtonHeight);

    const controls = animate(y, targetY, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
    return () => controls.stop();
  }, [activeSnap, addButtonHeight, y, focusedSegment, alternativeSegment, fullHeight]);

  useEffect(() => {
    if (fullHeight > 0) {
      const currentHeight = activeSnap === 'full' ? fullHeight : (fullHeight - addButtonHeight);
      setDrawerSnapPoint(currentHeight);
    }
  }, [activeSnap, fullHeight, addButtonHeight, setDrawerSnapPoint]);

  const handleDragEnd = (event: any, info: any) => {
    const currentY = y.get();
    const velocityY = info.velocity.y;
    const VELOCITY_THRESHOLD = 200;
    const DRAG_THRESHOLD = addButtonHeight / 2;

    let nextSnap: 'full' | 'reduced' = 'full';

    if (velocityY > VELOCITY_THRESHOLD) {
      nextSnap = 'reduced';
    } else if (velocityY < -VELOCITY_THRESHOLD) {
      nextSnap = 'full';
    } else {
      if (currentY > DRAG_THRESHOLD) {
        nextSnap = 'reduced';
      } else {
        nextSnap = 'full';
      }
    }
    setActiveSnap(nextSnap);
  };

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const scrollToElement = (key: string) => {
    requestAnimationFrame(() => {
      const container = timelineContainerRef.current;
      const targetEl = cardRefs.current.get(key);
      if (container && targetEl) {
        const containerLeft = container.getBoundingClientRect().left;
        const targetLeft = targetEl.getBoundingClientRect().left;
        const relativeLeft = targetLeft - containerLeft;
        const newScrollLeft = container.scrollLeft + relativeLeft - 16;
        container.scrollTo({
          left: Math.max(0, newScrollLeft),
          behavior: 'smooth',
        });
      }
    });
  };

  useEffect(() => {
    if (!focusedSegment && !focusedStep) {
      setIsGlobalPlaying(false);
    }
  }, [focusedSegment, focusedStep]);

  useEffect(() => {
    if (focusedSegment) {
      const key = `segment-${focusedSegment.originId}-${focusedSegment.destId}`;
      scrollToElement(key);
    }
  }, [focusedSegment]);

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
    scrollToElement(`place-${place.id}`);
  };

  const handleSegmentClick = (origin: Place, dest: Place, route: any) => {
    setFocusedStep(null);
    setFocusedSegment({ originId: origin.id, destId: dest.id });
    setAlternativeSegment(null);
    if (route) {
      const bounds = calculateSegmentBounds(origin, dest, route);
      setFocusBounds(bounds);
    }
    scrollToElement(`segment-${origin.id}-${dest.id}`);
  };

  const renderSegmentBadge = (origin: Place, dest: Place, sIdx: number) => {
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
      const transferCount = Math.max(0, transitStepsCount - 1);
      transferLabel = `환승 ${transferCount}회`;
      stepBadges = transitSteps
        .filter((s: any) => s.name)
        .map((s: any) => s.name.replace(/지하철\s*/, ''));
    } else if (type === 'car') {
      transferLabel = '차량';
    } else if (type === 'walk') {
      transferLabel = '도보';
    }

    const theme = getSegmentTheme(sIdx);
    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;

    return (
      <button
        ref={(el) => {
          const key = `segment-${origin.id}-${dest.id}`;
          if (el) cardRefs.current.set(key, el);
          else cardRefs.current.delete(key);
        }}
        type="button"
        onClick={() => handleSegmentClick(origin, dest, route)}
        className={`w-[156px] h-[62px] flex flex-col justify-between p-2.5 rounded-xl text-xs transition-all shrink-0 cursor-pointer text-left relative overflow-hidden ${
          isFocused ? theme.cardFocused : theme.cardUnfocused
        }`}
        title={`${origin.place_name} → ${dest.place_name} 구간 (${duration || '이동정보'})`}
      >
        <div className="flex items-center justify-between gap-1 w-full">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <div
              className="w-4.5 h-4.5 rounded-full text-white flex items-center justify-center shrink-0 shadow-xs"
              style={{
                background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
              }}
            >
              {type === 'car' ? (
                <Car className="w-3 h-3" />
              ) : type === 'walk' ? (
                <Footprints className="w-3 h-3" />
              ) : (
                <Bus className="w-3 h-3" />
              )}
            </div>
            <span className="font-extrabold text-[12.5px] truncate">{duration || '이동'}</span>
          </div>
          {transferLabel && (
            <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${theme.badgeUnfocused}`}>
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
                  className={`text-[9.5px] px-1.5 py-0.5 rounded font-semibold truncate max-w-[70px] ${theme.badgeUnfocused}`}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <div className={`text-[10.5px] font-medium truncate flex items-center gap-1 ml-auto ${theme.subtextUnfocused}`}>
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
    <motion.div
      ref={containerRef}
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragElastic={{ top: 0.05, bottom: 0.05 }}
      dragConstraints={{
        top: 0,
        bottom: addButtonHeight
      }}
      onDragEnd={handleDragEnd}
      style={{
        y,
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        pointerEvents: (focusedSegment || alternativeSegment) ? 'none' : 'auto',
      }}
      className="md:hidden pointer-events-auto bg-white/95 text-zinc-900 backdrop-blur-xl border-t border-zinc-200/90 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] flex flex-col"
    >
      {/* 플로팅 버튼 타겟 (바텀시트 상단 바로 위에 위치) */}
      <div
        id="mobile-map-buttons-target"
        className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] pointer-events-none *:pointer-events-auto"
      />

      {/* 드래그 핸들바 영역 */}
      <div
        onPointerDown={(e) => dragControls.start(e)}
        className="w-full flex justify-center pt-2.5 pb-1 bg-transparent cursor-grab active:cursor-grabbing touch-none shrink-0 select-none rounded-t-[24px]"
      >
        <div className="w-12 h-1 bg-zinc-300 rounded-full pointer-events-none" />
      </div>

      {/* 1. 슬림 상단 컨트롤 헤더 (여정 제목 + 날짜 & 이동 수단 설정 정보) */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          dragControls.start(e);
        }}
        className="w-full px-4 pt-1 pb-1 flex items-center justify-between gap-2 shrink-0 select-none touch-none"
      >
        {/* 좌측: 목록/취소 버튼 */}
        <button
          type="button"
          onClick={() => {
            if (isEditMode) {
              setEditMode(false);
            } else {
              clearJourney();
            }
          }}
          className="flex items-center gap-0.5 text-zinc-500 hover:text-zinc-800 transition-colors text-xs font-semibold rounded-md px-1 py-0.5 shrink-0 cursor-pointer"
        >
          {isEditMode ? null : <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2.5} />}
          {isEditMode ? '취소' : '목록'}
        </button>

        {/* 중앙: 여정 정보 수정 영역 (제목, 날짜, 이동수단 설정 정보 전체 포함 버튼) */}
        <div className="flex-1 flex justify-center min-w-0 px-1">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="inline-flex flex-col items-center max-w-full px-2.5 py-1 rounded-xl hover:bg-zinc-100/90 active:bg-zinc-200/80 transition-all cursor-pointer group shrink border border-transparent hover:border-zinc-200/80"
            title="여정 정보 수정"
          >
            {/* 1행: [Pencil 아이콘] 여정 제목 */}
            <div className="flex items-center gap-1.5 max-w-full">
              <Pencil className="w-3 h-3 text-zinc-400 group-hover:text-blue-600 transition-colors shrink-0" strokeWidth={2} />
              <h2 className="text-sm font-extrabold tracking-tight text-zinc-900 group-hover:text-blue-600 transition-colors truncate">
                {activeJourney.title}
              </h2>
            </div>

            {/* 2행: 여정 제목 밑: 날짜 & 대표 이동수단 설정 정보 */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 group-hover:text-zinc-700 mt-0.5 truncate max-w-full transition-colors">
              <div className="flex items-center gap-1 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 shrink-0 transition-colors" />
                <span>{formattedDate}</span>
              </div>
              <span className="text-zinc-300 font-light select-none">·</span>
              <div className="flex items-center gap-1 shrink-0">
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
            onClick={() => {
              setEditMode(!isEditMode);
              if (!isEditMode) setDrawerSnapPoint(1);
            }}
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

      {/* 2. 가로 연결형 타임라인 바로 위에 붙은 재생 플레이어 & 요약 정보 헤더 바 */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          dragControls.start(e);
        }}
        className="w-full px-4 pt-1.5 pb-1 flex items-center justify-between gap-2 shrink-0 border-t border-zinc-100/60 select-none touch-none"
      >
        {/* 좌측: 소요 시간 & 비용 (목록 폰트 크기 text-xs/text-sm로 확대) */}
        <div className="flex-1 flex flex-col items-start justify-center min-w-0 leading-tight">
          <span className="font-extrabold text-sm text-zinc-900 truncate">
            {totalDurationMin > 0 ? formatTotalDuration(totalDurationMin) : '0분'}
          </span>
          <span className="font-semibold text-xs text-zinc-600 truncate mt-0.5">
            {(totalFareSum || 0).toLocaleString()}원
          </span>
        </div>

        {/* 중앙: 재생 플레이어 UI (정확히 중앙 정렬, 복원된 w-11 h-11 크기) */}
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
              className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
              title={prevJourney ? `이전 여정: ${prevJourney.title}` : "이전 여정 없음"}
            >
              <SkipBackIcon className="w-5 h-5" />
            </button>

            {places.length >= 2 ? (
              <button
                type="button"
                onClick={handlePlayToggle}
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
              className="w-8 h-8 flex items-center justify-center text-zinc-700 hover:text-zinc-950 active:scale-90 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
              title={nextJourney ? `다음 여정: ${nextJourney.title}` : "다음 여정 없음"}
            >
              <SkipForwardIcon className="w-5 h-5" />
            </button>
          </div>
        ) : null}

        {/* 우측 끝: 목적지 N개 (flex-1 영역으로 우측 정렬) */}
        <div className="flex-1 flex items-center justify-end gap-1 text-xs font-semibold text-zinc-600 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="shrink-0">장소 {places.length}곳</span>
        </div>
      </div>

      {/* 2. 중단 컴팩트 가로 연결형 타임라인 */}
      <div ref={timelineContainerRef} className="w-full px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
        {places.map((place, idx) => {
          const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
          const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
          const placeTheme = getSequenceTheme(idx, places.length);

          return (
            <div key={place.id} className="flex items-center gap-2 shrink-0">
              {/* 컴팩트 장소 노드 카드 (w-[156px] h-[62px]) - 흰색 배경 & 지도 핀 테마 매칭 */}
              <button
                ref={(el) => {
                  const key = `place-${place.id}`;
                  if (el) cardRefs.current.set(key, el);
                  else cardRefs.current.delete(key);
                }}
                type="button"
                onClick={() => handlePlaceClick(place)}
                className="w-[156px] h-[62px] flex flex-col justify-between p-2.5 rounded-xl bg-white text-zinc-900 font-bold shadow-xs hover:bg-zinc-50 transition-all shrink-0 cursor-pointer text-left border border-zinc-200/90 hover:border-zinc-300"
                title={`${place.place_name} (${place.address || ''})`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className="w-4.5 h-4.5 rounded-full text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: placeTheme.color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[10.5px] text-zinc-500 font-medium truncate text-right flex-1 min-w-0 ml-1">
                    {categoryLabel || shortAddress || '장소'}
                  </span>
                </div>

                <div className="flex flex-col min-w-0 w-full">
                  <span className="truncate text-[12.5px] font-bold text-zinc-900 tracking-tight leading-tight">{place.place_name}</span>
                </div>
              </button>

              {/* 구간 이동 칩 (Polyline 패턴 연동) */}
              {idx < places.length - 1 && renderSegmentBadge(place, places[idx + 1], idx)}
            </div>
          );
        })}
      </div>

      {/* 3. 최하단 장소 추가 버튼 */}
      <div
        ref={addPlaceRef}
        className="w-full px-4 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shrink-0"
      >
        <button
          type="button"
          onClick={handleAddPlaceClick}
          className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-900 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex justify-center items-center gap-2 border border-white/10"
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
          <span className="tracking-wide">장소 추가</span>
        </button>
      </div>

      {/* 바텀 시트 위쪽 탄성 동작 시 하단의 빈 공간이 노출되는 현상을 방지하는 절대 위치 가림막 (Skirt) */}
      <div
        style={{
          position: 'absolute',
          top: '99%',
          left: 0,
          right: 0,
          height: '200px',
          backgroundColor: 'inherit',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}
