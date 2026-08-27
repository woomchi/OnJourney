"use client";

import React from 'react';
import type { Place, SelectedRoute, DirectionResult, DirectionStep, BaseRouteData, TransportType } from '@/types/journey';
import { getSegmentTheme } from '@/constants/colors';
import { calculateHaversineDistance } from '@/lib/services/naverMapRouteService';
import { formatKmDistance, formatDurationMinutes } from '@/lib/utils/journeyUtils';
import { Bus, Car, Footprints, Train } from 'lucide-react';
import { AlternativeRouteIcon } from '@/components/ui/icons';

interface HorizontalTimelineSegmentBadgeProps {
  origin: Place;
  dest: Place;
  segmentIndex: number;
  route: SelectedRoute | DirectionResult | null;
  isLoading: boolean;
  transportType: TransportType | string;
  isFocused: boolean;
  isAlternativeOpen: boolean;
  onSegmentClick: (origin: Place, dest: Place, route: BaseRouteData | null) => void;
  onToggleAlternative: (origin: Place, dest: Place, route: BaseRouteData | null) => void;
  onBindRef: (key: string, el: HTMLElement | null) => void;
}

export function HorizontalTimelineSegmentBadge({
  origin,
  dest,
  segmentIndex,
  route,
  isLoading,
  transportType,
  isFocused,
  isAlternativeOpen,
  onSegmentClick,
  onToggleAlternative,
  onBindRef,
}: HorizontalTimelineSegmentBadgeProps) {
  if (isLoading) {
    return (
      <div className="relative flex flex-col justify-between w-[140px] shrink-0 h-[100px] px-1 select-none">
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
  const theme = getSegmentTheme(segmentIndex);

  return (
    <div className="relative flex flex-col justify-between w-[140px] shrink-0 h-[100px] px-1 select-none">
      {/* 1. 상단 스페이서 (32px) */}
      <div className="h-[32px] w-full shrink-0" />

      {/* 2. 중앙 요약 카드 영역 (26px) */}
      <div className="relative w-full flex items-center justify-center h-[26px] shrink-0">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center">
          <div
            ref={(el) => onBindRef(`segment-${origin.id}-${dest.id}`, el)}
            onClick={() => onSegmentClick(origin, dest, route)}
            className={`relative z-10 px-2 py-1.5 rounded-xl flex items-center justify-between gap-1.5 transition-all cursor-pointer shadow-xs border w-[130px] h-[86px] ${
              isFocused
                ? 'bg-zinc-950 text-white border-zinc-950 shadow-md scale-105'
                : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-350 hover:bg-zinc-50'
            }`}
            title={`${origin.place_name} → ${dest.place_name} 이동정보`}
          >
            {/* 좌측 정보 영역 */}
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
                    const hasSubway = steps.some((s: DirectionStep) => s.type === 'subway' || s.type === 'train');
                    const hasBus = steps.some((s: DirectionStep) => s.type === 'bus' || s.type === 'expressbus');

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
                  route?.steps ? `환승 ${Math.max(0, route.steps.filter((s: DirectionStep) => s.type !== 'walk').length - 1)}회` : '대중교통'
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

            {/* 우측 대안 수단 버튼 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleAlternative(origin, dest, route);
              }}
              className={`
                flex items-center justify-center w-6.5 h-6.5 rounded-md border transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer shrink-0
                ${isAlternativeOpen
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
                isActive={isAlternativeOpen}
                className="w-3.5 h-3.5"
              />
            </button>
          </div>
        </div>
      </div>

      {/* 3. 하단 스페이서 (36px) */}
      <div className="h-[36px] w-full shrink-0" />
    </div>
  );
}
