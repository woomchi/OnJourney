"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, DirectionResult, DirectionAlternative, RouteGuideNode } from '@/types/journey';

interface PlaceListProps {
  editMode?: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  localPlaces: Place[];
  setLocalPlaces: React.Dispatch<React.SetStateAction<Place[]>>;
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
  transportType: 'public' | 'car';
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

// 1. 구간 이동 정보 뼈대 로딩 UI
function SegmentInfoSkeleton() {
  return (
    <div className="mx-4 mb-3 px-4 py-4 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-zinc-200 rounded w-24"></div>
        <div className="h-4 bg-zinc-200 rounded w-16"></div>
      </div>
      <div className="h-3 bg-zinc-200 rounded-full w-full"></div>
    </div>
  );
}

const SEQUENCE_COLORS = [
  '#4F46E5', // 1번째 구간: Indigo Blue
  '#0D9488', // 2번째 구간: Teal Green
  '#D97706', // 3번째 구간: Amber Golden
  '#EC4899', // 4번째 구간: Coral Pink
  '#DC2626', // 5번째 이상: Rose Red
];

// 2. 실시간 구간 이동 정보 렌더링 컴포넌트
interface SegmentInfoProps {
  data?: DirectionResult;
  loading?: boolean;
  index: number;
}

function SegmentInfo({ data, loading, index }: SegmentInfoProps) {
  if (loading) {
    return <SegmentInfoSkeleton />;
  }

  if (!data) {
    return (
      <div className="mx-4 mb-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-100 text-center text-xs text-zinc-400">
        경로 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const totalStepDuration = data.steps.reduce((acc, s) => acc + s.duration, 0) || 1;
  const transitSteps = data.steps.filter((s) => s.type !== 'walk');
  const hasTransit = transitSteps.length > 0;

  return (
    <div className="mx-4 mb-3 px-4 py-3 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99] transition-all duration-200 cursor-pointer">
      {/* 상단 정보: 총 이동 시간, 요금, 실시간 상태 */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-end gap-1.5 flex-shrink-0">
          <span className="text-lg font-extrabold text-zinc-800 leading-none tracking-tight">
            {data.duration}분
          </span>
          <span className="text-[12px] font-medium text-zinc-400 pb-[0.5px] whitespace-nowrap">
            {data.fare > 0 ? `${data.fare.toLocaleString()}원` : '요금 정보 없음'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded-full border border-rose-100 flex-shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
          </span>
          실시간 정보
        </div>
      </div>

      {/* 동적 타임라인 바 및 하단 노선 정보 */}
      <div className="flex ml-3 -mr-2 mt-4 mb-2 relative">
        {data.steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === data.steps.length - 1;
          const widthPercent = `${(step.duration / totalStepDuration) * 100}%`;
          
          let icon = '🚶';
          if (step.type === 'subway') icon = '🚇';
          else if (step.type === 'bus') icon = '🚌';
          else if (step.type === 'car') icon = '🚗';

          const segmentColor = SEQUENCE_COLORS[index % SEQUENCE_COLORS.length];
          const stepColor = step.type === 'walk' ? (step.color || '#E4E4E7') : segmentColor;

          return (
            <div
              key={idx}
              className="flex flex-col items-stretch"
              style={{
                width: widthPercent,
                minWidth: '42px',
              }}
            >
              {/* 타임라인 바 조각 */}
              <div
                className="relative flex items-center justify-center h-3 pl-[10px] pr-[10px]"
                style={{
                  backgroundColor: stepColor,
                  borderTopLeftRadius: isFirst ? '9999px' : '0px',
                  borderBottomLeftRadius: isFirst ? '9999px' : '0px',
                  borderTopRightRadius: isLast ? '9999px' : '0px',
                  borderBottomRightRadius: isLast ? '9999px' : '0px',
                }}
              >
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center bg-white rounded-full shadow-sm w-4 h-4 z-10 border"
                  style={{ borderColor: stepColor }}
                >
                  <span className="text-[9px]">{icon}</span>
                </div>
                <span className={`font-bold whitespace-nowrap text-[9px] ${step.type === 'walk' ? 'text-zinc-700' : 'text-white'}`}>
                  {step.duration}분
                </span>
              </div>

              {/* 하단 노선명 텍스트 */}
              {hasTransit && (
                <div 
                  className="text-center mt-1 text-[9px] font-extrabold truncate px-0.5 min-h-[12px]"
                  title={step.type !== 'walk' ? step.name : undefined}
                >
                  {step.type !== 'walk' ? (
                    <span style={{ color: stepColor }}>
                      {step.type === 'subway'
                        ? (step.name.endsWith('선') && step.name.length >= 4 ? step.name.slice(0, -1) : step.name)
                        : step.name.replace(' 버스', '')}
                    </span>
                  ) : (
                    <span className="invisible">&nbsp;</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 3. 대안 구간 이동 정보 렌더링 컴포넌트
interface AlternativeSegmentInfoProps {
  alternatives?: DirectionAlternative[];
  loading?: boolean;
}

function AlternativeSegmentInfo({ alternatives, loading }: AlternativeSegmentInfoProps) {
  if (loading) {
    return (
      <div className="mx-4 px-4 py-3 bg-white rounded-xl border border-zinc-200 shadow-sm animate-pulse flex flex-col gap-2">
        <div className="h-4 bg-zinc-200 rounded w-20 mb-1"></div>
        <div className="h-8 bg-zinc-200 rounded w-full"></div>
        <div className="h-8 bg-zinc-200 rounded w-full"></div>
      </div>
    );
  }

  if (!alternatives || alternatives.length === 0) return null;

  return (
    <div className="mx-4 px-4 py-3 bg-white rounded-xl border border-zinc-200 shadow-sm">
      <div className="text-[11px] font-semibold text-zinc-600 mb-2">대안 이동 수단</div>
      <div className="flex flex-col gap-2">
        {alternatives.map((alt, idx) => {
          let emoji = '🚶';
          if (alt.type === 'taxi') emoji = '🚕';
          else if (alt.type === 'public') emoji = '🚌';
          else if (alt.type === 'car') emoji = '🚗';

          return (
            <div
              key={idx}
              className="flex items-center justify-between w-full p-2 hover:bg-zinc-50 rounded-lg transition-colors border border-transparent hover:border-zinc-200 text-left text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{emoji}</span>
                <span className="font-medium text-zinc-700">
                  {alt.name}
                  {alt.fare !== undefined && alt.fare > 0 && (
                    <span className="text-[10px] text-zinc-400 font-normal ml-1">
                      ({alt.fare.toLocaleString()}원)
                    </span>
                  )}
                </span>
              </div>
              <span className="font-bold text-zinc-900">{alt.duration}분</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 4. 차량 이동 수단 세부 경로 렌더링 컴포넌트
interface CarRouteGuideProps {
  guide?: RouteGuideNode[];
}

function CarRouteGuide({ guide }: CarRouteGuideProps) {
  if (!guide || guide.length === 0) {
    return (
      <div className="mx-4 mb-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-100 text-center text-xs text-zinc-400">
        세부 경로 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const formatDistance = (meters: number) => {
    if (meters < 10) return '';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return '';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}분`;
  };

  return (
    <div className="mx-4 mb-3 p-4 bg-zinc-50/50 border border-zinc-150 rounded-2xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)] max-h-72 overflow-y-auto flex flex-col gap-3">
      <div className="text-[11px] font-bold text-zinc-500 tracking-wide flex items-center gap-1.5 uppercase select-none">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-zinc-400">
          <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.343 7.587.829.799 1.655 1.38 2.274 1.765.31.192.57.337.757.433.113.06.211.107.282.14l.017.008.006.003zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
        상세 경로 안내
      </div>
      <div className="relative pl-1 flex flex-col gap-3.5">
        {/* 세로 연결선 */}
        <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-zinc-200" />

        {guide.map((step, idx) => {
          const distStr = formatDistance(step.distance);
          const durStr = formatDuration(step.duration);

          // 아이콘과 색상 매핑
          let icon = '•';
          let iconColor = 'text-zinc-400 bg-white border-zinc-200';
          let iconSize = 'w-4 h-4 text-[9px]';

          const text = step.instructions;
          if (text.includes('출발')) {
            icon = '🏁';
            iconColor = 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm';
            iconSize = 'w-5 h-5 text-[10px]';
          } else if (text.includes('도착')) {
            icon = '📍';
            iconColor = 'text-rose-600 bg-rose-50 border-rose-200 shadow-sm';
            iconSize = 'w-5 h-5 text-[10px]';
          } else if (text.includes('우회전') || text.includes('우측')) {
            icon = '→';
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (text.includes('좌회전') || text.includes('좌측')) {
            icon = '←';
            iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
          } else if (text.includes('유턴')) {
            icon = '↶';
            iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
          } else if (text.includes('직진')) {
            icon = '↑';
            iconColor = 'text-zinc-600 bg-zinc-50 border-zinc-200';
          } else if (text.includes('지하차도') || text.includes('터널') || text.includes('고속도로')) {
            icon = '🛣️';
            iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
          }

          return (
            <div key={idx} className="relative flex gap-3 pl-6 items-start group">
              {/* 타임라인 노드 아이콘 */}
              <div
                className={`absolute left-0 top-0.5 rounded-full border flex items-center justify-center font-bold z-10 transition-colors group-hover:scale-110 duration-200 ${iconColor} ${iconSize}`}
              >
                {icon}
              </div>

              {/* 경로 설명 및 거리/시간 */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-zinc-600 leading-snug group-hover:text-zinc-800 transition-colors">
                  {step.instructions}
                </p>
                {(distStr || durStr) && (
                  <div className="flex items-center gap-1 mt-0.5 text-[9px] text-zinc-400 font-medium">
                    {distStr && <span>{distStr}</span>}
                    {distStr && durStr && <span className="text-zinc-300">·</span>}
                    {durStr && <span>{durStr}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
  nextPlace,
  transportType,
}: PlaceCardProps) {
  const { directionsCache, directionsLoading, fetchSegmentDirections, setFocusBounds, focusedSegment, setFocusedSegment } = useJourneyStore();
  const [showAlternatives, setShowAlternatives] = useState(false);

  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}-${transportType}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const isSegmentLoading = nextPlace ? directionsLoading[cacheKey] : false;

  useEffect(() => {
    if (!editMode && nextPlace) {
      fetchSegmentDirections(place, nextPlace, transportType);
    }
  }, [editMode, place, nextPlace, transportType, fetchSegmentDirections]);

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
        className={`pl-10 overflow-hidden transition-all duration-300 ease-in-out ${showAlternatives && !editMode && !isLast ? 'max-h-96 opacity-100 mb-3' : 'max-h-0 opacity-0'
          }`}
      >
        <AlternativeSegmentInfo alternatives={segmentData?.alternatives} loading={isSegmentLoading} />
      </div>

      {/* 기본 구간 이동 정보 (항상 노출) */}
      {!editMode && !isLast && (
        <div className="pl-10 pb-1 flex flex-col gap-1">
          <button
            type="button"
            className="w-full text-left focus:outline-none"
            onClick={() => {
              if (nextPlace) {
                // 이미 해당 구간이 포커스된 경우 토글 해제
                if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                  setFocusedSegment(null);
                  setFocusBounds(null);
                } else {
                  const sw = {
                    lat: Math.min(place.lat, nextPlace.lat),
                    lng: Math.min(place.lng, nextPlace.lng),
                  };
                  const ne = {
                    lat: Math.max(place.lat, nextPlace.lat),
                    lng: Math.max(place.lng, nextPlace.lng),
                  };
                  setFocusBounds({ sw, ne });
                  setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                }
              }
            }}
          >
            <SegmentInfo data={segmentData?.primary} loading={isSegmentLoading} index={index} />
          </button>

          {/* 차량 세부 경로 안내 (구간 선택/포커스 시 활성화) */}
          {!isSegmentLoading && transportType === 'car' && focusedSegment && focusedSegment.originId === place.id && nextPlace && focusedSegment.destId === nextPlace.id && segmentData?.primary && (
            <div className="overflow-hidden transition-all duration-300">
              <CarRouteGuide guide={segmentData.primary.guide} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function PlaceList({
  editMode = false,
  selectedIds,
  onToggleSelect,
  localPlaces,
  setLocalPlaces,
}: PlaceListProps) {
  const { activeJourney } = useJourneyStore();
  const draggedIndexRef = useRef<number | null>(null);

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

  const handleDragEnd = () => {
    draggedIndexRef.current = null;
  };

  const transportType = activeJourney.transport_type || 'public';

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
            nextPlace={idx < localPlaces.length - 1 ? localPlaces[idx + 1] : null}
            transportType={transportType}
          />
        ))}
      </ul>
    </div>
  );
}
