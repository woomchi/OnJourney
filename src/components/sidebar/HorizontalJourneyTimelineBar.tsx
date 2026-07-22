"use client";

import { useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Journey, Place } from '@/types/journey';
import { MapPin, ArrowRight, Footprints, Car, Bus, Train } from 'lucide-react';

import { getSequenceTheme, getSegmentTheme } from '@/constants/colors';

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
    setAlternativeSegment,
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
  if (places.length === 0) return null;

  const transportType = activeJourney.transport_type || 'public';

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

    // 거리 계산 및 포맷팅
    const distanceVal = route?.distance;
    const formattedDistance = distanceVal != null
      ? (distanceVal >= 1 ? `${distanceVal.toFixed(1)}km` : `${Math.round(distanceVal * 1000)}m`)
      : '';

    // 요금 계산 및 포맷팅
    const fareVal = route?.fare || route?.taxiFare;
    const formattedFare = fareVal
      ? (route?.taxiFare && !route?.fare ? `택시 ${fareVal.toLocaleString()}원` : `${fareVal.toLocaleString()}원`)
      : '';
    
    // 환승 및 대중교통 노선 정보 계산
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
        className={`w-[168px] h-[76px] flex flex-col justify-between p-3 rounded-2xl text-xs transition-all shrink-0 cursor-pointer text-left relative overflow-hidden ${
          isFocused ? theme.cardFocused : theme.cardUnfocused
        }`}
        title={`${origin.place_name} → ${dest.place_name} 구간 (${duration || '이동정보'})`}
      >
        {/* 상단: 수단 아이콘 + 이동시간 + 환승 태그 */}
        <div className="flex items-center justify-between gap-1 w-full">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            {type === 'car' ? (
              <Car className={`w-4.5 h-4.5 shrink-0 ${theme.iconUnfocused}`} />
            ) : type === 'walk' ? (
              <Footprints className={`w-4.5 h-4.5 shrink-0 ${theme.iconUnfocused}`} />
            ) : (
              <Bus className={`w-4.5 h-4.5 shrink-0 ${theme.iconUnfocused}`} />
            )}
            <span className="font-extrabold text-[13.5px] truncate">{duration || '이동'}</span>
          </div>
          {transferLabel && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${theme.badgeUnfocused}`}>
              {transferLabel}
            </span>
          )}
        </div>

        {/* 하단: 이동 거리, 요금 및 노선 태그 */}
        <div className="flex flex-col gap-0.5 w-full min-w-0">
          {stepBadges.length > 0 ? (
            <div className="flex items-center gap-1 overflow-hidden">
              {stepBadges.slice(0, 2).map((badge, bIdx) => (
                <span
                  key={bIdx}
                  className={`text-[10px] px-1 py-0.5 rounded font-semibold truncate max-w-[72px] ${theme.badgeUnfocused}`}
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <div className={`text-[11px] font-medium truncate flex items-center gap-1 ${theme.subtextUnfocused}`}>
            {formattedDistance && <span>{formattedDistance}</span>}
            {formattedDistance && formattedFare && <span>·</span>}
            {formattedFare && <span>{formattedFare}</span>}
            {!formattedDistance && !formattedFare && <span className="opacity-75">상세 경로 보기</span>}
          </div>
        </div>

        {/* 하단 Polyline 패턴 그라데이션 적용 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[3.5px] pointer-events-none transition-all"
          style={{
            background: `linear-gradient(to right, ${theme.gradientStart}, ${theme.gradientEnd})`,
          }}
        />
      </button>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] md:hidden pointer-events-auto bg-white/95 text-zinc-900 backdrop-blur-xl border-t border-zinc-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div ref={timelineContainerRef} className="w-full px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        {places.map((place, idx) => {
          const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
          const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
          const placeTheme = getSequenceTheme(idx, places.length);

          return (
            <div key={place.id} className="flex items-center gap-2.5 shrink-0">
              {/* 장소 노드 카드 (통일된 크기: w-[168px] h-[76px]) - 흰색 배경 & 지도 핀 테마 매칭 */}
              <button
                ref={(el) => {
                  const key = `place-${place.id}`;
                  if (el) cardRefs.current.set(key, el);
                  else cardRefs.current.delete(key);
                }}
                type="button"
                onClick={() => handlePlaceClick(place)}
                className="w-[168px] h-[76px] flex flex-col justify-between p-3 rounded-2xl bg-white text-zinc-900 font-bold shadow-sm hover:bg-zinc-50 transition-all shrink-0 cursor-pointer text-left border border-zinc-200/90 hover:border-zinc-300"
                title={`${place.place_name} (${place.address || ''})`}
              >
                {/* 상단: 핀 번호 & 카테고리/주소 */}
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className="w-5.5 h-5.5 rounded-full text-white text-xs font-black flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: placeTheme.color }}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[11px] text-zinc-500 font-medium truncate text-right flex-1 min-w-0 ml-1">
                    {categoryLabel || shortAddress || '장소'}
                  </span>
                </div>

                {/* 하단: 장소 이름 및 상세 주소 */}
                <div className="flex flex-col min-w-0 w-full">
                  <span className="truncate text-[13.5px] font-bold text-zinc-900 tracking-tight">{place.place_name}</span>
                  {shortAddress ? (
                    <span className="truncate text-[11px] text-zinc-500 font-normal">{shortAddress}</span>
                  ) : null}
                </div>
              </button>

              {/* 다음 장소와의 구간 이동 칩 */}
              {idx < places.length - 1 && renderSegmentBadge(place, places[idx + 1], idx)}
            </div>
          );
        })}
      </div>
    </div>
  );
}


