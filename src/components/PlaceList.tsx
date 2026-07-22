"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import PlaceCard from './places/PlaceCard';
import { MapPin, Plus } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import React, { useEffect } from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { useSnapScrollBridge } from '@/hooks/ui/useSnapScrollBridge';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

interface PlaceListProps {
  editMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  localPlaces: Place[];
  setLocalPlaces: React.Dispatch<React.SetStateAction<Place[]>>;
  children?: React.ReactNode;
  scrollProgress?: any; // MotionValue<number>
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
  localPlaces,
  setLocalPlaces,
  children,
  scrollProgress,
}: PlaceListProps) {
  const {
    activeJourney,
    drawerSnapPoint,
    isDrawerMaximized,
    isSearchMode,
    openSearchMode,
    setFocusedStep,
    setFocusedSegment,
    setAlternativeSegment,
    setFocusBounds,
    setDrawerSnapPoint,
  } = useJourneyStore();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomSheet = useOptionalBottomSheet();

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!scrollProgress) return;
    const target = e.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    let progress = 0;
    if (target.scrollHeight <= target.clientHeight) {
      progress = 1;
    } else if (remaining <= 0) {
      progress = 1;
    } else if (remaining >= 40) {
      progress = 0;
    } else {
      progress = (40 - remaining) / 40;
    }

    const nextProgress = Math.round(progress * 100) / 100;
    if (scrollProgress.get() !== nextProgress) {
      scrollProgress.set(nextProgress);
    }
  };

  useEffect(() => {
    const checkScroll = () => {
      if (scrollRef.current && scrollProgress) {
        const target = scrollRef.current;
        const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
        let progress = 0;
        if (target.scrollHeight <= target.clientHeight) {
          progress = 1;
        } else if (remaining <= 0) {
          progress = 1;
        } else if (remaining >= 40) {
          progress = 0;
        } else {
          progress = (40 - remaining) / 40;
        }

        const nextProgress = Math.round(progress * 100) / 100;
        scrollProgress.set(nextProgress);
      }
    };

    checkScroll();
    
    const timer = setTimeout(checkScroll, 100);

    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkScroll);
    };
  }, [localPlaces, drawerSnapPoint, scrollProgress]);

  // 모바일 터치/휠 제스처 핸들러: 리스트 스크롤과 바텀시트 드래그 제스처 분리 및 스냅 제어
  const {
    handlePointerDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel
  } = useSnapScrollBridge({
    scrollRef,
    drawerSnapPoint,
    isDrawerMaximized,
    setDrawerSnapPoint,
    activeJourney,
    disabled: false
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );



  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalPlaces((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    }
  };

  const transportType = activeJourney?.transport_type || 'public';
  const hasNoPlaces = !activeJourney || localPlaces.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-zinc-50">
      {/* 스크롤 가능한 본문 영역 (장소 리스트 또는 빈 화면 안내) */}
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none scrollbar-sidebar relative"
      >
        {hasNoPlaces ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 h-full min-h-[260px]">
            <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
              <MapPin className="w-10 h-10 text-blue-300" strokeWidth={1} />
            </div>
            <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
              하단 장소 추가 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col px-2 py-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={localPlaces.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {localPlaces.map((place, idx) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    index={idx}
                    isLast={idx === localPlaces.length - 1}
                    editMode={editMode}
                    isSelected={selectedIds.includes(place.id)}
                    onToggleSelect={() => onToggleSelect(place.id)}
                    nextPlace={idx < localPlaces.length - 1 ? localPlaces[idx + 1] : null}
                    transportType={transportType}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </ul>
        )}
      </div>

      {/* 사이드바 최하단 고정 영역: 장소 추가 버튼 또는 선택 삭제 액션 */}
      {!isSearchMode && (
        <div className="px-6 py-4 flex-shrink-0 bg-white border-t border-zinc-100 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] z-10">
          {editMode ? (
            children
          ) : (
            <button
              type="button"
              onClick={() => {
                setFocusedStep?.(null);
                setFocusedSegment?.(null);
                setAlternativeSegment?.(null);
                setFocusBounds?.(null);
                openSearchMode();
              }}
              className="w-full py-4 bg-zinc-950/90 hover:bg-zinc-900 active:scale-[0.98] text-white font-bold text-[15px] rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:shadow-xl transition-all cursor-pointer flex justify-center items-center gap-2 backdrop-blur-md border border-white/10"
            >
              <Plus className="w-4.5 h-4.5" strokeWidth={2.5} />
              <span className="tracking-wide">장소 추가</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
