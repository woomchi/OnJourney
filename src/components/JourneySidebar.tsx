"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { CustomBottomSheet, useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { motion, useTransform, useMotionValue } from 'framer-motion';
import { useDialog } from '@/providers/DialogProvider';
import HorizontalJourneyTimelineBar from '@/components/sidebar/HorizontalJourneyTimelineBar';
import JourneyControlFloatingBar from '@/components/sidebar/JourneyControlFloatingBar';
import FixedJourneyTimelineSheet from '@/components/sidebar/FixedJourneyTimelineSheet';
import EditJourneyModal from '@/components/EditJourneyModal';
import CreateJourneyModal from '@/components/CreateJourneyModal';
import ActiveJourneySidebar from '@/components/sidebar/ActiveJourneySidebar';
import JourneyListSidebar from '@/components/sidebar/JourneyListSidebar';
import AuthModal from '@/components/AuthModal';
import { useJourneys } from '@/hooks/queries/useJourneys';
import { useQueryClient } from '@tanstack/react-query';
import { sortJourneysByStoredOrder } from '@/lib/journeyUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Plus, X } from 'lucide-react';

const FloatingButtonsContainer = () => {
  const bottomSheet = useOptionalBottomSheet();
  const fallbackY = useMotionValue(0);
  const y = bottomSheet?.y || fallbackY;
  const maxHeight = bottomSheet?.maxHeight ?? 800;
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

const CreateJourneyFloatingButton = ({ show, onClick, PlusIcon, y, minHeight }: { show: boolean, onClick: () => void, PlusIcon: any, y: any, minHeight: number }) => {
  const opacity = useTransform(y, [-minHeight - 20, -minHeight - 100], [0, 1]);
  const pointerEvents = useTransform(y, (latest: number) => latest > -minHeight - 50 ? 'none' : 'auto');

  const translateY = useTransform(y, [-minHeight, 0], [0, 120], { clamp: true });

  if (!show) return null;

  return (
    <motion.div
      className="fixed bottom-[20px] left-4 right-4 z-[101] md:hidden"
      style={{ opacity, y: translateY, pointerEvents: pointerEvents as any }}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full py-4 bg-zinc-950/90 hover:bg-zinc-900 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:shadow-xl transition-all cursor-pointer flex justify-center items-center gap-2 backdrop-blur-md border border-white/10"
      >
        <PlusIcon className="w-4.5 h-4.5" strokeWidth={2.5} />
        <span className="tracking-wide">여정 추가</span>
      </button>
    </motion.div>
  );
};

const AddPlaceFloatingButton = ({ show, onClick, PlusIcon }: { show: boolean, onClick: () => void, PlusIcon: any }) => {
  if (!show) return null;

  return (
    <div className="fixed bottom-[20px] left-4 right-4 z-[101] md:hidden pointer-events-auto">
      <button
        type="button"
        onClick={onClick}
        className="w-full py-4 bg-zinc-950/90 hover:bg-zinc-900 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:shadow-xl transition-all cursor-pointer flex justify-center items-center gap-2 backdrop-blur-md border border-white/10"
      >
        <PlusIcon className="w-4.5 h-4.5" strokeWidth={2.5} />
        <span className="tracking-wide">장소 추가</span>
      </button>
    </div>
  );
};

const CloseSearchFloatingButton = ({ onClick }: { onClick: () => void }) => (
  <div className="fixed bottom-[20px] left-4 right-4 z-[200] md:hidden pointer-events-auto">
    <button
      type="button"
      onClick={onClick}
      className="
        w-full py-3.5 rounded-2xl font-bold text-[15px] tracking-wide
        flex justify-center items-center gap-2 cursor-pointer
        transition-all duration-200 active:scale-[0.98]
        bg-zinc-900/90 hover:bg-zinc-800 text-white
        shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:shadow-xl
        backdrop-blur-md border border-white/10
      "
    >
      <X className="w-4 h-4" strokeWidth={2.5} />
      <span>닫기</span>
    </button>
  </div>
);

const parseSnapVal = (s: any): number => {
  if (s === 1 || s === '1') return 1;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') return parseInt(s, 10) || 0;
  return 0;
};

export default function JourneySidebar() {
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const y = useMotionValue(0);
  const scrollProgress = useMotionValue(1); // 1: 최하단, 0: 최하단 아님 (React 리렌더링 병목 제거용 MotionValue)
  const { alert } = useDialog();
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
    setEditMode,
    reorderPlaces,
    openCreateForm,
    journeys,
    isSearchMode,
    openSearchMode,
    closeSearchMode,
    setFocusedStep,
    setFocusedSegment,
    setAlternativeSegment,
    setFocusBounds,
  } = useJourneyStore();
  const [mounted, setMounted] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [snap, setSnap] = useState<number | string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const wasActiveJourneyRef = useRef(activeJourney);
  const prevSearchModeRef = useRef(isSearchMode);

  const getSearchMinSnap = () => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('onjourney_recent_queries');
        const parsed = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed) && parsed.length > 0) return 114;
      } catch (e) { }
    }
    return 74;
  };

  useEffect(() => {
    if (isSearchMode && !prevSearchModeRef.current) {
      setSnap(getSearchMinSnap());
    } else if (!isSearchMode && prevSearchModeRef.current) {
      setSnap(activeJourney ? 370 : 360);
    }
    prevSearchModeRef.current = isSearchMode;
  }, [isSearchMode, activeJourney]);

  /* eslint-disable react-hooks/set-state-in-effect */
  // Initialize snap point on mount based on existing store state or activeJourney
  useEffect(() => {
    if (activeJourney !== wasActiveJourneyRef.current) {
      setSnap(activeJourney ? 370 : 360);
      wasActiveJourneyRef.current = activeJourney;
    } else if (snap === null) {
      // Use existing drawerSnapPoint if available (from persistence), otherwise fallback
      const storeSnap = useJourneyStore.getState().drawerSnapPoint;
      setSnap(storeSnap !== null && storeSnap !== undefined ? storeSnap : (activeJourney ? 370 : 360));
    }
  }, [activeJourney, snap]);

  // Adjust snap point automatically when activeJourney changes
  useEffect(() => {
    const parsed = parseSnapVal(snap);
    if (activeJourney) {
      if (parsed === 360) setSnap(370);
      else if (parsed === 62) setSnap(133);
    } else {
      if (parsed === 370) setSnap(360);
      else if (parsed === 133) setSnap(62);
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
  const { data: fetchedJourneys, isLoading: isJourneysLoading } = useJourneys(user?.id);

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
    if (authLoading) return;

    if (!user) {
      clearJourney();
      setJourneys([]);
      return;
    }

    if (fetchedJourneys) {
      const sorted = sortJourneysByStoredOrder(fetchedJourneys, user.id);
      setJourneys(sorted);
    }
  }, [user, authLoading, fetchedJourneys, clearJourney, setJourneys]);

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

  const isLoading = authLoading || (!!user && isJourneysLoading);

  const minSnapPx = isSearchMode
    ? getSearchMinSnap()
    : (activeJourney ? 133 : 62);

  const defaultSnapPx = isSearchMode
    ? (windowHeight ? Math.round(windowHeight * 0.62) : 500)
    : (activeJourney ? 370 : 360);



  const content = activeJourney ? (
    <ActiveJourneySidebar activeJourney={activeJourney} scrollProgress={scrollProgress} />
  ) : (
    <JourneyListSidebar isLoading={isLoading} />
  );

  // Defer rendering until client-side hydration is complete to prevent hydration mismatches
  if (!mounted) {
    return (
      <>
        <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] h-full flex flex-col bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 relative">
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
    const minSnapPx = isSearchMode ? getSearchMinSnap() : (activeJourney ? 133 : 62);
    const defaultSnapPx = isSearchMode
      ? (windowHeight ? Math.round(windowHeight * 0.62) : 500)
      : (activeJourney ? 370 : 360);

    const parsedSnap = parseSnapVal(snap);
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (parsedSnap === minSnapPx) currentSnapType = 'min';
    else if (parsedSnap === 1) currentSnapType = 'max';

    const showFloatingCreateButton = !activeJourney && journeys.length > 0 && !isEditMode;
    const showFloatingAddPlaceButton = !!activeJourney && !isEditMode && !isSearchMode;
    const isDefaultSnap = snap === defaultSnapPx || snap === `${defaultSnapPx}px`;

    const handleCreateClick = () => {
      if (!user) {
        openAuthModal();
        return;
      }
      openCreateForm();
    };

    const handleAddPlaceClick = () => {
      setFocusedStep(null);
      setFocusedSegment(null);
      setAlternativeSegment(null);
      setFocusBounds(null);
      openSearchMode();
    };

    if (activeJourney) {
      return (
        <>
          {/* 모바일 하단 초슬림 고정 높이 바텀 시트 (기본 탐색 모드일 때) */}
          {!isSearchMode && !isEditMode && (
            <FixedJourneyTimelineSheet
              activeJourney={activeJourney}
              setIsEditModalOpen={setIsEditModalOpen}
            />
          )}

          {/* 편집 모드 또는 검색 모드 시 바텀 시트 노출 */}
          {(isSearchMode || isEditMode) && (
            <CustomBottomSheet
              isOpen={!focusedSegment && !alternativeSegment}
              minHeight={minSnapPx}
              defaultHeight={defaultSnapPx}
              maxHeight={windowHeight - 16}
              initialSnap={currentSnapType}
              zIndex={30}
              y={y}
              onSnap={(snapName) => {
                if (snapName === 'min') setSnap(minSnapPx);
                else if (snapName === 'default') setSnap(defaultSnapPx);
                else if (snapName === 'max') setSnap(1);
              }}
            >
              <FloatingButtonsContainer />
              {content}
            </CustomBottomSheet>
          )}

          <EditJourneyModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            journey={activeJourney}
          />
          <CreateJourneyModal />
          <AuthModal />
        </>
      );
    }

    return (
      <>
        <CustomBottomSheet
          isOpen={!focusedSegment && !alternativeSegment}
          minHeight={minSnapPx}
          defaultHeight={defaultSnapPx}
          maxHeight={windowHeight - 16}
          initialSnap={currentSnapType}
          zIndex={30}
          y={y}
          onSnap={(snapName) => {
            if (snapName === 'min') setSnap(minSnapPx);
            else if (snapName === 'default') setSnap(defaultSnapPx);
            else if (snapName === 'max') setSnap(1);
          }}
        >
          <FloatingButtonsContainer />
          {content}
        </CustomBottomSheet>

        <CreateJourneyFloatingButton
          show={showFloatingCreateButton}
          onClick={handleCreateClick}
          PlusIcon={Plus}
          y={y}
          minHeight={minSnapPx}
        />

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
