"use client";

import { useEffect, useState, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useDialog } from '@/providers/DialogProvider';
import PlaceList from '@/components/PlaceList';
import EditJourneyModal from '@/components/EditJourneyModal';
import type { Journey, Place } from '@/types/journey';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { motion, useTransform, useMotionValue } from 'framer-motion';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';

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

  // On Mobile, header is a 32px button bar inside bottom sheet ([< 목록] & [편집])
  const headerHeight = isMobile ? 32 : (isEditMode ? 48 : 72);

  const bottomSheet = useOptionalBottomSheet();
  const fallbackY = useMotionValue(0);
  const activeY = bottomSheet?.y || fallbackY;
  const minHeight = bottomSheet?.minHeight ?? 133;
  const defaultHeight = bottomSheet?.defaultHeight ?? 370;

  const contentHeight = useTransform(activeY, (latest: number) => {
    if (!isMobile) return '100%';
    return `${Math.max(0, -latest - 13 - headerHeight)}px`;
  });

  const contentOpacity = useTransform(activeY, (latest: number) => {
    if (!isMobile) return 1;
    const range = -minHeight - -defaultHeight;
    if (range <= 0) return 1;
    const progress = (-latest - minHeight) / range;
    return Math.min(1, Math.max(0, progress));
  });

  const pointerEvents = useTransform(activeY, (latest: number) => {
    if (!isMobile) return 'auto';
    return latest > -minHeight - 10 ? 'none' : 'auto';
  });

  const { confirm, alert } = useDialog();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [localPlaces, setLocalPlaces] = useState<Place[]>(activeJourney?.places || []);
  const prevJourneyIdRef = useRef(activeJourney?.id);

  // Reset isEditMode and selectedPlaceIds ONLY when activeJourney.id changes to a different journey
  useEffect(() => {
    if (prevJourneyIdRef.current !== activeJourney?.id) {
      prevJourneyIdRef.current = activeJourney?.id;
      setEditMode(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlaceIds([]);
    }
  }, [activeJourney?.id, setEditMode]);

  // Sync localPlaces with activeJourney.places whenever activeJourney.places or isEditMode changes
  useEffect(() => {
    if (activeJourney?.places) {
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

      <div className="flex-1 flex flex-col min-h-0 relative">
        <motion.div
          className="flex-1 flex flex-col min-h-0 w-full h-full"
          style={{
            height: contentHeight,
            opacity: contentOpacity,
            pointerEvents: pointerEvents as any
          }}
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
