"use client";

import { useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useJourneyDirectionsCache, directionKeys } from '@/hooks/queries/useDirections';
import { useQueryClient } from '@tanstack/react-query';
import type { Place } from '@/types/journey';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import SegmentInfo from './SegmentInfo';
import TimelineNode from './TimelineNode';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { getSequenceTheme } from '@/constants/colors';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RefreshCw } from 'lucide-react';
import { AlternativeRouteIcon } from '@/components/ui/icons';

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


interface PlaceCardProps {
  place: Place;
  index: number;
  isLast: boolean;
  editMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  nextPlace: Place | null;
  transportType: 'public' | 'car' | 'walk';
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function PlaceCard({
  place,
  index,
  isLast,
  editMode,
  isSelected,
  onToggleSelect,
  nextPlace,
  transportType,
  scrollContainerRef,
}: PlaceCardProps) {
  const {
    activeJourney,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    setFocusedStep,
    focusedStep,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
    isDrawerMaximized,
    alternativeSegment,
    setAlternativeSegment,
    setTargetChangePlaceId,
    openSearchMode,
  } = useJourneyStore();

  const isMobile = useMediaQuery('(max-width: 767px)');
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: place.id,
    disabled: !editMode,
  });

  const cardRef = useRef<HTMLLIElement>(null);
  
  const setRefs = (node: HTMLLIElement | null) => {
    setNodeRef(node);
    cardRef.current = node;
  };

  const isFocused = 
    (focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace?.id) ||
    (focusedStep?.originId === place.id && focusedStep?.destId === nextPlace?.id);

  const isSegmentPlaying = !!(
    focusedStep && 
    focusedStep.originId === place.id && 
    focusedStep.destId === nextPlace?.id
  );

  useEffect(() => {
    if (focusedSegment && focusedSegment.originId !== place.id) {
      if (alternativeSegment?.originId === place.id) {
        setAlternativeSegment(null);
      }
    }
  }, [focusedSegment, place.id, alternativeSegment, setAlternativeSegment]);

  const wasFocusedRef = useRef(false);

  useEffect(() => {
    if (!editMode) {
      const isCurrentlyFocused =
        (focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace?.id) ||
        (focusedStep?.originId === place.id && focusedStep?.destId === nextPlace?.id);

      if (isCurrentlyFocused && cardRef.current) {
        setTimeout(() => {
          const container = scrollContainerRef?.current;
          const element = cardRef.current;
          if (container && element) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;
            const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2);
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }
      
      if (wasFocusedRef.current && !isCurrentlyFocused && !focusedSegment && !focusedStep && cardRef.current) {
        const scrollBlock = isDrawerMaximized ? 'nearest' : 'center';
        setTimeout(() => {
          const container = scrollContainerRef?.current;
          const element = cardRef.current;
          if (container && element) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;
            const targetScrollTop = container.scrollTop + relativeTop - (container.clientHeight / 2) + (element.clientHeight / 2);
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          } else {
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
          }
        }, 50);
      }
      
      wasFocusedRef.current = !!isCurrentlyFocused;
    }
  }, [focusedSegment, focusedStep, place.id, nextPlace?.id, editMode, isDrawerMaximized, scrollContainerRef]);

  const queryClient = useQueryClient();
  const places = activeJourney?.places ?? [];
  const directionsCache = useJourneyDirectionsCache(places);
  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const { isCacheRestored } = useJourneyStore();
  const publicQueryState = nextPlace ? queryClient.getQueryState(directionKeys.segmentPublic(place.id, nextPlace.id)) : null;
  const carQueryState = nextPlace ? queryClient.getQueryState(directionKeys.segmentCar(place.id, nextPlace.id)) : null;
  const hasSelectedRoute = place.selected_route && place.selected_route.destId === nextPlace?.id;
  const isSegmentLoading = Boolean(
    nextPlace &&
    !hasSelectedRoute &&
    (!isCacheRestored ||
      (!segmentData && (
        !publicQueryState || publicQueryState.status === 'pending' ||
        !carQueryState || carQueryState.status === 'pending'
      ))
    )
  );

  const activeRoute = nextPlace 
    ? getDefaultRoute(place, nextPlace, segmentData, transportType)
    : undefined;

  const theme = getSequenceTheme(index, places.length);

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition ? 'transform 150ms cubic-bezier(0.2, 0, 0, 1)' : undefined,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <li
      ref={setRefs}
      style={style}
      className={`relative pt-1 pb-1 require-drag-handle ${isDragging ? 'z-20' : ''} ${
        !isDrawerMaximized && !isMobile ? 'snap-start snap-always' : ''
      }`}
    >
      <div className="flex items-center gap-0 group">
        <TimelineNode
          index={index}
          totalPlaces={places.length}
          isLast={isLast}
          editMode={editMode}
          isFocused={isFocused}
          isSegmentPlaying={isSegmentPlaying}
          place={place}
          nextPlace={nextPlace}
          activeRoute={activeRoute}
          transportType={(activeRoute?.type as 'public' | 'car' | 'walk') || transportType}
        />

        <div
          onClick={editMode ? onToggleSelect : undefined}
          className={`place-card-content flex-1 min-w-0 mx-2 bg-white border rounded-2xl shadow-sm transition-all duration-200 ${
            editMode
              ? 'border-zinc-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
              : 'border-zinc-100 group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
          } ${isDragging ? 'border-blue-400 bg-blue-50/40' : ''}`}
        >
          <div className="flex items-center px-3.5 py-2.5 gap-2">
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

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-bold text-zinc-800 truncate leading-tight flex-1 min-w-0">
                  {place.place_name}
                </p>
                {place.category && (() => {
                  const categoryTheme = getCategoryTheme(place.category);
                  const classes = themeClasses[categoryTheme.type] || themeClasses.etc;
                  return (
                    <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${classes.badge}`}>
                      {place.category.split('>').pop()?.trim() || place.category}
                    </span>
                  );
                })()}
              </div>
              {place.address && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
              )}
            </div>

            {!editMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTargetChangePlaceId(place.id);
                  openSearchMode();
                }}
                className="flex-shrink-0 w-6.5 h-6.5 rounded-md bg-zinc-50 hover:bg-blue-50/80 border border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600 flex items-center justify-center transition-all duration-300 shadow-2xs cursor-pointer active:scale-95 group/change-btn"
                title="장소 정보 변경"
              >
                <RefreshCw className="w-3.5 h-3.5 text-zinc-500 group-hover/change-btn:text-blue-600 transition-colors" strokeWidth={2.2} />
              </button>
            )}

            {editMode && (
              <div
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 p-2 rounded hover:bg-zinc-100 transition-colors touch-none drag-handle"
              >
                <GripVertical className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* 대중교통/정류소 장소인 경우 실시간 버스 도착 정보 카드 노출 */}
          {!editMode && (() => {
            const pName = place?.place_name || (place as any)?.name || '';
            const pAddr = place?.address || (place as any)?.address_name || (place as any)?.road_address_name || '';
            
            const isTransit =
              place?.category === 'transit' ||
              Boolean((place as any)?.arsId || (place as any)?.stationId || (place as any)?.nodeId) ||
              pName.endsWith('역') ||
              pName.includes('정류장') ||
              pName.includes('정류소') ||
              pName.includes('터미널');

            if (!isTransit) return null;

          })()}
        </div>
      </div>

      {!editMode && !isLast && (() => {
        const currentTransport = (activeRoute?.type as string) || transportType;
        const isWalk = currentTransport === 'walk';

        return (
          <div className="relative mt-1 flex items-center">
            {/* 세로 연결선 (SegmentInfo 옆 64px 영역을 지나 다음 순서 노드까지 이어지도록 연장) */}
            <div className="absolute left-0 top-0 bottom-0 w-16 flex justify-center pointer-events-none z-0">
              <svg className="w-full h-full overflow-visible pointer-events-none z-0">
                <line
                  x1="50%"
                  y1="-6px"
                  x2="50%"
                  y2="calc(100% + 12px)"
                  stroke={isFocused ? (theme.color || '#09090b') : '#e4e4e7'}
                  strokeWidth="2.5"
                  strokeDasharray={isWalk ? '4 7' : undefined}
                  strokeLinecap="round"
                />
              </svg>
              {(isFocused || isSegmentPlaying) && (
                <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-10">
                  <line
                    x1="50%"
                    y1="-6px"
                    x2="50%"
                    y2="calc(100% + 12px)"
                    stroke={theme.color || '#09090b'}
                    strokeWidth="3.5"
                    strokeDasharray={isWalk ? '4 7' : undefined}
                    strokeLinecap="round"
                    className={isSegmentPlaying ? 'animate-pulse' : ''}
                  />
                </svg>
              )}
            </div>

            {/* TimelineNode(64px) 폭 맞춤용 Spacer */}
            <div className="w-16 flex-shrink-0" />

            {/* 이동 정보 카드 (장소 카드와 100% 동일한 flex-1 min-w-0 mx-2 레이아웃 배치) */}
            <div
              role="button"
              tabIndex={0}
              className="flex-1 min-w-0 mx-2 text-left focus:outline-none cursor-pointer"
              onClick={() => {
                if (nextPlace) {
                  if (isFocused) {
                    setFocusedStep(null);
                    setFocusedSegment(null);
                    setAlternativeSegment(null);
                    setFocusBounds(null);
                  } else {
                    const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
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
                    if (isFocused) {
                      setFocusedStep(null);
                      setFocusedSegment(null);
                      setAlternativeSegment(null);
                      setFocusBounds(null);
                    } else {
                      const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
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
          </div>
        );
      })()}
    </li>
  );
}
