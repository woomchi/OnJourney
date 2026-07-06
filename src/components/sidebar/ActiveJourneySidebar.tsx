"use client";

import { useEffect, useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import PlaceList from '@/components/PlaceList';
import EditJourneyModal from '@/components/EditJourneyModal';
import type { Journey, Place } from '@/types/journey';

import JourneyPlayerHeader from './JourneyPlayerHeader';
import SearchOverlay from './SearchOverlay';
import SidebarBottomActions from './SidebarBottomActions';

interface ActiveJourneySidebarProps {
  activeJourney: Journey;
}

export default function ActiveJourneySidebar({ activeJourney }: ActiveJourneySidebarProps) {
  const {
    reorderPlaces,
    isEditMode,
    setEditMode,
    isSearchMode,
  } = useJourneyStore();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [localPlaces, setLocalPlaces] = useState<Place[]>([]);

  // Reset isEditMode and selectedPlaceIds when activeJourney changes
  useEffect(() => {
    setEditMode(false);
    setSelectedPlaceIds([]);
  }, [activeJourney?.id, setEditMode]);

  // Sync localPlaces with activeJourney.places when not in edit mode
  useEffect(() => {
    if (!isEditMode && activeJourney?.places) {
      setLocalPlaces(activeJourney.places);
    }
  }, [activeJourney?.places, isEditMode]);

  useEffect(() => {
    setSelectedPlaceIds([]);
  }, [isEditMode]);

  const handleDeleteSelectedPlaces = async () => {
    if (selectedPlaceIds.length === 0 || !activeJourney) return;
    if (!confirm(`선택한 ${selectedPlaceIds.length}개의 장소를 삭제하시겠습니까?`)) {
      return;
    }
    try {
      const remainingPlaces = localPlaces.filter(
        (p) => !selectedPlaceIds.includes(p.id)
      );
      await reorderPlaces(remainingPlaces);
      setSelectedPlaceIds([]);
      setEditMode(false);
    } catch (err) {
      console.error('장소 삭제 실패:', err);
      alert('장소 삭제에 실패했습니다.');
    }
  };

  const handleDoneEdit = async () => {
    if (activeJourney) {
      try {
        await reorderPlaces(localPlaces);
      } catch (err) {
        console.error('순서 변경 저장 실패:', err);
        alert('순서 변경 저장에 실패했습니다.');
      }
    }
    setEditMode(false);
  };

  return (
    <>
      <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] h-full flex flex-col bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
        <JourneyPlayerHeader
          activeJourney={activeJourney}
          isSearchMode={isSearchMode}
          setIsEditModalOpen={setIsEditModalOpen}
          handleDoneEdit={handleDoneEdit}
        />

        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          <PlaceList
            editMode={isEditMode}
            selectedIds={selectedPlaceIds}
            onToggleSelect={(id) => {
              setSelectedPlaceIds((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
              );
            }}
            localPlaces={localPlaces}
            setLocalPlaces={setLocalPlaces}
          />

          {!isSearchMode && (
            <SidebarBottomActions
              isEditMode={isEditMode}
              selectedPlaceIds={selectedPlaceIds}
              handleDeleteSelectedPlaces={handleDeleteSelectedPlaces}
            />
          )}

          <SearchOverlay activeJourney={activeJourney} />
        </div>
      </aside>

      <EditJourneyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        journey={activeJourney}
      />
    </>
  );
}
