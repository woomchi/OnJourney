"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import { Sheet } from 'react-modal-sheet';
import PlaceCard from './places/PlaceCard';
import { MapPin, Plus } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface PlaceListProps {
  editMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  localPlaces: Place[];
  setLocalPlaces: React.Dispatch<React.SetStateAction<Place[]>>;
  children?: React.ReactNode;
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
  localPlaces,
  setLocalPlaces,
  children,
}: PlaceListProps) {
  const { 
    activeJourney, 
    isDrawerMaximized, 
    isSearchMode, 
    openSearchMode,
    setFocusedStep,
    setFocusedSegment,
    setAlternativeSegment,
    setFocusBounds
  } = useJourneyStore();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const Scroller = isMobile ? Sheet.Content : 'div';
  const scrollerProps = isMobile ? { disableDrag: !isDrawerMaximized } : {};

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );



  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <Scroller 
        className="flex flex-col items-center justify-center text-center py-12 px-6 flex-1 overflow-y-auto"
      >
        <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
          <MapPin className="w-10 h-10 text-blue-300" strokeWidth={1} />
        </div>
        <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
          아래 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
        </p>
        <div className="w-full mt-6">
          {children}
        </div>
      </Scroller>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalPlaces((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    }
  };

  const transportType = activeJourney.transport_type || 'public';

  return (
    <Scroller 
      {...scrollerProps}
      className={`flex-1 overflow-y-auto scrollbar-sidebar overscroll-none ${
        !isDrawerMaximized && !isMobile ? 'snap-y snap-mandatory' : ''
      }`}
      style={{ paddingBottom: '0.5rem' }}
    >
      <ul className="flex flex-col px-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={localPlaces.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {localPlaces.map((place, idx) => (
              <PlaceCard
                key={place.id}
                place={place}
                index={idx}
                isLast={idx === localPlaces.length - 1}
                editMode={editMode}
                isSelected={selectedIds.includes(place.id)}
                onToggleSelect={() => onToggleSelect(place.id)}
                nextPlace={idx < localPlaces.length - 1 ? localPlaces[idx + 1] : null}
                transportType={transportType}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* 장소 추가 버튼 (이동 카드 위치에 렌더링) */}
        {!editMode && !isSearchMode && (
          <li className="relative pl-11 pr-2 py-3 flex items-center group/add">
            {/* 이전 장소에서 이어지는 타임라인 연결선 */}
            <div className="absolute left-[1.375rem] top-0 bottom-1/2 w-0.5 bg-gradient-to-b from-zinc-200 to-transparent -translate-x-1/2" />
            
            {/* 기존의 까만색 장소 추가 버튼 디자인 */}
            <button
              type="button"
              onClick={() => {
                setFocusedStep?.(null);
                setFocusedSegment?.(null);
                setAlternativeSegment?.(null);
                setFocusBounds?.(null);
                openSearchMode();
              }}
              className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden shadow-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Plus className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300" strokeWidth={2.5} />
              <span className="relative z-10 tracking-wide">장소 추가</span>
            </button>
          </li>
        )}
      </ul>
      {children}
    </Scroller>
  );
}
