"use client";

import { useJourneyStore } from '@/stores/journey-store';
import { Trash2, Plus } from 'lucide-react';

interface SidebarBottomActionsProps {
  isEditMode: boolean;
  selectedPlaceIds: string[];
  handleDeleteSelectedPlaces: () => void;
}

export default function SidebarBottomActions({
  isEditMode,
  selectedPlaceIds,
  handleDeleteSelectedPlaces,
}: SidebarBottomActionsProps) {
  const {
    setFocusedStep,
    setFocusedSegment,
    setAlternativeSegment,
    setFocusBounds,
    openSearchMode,
  } = useJourneyStore();

  if (!isEditMode) return null;

  return (
    <button
      type="button"
      onClick={handleDeleteSelectedPlaces}
      disabled={selectedPlaceIds.length === 0}
      className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all duration-300 flex justify-center items-center gap-2 ${selectedPlaceIds.length > 0
        ? 'bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(220,38,38,0.15)] cursor-pointer shadow-sm'
        : 'bg-zinc-100 text-zinc-300 cursor-default'
        }`}
    >
      <Trash2 className="w-4 h-4" strokeWidth={2.5} />
      <span className="tracking-wide">
        {selectedPlaceIds.length > 0 ? `선택 삭제 (${selectedPlaceIds.length})` : '삭제'}
      </span>
    </button>
  );
}
