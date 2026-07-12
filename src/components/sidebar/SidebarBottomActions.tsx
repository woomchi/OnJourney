"use client";

import { useJourneyStore } from '@/stores/journey-store';

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
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
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
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="relative z-10 tracking-wide">장소 추가</span>
        </button>
      )}
    </div>
  );
}
