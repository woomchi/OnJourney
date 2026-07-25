"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { DirectionResult } from '@/types/journey';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';
import { SEQUENCE_COLORS } from '@/constants/colors';
import FittedDuration from './FittedDuration';
import { Car, Footprints, Bus, Train } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import { AlternativeRouteIcon } from '@/components/ui/icons';

// 1. 구간 이동 정보 뼈대 로딩 UI
export function SegmentInfoSkeleton() {
  return (
    <div className="w-full px-4 py-4 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-zinc-200 rounded w-24 animate-pulse"></div>
        <div className="h-4 bg-zinc-200 rounded w-16 animate-pulse"></div>
      </div>
      <div className="h-3 bg-zinc-200 rounded-full w-full animate-pulse"></div>
    </div>
  );
}

interface SegmentInfoProps {
  data?: DirectionResult;
  loading?: boolean;
  index: number;
  placeId?: string;
  destId?: string;
}

// 2. 실시간 구간 이동 정보 렌더링 컴포넌트
export default function SegmentInfo({ data, loading, index, placeId, destId }: SegmentInfoProps) {
  const queryClient = useQueryClient();
  const { 
    focusedStep, 
    setFocusedStep, 
    focusedSegment, 
    setFocusedSegment, 
    setFocusBounds,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
    activeJourney
  } = useJourneyStore();

  if (loading) {
    return <SegmentInfoSkeleton />;
  }

  if (!data) {
    return (
      <div className="w-full px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-100 text-center text-xs text-zinc-400">
        경로 정보를 불러올 수 없습니다.
      </div>
    );
  }

  // Calculate percentage widths using a power-curve to compress proportions
  const COMPRESS_POWER = 0.3;
  const MIN_PCT = 12; // minimum percentage for any step
  const compressed = data.steps.map(s => Math.pow(Math.max(s.duration, 1), COMPRESS_POWER));
  const compressedTotal = compressed.reduce((a, b) => a + b, 0) || 1;
  const rawPcts = compressed.map(c => (c / compressedTotal) * 100);
  const clampedPcts = rawPcts.map(p => Math.max(p, MIN_PCT));
  const clampedSum = clampedPcts.reduce((a, b) => a + b, 0);
  const normalizedPcts = clampedPcts.map(p => (p / clampedSum) * 100);

  const isThisSegmentFocused = focusedSegment?.originId === placeId && focusedSegment?.destId === destId;
  const segmentColor = SEQUENCE_COLORS[index % SEQUENCE_COLORS.length];

  const duration = data.duration ? `${data.duration}분` : '';
  const type = data.type || 'public';

  const distanceVal = data.distance;
  const formattedDistance = distanceVal != null
    ? (distanceVal >= 1 ? `${distanceVal.toFixed(1)}km` : `${Math.round(distanceVal * 1000)}m`)
    : '';

  const fareVal = data.fare || data.taxiFare;
  const formattedFare = fareVal
    ? (data.taxiFare && !data.fare ? `택시 ${data.taxiFare.toLocaleString()}원` : `${data.fare.toLocaleString()}원`)
    : '';

  let transferLabel = '';
  let stepBadges: string[] = [];
  if (type === 'public' && data.steps) {
    const transitSteps = data.steps.filter((s: any) => s.type !== 'walk');
    const transitStepsCount = transitSteps.length;
    const transferCount = Math.max(0, transitStepsCount - 1);
    transferLabel = `환승 ${transferCount}회`;
    stepBadges = transitSteps
      .filter((s: any) => s.name)
      .map((s: any) => s.name.replace(/지하철\s*/, ''));
  } else if (type === 'car') {
    transferLabel = '차량';
  } else if (type === 'walk') {
    transferLabel = '도보';
  }

  // Get active Places for Alternative route prefetching
  const places = activeJourney?.places || [];
  const originPlace = places.find(p => p.id === placeId);
  const destPlace = places.find(p => p.id === destId);

  const getTransportIcon = (tType: string, steps: any[] = []) => {
    if (tType === 'car' || tType === 'taxi') return <Car className="w-7 h-7" />;
    if (tType === 'walk') return <Footprints className="w-7 h-7" />;

    const hasSubway = steps.some((s: any) => s.type === 'subway' || s.type === 'train');
    const hasBus = steps.some((s: any) => s.type === 'bus' || s.type === 'expressbus');

    if (hasSubway && hasBus) {
      return (
        <div className="flex items-center gap-1">
          <Bus className="w-7 h-7" />
          <Train className="w-7 h-7" />
        </div>
      );
    }
    if (hasSubway) return <Train className="w-7 h-7" />;
    if (hasBus) return <Bus className="w-7 h-7" />;
    return <Bus className="w-7 h-7" />;
  };

  return (
    <div 
      className={`w-full px-4 py-3 rounded-xl transition-all duration-200 border select-none ${
        isThisSegmentFocused
          ? 'bg-blue-50/50 border-blue-400 shadow-[0_4px_16px_rgba(59,130,246,0.12)]'
          : 'bg-white border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99]'
      }`}
    >
      {/* 1. 이동 요약 정보 (가로형 요약 바 스타일 + 요약 카드 내 버튼 포함) */}
      <div className="flex items-center justify-between w-full min-w-0 gap-2">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* 수단 아이콘 (구간 별 테마 컬러스킴 적용) */}
          <div
            style={
              isThisSegmentFocused
                ? { backgroundColor: segmentColor, color: '#FFFFFF' }
                : { backgroundColor: `${segmentColor}12`, color: segmentColor }
            }
            className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200"
          >
            {getTransportIcon(type, data.steps)}
          </div>

          {/* 소요 시간, 환승 정보, 요금 요약 */}
          <div className="flex flex-col min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-tight text-[24px] text-zinc-800">
                {duration || '이동'}
              </span>
              {formattedDistance && (
                <span className="text-[19px] text-zinc-400 font-semibold border-l border-zinc-200 pl-2">
                  {formattedDistance}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5 text-[17.5px] font-bold text-zinc-400 mt-1">
              <span className={isThisSegmentFocused ? 'text-blue-600/90' : 'text-zinc-500'}>
                {type === 'public' ? transferLabel : type === 'car' ? '차량' : '도보'}
              </span>
              <span className="opacity-40">·</span>
              <span className={isThisSegmentFocused ? 'text-zinc-600' : 'text-zinc-500'}>
                {type === 'car' ? (
                  data.taxiFare ? `택시 ${data.taxiFare.toLocaleString()}원` : '비용 정보 없음'
                ) : type === 'walk' ? (
                  '무료'
                ) : fareVal ? (
                  formattedFare
                ) : (
                  '요금 정보 없음'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* 대안 경로 탐색 버튼 (요약 카드 내부 우측 배치) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!placeId || !destId) return;
            const isCurrentlyOpen = alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId;
            
            if (!isCurrentlyOpen && originPlace && destPlace) {
              const wasFocused = focusedSegment?.originId === placeId && focusedSegment?.destId === destId;
              setIsAlternativeFromFocus(wasFocused);
              setAlternativeSegment({ originId: placeId, destId: destId });
              setFocusedSegment(null);
              setFocusedStep(null);
              if (data) {
                const bounds = calculateSegmentBounds(originPlace, destPlace, data);
                setFocusBounds(bounds);
              }
              // prefetch alternate routes data
              const cacheKey = `${placeId}-${destId}`;
              const segmentDataInCache = queryClient.getQueryData(directionKeys.segmentPublic(placeId, destId));
              if (!segmentDataInCache) {
                Promise.allSettled([
                  queryClient.fetchQuery({
                    queryKey: directionKeys.segmentPublic(placeId, destId),
                    queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace)
                  }),
                  queryClient.fetchQuery({
                    queryKey: directionKeys.segmentCar(placeId, destId),
                    queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace)
                  })
                ]).catch(console.error);
              }
            } else {
              setAlternativeSegment(null);
              if (isAlternativeFromFocus && originPlace && destPlace) {
                setFocusedSegment({ originId: placeId, destId: destId });
                if (data) {
                  const bounds = calculateSegmentBounds(originPlace, destPlace, data);
                  setFocusBounds(bounds);
                }
              } else {
                setFocusBounds(null);
              }
            }
          }}
          className={`
            flex items-center justify-center w-7.5 h-7.5 rounded-lg border transition-all duration-300 shadow-2xs cursor-pointer shrink-0
            ${alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
              : 'bg-zinc-50 border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600'
            }
          `}
          title="대안 경로 탐색"
        >
          <AlternativeRouteIcon 
            isActive={alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId}
            className="w-3.5 h-3.5"
          />
        </button>
      </div>

      {/* 2. 동적 타임라인 바 및 하단 노선 정보 (포커스/선택 시에만 확장되어 노출됨) */}
      {isThisSegmentFocused && (
        <div className="border-t border-zinc-100 mt-2.5 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex mt-2 mb-1 relative" style={{ paddingLeft: '8px', paddingRight: '4px' }}>
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
              const stepColor = step.type === 'walk' ? '#E4E4E7' : segmentColor;

              const isWalk = step.type === 'walk';

              const isThisStepFocused = !!(
                focusedStep &&
                focusedStep.originId === placeId &&
                focusedStep.destId === destId &&
                focusedStep.stepIndex === idx
              );
              const hasFocusedStep = !!(focusedStep && focusedStep.subType !== 'dest');

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
                      let subType: 'start' | 'end' | 'dest' | undefined = undefined;
                      if (step.type === 'car' || step.type === 'taxi') {
                        subType = 'start';
                      } else if (step.type !== 'walk' && step.startName) {
                        subType = 'start';
                      }

                      let lat = step.startLat;
                      let lng = step.startLng;

                      if (lat === undefined || lng === undefined) {
                        if (step.pathPoints && step.pathPoints.length > 0) {
                          lat = step.pathPoints[0].lat;
                          lng = step.pathPoints[0].lng;
                        }
                      }

                      if (lat !== undefined && lng !== undefined) {
                        setFocusBounds({
                          sw: { lat, lng },
                          ne: { lat, lng }
                        });
                      } else {
                        const bounds = calculateStepBounds(step);
                        if (bounds) {
                          setFocusBounds(bounds);
                        }
                      }

                      setFocusedStep({
                        originId: placeId,
                        destId,
                        stepIndex: idx,
                        subType
                      });
                    }
                  }}
                >
                  {/* 아이콘 백그라운드 컷아웃 */}
                  <div
                    className="absolute left-0 -translate-x-1/2 bg-white rounded-full z-[15] transition-all duration-200"
                    style={{ width: '20px', height: '20px', top: '-4px' }}
                  />

                  {/* 아이콘 */}
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
