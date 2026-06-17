"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { fetchLatestJourney, fetchJourneys, deleteJourneys } from '@/lib/journeys';
import CreateJourneyModal from '@/components/CreateJourneyModal';
import AuthModal from '@/components/AuthModal';
import PlaceList from '@/components/PlaceList';
import AddPlaceModal from '@/components/AddPlaceModal';
import type { Journey, Place } from '@/types/journey';

function formatJourneyDate(dateStr: string) {
  if (!dateStr || !dateStr.includes('-')) return dateStr || '';
  const [year, month, day] = dateStr.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function sortJourneysByStoredOrder(journeys: Journey[], userId: string): Journey[] {
  if (typeof window === 'undefined') return journeys;
  const orderStr = localStorage.getItem(`journey_order_${userId}`);
  if (!orderStr) return journeys;
  try {
    const orderIds = JSON.parse(orderStr) as string[];
    const idToIndex = new Map(orderIds.map((id, index) => [id, index]));

    return [...journeys].sort((a, b) => {
      const indexA = idToIndex.has(a.id) ? idToIndex.get(a.id)! : -1;
      const indexB = idToIndex.has(b.id) ? idToIndex.get(b.id)! : -1;

      if (indexA === -1 && indexB === -1) {
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
      }
      if (indexA === -1) return -1; // New journeys to the top
      if (indexB === -1) return 1;
      return indexA - indexB;
    });
  } catch (e) {
    return journeys;
  }
}

export default function JourneySidebar() {
  const { user, loading: authLoading, openAuthModal, signOut } = useAuth();
  const {
    journeys,
    setJourneys,
    activeJourney,
    openCreateForm,
    openAddPlace,
    setActiveJourney,
    clearJourney,
    reorderPlaces
  } = useJourneyStore();
  const [isHydrating, setIsHydrating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isListEditMode, setIsListEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);
  const [localPlaces, setLocalPlaces] = useState<Place[]>([]);

  // Drag and drop states for journey list
  const [localJourneys, setLocalJourneys] = useState<Journey[]>([]);
  const [isListDragging, setIsListDragging] = useState(false);
  const draggedJourneyIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      clearJourney();
      setJourneys([]);
      return;
    }

    let cancelled = false;

    const hydrate = async () => {
      setIsHydrating(true);
      try {
        const list = await fetchJourneys();
        if (!cancelled) {
          const sorted = user ? sortJourneysByStoredOrder(list, user.id) : list;
          setJourneys(sorted);
        }
      } catch (err) {
        console.error('여정 목록 로드 실패 (hydrate):', err);
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [user, clearJourney]);

  useEffect(() => {
    if (!user) {
      setJourneys([]);
      return;
    }

    if (activeJourney) {
      return;
    }

    let cancelled = false;
    const loadList = async () => {
      try {
        const list = await fetchJourneys();
        if (!cancelled) {
          const sorted = user ? sortJourneysByStoredOrder(list, user.id) : list;
          setJourneys(sorted);
        }
      } catch (err) {
        console.error('여정 목록 로드 실패:', err);
      }
    };

    loadList();

    return () => {
      cancelled = true;
    };
  }, [user, activeJourney]);

  // Sync localJourneys with journeys when not dragging
  useEffect(() => {
    if (!isListDragging) {
      setLocalJourneys(journeys);
    }
  }, [journeys, isListDragging]);

  // Reset isEditMode and selectedPlaceIds when activeJourney changes (e.g. going back to list, or switching)
  useEffect(() => {
    setIsEditMode(false);
    setSelectedPlaceIds([]);
  }, [activeJourney?.id]);

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
      setIsEditMode(false);
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
    setIsEditMode(false);
  };

  const handleCreateClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    openCreateForm();
  };

  const handleSignOut = async () => {
    await signOut();
    clearJourney();
  };

  const handleStartEdit = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    setIsListEditMode(true);
    setSelectedIds([]);
  };

  const handleCancelEdit = () => {
    setIsListEditMode(false);
    setSelectedIds([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개의 여정을 삭제하시겠습니까?`)) {
      return;
    }
    try {
      setIsHydrating(true);
      await deleteJourneys(selectedIds);
      const list = await fetchJourneys();
      const sorted = user ? sortJourneysByStoredOrder(list, user.id) : list;
      setJourneys(sorted);
      setSelectedIds([]);
      setIsListEditMode(false);
    } catch (err) {
      console.error('여정 삭제 실패:', err);
      alert('여정 삭제에 실패했습니다.');
    } finally {
      setIsHydrating(false);
    }
  };

  // Drag handlers for journey list
  const handleJourneyDragStart = (e: React.DragEvent, index: number) => {
    if (!isListEditMode) {
      e.preventDefault();
      return;
    }
    setIsListDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    draggedJourneyIndexRef.current = index;
  };

  const handleJourneyDragOver = (e: React.DragEvent, index: number) => {
    if (!isListEditMode) return;
    e.preventDefault();
    const draggedIndex = draggedJourneyIndexRef.current;
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...localJourneys];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    draggedJourneyIndexRef.current = index;
    setLocalJourneys(updated);
  };

  const handleJourneyDragEnd = () => {
    setIsListDragging(false);
    draggedJourneyIndexRef.current = null;
    if (user) {
      const orderIds = localJourneys.map((j) => j.id);
      localStorage.setItem(`journey_order_${user.id}`, JSON.stringify(orderIds));
    }
    setJourneys(localJourneys);
  };

  const isLoading = authLoading || isHydrating;

  // Defer rendering until client-side hydration is complete to prevent hydration mismatches
  if (!mounted) {
    return (
      <>
        <aside className="w-[30%] min-w-[320px] max-w-[400px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
          <header className="px-8 py-7 border-b border-zinc-100/80 bg-white/50 backdrop-blur-md flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
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

  // ── 여정이 있는 상태 ──────────────────────────────────
  if (activeJourney) {
    return (
      <>
        <aside className="w-[30%] min-w-[320px] max-w-[400px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
          {/* ── 헤더: 뒤로가기 | 제목 (center) | 편집 ── */}
          <header className="flex items-center border-b border-zinc-100/80 bg-white/60 backdrop-blur-md flex-shrink-0 h-14">
            {/* 뒤로가기 */}
            <button
              type="button"
              onClick={() => clearJourney()}
              className="flex items-center gap-1 px-4 h-full text-zinc-400 hover:text-zinc-700 transition-colors text-xs font-semibold flex-shrink-0 w-20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              뒤로
            </button>

            {/* 여정 제목 (가운데) */}
            <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-1">
              <h2 className="text-sm font-bold text-zinc-900 truncate max-w-full leading-tight">
                {activeJourney.title}
              </h2>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {formatJourneyDate(activeJourney.journey_date)}&nbsp;·&nbsp;
                {activeJourney.transport_type === 'public' ? '대중교통' : '차량'}
              </p>
            </div>

            {/* 편집 */}
            <button
              type="button"
              onClick={isEditMode ? handleDoneEdit : () => setIsEditMode(true)}
              className={`
                flex items-center gap-1 px-4 h-full text-xs font-semibold flex-shrink-0 w-20 justify-end transition-colors
                ${isEditMode ? 'text-blue-600' : 'text-zinc-400 hover:text-zinc-700'}
              `}
            >
              {isEditMode ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  완료
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  편집
                </>
              )}
            </button>
          </header>

          {/* ── 장소 목록 (스크롤 영역) ── */}
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

          {/* ── 하단 고정: 장소 추가 or 삭제 버튼 ── */}
          <div className="p-6 bg-white/80 backdrop-blur-md border-t border-zinc-100 flex-shrink-0">
            {isEditMode ? (
              <button
                type="button"
                onClick={handleDeleteSelectedPlaces}
                disabled={selectedPlaceIds.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all duration-300 flex justify-center items-center gap-2 ${selectedPlaceIds.length > 0
                  ? 'bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(220,38,38,0.15)] cursor-pointer shadow-sm'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
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
                onClick={openAddPlace}
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
        </aside>

        <CreateJourneyModal />
        <AuthModal />
        <AddPlaceModal />
      </>
    );
  }

  // ── 로딩 or 여정 없음 상태 ────────────────────────────
  return (
    <>
      <aside className="w-[30%] min-w-[320px] max-w-[400px] h-full flex flex-col bg-white border-r border-zinc-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">

        {/* 앱 로고 헤더 */}
        <header className="px-8 py-7 border-b border-zinc-100/80 bg-white/50 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                  <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600">
                On-Journey
              </h1>
            </div>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                로그아웃
              </button>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                className="text-xs font-semibold text-blue-500 hover:text-blue-700 transition-colors bg-blue-50 px-3 py-1.5 rounded-full"
              >
                로그인
              </button>
            )}
          </div>
        </header>

        {/* 서비스 로고 밑 작은 바 */}
        {!isLoading && (
          <div className="px-8 py-3.5 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between text-xs font-semibold flex-shrink-0">
            {isListEditMode ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-blue-600 hover:text-blue-700 transition-colors font-bold flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  완료
                </button>
              </>
            ) : (
              <>
                <span className="text-zinc-400 font-normal">총 {journeys.length}개의 여정</span>
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-zinc-500 hover:text-zinc-700 transition-colors flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                  편집
                </button>
              </>
            )}
          </div>
        )}

        {/* 본문 */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-6 h-6 animate-spin text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <p className="text-sm text-zinc-400 font-medium">불러오는 중...</p>
            </div>
          </div>
        ) : journeys.length > 0 ? (
          <div className="flex-1 flex flex-col items-stretch gap-3 px-4 py-6 bg-gradient-to-b from-transparent to-zinc-50/50 overflow-y-auto select-none">
            {localJourneys.map((journey, idx) => {
              const isDragged = draggedJourneyIndexRef.current === idx;
              return (
                <div
                  key={journey.id}
                  draggable={isListEditMode}
                  onDragStart={(e) => handleJourneyDragStart(e, idx)}
                  onDragOver={(e) => handleJourneyDragOver(e, idx)}
                  onDragEnd={handleJourneyDragEnd}
                  className={`flex items-center gap-3 w-full transition-all duration-200 ${isDragged ? 'opacity-40 scale-[0.98]' : ''
                    }`}
                >
                  {isListEditMode && (
                    <input
                      type="checkbox"
                      id={`checkbox-${journey.id}`}
                      checked={selectedIds.includes(journey.id)}
                      onChange={() => handleToggleSelect(journey.id)}
                      className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => !isListEditMode && setActiveJourney(journey)}
                    disabled={isListEditMode}
                    className={`flex-1 text-left bg-white border border-zinc-100 rounded-2xl p-5 shadow-sm transition-all flex flex-col gap-3 group focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${isListEditMode ? 'opacity-90 cursor-default' : 'hover:border-blue-500 hover:shadow-md cursor-pointer'
                      }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full transition-colors group-hover:bg-blue-100">
                        {journey.transport_type === 'public' ? '🚌 대중교통' : '🚗 차량'}
                      </span>
                      <h3 className="text-[15px] font-bold text-zinc-900 mt-2 truncate transition-colors group-hover:text-blue-600">
                        {journey.title}
                      </h3>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-zinc-400 border-t border-zinc-50 pt-2.5 mt-1 w-full">
                      <span>{formatJourneyDate(journey.journey_date)}</span>
                      <span>장소 {journey.places?.length ?? 0}개</span>
                    </div>
                  </button>
                  {isListEditMode && (
                    <div className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 p-2 rounded hover:bg-zinc-100 flex-shrink-0 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-transparent to-zinc-50/50">
            <div className="w-24 h-24 mb-6 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-zinc-800 mb-2">새로운 여정을 시작해볼까요?</p>
            <p className="text-sm text-zinc-500 font-medium leading-relaxed max-w-[240px]">
              {user
                ? '아직 계획된 여정이 없습니다. 지금 바로 당신만의 특별한 경로를 만들어보세요.'
                : '로그인 후 여정을 만들고 저장할 수 있습니다.'}
            </p>
          </div>
        )}

        {/* 여정 생성 or 삭제 버튼 */}
        {!isLoading && (
          <div className="p-6 bg-white/80 backdrop-blur-md border-t border-zinc-100 flex-shrink-0">
            {isListEditMode ? (
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedIds.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all duration-300 flex justify-center items-center gap-2 ${selectedIds.length > 0
                  ? 'bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(220,38,38,0.15)] cursor-pointer shadow-sm'
                  : 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                  }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                <span className="tracking-wide">
                  {selectedIds.length > 0 ? `선택 삭제 (${selectedIds.length})` : '삭제'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreateClick}
                className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 relative z-10 transition-transform group-hover:rotate-90 duration-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="relative z-10 tracking-wide">여정 생성하기</span>
              </button>
            )}
          </div>
        )}
      </aside>

      <CreateJourneyModal />
      <AuthModal />
    </>
  );
}
