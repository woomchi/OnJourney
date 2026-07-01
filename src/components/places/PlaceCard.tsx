"use client";

import { useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useJourneyDirectionsCache, directionKeys } from '@/hooks/queries/useDirections';
import { useQueryClient } from '@tanstack/react-query';
import type { Place } from '@/types/journey';
import { fetchSegmentDirections as fetchDirectionsApi } from '@/lib/services/directionsService';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import SegmentInfo from './SegmentInfo';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { getSequenceTheme } from '@/constants/colors';

const themeClasses = {
  cafe: {
    bg: 'from-amber-400 to-orange-500 shadow-orange-100',
    badge: 'text-amber-700 bg-amber-50 border border-amber-100',
    line: 'from-amber-200 via-amber-100'
  },
  restaurant: {
    bg: 'from-red-400 to-rose-500 shadow-rose-100',
    badge: 'text-rose-700 bg-rose-50 border border-rose-100',
    line: 'from-rose-200 via-rose-100'
  },
  hotel: {
    bg: 'from-emerald-400 to-teal-500 shadow-emerald-100',
    badge: 'text-emerald-700 bg-emerald-50 border border-emerald-100',
    line: 'from-emerald-200 via-emerald-100'
  },
  activity: {
    bg: 'from-blue-400 to-indigo-500 shadow-blue-100',
    badge: 'text-blue-700 bg-blue-50 border border-blue-100',
    line: 'from-blue-200 via-blue-100'
  },
  transit: {
    bg: 'from-zinc-400 to-zinc-500 shadow-zinc-100',
    badge: 'text-zinc-700 bg-zinc-50 border border-zinc-100',
    line: 'from-zinc-200 via-zinc-100'
  },
  etc: {
    bg: 'from-violet-400 to-purple-500 shadow-purple-100',
    badge: 'text-purple-700 bg-purple-50 border border-purple-100',
    line: 'from-purple-200 via-purple-100'
  }
};

function AlternativeRouteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-15L21 6m0 0L16.5 10.5M21 6H7.5" />
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
  isDropped?: boolean;
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
  isDropped = false,
  isSelected,
  onToggleSelect,
  nextPlace,
  transportType,
}: PlaceCardProps) {
  const {
    activeJourney,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    setFocusedStep,
    focusedStep,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
  } = useJourneyStore();
  const cardRef = useRef<HTMLLIElement>(null);

  const isFocused = 
    (focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace?.id) ||
    (focusedStep?.originId === place.id && focusedStep?.destId === nextPlace?.id);

  const isSegmentPlaying = !!(
    focusedStep && 
    focusedStep.originId === place.id && 
    focusedStep.destId === nextPlace?.id
  );

  // 다른 이동 구간을 클릭하여 포커스가 변경되면 아코디언 닫기 (이제는 패널이므로 MapArea에서 제어하지만 호환성 유지)
  useEffect(() => {
    if (focusedSegment && focusedSegment.originId !== place.id) {
      if (alternativeSegment?.originId === place.id) {
        setAlternativeSegment(null);
      }
    }
  }, [focusedSegment, place.id, alternativeSegment, setAlternativeSegment]);

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

  const queryClient = useQueryClient();
  const places = activeJourney?.places ?? [];
  const directionsCache = useJourneyDirectionsCache(places);
  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const isSegmentLoading = nextPlace 
    ? queryClient.getQueryState(directionKeys.segment(place.id, nextPlace.id))?.status === 'pending'
    : false;

  const activeRoute = nextPlace 
    ? getDefaultRoute(place, nextPlace, segmentData, transportType)
    : undefined;

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
        {/* 번호 + 세로선 컬럼 (여정 재생 레코드판 컨셉 적용) */}
        {(() => {
          const theme = getSequenceTheme(index, places.length);
            
          return (
            <div className="flex flex-col items-center w-16 flex-shrink-0 self-stretch select-none pt-1 group/timeline">
              {/* 타임라인 노드 컨테이너 (앨범 슬리브 + 레코드판) */}
              <div 
                className={`relative flex items-center justify-center mt-2 mb-2 w-full h-10 ${!isLast && !editMode ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (!editMode && nextPlace) {
                    if (isFocused) {
                      setFocusedStep(null);
                      setFocusedSegment(null);
                      setAlternativeSegment(null);
                      setFocusBounds(null);
                    } else {
                      const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                      setFocusBounds(bounds);
                      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                      setFocusedStep(null);
                    }
                  }
                }}
              >
                {/* 재생 중 주변 오라(Aura) - 앨범 커버 뒤에 퍼짐 */}
                {isSegmentPlaying && (
                  <>
                    <div className="absolute z-10 w-9 h-9 rounded-md animate-ping opacity-30 pointer-events-none" style={{ backgroundColor: theme.color }} />
                    <div className="absolute z-10 w-10 h-10 rounded-md opacity-40 animate-pulse blur-[4px] pointer-events-none" style={{ backgroundColor: theme.color }} />
                  </>
                )}

                {/* 레코드판 본체 (앨범 커버 뒤에 숨어있다가 호버 시 우측으로 나옴, 클릭/포커스 시 앞으로 나옴, 재생 시 회전) */}
                {!isLast && (
                  <div 
                    className={`absolute flex items-center justify-center rounded-full bg-zinc-950 border border-zinc-800 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden 
                      ${isFocused 
                        ? `z-40 translate-x-[8px] scale-110 shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${isSegmentPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`
                        : 'z-20 translate-x-0 group-hover:translate-x-[14px] group-hover:rotate-[60deg] shadow-sm'}`}
                    style={{ width: '34px', height: '34px' }}
                  >
                    {/* 그루브 (Concentric circles) */}
                    <div className="absolute inset-0 rounded-full border border-zinc-800/60 m-[2px]"></div>
                    <div className="absolute inset-0 rounded-full border border-zinc-800/40 m-[4px]"></div>
                    <div className="absolute inset-0 rounded-full border border-zinc-800/60 m-[6px]"></div>
                    <div className="absolute inset-0 rounded-full border border-zinc-800/40 m-[8px]"></div>
                    <div className="absolute inset-0 rounded-full border border-zinc-800/50 m-[10px]"></div>
                    
                    {/* 비닐 특유의 광택 (Conic Gradient) */}
                    <div 
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.2) 30deg, transparent 60deg, transparent 180deg, rgba(255,255,255,0.2) 210deg, transparent 240deg)'
                      }}
                    />

                    {/* 중앙 라벨 (포커스 시에는 커지고 장소 번호 표시, 아닐 때는 작은 스핀들) */}
                    <div 
                      className={`relative flex items-center justify-center rounded-full z-10 shadow-sm transition-all duration-500 ${isFocused ? 'w-[16px] h-[16px]' : 'w-[10px] h-[10px]'}`}
                      style={{
                        background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`
                      }}
                    >
                      {!isFocused ? (
                        <div className="w-[3px] h-[3px] rounded-full bg-zinc-900 border-[0.5px] border-zinc-700 shadow-inner" />
                      ) : (
                        <span className="text-[10px] font-black text-white leading-none tracking-tighter drop-shadow-sm">
                          {index + 1}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* 앨범 커버 슬리브 (마지막 장소는 가만히 있고, 일반 장소는 포커스 시 레코드가 튀어나옴) */}
                <div 
                  className={`absolute z-30 w-[38px] h-[38px] rounded-[3px] flex flex-col items-center justify-center overflow-hidden border border-white/20 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    isLast 
                      ? 'opacity-100 shadow-[0_2px_8px_rgba(0,0,0,0.15)] pointer-events-none'
                      : isFocused 
                        ? 'opacity-85 scale-[0.95] -translate-x-[4px] translate-y-0 rotate-0 shadow-sm pointer-events-none' 
                        : 'opacity-100 translate-x-0 translate-y-0 rotate-0 shadow-[0_4px_12px_rgba(0,0,0,0.4)] group-hover:scale-[1.02]'
                  }`}
                  style={{ 
                    background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
                    borderLeft: '3px solid rgba(0,0,0,0.3)' // 앨범 척추(Spine) 느낌
                  }}
                >
                  {/* 빈티지 링웨어(Ringwear - 레코드판 자국) */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-[34px] h-[34px] rounded-full border border-white/10 mix-blend-overlay" />
                    <div className="absolute w-[32px] h-[32px] rounded-full border border-black/5 mix-blend-multiply" />
                  </div>
                  
                  {/* 슈링크 랩 (비닐 포장) 광택 효과 */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-60" />
                  
                  {/* 부드러운 상단 빛 반사 */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4)_0%,transparent_60%)]" />
                  
                  {/* 중앙 장소 순서 타이포그래피 (모던한 느낌의 라벨 뱃지) */}
                  <div className="relative z-10 w-[22px] h-[22px] flex items-center justify-center rounded-full bg-white/95 shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                    <span className="text-[12px] font-black tracking-tighter mt-[1px]" style={{ color: theme.color }}>
                      {index + 1}
                    </span>
                  </div>
                </div>

                {/* 마우스 호버 시 뜨는 재생/일시정지 오버레이 (상태에 따라 모양 변경) */}
                {!editMode && !isLast && (
                  <div 
                    className={`absolute flex items-center justify-center transition-all duration-300 z-40 bg-black/40 backdrop-blur-[2px] pointer-events-none 
                      ${isFocused ? 'w-[38px] h-[38px] rounded-full opacity-0 group-hover:opacity-100 scale-100 translate-x-[8px]' : 'w-[38px] h-[38px] rounded-[3px] opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-[1.02] translate-x-0'}`}
                  >
                    {isSegmentPlaying ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px] text-white/95 shadow-sm">
                        <rect x="6" y="5" width="4" height="14" rx="1.5" />
                        <rect x="14" y="5" width="4" height="14" rx="1.5" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white/95 ml-0.5 shadow-sm">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
              
              {/* 세로 연결선 (오디오 케이블 / 네온 트랙 라인 느낌) */}
              {!isLast && (
                <div className="flex-1 w-full flex justify-center py-1 relative z-0">
                  {/* 배경 라인 */}
                  <div className="absolute inset-y-0 w-2 bg-zinc-100/80 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] border border-zinc-200/50" />
                  
                  {/* 기본 그라데이션 선 */}
                  <div 
                    className="absolute inset-y-0 w-2 rounded-full opacity-50"
                    style={{
                      background: `linear-gradient(180deg, ${theme.color} 0%, transparent 90%)`
                    }}
                  />
                  
                  {/* 활성화 상태 (네온 글로우) */}
                  {(isFocused || isSegmentPlaying) && (
                    <div 
                      className="absolute inset-y-0 w-2 rounded-full animate-pulse"
                      style={{
                        background: `linear-gradient(180deg, ${theme.color} 0%, ${theme.color} 100%)`,
                        boxShadow: `0 0 12px ${theme.color}80, 0 0 4px ${theme.color}`
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* 장소 카드 */}
        <div
          onClick={editMode ? onToggleSelect : undefined}
          className={`place-card-content flex-1 min-w-0 mx-2 mb-1 bg-white border rounded-2xl shadow-sm transition-all duration-200 ${
            isDropped
              ? 'animate-drop-ripple border-blue-400 z-20 shadow-[0_4px_20px_rgba(59,130,246,0.15)]'
              : editMode
                ? 'border-zinc-100 cursor-pointer hover:border-blue-300 hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
                : 'border-zinc-100 group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)]'
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
          {place.category && (() => {
            const theme = getCategoryTheme(place.category);
            const classes = themeClasses[theme.type] || themeClasses.etc;
            return (
              <div className="px-4 pb-2.5">
                <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${classes.badge}`}>
                  {place.category.split('>').pop()?.trim() || place.category}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 대안 이동 정보 아코디언은 상세 패널(MapArea)로 분리됨 */}

      {/* 기본 구간 이동 정보 (항상 노출) */}
      {!editMode && !isLast && (() => {
        return (
          <div className="pl-16 pb-1 flex flex-col gap-1 relative">
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left focus:outline-none cursor-pointer"
              onClick={() => {
                if (nextPlace) {
                  if (isFocused) {
                    setFocusedStep(null);
                    setFocusedSegment(null);
                    setAlternativeSegment(null);
                    setFocusBounds(null);
                  } else {
                    const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
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
                    if (isFocused) {
                      setFocusedStep(null);
                      setFocusedSegment(null);
                      setAlternativeSegment(null);
                      setFocusBounds(null);
                    } else {
                      const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
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

            {/* 대안 교통정보 토글 버튼을 이동 구간(SegmentInfo) 상단 우측에 겹치도록 배치 */}
            <div className="absolute top-2.5 right-6 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const isCurrentlyOpen = alternativeSegment?.originId === place.id && alternativeSegment?.destId === nextPlace?.id;
                  
                  if (!isCurrentlyOpen && nextPlace) {
                    const wasFocused = focusedSegment?.originId === place.id && focusedSegment?.destId === nextPlace.id;
                    setIsAlternativeFromFocus(wasFocused);
                    setAlternativeSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedSegment(null);
                    setFocusedStep(null);
                    if (activeRoute) {
                      const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                      setFocusBounds(bounds);
                    }
                    if (!segmentData) {
                      queryClient.fetchQuery({
                        queryKey: directionKeys.segment(place.id, nextPlace.id),
                        queryFn: () => fetchDirectionsApi(place, nextPlace)
                      }).catch(console.error);
                    }
                  } else {
                    setAlternativeSegment(null);
                    if (isAlternativeFromFocus && nextPlace) {
                      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                      if (activeRoute) {
                        const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                        setFocusBounds(bounds);
                      }
                    } else {
                      setFocusBounds(null);
                    }
                  }
                }}
                className={`
                  flex items-center justify-center w-7 h-7 rounded-full
                  transition-all duration-300 shadow-sm
                  ${alternativeSegment?.originId === place.id && alternativeSegment?.destId === nextPlace?.id
                    ? 'bg-blue-500 text-white shadow-blue-500/30'
                    : 'bg-white/90 backdrop-blur-sm border border-zinc-200 text-zinc-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                  }
                `}
                aria-label="대안 경로 탐색"
                title="대안 경로 탐색"
              >
                <AlternativeRouteIcon />
              </button>
            </div>
          </div>
        );
      })()}
    </li>
  );
}
