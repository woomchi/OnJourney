"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { CustomBottomSheet, useBottomSheet } from '@/components/common/CustomBottomSheet';
import { motion, useTransform } from 'framer-motion';
import CreateJourneyModal from '@/components/CreateJourneyModal';
import ActiveJourneySidebar from '@/components/sidebar/ActiveJourneySidebar';
import JourneyListSidebar from '@/components/sidebar/JourneyListSidebar';
import AuthModal from '@/components/AuthModal';
import { useJourneys } from '@/hooks/queries/useJourneys';
import { useQueryClient } from '@tanstack/react-query';
import { sortJourneysByStoredOrder } from '@/lib/journeyUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Plus } from 'lucide-react';

const FloatingButtonsContainer = () => {
  const { y, maxHeight } = useBottomSheet();
  const opacity = useTransform(y, [-360, -maxHeight + 100], [1, 0]);
  const pointerEvents = useTransform(y, (latest: number) => latest < -400 ? 'none' : 'auto');
  return (
    <motion.div 
      id="mobile-map-buttons-target"
      className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] *:pointer-events-auto"
      style={{ opacity, pointerEvents: pointerEvents as any }}
    />
  );
};

const CreateJourneyFloatingButton = ({ show, onClick, PlusIcon }: { show: boolean, onClick: () => void, PlusIcon: any }) => {
  const { y, minHeight } = useBottomSheet();
  const opacity = useTransform(y, [-minHeight - 20, -minHeight - 100], [0, 1]);
  const translateY = useTransform(y, [-minHeight - 20, -minHeight - 100], [120, 0]);
  const pointerEvents = useTransform(y, (latest: number) => latest > -minHeight - 50 ? 'none' : 'auto');

  if (!show) return null;

  return (
    <motion.div 
      className="fixed bottom-5 left-4 right-4 z-[101] md:hidden"
      style={{ opacity, y: translateY, pointerEvents: pointerEvents as any }}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full py-4 bg-zinc-950/90 hover:bg-zinc-900 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:shadow-xl transition-all cursor-pointer flex justify-center items-center gap-2 backdrop-blur-md border border-white/10"
      >
        <PlusIcon className="w-4.5 h-4.5" strokeWidth={2.5} />
        <span className="tracking-wide">새 여정 만들기</span>
      </button>
    </motion.div>
  );
};

