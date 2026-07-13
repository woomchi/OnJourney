"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import PlaceCard from './places/PlaceCard';
import { MapPin } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
  const { activeJourney, isDrawerMaximized } = useJourneyStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <div 
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
      </div>
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
    <div 
      className={`flex-1 overflow-y-auto scrollbar-sidebar overscroll-none ${
        !isDrawerMaximized ? 'snap-y snap-mandatory' : ''
      }`}
      style={{ paddingBottom: isDrawerMaximized ? '0.5rem' : 'calc(0.5rem + var(--drawer-hidden-height, 0px))' }}
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
      </ul>
      {children}
    </div>
  );
}
