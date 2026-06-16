"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';

interface PlaceListProps {
  editMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
}

interface PlaceCardProps {
  place: Place;
  index: number;
  isLast: boolean;
  editMode: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragged: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// 구간 이동 정보 플레이스홀더 (향후 ODsay API 연동)
function SegmentInfo() {
  return (
    <div className="mx-4 mb-3 px-4 py-3 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      {/* 상단 정보: 총 이동 시간, 요금, 실시간 상태 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-end gap-2">
          <span className="text-xl font-extrabold text-zinc-800 leading-none tracking-tight">53분</span>
          <span className="text-[13px] font-medium text-zinc-500 pb-[1px]">1,400원</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded-full border border-rose-100">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
          </span>
          최적 경로
        </div>
      </div>
      
      {/* 네이버 지도 스타일 통합 타임라인 바 */}
      <div className="flex w-full h-8 rounded-[8px] overflow-hidden border border-zinc-200/80 shadow-sm bg-zinc-100 mt-3">
        {/* Step 1: 도보 */}
        <div className="flex items-center justify-center bg-zinc-100 text-zinc-600 relative" style={{ width: '18%' }}>
          <span className="text-[11px] font-medium truncate px-1 z-10 flex items-center gap-0.5">
            <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
            </svg>
            8분
          </span>
        </div>
        
        {/* Step 2: 지하철 */}
        <div className="flex items-center justify-center bg-[#00A84D] text-white" style={{ width: '47%' }}>
          <span className="text-[11px] font-bold truncate px-1 drop-shadow-sm flex items-center gap-1">
            2호선 29분
          </span>
        </div>

        {/* Step 3: 도보 */}
        <div className="flex items-center justify-center bg-zinc-100 text-zinc-600 relative" style={{ width: '15%' }}>
          <span className="text-[11px] font-medium truncate px-1 z-10 flex items-center gap-0.5">
            <svg className="w-3 h-3 opacity-70" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
            </svg>
            6분
          </span>
        </div>

        {/* Step 4: 버스 */}
        <div className="flex items-center justify-center bg-[#0068b7] text-white" style={{ width: '20%' }}>
          <span className="text-[11px] font-bold truncate px-1 drop-shadow-sm flex items-center gap-1">
            144번 10분
          </span>
        </div>
      </div>
    </div>
  );
}

// 대안 구간 이동 정보 플레이스홀더
function AlternativeSegmentInfo() {
  return (
    <div className="mx-4 px-4 py-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="text-[11px] font-semibold text-zinc-600 mb-2">대안 이동 수단</div>
      <div className="flex flex-col gap-2">
        <button className="flex items-center justify-between w-full p-2 hover:bg-zinc-50 rounded-lg transition-colors border border-transparent hover:border-zinc-200 text-left">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚕</span>
            <span className="text-xs font-medium text-zinc-700">택시</span>
          </div>
          <span className="text-xs font-bold text-zinc-900">15분</span>
        </button>
        <button className="flex items-center justify-between w-full p-2 hover:bg-zinc-50 rounded-lg transition-colors border border-transparent hover:border-zinc-200 text-left">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚶</span>
            <span className="text-xs font-medium text-zinc-700">도보</span>
          </div>
          <span className="text-xs font-bold text-zinc-900">45분</span>
        </button>
      </div>
    </div>
  );
}

function PlaceCard({
  place,
  index,
  isLast,
  editMode,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragged,
  isSelected,
  onToggleSelect,
}: PlaceCardProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);

