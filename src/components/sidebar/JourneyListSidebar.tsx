"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useJourneyStore } from '@/stores/journey-store';
import { useQueryClient } from '@tanstack/react-query';
import { deleteJourneys } from '@/lib/journeys';
import { formatJourneyDate } from '@/lib/journeyUtils';
import type { Journey } from '@/types/journey';
import { useOverscrollDrawer } from '@/hooks/useOverscrollDrawer';
import { Loader2, GripVertical, Pencil, Check, Trash2, Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface SortableJourneyCardProps {
  journey: Journey;
  isListEditMode: boolean;
  selectedIds: string[];
  handleToggleSelect: (id: string) => void;
  setActiveJourney: (journey: Journey) => void;
  formatJourneyDate: (date: any) => string;
  isDrawerMaximized: boolean;
}

function SortableJourneyCard({
  journey,
  isListEditMode,
  selectedIds,
  handleToggleSelect,
  setActiveJourney,
  formatJourneyDate,
  isDrawerMaximized
}: SortableJourneyCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: journey.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transition ? 'transform 150ms cubic-bezier(0.2, 0, 0, 1)' : undefined,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`journey-card-content relative flex items-center w-full bg-white border rounded-2xl shadow-sm transition-colors transition-shadow duration-200 group ${
        !isDrawerMaximized ? 'snap-start snap-always' : ''
      } ${
        isDragging
          ? 'border-blue-400 bg-blue-50/40 z-20'
          : isListEditMode
            ? 'border-zinc-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
            : 'border-zinc-100 hover:border-blue-500 hover:shadow-md'
      } ${isListEditMode && !isDragging ? 'opacity-90' : ''}`}
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
        className={`flex-1 text-left p-5 flex flex-col gap-3 focus:outline-none ${isListEditMode ? 'pl-4' : ''}`}
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
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="pr-4 flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 transition-colors p-1 rounded hover:bg-zinc-100 touch-none drag-handle"
        >
          <GripVertical className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

export default function JourneyListSidebar({ isLoading }: { isLoading: boolean }) {
  const { user, openAuthModal, signOut } = useAuth();
  const {
    journeys,
    setJourneys,
    openCreateForm,
    setActiveJourney,
    clearJourney,
    isDrawerMaximized,
    setDrawerSnapPoint,
  } = useJourneyStore();

  const overscrollHandlers = useOverscrollDrawer();
  const queryClient = useQueryClient();

  const [isListEditMode, setIsListEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localJourneys, setLocalJourneys] = useState<Journey[]>([]);

  useEffect(() => {
    setLocalJourneys(journeys);
  }, [journeys]);

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
    setDrawerSnapPoint(1);
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

  const handleCreateClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }
    openCreateForm();
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalJourneys((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        
        if (user) {
          const orderIds = newItems.map((j) => j.id);
          localStorage.setItem(`journey_order_${user.id}`, JSON.stringify(orderIds));
        }
        setJourneys(newItems);
        return newItems;
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    }
  };

  return (
    <aside className="w-full md:w-[35%] md:min-w-[380px] md:max-w-[480px] h-full flex flex-col bg-white md:border-r border-zinc-100 md:shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
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

      {!isLoading && (
        <div className={`px-8 py-3.5 border-b border-zinc-100/80 flex items-center justify-between text-xs font-semibold flex-shrink-0 drawer-drag-area cursor-grab active:cursor-grabbing touch-none ${isListEditMode ? 'bg-white' : 'bg-white/80 backdrop-blur-xl'}`}>
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
                <Check className="w-4 h-4" strokeWidth={2.5} />
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
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
                편집
              </button>
            </>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={localJourneys.map(j => j.id)}
              strategy={verticalListSortingStrategy}
            >
              {localJourneys.map((journey) => (
                <SortableJourneyCard
                  key={journey.id}
                  journey={journey}
                  isListEditMode={isListEditMode}
                  selectedIds={selectedIds}
                  handleToggleSelect={handleToggleSelect}
                  setActiveJourney={setActiveJourney}
                  formatJourneyDate={formatJourneyDate}
                  isDrawerMaximized={isDrawerMaximized}
                />
              ))}
            </SortableContext>
          </DndContext>
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
            <Trash2 className="w-4 h-4" strokeWidth={2.5} />
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
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span className="tracking-wide">새 여정 만들기</span>
            </button>
          </div>
        )
      )}
    </aside>
  );
}
