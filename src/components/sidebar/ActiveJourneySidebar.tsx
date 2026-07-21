"use client";

import { useEffect, useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useDialog } from '@/providers/DialogProvider';
import PlaceList from '@/components/PlaceList';
import EditJourneyModal from '@/components/EditJourneyModal';
import type { Journey, Place } from '@/types/journey';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { motion } from 'framer-motion';

import JourneyPlayerHeader from './JourneyPlayerHeader';
import SearchOverlay from './SearchOverlay';
import SidebarBottomActions from './SidebarBottomActions';

interface ActiveJourneySidebarProps {
  activeJourney: Journey;
  scrollProgress?: any; // MotionValue<number>
}

export default function ActiveJourneySidebar({ activeJourney, scrollProgress }: ActiveJourneySidebarProps) {
  const {
    reorderPlaces,
    isEditMode,
    setEditMode,
    isSearchMode,
    drawerSnapPoint,
  } = useJourneyStore();

  const isMobile = useMediaQuery('(max-width: 767px)');
  
  // Track viewport height for absolute pixel animations (Framer Motion doesn't interpolate hybrid calc/% height values well)
  const [windowHeight, setWindowHeight] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const snapPx = drawerSnapPoint === 1 || drawerSnapPoint === '1'
    ? windowHeight - 16
    : typeof drawerSnapPoint === 'number'
      ? drawerSnapPoint
      : parseInt(String(drawerSnapPoint), 10) || 0;

  let currentSnapType: 'min' | 'default' | 'max' = 'default';
  const minSnapPx = activeJourney ? 133 : 62;
  if (snapPx === minSnapPx) currentSnapType = 'min';
  else if (snapPx === windowHeight - 16) currentSnapType = 'max';

  // Use 76px header height for Edit Mode, 126px for Normal Player Mode (due to media controls overlay)
  const headerHeight = isEditMode ? 76 : 126;

  const contentMaxHeight = isMobile && snapPx > 0
    ? `${Math.max(0, snapPx - 26 - headerHeight)}px`
    : '100%';

  const { confirm, alert } = useDialog();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [localPlaces, setLocalPlaces] = useState<Place[]>([]);

  // Reset isEditMode and selectedPlaceIds when activeJourney changes
  useEffect(() => {
    setEditMode(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPlaceIds([]);
  }, [activeJourney?.id, setEditMode]);

  // Sync localPlaces with activeJourney.places when not in edit mode
  useEffect(() => {
    if (!isEditMode && activeJourney?.places) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalPlaces(activeJourney.places);
    }
  }, [activeJourney?.places, isEditMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPlaceIds([]);
  }, [isEditMode]);

  const handleDeleteSelectedPlaces = async () => {
    if (selectedPlaceIds.length === 0 || !activeJourney) return;
    const confirmed = await confirm({
      message: `선택한 ${selectedPlaceIds.length}개의 장소를 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      variant: 'destructive',
    });
    if (!confirmed) {
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
      await alert('장소 삭제에 실패했습니다.');
    }
  };

  const handleDoneEdit = async () => {
    if (activeJourney) {
      try {
        await reorderPlaces(localPlaces);
      } catch (err) {
        console.error('순서 변경 저장 실패:', err);
        await alert('순서 변경 저장에 실패했습니다.');
      }
    }
    setEditMode(false);
  };

  const innerContent = (
    <div className="flex flex-col w-full h-full bg-white">
      <JourneyPlayerHeader
        activeJourney={activeJourney}
        isSearchMode={isSearchMode}
        setIsEditModalOpen={setIsEditModalOpen}
        handleDoneEdit={handleDoneEdit}
      />

      <div
        className="flex-1 flex flex-col min-h-0 relative"
        style={{ maxHeight: contentMaxHeight }}
      >
        <motion.div
          variants={{
            min: { opacity: 0, y: 15, pointerEvents: 'none' as const, transition: { duration: 0.2, ease: 'easeOut' } },
            default: { opacity: 1, y: 0, pointerEvents: 'auto' as const, transition: { duration: 0.3, ease: 'easeOut' } },
            max: { opacity: 1, y: 0, pointerEvents: 'auto' as const, transition: { duration: 0.3, ease: 'easeOut' } },
          }}
          animate={currentSnapType}
          className="flex-1 flex flex-col min-h-0 w-full h-full"
        >
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
            scrollProgress={scrollProgress}
          >
            {!isSearchMode && (
              <SidebarBottomActions
                isEditMode={isEditMode}
                selectedPlaceIds={selectedPlaceIds}
                handleDeleteSelectedPlaces={handleDeleteSelectedPlaces}
              />
            )}
          </PlaceList>
        </motion.div>

        <SearchOverlay activeJourney={activeJourney} />
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? innerContent : (
        <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] flex flex-col h-full bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
          {innerContent}
        </aside>
      )}

      <EditJourneyModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        journey={activeJourney}
      />
    </>
  );
}