  return (
    <li
      draggable={editMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`relative transition-all duration-200 ${isDragged ? 'opacity-40 scale-[0.98]' : ''}`}
    >
      {/* 카드 + 번호 행 */}
      <div className="flex items-center gap-0 group">
        {/* 번호 + 세로선 컬럼 */}
        <div className="flex flex-col items-center w-10 flex-shrink-0 self-stretch select-none">
          {editMode ? (
            <div className="w-8 h-8 flex items-center justify-center z-10 flex-shrink-0">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200 flex items-center justify-center text-white text-xs font-bold z-10 flex-shrink-0">
              {index + 1}
            </div>
          )}
          {/* 세로 연결선 (마지막 카드 제외) */}
          {!isLast && (
            <div className="flex-1 w-px bg-gradient-to-b from-blue-200 via-blue-100 to-transparent min-h-[2rem] mt-1" />
          )}
        </div>

        {/* 장소 카드 */}
        <div className="flex-1 min-w-0 mx-2 mb-1 bg-white border border-zinc-100 rounded-2xl shadow-sm group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)] transition-all duration-200">
          <div className="flex items-center px-4 py-3 gap-2">
            {/* 장소 정보 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-800 truncate leading-tight">
                {place.place_name}
              </p>
              {place.address && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
              )}
            </div>

            {/* 대안 교통정보 토글 (∨ 버튼) - 기본 상태에만 노출 */}
            {!editMode && !isLast && (
              <button
                type="button"
                onClick={() => setShowAlternatives((v) => !v)}
                className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  transition-all duration-200
                  ${showAlternatives
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-zinc-50 text-zinc-400 hover:bg-blue-50 hover:text-blue-500'
                  }
                `}
                aria-label="대안 교통정보 보기"
              >
                <ChevronDownIcon open={showAlternatives} />
              </button>
            )}

            {/* 드래그 핸들 - 편집 상태에만 오른쪽에 노출 */}
            {editMode && (
              <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 p-2 rounded hover:bg-zinc-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          {/* 카테고리 뱃지 */}
          {place.category && (
            <div className="px-4 pb-2.5">
              <span className="inline-block text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {place.category.split('>').pop()?.trim() || place.category}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 대안 이동 정보 (아코디언 토글, 장소 카드 바로 밑) */}
      <div 
        className={`pl-10 overflow-hidden transition-all duration-300 ease-in-out ${
          showAlternatives && !editMode && !isLast ? 'max-h-96 opacity-100 mb-3' : 'max-h-0 opacity-0'
        }`}
      >
        <AlternativeSegmentInfo />
      </div>

      {/* 기본 구간 이동 정보 (항상 노출) */}
      {!editMode && !isLast && (
        <div className="pl-10 pb-1">
          <SegmentInfo />
        </div>
      )}
    </li>
  );
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
}: PlaceListProps) {
  const { activeJourney, reorderPlaces } = useJourneyStore();
  const [localPlaces, setLocalPlaces] = useState<Place[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const draggedIndexRef = useRef<number | null>(null);

  // Sync with store places when not dragging
  useEffect(() => {
    if (!isDragging && activeJourney?.places) {
      setLocalPlaces(activeJourney.places);
    }
  }, [activeJourney?.places, isDragging]);

  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-6 flex-1">
        <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
            className="w-10 h-10 text-blue-300"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
          아래 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
        </p>
      </div>
    );
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!editMode) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    draggedIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!editMode) return;
    e.preventDefault();
    const draggedIndex = draggedIndexRef.current;
    if (draggedIndex === null || draggedIndex === index) return;

    // Shift places dynamically
    const updated = [...localPlaces];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    draggedIndexRef.current = index;
    setLocalPlaces(updated);
  };

  const handleDragEnd = async () => {
    setIsDragging(false);
    draggedIndexRef.current = null;
    if (activeJourney) {
      await reorderPlaces(localPlaces);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pt-4 pb-2">
      <ul className="flex flex-col px-2">
        {localPlaces.map((place, idx) => (
          <PlaceCard
            key={place.id}
            place={place}
            index={idx}
            isLast={idx === localPlaces.length - 1}
            editMode={editMode}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            isDragged={draggedIndexRef.current === idx}
            isSelected={selectedIds.includes(place.id)}
            onToggleSelect={() => onToggleSelect(place.id)}
          />
        ))}
      </ul>
    </div>
  );
}
