"use client";

import { useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useJourneyDirectionsCache, directionKeys } from '@/hooks/queries/useDirections';
import { useQueryClient } from '@tanstack/react-query';
import type { Place } from '@/types/journey';
import { fetchSegmentDirections as fetchDirectionsApi } from '@/lib/services/directionsService';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import SegmentInfo from './SegmentInfo';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { getSequenceTheme } from '@/constants/colors';

const themeClasses = {
  cafe: {
    bg: 'from-amber-400 to-orange-500 shadow-orange-100',
    badge: 'text-amber-700 bg-amber-50 border border-amber-100',
    line: 'from-amber-200 via-amber-100'
  },
  restaurant: {
    bg: 'from-red-400 to-rose-500 shadow-rose-100',
    badge: 'text-rose-700 bg-rose-50 border border-rose-100',
    line: 'from-rose-200 via-rose-100'
  },
  hotel: {
    bg: 'from-emerald-400 to-teal-500 shadow-emerald-100',
    badge: 'text-emerald-700 bg-emerald-50 border border-emerald-100',
    line: 'from-emerald-200 via-emerald-100'
  },
  activity: {
    bg: 'from-blue-400 to-indigo-500 shadow-blue-100',
    badge: 'text-blue-700 bg-blue-50 border border-blue-100',
    line: 'from-blue-200 via-blue-100'
  },
  transit: {
    bg: 'from-zinc-400 to-zinc-500 shadow-zinc-100',
    badge: 'text-zinc-700 bg-zinc-50 border border-zinc-100',
    line: 'from-zinc-200 via-zinc-100'
  },
  etc: {
    bg: 'from-violet-400 to-purple-500 shadow-purple-100',
    badge: 'text-purple-700 bg-purple-50 border border-purple-100',
    line: 'from-purple-200 via-purple-100'
  }
};

function AlternativeRouteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-15L21 6m0 0L16.5 10.5M21 6H7.5" />
    </svg>
  );
}

interface PlaceCardProps {
  place: Place;
  index: number;
  isLast: boolean;
  editMode: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragged: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  nextPlace: Place | null;
  transportType: 'public' | 'car' | 'walk';
}

