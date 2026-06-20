"use client";

import { useState, useEffect, useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, DirectionResult, DirectionsApiResponse, RouteGuideNode, SelectedRoute } from '@/types/journey';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';

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
  transportType: 'public' | 'car' | 'walk';
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

// 타임라인 바 내 소요시간 표시 (공간에 따라 적응적으로 표시)
// 공간 충분: "5분" / 부족: "2.." / 매우 부족: "1"
function FittedDuration({ duration, isWalk }: { duration: number; isWalk: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(`${duration}분`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth === 0) return;

      const measurer = document.createElement('span');
      measurer.style.cssText =
        'position:absolute;visibility:hidden;font-size:9px;font-weight:700;white-space:nowrap;';
      document.body.appendChild(measurer);

      // 1) Try full text: "5분"
      const fullText = `${duration}분`;
      measurer.textContent = fullText;
      if (measurer.offsetWidth <= availableWidth) {
        setDisplayText(fullText);
        document.body.removeChild(measurer);
        return;
      }

      // 2) Measure number width and dot width
      const numStr = `${duration}`;
      measurer.textContent = numStr;
      const numWidth = measurer.offsetWidth;

      measurer.textContent = '.';
      const dotWidth = measurer.offsetWidth;

      // 3) Number + as many dots as fit (max 3)
      const spaceForDots = availableWidth - numWidth;
      const maxDots = Math.min(Math.max(Math.floor(spaceForDots / dotWidth), 0), 3);

      if (maxDots > 0) {
        setDisplayText(numStr + '.'.repeat(maxDots));
      } else if (numWidth <= availableWidth) {
        setDisplayText(numStr);
      } else {
        setDisplayText('');
      }

      document.body.removeChild(measurer);
    };

    // Initial + resize observer
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [duration]);

  return (
    <div
      ref={containerRef}
      className={`w-full font-bold text-[9px] whitespace-nowrap text-center overflow-hidden leading-[12px] ${isWalk ? 'text-zinc-700' : 'text-white'}`}
    >
      {displayText}
    </div>
  );
}

// 2. 실시간 구간 이동 정보 렌더링 컴포넌트
interface SegmentInfoProps {
  data?: DirectionResult;
  loading?: boolean;
  index: number;
  placeId?: string;
  destId?: string;
}