export default function JourneySidebar() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const {
    setJourneys,
    activeJourney,
    clearJourney,
    isSyncing,
    setDrawerMaximized,
    setDrawerSnapPoint,
    focusedSegment,
    alternativeSegment,
    isEditMode,
    openCreateForm,
    journeys,
  } = useJourneyStore();
  const [mounted, setMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [snap, setSnap] = useState<number | string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const wasActiveJourneyRef = useRef(activeJourney);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Initialize snap point on mount based on existing store state or activeJourney
  useEffect(() => {
    if (activeJourney !== wasActiveJourneyRef.current) {
      setSnap(activeJourney ? '370px' : '360px');
      wasActiveJourneyRef.current = activeJourney;
    } else if (snap === null) {
      // Use existing drawerSnapPoint if available (from persistence), otherwise fallback
      const storeSnap = useJourneyStore.getState().drawerSnapPoint;
      setSnap(storeSnap !== null && storeSnap !== undefined ? storeSnap : (activeJourney ? '370px' : '360px'));
    }
  }, [activeJourney, snap]);

  // Adjust snap point automatically when activeJourney changes
  useEffect(() => {
    if (activeJourney) {
      if (snap === '360px') setSnap('370px');
      else if (snap === '84px') setSnap('136px');
    } else {
      if (snap === '370px') setSnap('360px');
      else if (snap === '136px') setSnap('84px');
    }
  }, [activeJourney, snap]);


  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isMobile) {
      setDrawerMaximized(false);
      setDrawerSnapPoint(null);
    } else if (snap !== null) {
      setDrawerMaximized(String(snap) === '1' || snap === 1);
      setDrawerSnapPoint(snap);
    }
  }, [snap, isMobile, setDrawerMaximized, setDrawerSnapPoint]);

  // Sync snap with drawerSnapPoint if it changes externally (e.g. via overscroll)
  const { drawerSnapPoint } = useJourneyStore();
  useEffect(() => {
    if (drawerSnapPoint !== undefined && drawerSnapPoint !== snap && isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnap(drawerSnapPoint);
    }
  }, [drawerSnapPoint, isMobile]);

  const queryClient = useQueryClient();
  const { data: fetchedJourneys, isLoading: isJourneysLoading } = useJourneys();

  // 렌더링 후 화면 높이 계산을 위한 상태
  const [windowHeight, setWindowHeight] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // React Query 데이터가 로드되면 Zustand 스토어(UI)와 동기화
  useEffect(() => {
    if (!user) {
      clearJourney();
      setJourneys([]);
      return;
    }

    if (fetchedJourneys) {
      const sorted = sortJourneysByStoredOrder(fetchedJourneys, user.id);
      setJourneys(sorted);
    }
  }, [user, fetchedJourneys, clearJourney, setJourneys]);

  // DB 동기화 완료 시 React Query 캐시를 최신화하여 스토어 덮어쓰기 방지
  const prevSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing) {
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
    }
    prevSyncingRef.current = isSyncing;
  }, [isSyncing, queryClient]);

  // DB 동기화 중(저장 중) 브라우저 이탈 방지 경고
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSyncing) {
        e.preventDefault();
        e.returnValue = '현재 여정을 저장하는 중입니다. 저장 전에 페이지를 벗어나면 변경사항이 저장되지 않을 수 있습니다.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isSyncing]);

  const isLoading = authLoading || isJourneysLoading;

  const minSnapPx = activeJourney ? 136 : 84;
  const defaultSnapPx = activeJourney ? 370 : 360;



  const content = activeJourney ? (
    <ActiveJourneySidebar activeJourney={activeJourney} />
  ) : (
    <JourneyListSidebar isLoading={isLoading} />
  );

  // Defer rendering until client-side hydration is complete to prevent hydration mismatches
  if (!mounted) {
    return (
      <>
        <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] h-full flex flex-col bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
          <header className="hidden md:block px-8 py-7 border-b border-zinc-100/80 bg-white/50 backdrop-blur-md flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <img src="/service_logo2.png" alt="On-Journey Logo" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600">
                  On-Journey
                </h1>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors bg-blue-50 px-3 py-1.5 rounded-full"
              >
                로그인
              </button>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-6 h-6 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-zinc-400 font-medium">불러오는 중...</p>
            </div>
          </div>
        </aside>

        <CreateJourneyModal />
        <AuthModal />
      </>
    );
  }

  if (isMobile) {
    const minSnapPx = activeJourney ? 136 : 84;
    const defaultSnapPx = activeJourney ? 370 : 360;

    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (snap === minSnapPx || snap === `${minSnapPx}px`) currentSnapType = 'min';
    else if (snap === 1 || snap === '1') currentSnapType = 'max';

    const showFloatingCreateButton = !activeJourney && journeys.length > 0 && !isEditMode;

    const handleCreateClick = () => {
      if (!user) {
        openAuthModal();
        return;
      }
      openCreateForm();
    };

    return (
      <>
        <CustomBottomSheet
          isOpen={!focusedSegment && !alternativeSegment}
          minHeight={minSnapPx}
          defaultHeight={defaultSnapPx}
          maxHeight={windowHeight - 16}
          initialSnap={currentSnapType}
          zIndex={30}
          onSnap={(snapName) => {
            if (snapName === 'min') setSnap(`${minSnapPx}px`);
            else if (snapName === 'default') setSnap(`${defaultSnapPx}px`);
            else if (snapName === 'max') setSnap(1);
          }}
        >
          <FloatingButtonsContainer />
          <CreateJourneyFloatingButton 
            show={showFloatingCreateButton} 
            onClick={handleCreateClick} 
            PlusIcon={Plus}
          />
          {content}
        </CustomBottomSheet>
        
        <CreateJourneyModal />
        <AuthModal />
      </>
    );
  }

  return (
    <>
      {content}
      <CreateJourneyModal />
      <AuthModal />
    </>
  );
}
