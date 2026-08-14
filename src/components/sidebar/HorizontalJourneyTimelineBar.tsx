"use client";

import { useEffect, useRef, useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds, calculateHaversineDistance } from '@/lib/naverMapRouteService';
import type { Journey, Place } from '@/types/journey';
import { MapPin, ArrowRight, Footprints, Car, Bus, Train } from 'lucide-react';
import { AlternativeRouteIcon } from '@/components/ui/icons';

import { getSequenceTheme, getSegmentTheme } from '@/constants/colors';
import { formatKmDistance, formatDurationMinutes } from '@/lib/utils/journeyUtils';

interface HorizontalJourneyTimelineBarProps {
  activeJourney: Journey;
}

export default function HorizontalJourneyTimelineBar({
  activeJourney,
}: HorizontalJourneyTimelineBarProps) {
  const queryClient = useQueryClient();
  const {
    focusedSegment,
    setFocusedSegment,
    setFocusedStep,
    setFocusBounds,
    focusedPlaceId,
    setFocusedPlaceId,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
    isCacheRestored,
    departureTime,
  } = useJourneyStore();

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
    if (focusedSegment) {
      const key = `segment-${focusedSegment.originId}-${focusedSegment.destId}`;
      scrollToElement(key);
    }
  }, [focusedSegment]);

  const places = activeJourney?.places || [];
  const directionsCache = useJourneyDirectionsCache(places);
  if (places.length === 0) return null;

  const transportType = activeJourney.transport_type || 'public';

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
      const publicData = queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carData = queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id, departureTime));
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
      const cacheKey = `${origin.id}-${dest.id}`;
      const cachedData = directionsCache[cacheKey];

      const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id, departureTime));
      const publicData = cachedData ? { public: cachedData.public } : queryClient.getQueryData<any>(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carData = cachedData ? { car: cachedData.car, walk: cachedData.walk } : queryClient.getQueryData<any>(directionKeys.segmentCar(origin.id, dest.id, departureTime));

      const hasData = (cachedData && (cachedData.public.length > 0 || cachedData.car.length > 0 || cachedData.walk.length > 0)) || !!publicData || !!carData;

      isSegLoading = !isCacheRestored || (
        !hasData &&
        (!publicQueryState || publicQueryState.status === 'pending' ||
         !carQueryState || carQueryState.status === 'pending')
      );

      const segmentData = cachedData || {
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
          className="relative flex flex-col justify-between w-[140px] shrink-0 h-[104px] px-1 select-none"
        >
          <div className="h-[34px] w-full shrink-0" />
          <div className="relative w-full flex items-center justify-center h-[28px] shrink-0">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center">
              <div className="relative z-10 px-2.5 py-2 rounded-xl flex items-center justify-between gap-1.5 bg-white/95 text-zinc-800 border border-zinc-200 shadow-2xs w-[130px] h-[86px] animate-pulse">
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

    const duration = route?.duration ? formatDurationMinutes(route.duration) : '';
    const type = route?.type || transportType;
    const getDistanceKm = (): number | null => {
      if (route?.distance != null && route.distance > 0) {
        return route.distance;
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
    const formattedDistance = formatKmDistance(distKm);

    const fareVal = route?.fare || route?.taxiFare;

    const theme = getSegmentTheme(sIdx);
    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;

    return (
      <div
        key={`segment-wrap-${origin.id}-${dest.id}`}
        className="relative flex flex-col justify-between w-[140px] shrink-0 h-[104px] px-1 select-none"
      >
        <div className="h-[34px] w-full shrink-0" />

        <div className="relative w-full flex items-center justify-center h-[28px] shrink-0">
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
                  : 'bg-white/95 text-zinc-800 border-zinc-200 hover:border-zinc-350 hover:bg-zinc-50'
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

              {/* 우측 대안 수단 버튼 (크기 확대 & 마이크로 인터랙션 적용) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const isCurrentlyOpen = alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id;
                  
                  if (!isCurrentlyOpen) {
                    const wasFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;
                    setIsAlternativeFromFocus(wasFocused);
                    setAlternativeSegment({ originId: origin.id, destId: dest.id });
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
                  flex items-center justify-center w-6.5 h-6.5 rounded-md border transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer shrink-0
                  ${alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : isFocused
                      ? 'bg-white/15 border-white/20 text-white hover:bg-white/30'
                      : 'bg-zinc-50 border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600'
                  }
                `}
                aria-label="대안 경로 탐색"
                title="대안 경로 탐색"
              >
                <AlternativeRouteIcon 
                  isActive={alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id}
                  className="w-3.5 h-3.5"
                />
              </button>
            </div>
          </div>
        </div>

        {/* 3. 하단 스페이서 (34px) */}
        <div className="h-[34px] w-full shrink-0" />
      </div>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] md:hidden pointer-events-auto bg-white/95 text-zinc-900 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div
        ref={timelineContainerRef}
        className="w-full px-5 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center overflow-x-auto scrollbar-none"
      >
        {places.map((place, idx) => {
          const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
          const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
          const placeTheme = getSequenceTheme(idx, places.length);
          const isPlaceFocused = focusedPlaceId === place.id;

          return (
            <div key={place.id} className="flex items-center shrink-0">
              {/* 장소 노드 항목 (수직 정렬: 상단 스페이서, 중앙 핀 노드, 하단 장소명 & 태그) */}
              <div className="flex flex-col items-center justify-between w-[100px] shrink-0 h-[104px] relative">
                {/* 상단 핀 위 영역 (상단 트랙 칩 수평 맞춤용) */}
                <div className="h-[34px] w-full" />

                {/* 중앙: 원형 핀 노드 (컬러스킴 적용) */}
                <div className="relative w-full flex items-center justify-center h-[28px]">
                  {/* 이전 구간 연결 엣지 선 (노드 핀 좌측, 8px 여백 적용) */}
                  {idx > 0 && (() => {
                    const prevInfo = getSegmentInfo(places[idx - 1], place);
                    return (
                      <svg className="absolute left-0 w-1/2 top-1/2 -translate-y-1/2 h-[4px] pointer-events-none z-0">
                        <line
                          x1="3px"
                          y1="50%"
                          x2="calc(100% - 23px)"
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
                          x1="23px"
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
                    className={`relative z-10 w-7.5 h-7.5 rounded-full text-white border-2 border-white shadow-md flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95 ${
                      isPlaceFocused ? 'ring-4 ring-indigo-500/40 scale-110 shadow-lg z-20' : ''
                    }`}
                    style={{ backgroundColor: placeTheme.color }}
                    title={`${place.place_name} (${place.address || ''})`}
                  >
                    <span className="text-xs font-black leading-none">{idx + 1}</span>
                  </button>
                </div>

                {/* 하단: 장소 이름 및 아래 배치된 장소 태그/카테고리 */}
                <button
                  type="button"
                  onClick={() => handlePlaceClick(place)}
                  className="flex flex-col items-center justify-start h-[34px] w-full text-center px-0.5 cursor-pointer group"
                >
                  <span className={`truncate text-[12.5px] transition-colors leading-tight max-w-full ${
                    isPlaceFocused
                      ? 'font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600'
                      : 'font-bold text-zinc-900 group-hover:text-blue-600'
                  }`}>
                    {place.place_name}
                  </span>
                  <span className={`truncate text-[10px] font-medium leading-tight max-w-full mt-0.5 ${
                    isPlaceFocused ? 'text-indigo-600 font-bold' : 'text-zinc-400'
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
    </div>
  );
}