function SegmentInfo({ data, loading, index, placeId, destId }: SegmentInfoProps) {
  const { focusedStep, setFocusedStep, focusedSegment, setFocusedSegment, setFocusBounds } = useJourneyStore();

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

  // Calculate percentage widths using a power-curve to compress proportions
  // This prevents long transit segments from dominating while giving walks enough room
  // e.g. 23min bus vs 1min walk: linear = 23x, compressed(^0.3) ≈ 2.5x
  const COMPRESS_POWER = 0.3;
  const MIN_PCT = 12; // minimum percentage for any step — guarantees room for "1…"
  const compressed = data.steps.map(s => Math.pow(Math.max(s.duration, 1), COMPRESS_POWER));
  const compressedTotal = compressed.reduce((a, b) => a + b, 0) || 1;
  const rawPcts = compressed.map(c => (c / compressedTotal) * 100);
  // Clamp all to at least MIN_PCT, then normalize to sum to 100
  const clampedPcts = rawPcts.map(p => Math.max(p, MIN_PCT));
  const clampedSum = clampedPcts.reduce((a, b) => a + b, 0);
  const normalizedPcts = clampedPcts.map(p => (p / clampedSum) * 100);

  return (
    <div className="mx-4 mb-3 px-4 py-3 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99] transition-all duration-200 cursor-pointer">
      {/* 상단 정보: 총 이동 시간, 요금, 실시간 상태 */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-end gap-1.5 flex-shrink-0">
          <span className="text-lg font-extrabold text-zinc-800 leading-none tracking-tight">
            {data.duration}분
          </span>
          <span className="text-[12px] font-medium text-zinc-400 pb-[0.5px] whitespace-nowrap">
            {data.type === 'car' || data.type === 'taxi' ? (
              `택시 ${data.taxiFare?.toLocaleString()}원${data.fare > 0 ? ` (통행료 ${data.fare.toLocaleString()}원)` : ''}`
            ) : data.type === 'walk' || data.type === 'bicycle' ? (
              '무료'
            ) : (data.isIntercity || data.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && data.fare === 0 ? (
              '예매처 확인'
            ) : data.fare > 0 ? (
              data.isFareEstimated ? `약 ${data.fare.toLocaleString()}원` : `${data.fare.toLocaleString()}원`
            ) : (
              '요금 정보 없음'
            )}
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
      <div className="flex mt-4 mb-2 relative" style={{ paddingLeft: '8px', paddingRight: '4px' }}>
        {data.steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === data.steps.length - 1;
          const pct = normalizedPcts[idx];
          
          let icon = '🚶';
          if (step.type === 'subway') icon = '🚇';
          else if (step.type === 'bus') icon = '🚌';
          else if (step.type === 'car') icon = '🚗';
          else if (step.type === 'train') icon = '🚄';
          else if (step.type === 'expressbus') icon = '🚌';

          const segmentColor = SEQUENCE_COLORS[index % SEQUENCE_COLORS.length];
          const stepColor = step.type === 'walk' ? (step.color || '#E4E4E7') : segmentColor;

          const isWalk = step.type === 'walk';

          const isThisStepFocused = !!(
            focusedStep &&
            focusedStep.originId === placeId &&
            focusedStep.destId === destId &&
            focusedStep.stepIndex === idx
          );
          const hasFocusedStep = !!focusedStep;

          return (
            <div
              key={idx}
              className="flex flex-col items-stretch min-w-0 relative group/step cursor-pointer"
              style={{
                width: `${pct}%`,
                flexShrink: 0,
                flexGrow: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!placeId || !destId) return;

                // Ensure segment focus is active
                const isSegmentFocused = focusedSegment && focusedSegment.originId === placeId && focusedSegment.destId === destId;
                if (!isSegmentFocused) {
                  setFocusedSegment({ originId: placeId, destId });
                }

                if (isThisStepFocused) {
                  setFocusedStep(null);
                  const bounds = calculateSegmentBounds(
                    { lat: data.pathPoints[0].lat, lng: data.pathPoints[0].lng },
                    { lat: data.pathPoints[data.pathPoints.length - 1].lat, lng: data.pathPoints[data.pathPoints.length - 1].lng },
                    data
                  );
                  setFocusBounds(bounds);
                } else {
                  const bounds = calculateStepBounds(step);
                  if (bounds) {
                    setFocusBounds(bounds);
                  }
                  setFocusedStep({
                    originId: placeId,
                    destId,
                    stepIndex: idx
                  });
                }
              }}
            >
                {/* 아이콘 백그라운드 컷아웃 (바 위에 덮어씌워져서 바가 움푹 파인 듯한 효과) */}
                <div 
                  className="absolute left-0 -translate-x-1/2 bg-white rounded-full z-[15] transition-all duration-200"
                  style={{ width: '20px', height: '20px', top: '-4px' }}
                />

                {/* 아이콘 — 바 바깥에 배치하여 overflow-hidden에 잘리지 않도록 */}
                <div
                  className={`absolute left-0 -translate-x-1/2 flex items-center justify-center bg-white rounded-full shadow-sm border z-20 transition-all duration-200 ${isThisStepFocused ? 'scale-110' : ''}`}
                  style={{
                    borderColor: stepColor,
                    width: '16px',
                    height: '16px',
                    top: '-2px',
                    opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                  }}
                >
                  <span className="text-[9px] leading-none">{icon}</span>
                </div>

                {/* 타임라인 바 조각 */}
                <div
                  className="relative flex items-center justify-center h-3 overflow-hidden transition-all duration-200"
                  style={{
                    backgroundColor: stepColor,
                    borderTopLeftRadius: isFirst ? '9999px' : '0px',
                    borderBottomLeftRadius: isFirst ? '9999px' : '0px',
                    borderTopRightRadius: isLast ? '9999px' : '0px',
                    borderBottomRightRadius: isLast ? '9999px' : '0px',
                    opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                    zIndex: isThisStepFocused ? 10 : 1,
                  }}
                >
                  <FittedDuration duration={step.duration} isWalk={isWalk} />
                </div>

                {/* 하단 노선명 텍스트 */}
                {hasTransit && (
                  <div 
                    className="text-center mt-1 text-[9px] font-extrabold truncate px-0.5 min-h-[12px] min-w-0 overflow-hidden transition-all duration-200"
                    style={{
                      opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                    }}
                    title={step.type !== 'walk' ? step.name : undefined}
                  >
                    {step.type !== 'walk' ? (
                      <span style={{ color: stepColor }} className="truncate">
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
  place: Place;
  nextPlace: Place | null;
  segmentData?: DirectionsApiResponse;
  loading?: boolean;
  onSelect?: () => void;
  transportType: 'public' | 'car' | 'walk';
}

function AlternativeSegmentInfo({ place, nextPlace, segmentData, loading, onSelect, transportType }: AlternativeSegmentInfoProps) {
  const [activeTab, setActiveTab] = useState<'public' | 'car' | 'walk'>(transportType);
  const { selectSegmentRoute, setFocusBounds, setFocusedSegment, setFocusedStep } = useJourneyStore();

  if (loading) {
    return (
      <div className="mx-4 px-4 py-3 bg-white rounded-xl border border-zinc-200 shadow-sm animate-pulse flex flex-col gap-2">
        <div className="h-4 bg-zinc-200 rounded w-20 mb-1"></div>
        <div className="h-8 bg-zinc-200 rounded w-full"></div>
        <div className="h-8 bg-zinc-200 rounded w-full"></div>
      </div>
    );
  }

  if (!segmentData) return null;

  const destId = nextPlace?.id || '';
  const routes = segmentData[activeTab] || [];
  const selectedRoute = place.selected_route && place.selected_route.destId === destId ? place.selected_route : null;

  const getEmoji = (type: string, name: string) => {
    if (type === 'public') {
      if (name.includes('기차') || name.includes('KTX') || name.includes('SRT') || name.includes('새마을') || name.includes('무궁화') || name.includes('ITX')) return '🚄';
      if (name.includes('지하철') || name.includes('선')) return '🚇';
      return '🚌';
    }
    if (type === 'taxi') return '🚕';
    if (type === 'car') return '🚗';
    if (type === 'walk') return '🚶';
    if (type === 'bicycle') return '🚴';
    if (type === 'kickboard') return '🛴';
    return '🚶';
  };

  return (
    <div className="mx-4 px-4 py-3 bg-white rounded-xl border border-zinc-200 shadow-sm flex flex-col gap-3">
      {/* Title */}
      <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">대안 이동 수단</div>

      {/* Tabs */}
      <div className="flex bg-zinc-50 p-0.5 rounded-lg border border-zinc-100">
        {(['public', 'car', 'walk'] as const).map((tab) => {
          const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`
                flex-1 py-1 text-xs font-semibold rounded-md transition-all duration-200 cursor-pointer
                ${isActive
                  ? 'bg-white text-blue-600 shadow-sm border border-zinc-150'
                  : 'text-zinc-500 hover:text-zinc-800'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* List Container with fixed height for exactly 2.5 items */}
      <div className="max-h-[126px] overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
        {routes.length === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-400">
            선택 가능한 경로가 없습니다.
          </div>
        ) : (
          routes.map((route) => {
            const isSelected = selectedRoute ? selectedRoute.id === route.id : false;
            const emoji = getEmoji(route.type, route.name);

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => {
                  const selectedRoute = {
                    destId,
                    id: route.id,
                    type: route.type,
                    name: route.name,
                    duration: route.duration,
                    fare: route.fare,
                    taxiFare: route.taxiFare,
                    distance: route.distance,
                    isIntercity: route.isIntercity,
                    isFareEstimated: route.isFareEstimated,
                    steps: route.steps,
                    pathPoints: route.pathPoints,
                    guide: route.guide,
                  };
                  selectSegmentRoute(place.id, selectedRoute);
                  if (nextPlace) {
                    const bounds = calculateSegmentBounds(place, nextPlace, selectedRoute);
                    setFocusBounds(bounds);
                    setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedStep(null);
                  }
                  onSelect?.();
                }}
                className={`
                  flex items-center justify-between w-full h-[46px] px-3 rounded-lg border transition-all duration-200 text-left cursor-pointer
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                    : 'border-zinc-100 bg-zinc-50/30 hover:border-zinc-300 hover:bg-zinc-50'
                  }
                `}
              >
                {/* Left: Icon and Name/Fare */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{emoji}</span>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[11px] font-bold truncate leading-tight ${isSelected ? 'text-blue-700' : 'text-zinc-700'}`}>
                      {route.name}
                    </span>
                    {activeTab === 'car' ? (
                      <span className="text-[9px] text-zinc-400 font-medium mt-0.5">
                        택시 {route.taxiFare?.toLocaleString()}원 {route.fare > 0 ? `(통행료 ${route.fare.toLocaleString()}원)` : '(통행료 무료)'}
                      </span>
                    ) : activeTab === 'walk' ? (
                      <span className="text-[9px] text-zinc-400 font-medium mt-0.5">
                        무료
                      </span>
                    ) : (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? (
                      <span className="text-[9px] text-zinc-400 font-medium mt-0.5">
                        예매처 확인
                      </span>
                    ) : route.fare > 0 ? (
                      <span className="text-[9px] text-zinc-400 font-medium mt-0.5">
                        {route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}
                      </span>
                    ) : (
                      <span className="text-[9px] text-zinc-400 font-medium mt-0.5">
                        요금 정보 없음
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Duration & Status Check */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] font-extrabold ${isSelected ? 'text-blue-600' : 'text-zinc-800'}`}>
                    {route.duration}분
                  </span>
                  {isSelected && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 text-blue-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            );
          })
        )}
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
  const { directionsCache, directionsLoading, fetchSegmentDirections, setFocusBounds, focusedSegment, setFocusedSegment, setFocusedStep } = useJourneyStore();
  const [showAlternatives, setShowAlternatives] = useState(false);

  const cacheKey = nextPlace ? `${place.id}-${nextPlace.id}` : '';
  const segmentData = nextPlace ? directionsCache[cacheKey] : undefined;
  const isSegmentLoading = nextPlace ? directionsLoading[cacheKey] : false;

  useEffect(() => {
    if (!editMode && nextPlace) {
      fetchSegmentDirections(place, nextPlace);
    }
  }, [editMode, place, nextPlace, fetchSegmentDirections]);

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
          className={`place-card-content flex-1 min-w-0 mx-2 mb-1 bg-white border border-zinc-100 rounded-2xl shadow-sm transition-all duration-200 ${
            editMode
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
            <button
              type="button"
              className="w-full text-left focus:outline-none"
              onClick={() => {
                if (nextPlace) {
                  // 이미 해당 구간이 포커스된 경우 토글 해제
                  if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                    setFocusedSegment(null);
                    setFocusBounds(null);
                    setFocusedStep(null);
                  } else {
                    const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                    setFocusBounds(bounds);
                    setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                    setFocusedStep(null);
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
            </button>


          </div>
        );
      })()}
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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

    // Find the clean card element to use as the drag preview
    const cardElement = (e.currentTarget as HTMLElement).querySelector('.place-card-content');
    if (cardElement) {
      const rect = cardElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      e.dataTransfer.setDragImage(cardElement, x, y);
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!editMode) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Shift places dynamically
    const updated = [...localPlaces];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setLocalPlaces(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
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
            isDragged={draggedIndex === idx}
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
