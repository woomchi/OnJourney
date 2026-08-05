"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds, calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { Journey, Place } from '@/types/journey';
import { Loader2, ChevronLeft, Pencil, Check, Plus, Calendar, MapPin, Bus, Car, Footprints, Train, Clock, Coins } from 'lucide-react';
import { SkipBackIcon, SkipForwardIcon, PlayTriangleIcon, PauseBarsIcon, AlternativeRouteIcon } from '@/components/ui/icons';
import { getSequenceTheme, getSegmentTheme } from '@/constants/colors';
import { motion, useDragControls, useMotionValue, animate } from 'framer-motion';

import { usePWA } from '@/components/PWAProvider';

interface FixedJourneyTimelineSheetProps {
  activeJourney: Journey;
  setIsEditModalOpen: (isOpen: boolean) => void;
}

export default function FixedJourneyTimelineSheet({
  activeJourney,
  setIsEditModalOpen,
}: FixedJourneyTimelineSheetProps) {
  const { isInstalled } = usePWA();
  const queryClient = useQueryClient();
  const {
    journeys,
    clearJourney,
    focusedStep,
    setFocusedStep,
    focusedSegment,
    setFocusedSegment,
    focusedPlaceId,
    setFocusedPlaceId,
    setFocusBounds,
    isSyncing,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
    setActiveJourney,
    isEditMode,
    setEditMode,
    setDrawerSnapPoint,
    openSearchMode,
    isCacheRestored,
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
      : 0;

    const controls = animate(y, targetY, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
    return () => controls.stop();
  }, [addButtonHeight, y, focusedSegment, alternativeSegment, fullHeight]);

  useEffect(() => {
    if (fullHeight > 0) {
      setDrawerSnapPoint(fullHeight);
    }
  }, [fullHeight, setDrawerSnapPoint]);

  const handleDragEnd = (event: any, info: any) => {
    return;
  };

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const scrollToElement = (key: string) => {
    requestAnimationFrame(() => {
      const container = timelineContainerRef.current;
      const targetEl = cardRefs.current.get(key);
      if (container && targetEl) {
        const itemWrapper = (targetEl.closest('.shrink-0') as HTMLElement) || targetEl;
        const containerLeft = container.getBoundingClientRect().left;
        const itemLeft = itemWrapper.getBoundingClientRect().left;
        const relativeLeft = itemLeft - containerLeft;
        const newScrollLeft = container.scrollLeft + relativeLeft - 20;
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
  let isAnySegmentLoading = false;

  if (places && places.length > 1) {
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      if (!origin || !dest) continue;

      let route: any = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
      if (!route) {
        const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id));
        const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id));
        const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
        const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));

        const isSegLoading = !isCacheRestored || (
          (!publicData && !carData) &&
          (!publicQueryState || publicQueryState.status === 'pending' ||
           !carQueryState || carQueryState.status === 'pending')
        );

        if (isSegLoading) {
          isAnySegmentLoading = true;
        }

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
      setFocusedPlaceId(null);
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
          setFocusedPlaceId(null);
          const bounds = calculateSegmentBounds(firstPlace, secondPlace, activeRoute);
          setFocusBounds(bounds);
        }
      }
    }
  };

  const handleAddPlaceClick = () => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setFocusedPlaceId(null);
    setAlternativeSegment(null);
    setFocusBounds(null);
    openSearchMode();
  };

  const handlePlaceClick = (place: Place) => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setAlternativeSegment(null);

    if (focusedPlaceId === place.id) {
      setFocusedPlaceId(null);
      setFocusBounds(null);
    } else {
      setFocusedPlaceId(place.id);
      setFocusBounds({
        sw: { lat: place.lat - 0.003, lng: place.lng - 0.003 },
        ne: { lat: place.lat + 0.003, lng: place.lng + 0.003 },
      });
      scrollToElement(`place-${place.id}`);
    }
  };

  const handleSegmentClick = (origin: Place, dest: Place, route: any) => {
    setFocusedStep(null);
    setFocusedSegment({ originId: origin.id, destId: dest.id });
    setFocusedPlaceId(null);
    setAlternativeSegment(null);
    if (route) {
      const bounds = calculateSegmentBounds(origin, dest, route);
      setFocusBounds(bounds);
    }
    scrollToElement(`segment-${origin.id}-${dest.id}`);
  };

  const getSegmentInfo = (origin?: Place, dest?: Place) => {
    if (!origin || !dest) return { type: transportType, isFocused: false };
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
    const type = route?.type || transportType;
    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;
    return { type, isFocused };
  };

  const renderSegmentBadge = (origin: Place, dest: Place, sIdx: number) => {
    let route: any = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
    let isSegLoading = false;

    if (!route) {
      const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id));
      const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id));
      const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id));
      const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id));

      isSegLoading = !isCacheRestored || (
        (!publicData && !carData) &&
        (!publicQueryState || publicQueryState.status === 'pending' ||
         !carQueryState || carQueryState.status === 'pending')
      );

      const segmentData = {
        public: publicData?.public || [],
        car: carData?.car || [],
        walk: carData?.walk || []
      };
      route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
    }

    if (isSegLoading) {
      return (
        <div
          key={`segment-wrap-${origin.id}-${dest.id}`}
          className="relative flex flex-col justify-between w-[140px] shrink-0 h-[100px] px-1 select-none"
        >
          <div className="h-[32px] w-full shrink-0" />
          <div className="relative w-full flex items-center justify-center h-[26px] shrink-0">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center">
              <div className="relative z-10 px-2.5 py-2 rounded-xl flex items-center justify-between gap-1.5 bg-white text-zinc-800 border border-zinc-200 shadow-2xs w-[130px] h-[86px] animate-pulse">
                <div className="flex flex-col items-start justify-center min-w-0 flex-1 gap-1.5">
                  <div className="flex items-center gap-1.5 w-full">
                    <div className="w-4 h-4 rounded-full bg-zinc-200 shrink-0" />
                    <div className="h-3.5 bg-zinc-200 rounded-md w-14" />
                  </div>
                  <div className="h-3 bg-zinc-150 rounded-md w-10" />
                  <div className="h-3 bg-zinc-150 rounded-md w-12" />
                </div>
                <div className="w-7.5 h-7.5 rounded-lg bg-zinc-100 border border-zinc-150 shrink-0" />
              </div>
            </div>
          </div>
          <div className="h-[36px] w-full shrink-0" />
        </div>
      );
    }

    const duration = route?.duration ? `${route.duration}분` : '';
    const type = route?.type || transportType;

    const getDistanceKm = (): number | null => {
      if (route?.distance != null && route.distance > 0) {
        return route.distance > 100 ? route.distance / 1000 : route.distance;
      }
      if (route?.pathPoints && route.pathPoints.length > 1) {
        let totalMeters = 0;
        for (let i = 0; i < route.pathPoints.length - 1; i++) {
          totalMeters += calculateHaversineDistance(
            route.pathPoints[i].lat,
            route.pathPoints[i].lng,
            route.pathPoints[i + 1].lat,
            route.pathPoints[i + 1].lng
          );
        }
        if (totalMeters > 0) return totalMeters / 1000;
      }
      if (origin && dest) {
        const meters = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
        if (meters > 0) return meters / 1000;
      }
      return null;
    };

    const distKm = getDistanceKm();
    const formattedDistance = distKm != null
      ? (distKm >= 1 ? `${distKm.toFixed(1)}km` : `${Math.round(distKm * 1000)}m`)
      : '';

    const fareVal = route?.fare || route?.taxiFare;

    const theme = getSegmentTheme(sIdx);
    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;

    return (
      <div
        key={`segment-wrap-${origin.id}-${dest.id}`}
        className="relative flex flex-col justify-between w-[140px] shrink-0 h-[100px] px-1 select-none"
      >
        {/* 1. 상단 스페이서 (32px) */}
        <div className="h-[32px] w-full shrink-0" />

        {/* 2. 중앙 요약 카드 영역 (26px) */}
        <div className="relative w-full flex items-center justify-center h-[26px] shrink-0">
          {/* 요약 카드 컨테이너 (부모 h-[26px]에 맞춰 수평 정렬, 내부 요약 카드는 overflow 노출) */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center">
            <div
              ref={(el) => {
                const key = `segment-${origin.id}-${dest.id}`;
                if (el) cardRefs.current.set(key, el as any);
                else cardRefs.current.delete(key);
              }}
              onClick={() => handleSegmentClick(origin, dest, route)}
              className={`relative z-10 px-2 py-1.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer shadow-xs border w-[130px] h-[86px] ${
                isFocused
                  ? 'bg-zinc-950 text-white border-zinc-950 shadow-md scale-105'
                  : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-350 hover:bg-zinc-50'
              }`}
              title={`${origin.place_name} → ${dest.place_name} 이동정보`}
            >
              {/* 좌측 정보 영역 (수직으로 쌓음) */}
              <div className="flex flex-col items-start justify-center min-w-0 flex-1 leading-tight gap-1">
                {/* 1행: 수단 아이콘 + 소요 시간 */}
                <div className="flex items-center gap-1 font-extrabold text-[14px] w-full leading-none">
                  <span 
                    style={{ color: isFocused ? '#FFFFFF' : theme.hex }}
                    className="shrink-0"
                  >
                    {(() => {
                      if (type === 'car') return <Car className="w-3.5 h-3.5" />;
                      if (type === 'walk') return <Footprints className="w-3.5 h-3.5" />;

                      const steps = route?.steps || [];
                      const hasSubway = steps.some((s: any) => s.type === 'subway' || s.type === 'train');
                      const hasBus = steps.some((s: any) => s.type === 'bus' || s.type === 'expressbus');

                      if (hasSubway && hasBus) {
                        return (
                          <div className="flex items-center gap-0.5">
                            <Bus className="w-3 h-3" />
                            <Train className="w-3 h-3" />
                          </div>
                        );
                      }
                      if (hasSubway) return <Train className="w-3.5 h-3.5" />;
                      if (hasBus) return <Bus className="w-3.5 h-3.5" />;
                      return <Bus className="w-3.5 h-3.5" />;
                    })()}
                  </span>
                  <span className="truncate">{duration || '이동'}</span>
                </div>
                
                {/* 2행: 이동 거리 */}
                <span className={`text-[12px] font-bold leading-none truncate max-w-full ${isFocused ? 'text-white/80' : 'text-zinc-600'}`}>
                  {formattedDistance || '거리 미정'}
                </span>

                {/* 3행: 환승 횟수 */}
                <span className={`text-[11.5px] font-medium leading-none truncate max-w-full ${isFocused ? 'text-white/65' : 'text-zinc-500'}`}>
                  {type === 'public' ? (
                    route?.steps ? `환승 ${Math.max(0, route.steps.filter((s: any) => s.type !== 'walk').length - 1)}회` : '대중교통'
                  ) : type === 'car' ? (
                    '차량'
                  ) : (
                    '도보'
                  )}
                </span>

                {/* 4행: 요금 정보 */}
                <span className={`text-[11px] font-medium leading-none truncate max-w-full ${isFocused ? 'text-white/55' : 'text-zinc-400'}`}>
                  {type === 'car' ? (
                    route?.taxiFare ? `택시 ${Math.round(route.taxiFare / 1000)}k` : '비용 미정'
                  ) : type === 'walk' ? (
                    '무료'
                  ) : fareVal ? (
                    `${fareVal.toLocaleString()}원`
                  ) : (
                    '요금 미정'
                  )}
                </span>
              </div>

              {/* 우측 대안 수단 버튼 (크기 확대) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isCurrentlyOpen = alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id;
                  
                  if (!isCurrentlyOpen) {
                    const wasFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;
                    setIsAlternativeFromFocus(wasFocused);
                    setAlternativeSegment({ originId: origin.id, destId: dest.id });
                    setFocusedSegment(null);
                    setFocusedStep(null);
                    if (route) {
                      const bounds = calculateSegmentBounds(origin, dest, route);
                      setFocusBounds(bounds);
                    }
                  } else {
                    setAlternativeSegment(null);
                    if (isAlternativeFromFocus) {
                      setFocusedSegment({ originId: origin.id, destId: dest.id });
                      if (route) {
                        const bounds = calculateSegmentBounds(origin, dest, route);
                        setFocusBounds(bounds);
                      }
                    } else {
                      setFocusBounds(null);
                    }
                  }
                }}
                className={`
                  flex items-center justify-center w-7.5 h-7.5 rounded-lg border transition-all duration-300 shadow-2xs cursor-pointer shrink-0
                  ${alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : isFocused
                      ? 'bg-white/15 border-white/20 text-white hover:bg-white/30'
                      : 'bg-zinc-50 border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600'
                  }
                `}
                title="대안 경로 탐색"
              >
                <AlternativeRouteIcon 
                  isActive={alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id}
                  className="w-4 h-4"
                />
              </button>
            </div>
          </div>
        </div>

        {/* 3. 하단 스페이서 (36px) */}
        <div className="h-[36px] w-full shrink-0" />
      </div>
    );
  };

  return (
    <motion.div
      ref={containerRef}
      drag={false}
      dragControls={dragControls}
      dragListener={false}
      dragElastic={0}
      dragConstraints={{
        top: 0,
        bottom: addButtonHeight
      }}
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

      {/* 1. 슬림 상단 컨트롤 헤더 (여정 제목 + 날짜 & 이동 수단 설정 정보) */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
        }}
        className="w-full px-4 pt-3 pb-1 flex items-center justify-between gap-2 shrink-0 select-none touch-none"
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
        }}
        className="w-full px-4 pt-1.5 pb-1 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none touch-none"
      >
        {/* 좌측: 소요 시간 & 비용 (목록 폰트 크기 text-xs/text-sm로 확대) */}
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

      {/* 2. 중단 컴팩트 노선 타임라인 바 */}
      <div
        ref={timelineContainerRef}
        className="w-full px-5 py-2 flex items-center overflow-x-auto scrollbar-none shrink-0"
      >
        {places.map((place, idx) => {
          const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
          const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
          const placeTheme = getSequenceTheme(idx, places.length);

          return (
            <div key={place.id} className="flex items-center shrink-0">
              {/* 장소 노드 항목 (수직 정렬: 상단 스페이서, 중앙 핀 노드, 하단 장소명 & 태그) */}
              <div className="flex flex-col items-center justify-between w-[96px] shrink-0 h-[100px] relative">
                {/* 상단 핀 위 영역 (상단 트랙 칩 수평 맞춤용) */}
                <div className="h-[32px] w-full" />

                {/* 중앙: 원형 핀 노드 (컬러스킴 적용) */}
                <div className="relative w-full flex items-center justify-center h-[26px]">
                  {/* 이전 구간 연결 엣지 선 (노드 핀 좌측, 8px 여백 적용) */}
                  {idx > 0 && (() => {
                    const prevInfo = getSegmentInfo(places[idx - 1], place);
                    return (
                      <svg className="absolute left-0 w-1/2 top-1/2 -translate-y-1/2 h-[4px] pointer-events-none z-0">
                        <line
                          x1="3px"
                          y1="50%"
                          x2="calc(100% - 22px)"
                          y2="50%"
                          stroke={prevInfo.isFocused ? '#09090b' : '#e4e4e7'}
                          strokeWidth="2.5"
                          strokeDasharray={prevInfo.type === 'walk' ? '4 7' : undefined}
                          strokeLinecap="round"
                        />
                      </svg>
                    );
                  })()}

                  {/* 다음 구간 연결 엣지 선 (노드 핀 우측, 8px 여백 적용) */}
                  {idx < places.length - 1 && (() => {
                    const nextInfo = getSegmentInfo(place, places[idx + 1]);
                    return (
                      <svg className="absolute right-0 w-1/2 top-1/2 -translate-y-1/2 h-[4px] pointer-events-none z-0">
                        <line
                          x1="22px"
                          y1="50%"
                          x2="calc(100% - 3px)"
                          y2="50%"
                          stroke={nextInfo.isFocused ? '#09090b' : '#e4e4e7'}
                          strokeWidth="2.5"
                          strokeDasharray={nextInfo.type === 'walk' ? '4 7' : undefined}
                          strokeLinecap="round"
                        />
                      </svg>
                    );
                  })()}

                  {/* 핀 버튼 (노드 테마 컬러스킴 적용) */}
                  <button
                    ref={(el) => {
                      const key = `place-${place.id}`;
                      if (el) cardRefs.current.set(key, el);
                      else cardRefs.current.delete(key);
                    }}
                    type="button"
                    onClick={() => handlePlaceClick(place)}
                    className={`relative z-10 w-7 h-7 rounded-full text-white border-2 border-white shadow-md flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95 ${
                      focusedPlaceId === place.id ? 'ring-4 ring-indigo-500/40 scale-110 shadow-lg z-20' : ''
                    }`}
                    style={{ backgroundColor: placeTheme.color }}
                    title={`${place.place_name} (${place.address || ''})`}
                  >
                    <span className="text-[11px] font-black leading-none">{idx + 1}</span>
                  </button>
                </div>

                {/* 하단: 장소 이름 및 아래 배치된 장소 태그/카테고리 */}
                <button
                  type="button"
                  onClick={() => handlePlaceClick(place)}
                  className="flex flex-col items-center justify-start h-[36px] w-full text-center px-0.5 cursor-pointer group"
                >
                  <span className={`truncate text-[12px] transition-colors leading-tight max-w-full ${
                    focusedPlaceId === place.id
                      ? 'font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600'
                      : 'font-bold text-zinc-900 group-hover:text-blue-600'
                  }`}>
                    {place.place_name}
                  </span>
                  <span className={`truncate text-[9.5px] font-medium leading-tight max-w-full mt-0.5 ${
                    focusedPlaceId === place.id ? 'text-indigo-600 font-bold' : 'text-zinc-400'
                  }`}>
                    {categoryLabel || shortAddress || '장소'}
                  </span>
                </button>
              </div>

              {/* 다음 장소와의 구간 이동 트랙 & 상단 칩 */}
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
