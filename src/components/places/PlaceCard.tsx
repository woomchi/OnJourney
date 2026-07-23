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
import { GripVertical } from 'lucide-react';
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
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
      
      if (wasFocusedRef.current && !isCurrentlyFocused && !focusedSegment && !focusedStep && cardRef.current) {
        const scrollBlock = isDrawerMaximized ? 'nearest' : 'center';
        setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
        }, 50);
        setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: scrollBlock });
        }, 400);
      }
      
      wasFocusedRef.current = !!isCurrentlyFocused;
    }
  }, [focusedSegment, focusedStep, place.id, nextPlace?.id, editMode, isDrawerMaximized]);

  const queryClient = useQueryClient();
  const places = activeJourney?.places ?? [];
  const directionsCache = useJourneyDirectionsCache(places);
  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const { isCacheRestored } = useJourneyStore();
  const publicQueryState = nextPlace ? queryClient.getQueryState(directionKeys.segmentPublic(place.id, nextPlace.id)) : null;
  const carQueryState = nextPlace ? queryClient.getQueryState(directionKeys.segmentCar(place.id, nextPlace.id)) : null;
  const isSegmentLoading = !isCacheRestored || (
    (publicQueryState?.status === 'pending' && publicQueryState?.fetchStatus !== 'paused') ||
    (carQueryState?.status === 'pending' && carQueryState?.fetchStatus !== 'paused')
  );

  const activeRoute = nextPlace 
    ? getDefaultRoute(place, nextPlace, segmentData, transportType)
    : undefined;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition ? 'transform 150ms cubic-bezier(0.2, 0, 0, 1)' : undefined,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <li
      ref={setRefs}
      style={style}
      className={`relative pt-3 pb-3 require-drag-handle ${isDragging ? 'z-20' : ''} ${
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
        />

        <div
          onClick={editMode ? onToggleSelect : undefined}
          className={`place-card-content flex-1 min-w-0 mx-2 bg-white border rounded-2xl shadow-sm transition-all duration-200 ${
            editMode
              ? 'border-zinc-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
              : 'border-zinc-100 group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
          } ${isDragging ? 'border-blue-400 bg-blue-50/40' : ''}`}
        >
          <div className="flex items-center px-4 py-3 gap-2">
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
              <p className="text-sm font-bold text-zinc-800 truncate leading-tight">
                {place.place_name}
              </p>
              {place.address && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
              )}
            </div>

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

      {!editMode && !isLast && (() => {
        return (
          <div className="pl-16 mt-1 pr-6 relative">
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left focus:outline-none cursor-pointer"
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
