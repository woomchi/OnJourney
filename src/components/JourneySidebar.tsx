"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { useJourneys } from '@/hooks/queries/useJourneys';
import { useQueryClient } from '@tanstack/react-query';
import { sortJourneysByStoredOrder } from '@/lib/journeyUtils';
import CreateJourneyModal from '@/components/CreateJourneyModal';
import AuthModal from '@/components/AuthModal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ActiveJourneySidebar from '@/components/sidebar/ActiveJourneySidebar';
import JourneyListSidebar from '@/components/sidebar/JourneyListSidebar';

export default function JourneySidebar() {
  const { user, loading: authLoading } = useAuth();
  const {
    setJourneys,
    activeJourney,
    clearJourney,
    isSyncing,
    setDrawerMaximized,
    setDrawerSnapPoint,
    focusedSegment,
  } = useJourneyStore();
  const [mounted, setMounted] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [snap, setSnap] = useState<number | string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const wasActiveJourneyRef = useRef(activeJourney);

  // Initialize snap point on mount based on activeJourney
  useEffect(() => {
    if (activeJourney !== wasActiveJourneyRef.current) {
      setSnap(activeJourney ? '360px' : '294px');
      wasActiveJourneyRef.current = activeJourney;
    } else if (snap === null) {
      setSnap(activeJourney ? '360px' : '294px');
    }
  }, [activeJourney, snap]);

  // Adjust snap point automatically when activeJourney changes
  useEffect(() => {
    if (activeJourney) {
      if (snap === '294px') setSnap('360px');
      else if (snap === '74px') setSnap('126px');
    } else {
      if (snap === '360px') setSnap('294px');
      else if (snap === '126px') setSnap('74px');
    }
  }, [activeJourney, snap]);
  
  const prevFocusedSegmentRef = useRef(focusedSegment);
  
  // Adjust snap point automatically when a segment is focused (to show RouteGuidePanel without overlap)
  useEffect(() => {
    if (!isMobile) return;
    const isCurrentlyFocused = !!focusedSegment;
    const wasFocused = !!prevFocusedSegmentRef.current;
    
    if (isCurrentlyFocused && !wasFocused) {
      setSnap(activeJourney ? '126px' : '74px');
    } else if (!isCurrentlyFocused && wasFocused) {
      setSnap(activeJourney ? '360px' : '294px');
    }
    prevFocusedSegmentRef.current = focusedSegment;
  }, [focusedSegment, isMobile, activeJourney]);
  
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
      setSnap(drawerSnapPoint);
    }
  }, [drawerSnapPoint, isMobile]);
  
  const queryClient = useQueryClient();
  const { data: fetchedJourneys, isLoading: isJourneysLoading } = useJourneys();

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
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const minSnapPx = activeJourney ? 126 : 74;
    const defaultSnapPx = activeJourney ? 360 : 294;
    const maxSnapPx = windowHeight - 12;
    
    const getCurrentSnapPx = () => {
      if (snap === 1 || snap === '1') return maxSnapPx;
      if (typeof snap === 'string' && snap.endsWith('px')) {
        return parseInt(snap, 10);
      }
      if (typeof snap === 'number') {
        return snap;
      }
      return defaultSnapPx;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      
      // Allow dragging only from the handle or a designated drag area
      const isDragArea = target.closest('.drawer-drag-area') || target.closest('.drawer-handle');
      if (!isDragArea) return;

      // Prevent capturing if clicking on interactive elements
      if (target.closest('button') || target.closest('a') || target.closest('input')) return;
      
      e.currentTarget.setPointerCapture(e.pointerId);
      touchStartY.current = e.clientY;
      setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (touchStartY.current === null) return;
      const diff = e.clientY - touchStartY.current;
      
      const currentPx = getCurrentSnapPx();
      
      if (currentPx === maxSnapPx && diff < 0) {
        setDragY(Math.sign(diff) * Math.pow(Math.abs(diff), 0.98));
      } else if (currentPx === minSnapPx && diff > 0) {
        setDragY(Math.sign(diff) * Math.pow(Math.abs(diff), 0.98));
      } else {
        setDragY(diff);
      }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      if (touchStartY.current === null) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      
      const currentPx = getCurrentSnapPx();
      const threshold = 25;

      if (dragY < -threshold) {
        if (currentPx === minSnapPx) setSnap(`${defaultSnapPx}px`);
        else if (currentPx === defaultSnapPx) setSnap(1);
      } else if (dragY > threshold) {
        if (currentPx === maxSnapPx) setSnap(`${defaultSnapPx}px`);
        else if (currentPx === defaultSnapPx) setSnap(`${minSnapPx}px`);
      }
      
      setDragY(0);
      setIsDragging(false);
      touchStartY.current = null;
    };

    let currentActiveSnapPoint = snap ?? `${defaultSnapPx}px`;
    if (currentActiveSnapPoint === '1') currentActiveSnapPoint = 1;

    const currentPx = getCurrentSnapPx();
    const baseTranslateY = maxSnapPx - currentPx;
    const hiddenHeight = currentPx === maxSnapPx ? '0px' : `${maxSnapPx - currentPx}px`;

    return (
      <>
        <div 
          className="fixed bottom-0 left-0 right-0 z-20 flex flex-col bg-white rounded-t-[20px] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] outline-none border-t border-zinc-200"
          style={{
            height: `${maxSnapPx}px`,
            transform: `translateY(${baseTranslateY + dragY}px)`,
            transition: isDragging ? 'none' : 'transform 400ms cubic-bezier(0.34, 1.2, 0.64, 1)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Portal Target for Map Buttons */}
          <div 
            id="mobile-map-buttons-target" 
            className={`absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] transition-all duration-300 ${
              (snap === 1 || snap === '1') ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-none *:pointer-events-auto'
            }`} 
          />
          
          <div className="drawer-handle flex-shrink-0 touch-none flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing w-full absolute top-0 z-[100]">
            <div className="w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-300 pointer-events-none" />
          </div>

          <div 
            className="flex-1 overflow-hidden flex flex-col pt-7"
            style={{ '--drawer-hidden-height': hiddenHeight } as React.CSSProperties}
          >
            {content}
          </div>
        </div>
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
