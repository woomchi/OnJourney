"use client";

import { useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import PlaceCard from './places/PlaceCard';

interface PlaceListProps {
  editMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  localPlaces: Place[];
  setLocalPlaces: React.Dispatch<React.SetStateAction<Place[]>>;
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
  localPlaces,
  setLocalPlaces,
}: PlaceListProps) {
  const { activeJourney } = useJourneyStore();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-6 flex-1">
        <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
            className="w-10 h-10 text-blue-300"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
          아래 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
        </p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!editMode) {
      e.preventDefault();
      return;
    }

    // Find the clean card element to use as the drag preview
    const cardElement = (e.currentTarget as HTMLElement).querySelector('.place-card-content');
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      e.dataTransfer.setDragImage(cardElement, x, y);
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!editMode) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Shift places dynamically
    const updated = [...localPlaces];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setLocalPlaces(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const transportType = activeJourney.transport_type || 'public';

  return (
    <div className="flex-1 overflow-y-auto pt-4 pb-2 scrollbar-sidebar">
      <ul className="flex flex-col px-2">
        {localPlaces.map((place, idx) => (
          <PlaceCard
            key={place.id}
            place={place}
            index={idx}
            isLast={idx === localPlaces.length - 1}
            editMode={editMode}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            isDragged={draggedIndex === idx}
            isSelected={selectedIds.includes(place.id)}
            onToggleSelect={() => onToggleSelect(place.id)}
            nextPlace={idx < localPlaces.length - 1 ? localPlaces[idx + 1] : null}
            transportType={transportType}
          />
        ))}
      </ul>
    </div>
  );
}
