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

  return (
    <div className={`px-6 py-4 border-t border-zinc-100 flex-shrink-0 ${isEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-md'}`}>
      {isEditMode ? (
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
      ) : (
        <button
          type="button"
          onClick={() => {
            setFocusedStep(null);
            setFocusedSegment(null);
            setAlternativeSegment(null);
            setFocusBounds(null);
            openSearchMode();
          }}
          className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Plus className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300" strokeWidth={2.5} />
          <span className="relative z-10 tracking-wide">장소 추가</span>
        </button>
      )}
    </div>
  );
}
