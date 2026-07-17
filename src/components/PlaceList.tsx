"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import PlaceCard from './places/PlaceCard';
import { MapPin, Plus } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import React from 'react';
import { useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
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
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
  localPlaces,
  setLocalPlaces,
  children,
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
    setDrawerSnapPoint
  } = useJourneyStore();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const bottomSheet = useOptionalBottomSheet();

  // 제스처 감지용 Ref
  const touchStartRef = React.useRef<{ y: number; scrollTop: number } | null>(null);
  const wheelAccumulator = React.useRef({
    lastTime: 0,
    delta: 0,
    startedAtTop: false,
    startedAtBottom: false
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    if (!isScrollable && bottomSheet) {
      const isDragHandle = (e.target as HTMLElement).closest('.drag-handle');
      const isButton = (e.target as HTMLElement).closest('button');
      const isInput = (e.target as HTMLElement).closest('input, textarea, select');
      if (!isDragHandle && !isButton && !isInput) {
        bottomSheet.dragControls.start(e);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    touchStartRef.current = {
      y: e.touches[0].clientY,
      scrollTop: target.scrollTop
    };
    // 터치 이벤트가 바텀 시트로 넘어가서 의도치 않은 드래그가 시작되는 것을 방지하기 위해 상위 전파 항상 차단
    e.stopPropagation();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    // 스크롤 중 터치 이동 이벤트가 바텀 시트로 전파되어 시트가 움직이는 것 항상 차단
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (!touchStartRef.current) return;

    const target = scrollRef.current || e.currentTarget;
    const deltaY = e.changedTouches[0].clientY - touchStartRef.current.y;
    const { scrollTop: startScrollTop } = touchStartRef.current;
    const currentScrollTop = target.scrollTop;

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTopAtStart = startScrollTop <= 2;
    const isAtBottomAtStart = isScrollable
      ? (startScrollTop > 2 && maxScroll - startScrollTop < 3)
      : true;

    // 리스트 컨텐츠가 스크롤되었는지 여부 확인 (스크롤이 발생했다면 오버스크롤 무시)
    const didNotScroll = Math.abs(currentScrollTop - startScrollTop) <= 2;

    if (didNotScroll) {
      const minSnap = activeJourney ? '133px' : '62px';
      const defaultSnap = activeJourney ? '370px' : '360px';

      let currentSnap: 'min' | 'default' | 'max' = 'default';
      if (drawerSnapPoint === minSnap || drawerSnapPoint === parseInt(minSnap, 10)) {
        currentSnap = 'min';
      } else if (drawerSnapPoint === 1 || drawerSnapPoint === '1' || isDrawerMaximized) {
        currentSnap = 'max';
      }

      if (currentSnap === 'max') {
        if (isAtTopAtStart && deltaY > 20) {
          // 최대 높이 상태에서 리스트 최상단일 때 아래로 스와이프하면 기본 높이로 축소
          setDrawerSnapPoint(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      if (currentSnap === 'min') {
        if (deltaY < -20) {
          // 최소 높이 상태에서 위로 스와이프하면 기본 높이로 확장
          setDrawerSnapPoint(defaultSnap);
        }
        touchStartRef.current = null;
        return;
      }

      // 민감도를 다른 영역과 통일하기 위해 임계값을 20px로 변경
      if (isAtTopAtStart && deltaY > 20) {
        // 아래로 스와이프 (축소 방향)
        setDrawerSnapPoint(minSnap);
      }
      else if (isAtBottomAtStart && deltaY < -20) {
        // 위로 스와이프 (확대 방향)
        setDrawerSnapPoint(1);
      }
    }

    touchStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    const target = scrollRef.current || e.currentTarget;
    const now = Date.now();

    const maxScroll = target.scrollHeight - target.clientHeight;
    const isScrollable = maxScroll > 5;

    const isAtTop = target.scrollTop <= 2;
    const isAtBottom = isScrollable
      ? (target.scrollTop > 2 && maxScroll - target.scrollTop < 3)
      : true;

    // 0.2초 이상 휠 입력이 없었다면 새로운 스크롤 세션으로 간주
    if (now - wheelAccumulator.current.lastTime > 200) {
      wheelAccumulator.current.delta = 0;
      // 스크롤 세션을 시작할 때 어떤 경계선에 있었는지 각각 독립적으로 기록
      wheelAccumulator.current.startedAtTop = isAtTop;
      wheelAccumulator.current.startedAtBottom = isAtBottom;
    }
    wheelAccumulator.current.lastTime = now;

    const minSnap = activeJourney ? '133px' : '62px';
    const defaultSnap = activeJourney ? '370px' : '360px';

    let currentSnap: 'min' | 'default' | 'max' = 'default';
    if (drawerSnapPoint === minSnap || drawerSnapPoint === parseInt(minSnap, 10)) {
      currentSnap = 'min';
    } else if (drawerSnapPoint === 1 || drawerSnapPoint === '1' || isDrawerMaximized) {
      currentSnap = 'max';
    }

    if (currentSnap === 'max') {
      if (isAtTop && e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta < -70) {
          setDrawerSnapPoint(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    if (currentSnap === 'min') {
      if (e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
        wheelAccumulator.current.delta += e.deltaY;
        if (wheelAccumulator.current.delta > 70) {
          setDrawerSnapPoint(defaultSnap);
          wheelAccumulator.current.delta = 0;
        }
      } else {
        wheelAccumulator.current.delta = 0;
      }
      return;
    }

    // 최상단에서 시작한 세션은 축소(위로 스크롤)만, 최하단에서 시작한 세션은 팽창(아래로 스크롤)만 허용하여
    // 한 번에 강하게 스크롤했을 때 반대편 경계선에서 오버스크롤이 터지는 것을 완벽 차단(Lock)
    if (isAtTop && e.deltaY < 0 && wheelAccumulator.current.startedAtTop) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta < -70) {
        setDrawerSnapPoint(minSnap);
        wheelAccumulator.current.delta = 0;
      }
    }
    else if (isAtBottom && e.deltaY > 0 && wheelAccumulator.current.startedAtBottom) {
      wheelAccumulator.current.delta += e.deltaY;
      if (wheelAccumulator.current.delta > 70) {
        setDrawerSnapPoint(1);
        wheelAccumulator.current.delta = 0;
      }
    } else {
      wheelAccumulator.current.delta = 0;
    }
  };

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



  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <div
        onPointerDown={handlePointerDown}
        className="flex flex-col items-center justify-center text-center py-12 px-6 flex-1 overflow-y-auto"
      >
        <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
          <MapPin className="w-10 h-10 text-blue-300" strokeWidth={1} />
        </div>
        <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
          아래 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
        </p>
        <div className="w-full mt-6">
          {children}
        </div>
      </div>
    );
  }

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

  const transportType = activeJourney.transport_type || 'public';

  return (
    <div
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-none scrollbar-sidebar relative bg-zinc-50"
      style={{ paddingBottom: '0.5rem' }}
    >
      <ul className="flex flex-col px-2">
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

        {/* 장소 추가 버튼 (이동 카드 위치에 렌더링) */}
        {!editMode && !isSearchMode && (
          <li className="relative pl-11 pr-2 py-3 flex items-center group/add">
            {/* 이전 장소에서 이어지는 타임라인 연결선 */}
            <div className="absolute left-[1.375rem] top-0 bottom-1/2 w-0.5 bg-gradient-to-b from-zinc-200 to-transparent -translate-x-1/2" />

            {/* 기존의 까만색 장소 추가 버튼 디자인 */}
            <button
              type="button"
              onClick={() => {
                setFocusedStep?.(null);
                setFocusedSegment?.(null);
                setAlternativeSegment?.(null);
                setFocusBounds?.(null);
                openSearchMode();
              }}
              className="relative group w-full py-4 bg-zinc-900 rounded-2xl text-white font-bold text-[15px] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex justify-center items-center gap-2 overflow-hidden shadow-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Plus className="w-4 h-4 relative z-10 transition-transform group-hover:rotate-90 duration-300" strokeWidth={2.5} />
              <span className="relative z-10 tracking-wide">장소 추가</span>
            </button>
          </li>
        )}
      </ul>
      {children}
    </div>
  );
}
