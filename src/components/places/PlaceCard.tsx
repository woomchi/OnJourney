"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import SegmentInfo from './SegmentInfo';
import AlternativeSegmentInfo from './AlternativeSegmentInfo';

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
  nextPlace: Place | null;
  transportType: 'public' | 'car' | 'walk';
}

export default function PlaceCard({
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
  nextPlace,
  transportType,
}: PlaceCardProps) {
  const {
    directionsCache,
    directionsLoading,
    fetchSegmentDirections,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    setFocusedStep,
    focusedStep,
  } = useJourneyStore();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const cardRef = useRef<HTMLLIElement>(null);

  // 다른 이동 구간을 클릭하여 포커스가 변경되면 아코디언 닫기
  useEffect(() => {
    if (focusedSegment && focusedSegment.originId !== place.id) {
      setShowAlternatives(false);
    }
  }, [focusedSegment, place.id]);

  useEffect(() => {
    if (!editMode) {
      const isFocused =
        (focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace?.id) ||
        (focusedStep?.originId === place.id && focusedStep?.destId === nextPlace?.id);

      if (isFocused && cardRef.current) {
        setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
    }
  }, [focusedSegment, focusedStep, place.id, nextPlace?.id, editMode]);

  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const isSegmentLoading = nextPlace ? directionsLoading[cacheKey] : false;

  return (
    <li
      ref={cardRef}
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
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200 flex items-center justify-center text-white text-xs font-bold z-10 flex-shrink-0">
            {index + 1}
          </div>
          {/* 세로 연결선 (마지막 카드 제외) */}
          {!isLast && (
            <div className="flex-1 w-px bg-gradient-to-b from-blue-200 via-blue-100 to-transparent min-h-[2rem] mt-1" />
          )}
        </div>

        {/* 장소 카드 */}
        <div
          onClick={editMode ? onToggleSelect : undefined}
          className={`place-card-content flex-1 min-w-0 mx-2 mb-1 bg-white border border-zinc-100 rounded-2xl shadow-sm transition-all duration-200 ${editMode
            ? 'cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
            : 'group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
            }`}
        >
          <div className="flex items-center px-4 py-3 gap-2">
            {/* 체크박스 - 편집 상태에만 왼쪽에 노출 */}
            {editMode && (
              <div className="flex-shrink-0 flex items-center justify-center mr-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                />
              </div>
            )}

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
                onClick={() => {
                  setShowAlternatives((v) => {
                    const nextShow = !v;
                    if (nextShow) {
                      setFocusedSegment(null);
                      setFocusedStep(null);
                      setFocusBounds(null);
                      if (!segmentData && nextPlace) {
                        fetchSegmentDirections(place, nextPlace);
                      }
                    }
                    return nextShow;
                  });
                }}
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
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500 p-2 rounded hover:bg-zinc-100 transition-colors"
              >
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
        className={`pl-10 overflow-hidden transition-all duration-300 ease-in-out ${showAlternatives && !editMode && !isLast ? 'max-h-[260px] opacity-100 mb-3' : 'max-h-0 opacity-0'
          }`}
      >
        <AlternativeSegmentInfo
          place={place}
          nextPlace={nextPlace}
          segmentData={segmentData}
          loading={isSegmentLoading}
          onSelect={() => setShowAlternatives(false)}
          transportType={transportType}
        />
      </div>

      {/* 기본 구간 이동 정보 (항상 노출) */}
      {!editMode && !isLast && (() => {
        const activeRoute = place.selected_route && nextPlace && place.selected_route.destId === nextPlace.id
          ? place.selected_route
          : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

        return (
          <div className="pl-10 pb-1 flex flex-col gap-1">
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left focus:outline-none cursor-pointer"
              onClick={() => {
                if (nextPlace) {
                  const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                  if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                    // 이미 포커스된 상태에서 다시 클릭하면, 전체 구간 보기로 돌아가도록(zoom-out to segment) bounds 재적용
                    setFocusBounds({ ...bounds });
                    setFocusedStep(null);
                  } else {
                    setFocusBounds(bounds);
                    setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedStep(null);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (nextPlace) {
                    const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                    if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                      setFocusBounds({ ...bounds });
                      setFocusedStep(null);
                    } else {
                      setFocusBounds(bounds);
                      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                      setFocusedStep(null);
                    }
                  }
                }
              }}
            >
              <SegmentInfo
                data={activeRoute}
                loading={isSegmentLoading}
                index={index}
                placeId={place.id}
                destId={nextPlace?.id}
              />
            </div>
          </div>
        );
      })()}
    </li>
  );
}
