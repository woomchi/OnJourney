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
      <div
        key={`segment-wrap-${origin.id}-${dest.id}`}
        className="relative flex flex-col items-center justify-between w-[148px] shrink-0 h-[104px] px-1 select-none"
      >
        {/* 1. 바 위 (Top): 이동 요약 칩 */}
        <div className="flex items-center justify-center h-[34px] w-full z-10">
          <button
            ref={(el) => {
              const key = `segment-${origin.id}-${dest.id}`;
              if (el) cardRefs.current.set(key, el);
              else cardRefs.current.delete(key);
            }}
            type="button"
            onClick={() => handleSegmentClick(origin, dest, route)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border text-nowrap max-w-[140px] truncate ${
              isFocused
                ? 'bg-zinc-950 text-white border-zinc-950 shadow-md scale-105'
                : 'bg-white/95 text-zinc-800 border-zinc-200/90 hover:border-zinc-400 hover:bg-zinc-50'
            }`}
            title={`${origin.place_name} → ${dest.place_name} 이동정보 (${duration || '상세보기'})`}
          >
            <div
              className={`h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center gap-0.5 shrink-0 ${
                isFocused ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {(() => {
                if (type === 'car') return <Car className="w-2.5 h-2.5" />;
                if (type === 'walk') return <Footprints className="w-2.5 h-2.5" />;

                const steps = route?.steps || [];
                const hasSubway = steps.some((s: any) => s.type === 'subway' || s.type === 'train');
                const hasBus = steps.some((s: any) => s.type === 'bus' || s.type === 'expressbus');

                if (hasSubway && hasBus) {
                  return (
                    <>
                      <Bus className="w-2.5 h-2.5" />
                      <Train className="w-2.5 h-2.5" />
                    </>
                  );
                }
                if (hasSubway) return <Train className="w-2.5 h-2.5" />;
                if (hasBus) return <Bus className="w-2.5 h-2.5" />;
                return <Bus className="w-2.5 h-2.5" />;
              })()}
            </div>
            <span className="font-extrabold tracking-tight text-[11.5px] truncate">
              {duration || '이동'}
            </span>
            {formattedDistance && (
              <span className={`text-[10px] font-medium opacity-80 border-l pl-1 truncate ${isFocused ? 'border-white/30' : 'border-zinc-200'}`}>
                {formattedDistance}
              </span>
            )}
          </button>
        </div>

        {/* 2. 중앙 (Center): 연속 트랙 노선선 */}
        <div className="relative w-full flex items-center justify-center h-[28px]">
          {/* 기본 트랙 라인 */}
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-zinc-200/90 rounded-full z-0" />
          {/* 포커스 시 활성화되는 테마 글로우 선 */}
          {isFocused && (
            <div
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3.5px] rounded-full z-0 transition-all duration-300"
              style={{
                backgroundColor: theme.hex,
                boxShadow: `0 0 10px ${theme.hex}a0`,
              }}
            />
          )}
        </div>

        {/* 3. 바 아래 (Bottom): 추가 노선 태그 / 수단 정보 */}
        <div className="flex items-center justify-center h-[34px] w-full z-10">
          {stepBadges.length > 0 ? (
            <div className="flex items-center gap-1 max-w-[130px] overflow-hidden">
              {stepBadges.slice(0, 1).map((badge, bIdx) => (
                <span
                  key={bIdx}
                  className="text-[9.5px] px-1.5 py-0.5 rounded bg-zinc-100/90 text-zinc-600 font-semibold border border-zinc-200/60 truncate max-w-[120px]"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : transferLabel ? (
            <span className="text-[10px] text-zinc-400 font-medium tracking-tight">
              {transferLabel}
            </span>
          ) : null}
        </div>
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
          const isPlaceFocused = focusedSegment === null && false; // Or place focus state

          return (
            <div key={place.id} className="flex items-center shrink-0">
              {/* 장소 노드 항목 (수직 정렬: 상단 스페이서, 중앙 핀 노드, 하단 장소명 & 태그) */}
              <div className="flex flex-col items-center justify-between w-[100px] shrink-0 h-[104px] relative">
                {/* 상단 핀 위 영역 (상단 트랙 칩 수평 맞춤용) */}
                <div className="h-[34px] w-full" />

                {/* 중앙: 노선선과 결합된 원형 핀 노드 (컬러스킴 적용) */}
                <div className="relative w-full flex items-center justify-center h-[28px]">
                  {/* 노선 트랙 연결선 (첫 장소가 아닌 경우 좌측 잇기) */}
                  {idx > 0 && (
                    <div className="absolute left-0 w-1/2 top-1/2 -translate-y-1/2 h-[3px] bg-zinc-200/90 z-0" />
                  )}
                  {/* 노선 트랙 연결선 (마지막 장소가 아닌 경우 우측 잇기) */}
                  {idx < places.length - 1 && (
                    <div className="absolute right-0 w-1/2 top-1/2 -translate-y-1/2 h-[3px] bg-zinc-200/90 z-0" />
                  )}

                  {/* 핀 버튼 (노드 테마 컬러스킴 적용) */}
                  <button
                    ref={(el) => {
                      const key = `place-${place.id}`;
                      if (el) cardRefs.current.set(key, el);
                      else cardRefs.current.delete(key);
                    }}
                    type="button"
                    onClick={() => handlePlaceClick(place)}
                    className="relative z-10 w-7.5 h-7.5 rounded-full text-white border-2 border-white shadow-md flex items-center justify-center transition-all cursor-pointer hover:scale-110 active:scale-95"
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
                  <span className="truncate text-[12.5px] font-bold text-zinc-900 group-hover:text-blue-600 transition-colors leading-tight max-w-full">
                    {place.place_name}
                  </span>
                  <span className="truncate text-[10px] text-zinc-400 font-medium leading-tight max-w-full mt-0.5">
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