export default function PlaceCard({
  place,
  index,
  isLast,
  editMode,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragged,
  isSelected,
  onToggleSelect,
  nextPlace,
  transportType,
}: PlaceCardProps) {
  const {
    activeJourney,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    setFocusedStep,
    focusedStep,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
  } = useJourneyStore();
  const cardRef = useRef<HTMLLIElement>(null);

  // 다른 이동 구간을 클릭하여 포커스가 변경되면 아코디언 닫기 (이제는 패널이므로 MapArea에서 제어하지만 호환성 유지)
  useEffect(() => {
    if (focusedSegment && focusedSegment.originId !== place.id) {
      if (alternativeSegment?.originId === place.id) {
        setAlternativeSegment(null);
      }
    }
  }, [focusedSegment, place.id, alternativeSegment, setAlternativeSegment]);

  useEffect(() => {
    if (!editMode) {
      const isFocused =
        (focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace?.id) ||
        (focusedStep?.originId === place.id && focusedStep?.destId === nextPlace?.id);

      if (isFocused && cardRef.current) {
        setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
    }
  }, [focusedSegment, focusedStep, place.id, nextPlace?.id, editMode]);

  const queryClient = useQueryClient();
  const places = activeJourney?.places ?? [];
  const directionsCache = useJourneyDirectionsCache(places);
  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const isSegmentLoading = nextPlace 
    ? queryClient.getQueryState(directionKeys.segment(place.id, nextPlace.id))?.status === 'pending'
    : false;

  const activeRoute = nextPlace 
    ? getDefaultRoute(place, nextPlace, segmentData, transportType)
    : undefined;

  return (
    <li
      ref={cardRef}
      draggable={editMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`relative transition-all duration-200 ${isDragged ? 'opacity-40 scale-[0.98]' : ''}`}
    >
      {/* 카드 + 번호 행 */}
      <div className="flex items-center gap-0 group">
        {/* 번호 + 세로선 컬럼 */}
        {(() => {
          const theme = getSequenceTheme(index, places.length);
          return (
            <div className="flex flex-col items-center w-10 flex-shrink-0 self-stretch select-none">
              <div 
                className="w-8 h-8 rounded-full shadow-md flex items-center justify-center text-white text-xs font-bold z-10 flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`
                }}
              >
                {index + 1}
              </div>
              {/* 세로 연결선 (마지막 카드 제외) */}
              {!isLast && (
                <div 
                  className="flex-1 w-px min-h-[2rem] mt-1"
                  style={{
                    background: `linear-gradient(180deg, ${theme.color}, transparent)`
                  }}
                />
              )}
            </div>
          );
        })()}

        {/* 장소 카드 */}
        <div
          onClick={editMode ? onToggleSelect : undefined}
          className={`place-card-content flex-1 min-w-0 mx-2 mb-1 bg-white border border-zinc-100 rounded-2xl shadow-sm transition-all duration-200 ${editMode
            ? 'cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
            : 'group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
            }`}
        >
          <div className="flex items-center px-4 py-3 gap-2">
            {/* 체크박스 - 편집 상태에만 왼쪽에 노출 */}
            {editMode && (
              <div className="flex-shrink-0 flex items-center justify-center mr-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                />
              </div>
            )}

            {/* 장소 정보 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-800 truncate leading-tight">
                {place.place_name}
              </p>
              {place.address && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
              )}
            </div>



            {/* 드래그 핸들 - 편집 상태에만 오른쪽에 노출 */}
            {editMode && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 p-2 rounded hover:bg-zinc-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          {/* 카테고리 뱃지 */}
          {place.category && (() => {
            const theme = getCategoryTheme(place.category);
            const classes = themeClasses[theme.type] || themeClasses.etc;
            return (
              <div className="px-4 pb-2.5">
                <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${classes.badge}`}>
                  {place.category.split('>').pop()?.trim() || place.category}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 대안 이동 정보 아코디언은 상세 패널(MapArea)로 분리됨 */}

      {/* 기본 구간 이동 정보 (항상 노출) */}
      {!editMode && !isLast && (() => {
        return (
          <div className="pl-10 pb-1 flex flex-col gap-1 relative">
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left focus:outline-none cursor-pointer"
              onClick={() => {
                if (nextPlace) {
                  const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                  if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                    // 이미 포커스된 상태에서 다시 클릭하면, 전체 구간 보기로 돌아가도록(zoom-out to segment) bounds 재적용
                    setFocusBounds({ ...bounds });
                    setFocusedStep(null);
                  } else {
                    setFocusBounds(bounds);
                    setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedStep(null);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (nextPlace) {
                    const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                    if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                      setFocusBounds({ ...bounds });
                      setFocusedStep(null);
                    } else {
                      setFocusBounds(bounds);
                      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                      setFocusedStep(null);
                    }
                  }
                }
              }}
            >
              <SegmentInfo
                data={activeRoute}
                loading={isSegmentLoading}
                index={index}
                placeId={place.id}
                destId={nextPlace?.id}
              />
            </div>

            {/* 대안 교통정보 토글 버튼을 이동 구간(SegmentInfo) 상단 우측에 겹치도록 배치 */}
            <div className="absolute top-2.5 right-6 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isCurrentlyOpen = alternativeSegment?.originId === place.id && alternativeSegment?.destId === nextPlace?.id;
                  
                  if (!isCurrentlyOpen && nextPlace) {
                    const wasFocused = focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace.id;
                    setIsAlternativeFromFocus(wasFocused);
                    setAlternativeSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedSegment(null);
                    setFocusedStep(null);
                    if (activeRoute) {
                      const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                      setFocusBounds(bounds);
                    }
                    if (!segmentData) {
                      queryClient.fetchQuery({
                        queryKey: directionKeys.segment(place.id, nextPlace.id),
                        queryFn: () => fetchDirectionsApi(place, nextPlace)
                      }).catch(console.error);
                    }
                  } else {
                    setAlternativeSegment(null);
                    if (isAlternativeFromFocus && nextPlace) {
                      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                      if (activeRoute) {
                        const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                        setFocusBounds(bounds);
                      }
                    } else {
                      setFocusBounds(null);
                    }
                  }
                }}
                className={`
                  flex items-center justify-center w-7 h-7 rounded-full
                  transition-all duration-300 shadow-sm
                  ${alternativeSegment?.originId === place.id && alternativeSegment?.destId === nextPlace?.id
                    ? 'bg-blue-500 text-white shadow-blue-500/30'
                    : 'bg-white/90 backdrop-blur-sm border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                  }
                `}
                aria-label="대안 경로 탐색"
                title="대안 경로 탐색"
              >
                <AlternativeRouteIcon />
              </button>
            </div>
          </div>
        );
      })()}
    </li>
  );
}
