"use client";

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { deleteJourneys } from '@/lib/journeys';
import { formatJourneyDate } from '@/lib/journeyUtils';
import type { Journey } from '@/types/journey';
import { useOverscrollDrawer } from '@/hooks/useOverscrollDrawer';

interface JourneyListSidebarProps {
  isLoading: boolean;
}

export default function JourneyListSidebar({ isLoading }: JourneyListSidebarProps) {
  const { user, openAuthModal, signOut } = useAuth();
  const {
    journeys,
    setJourneys,
    openCreateForm,
    setActiveJourney,
    clearJourney,
    isDrawerMaximized,
  } = useJourneyStore();

  const overscrollHandlers = useOverscrollDrawer();
  const queryClient = useQueryClient();

  const [isListEditMode, setIsListEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localJourneys, setLocalJourneys] = useState<Journey[]>([]);
  const [isListDragging, setIsListDragging] = useState(false);
  const draggedJourneyIndexRef = useRef<number | null>(null);
  const [draggedJourneyId, setDraggedJourneyId] = useState<string | null>(null);
  const [droppedJourneyId, setDroppedJourneyId] = useState<string | null>(null);

  // Sync localJourneys with journeys when not dragging
  useEffect(() => {
    if (!isListDragging) {
      setLocalJourneys(journeys);
    }
  }, [journeys, isListDragging]);

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
      await deleteJourneys(selectedIds);
      queryClient.invalidateQueries({ queryKey: ['journeys'] });
      setSelectedIds([]);
      setIsListEditMode(false);
    } catch (err) {
      console.error('여정 삭제 실패:', err);
      alert('여정 삭제에 실패했습니다.');
    }
  };

  // Drag handlers for journey list
  const handleJourneyDragStart = (e: React.DragEvent, index: number) => {
    if (!isListEditMode) {
      e.preventDefault();
      return;
    }

    const cardElement = (e.currentTarget as HTMLElement).querySelector('.journey-card-content');
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Inject floating preview styles momentarily
      cardElement.classList.add('shadow-2xl', 'scale-[1.02]', 'border-blue-200', 'bg-white');
      e.dataTransfer.setDragImage(cardElement, x, y);
      setTimeout(() => {
        cardElement.classList.remove('shadow-2xl', 'scale-[1.02]', 'border-blue-200', 'bg-white');
      }, 0);
    }

    setIsListDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    draggedJourneyIndexRef.current = index;
    setDraggedJourneyId(localJourneys[index]?.id || null);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
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

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(5);
    }
  };

  const handleJourneyDragEnd = () => {
    setIsListDragging(false);
    draggedJourneyIndexRef.current = null;
    if (user) {
      const orderIds = localJourneys.map((j) => j.id);
      localStorage.setItem(`journey_order_${user.id}`, JSON.stringify(orderIds));
    }
    setJourneys(localJourneys);

    if (draggedJourneyId) {
      setDroppedJourneyId(draggedJourneyId);
      // Haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
      setTimeout(() => {
        setDroppedJourneyId((curr) => curr === draggedJourneyId ? null : curr);
      }, 800);
    }
    setDraggedJourneyId(null);
  };

  const handleCreateClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    openCreateForm();
  };

  return (
    <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] h-full flex flex-col bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
      {/* 앱 로고 헤더 */}
      <header className={`hidden md:block px-8 py-7 border-b border-zinc-100/80 flex-shrink-0 ${isListEditMode ? 'bg-white' : 'bg-white/50 backdrop-blur-md'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
              <img src="/service_logo2.png" alt="On-Journey Logo" className="w-full h-full object-contain" />
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
        <div 
          data-vaul-no-drag
          {...overscrollHandlers}
          className={`flex-1 flex flex-col items-stretch gap-3 px-4 pt-1.5 pb-6 bg-gradient-to-b from-transparent to-zinc-50/50 overflow-y-auto select-none scrollbar-sidebar scroll-pt-1.5 scroll-pb-6 overscroll-none ${
            !isDrawerMaximized ? 'snap-y snap-mandatory' : ''
          }`}
          style={{ paddingBottom: isDrawerMaximized ? '1.5rem' : 'calc(1.5rem + var(--drawer-hidden-height, 0px))' }}
        >
          {localJourneys.map((journey, idx) => {
            const isDragged = draggedJourneyId === journey.id;
            const isDropped = droppedJourneyId === journey.id;
            return (
              <div
                key={journey.id}
                draggable={isListEditMode}
                onDragStart={(e) => handleJourneyDragStart(e, idx)}
                onDragOver={(e) => handleJourneyDragOver(e, idx)}
                onDragEnd={handleJourneyDragEnd}
                className={`journey-card-content relative flex items-center w-full bg-white border rounded-2xl shadow-sm transition-all group ${
                  !isDrawerMaximized ? 'snap-start snap-always' : ''
                } ${
                  isDropped
                    ? 'animate-drop-ripple border-blue-400 z-20 shadow-[0_4px_20px_rgba(59,130,246,0.15)]'
                    : isListEditMode
                      ? 'border-zinc-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
                      : 'border-zinc-100 hover:border-blue-500 hover:shadow-md'
                } ${isDragged ? 'opacity-40 scale-[0.98]' : ''} ${isListEditMode ? 'opacity-90' : ''}`}
                onClick={() => {
                  if (isListEditMode) {
                    handleToggleSelect(journey.id);
                  }
                }}
              >
                {isListEditMode && (
                  <div className="pl-4 flex-shrink-0 flex items-center justify-center">
                    <input
                      type="checkbox"
                      id={`checkbox-${journey.id}`}
                      checked={selectedIds.includes(journey.id)}
                      readOnly
                      className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    if (isListEditMode) {
                      e.stopPropagation();
                      handleToggleSelect(journey.id);
                    } else {
                      setActiveJourney(journey);
                    }
                  }}
                  className={`flex-1 text-left p-5 flex flex-col gap-3 focus:outline-none ${isListEditMode ? 'pl-4' : ''
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
                  <div className="pr-4 flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 transition-colors p-1 rounded hover:bg-zinc-100">
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
        <div 
          {...overscrollHandlers}
          className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-transparent to-zinc-50/35 select-none overflow-y-auto"
        >
          <div className="w-16 h-16 rounded-3xl bg-zinc-50 border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center justify-center mb-6 text-2xl">
            ✈️
          </div>
          <h3 className="text-base font-bold text-zinc-800 tracking-tight">여정이 없습니다</h3>
          <p className="text-xs text-zinc-400 mt-2 max-w-[200px] leading-relaxed font-medium">
            새로운 여행 계획을 수립하고 나만의 특별한 여정을 시작해보세요!
          </p>
          <button
            type="button"
            onClick={handleCreateClick}
            className="mt-6 px-6 py-3 bg-zinc-950 hover:bg-zinc-900 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            새 여정 만들기
          </button>
        </div>
      )}

      {/* 하단 고정 버튼 영역 */}
      {isListEditMode ? (
        <div className="p-6 border-t border-zinc-100 bg-white flex-shrink-0">
          <button
            type="button"
            onClick={handleDeleteSelected}
            disabled={selectedIds.length === 0}
            className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all duration-300 flex justify-center items-center gap-2 ${selectedIds.length > 0
              ? 'bg-red-600 hover:bg-red-700 text-white hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(220,38,38,0.15)] cursor-pointer shadow-sm'
              : 'bg-zinc-100 text-zinc-300 cursor-default'
              }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            <span className="tracking-wide">
              {selectedIds.length > 0 ? `선택 삭제 (${selectedIds.length})` : '삭제'}
            </span>
          </button>
        </div>
      ) : (
        journeys.length > 0 && (
          <div className="p-6 border-t border-zinc-100 bg-white flex-shrink-0">
            <button
              type="button"
              onClick={handleCreateClick}
              className="w-full py-4 bg-zinc-950 hover:bg-zinc-900 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer flex justify-center items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="tracking-wide">새 여정 만들기</span>
            </button>
          </div>
        )
      )}
    </aside>
  );
}
