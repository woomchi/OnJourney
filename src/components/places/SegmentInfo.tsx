"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { DirectionResult } from '@/types/journey';
import { calculateSegmentBounds, calculateStepBounds, calculateHaversineDistance } from '@/lib/naverMapRouteService';
import { SEQUENCE_COLORS } from '@/constants/colors';
import FittedDuration from './FittedDuration';
import { Car, Footprints, Bus, Train, RotateCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys } from '@/hooks/queries/useDirections';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import { AlternativeRouteIcon } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatKmDistance, formatDurationMinutes, inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import RouteTimelineGaugeBar from '@/components/route/RouteTimelineGaugeBar';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';

// 1. 구간 이동 정보 뼈대 로딩 UI
export function SegmentInfoSkeleton() {
  return (
    <div className="w-full px-4 py-3.5 bg-white/95 rounded-2xl border border-zinc-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] animate-pulse flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-zinc-200" />
          <div className="h-4 bg-zinc-200 rounded-md w-20" />
          <div className="h-3.5 bg-zinc-150 rounded-md w-12" />
        </div>
        <div className="h-4 bg-zinc-200 rounded-md w-14" />
      </div>
      <div className="h-2.5 bg-zinc-150 rounded-full w-full" />
    </div>
  );
}

interface SegmentInfoProps {
  data?: DirectionResult;
  loading?: boolean;
  index: number;
  placeId?: string;
  destId?: string;
  onRetry?: () => void;
}

// 2. 실시간 구간 이동 정보 렌더링 컴포넌트
export default function SegmentInfo({ data, loading, index, placeId, destId, onRetry }: SegmentInfoProps) {
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isTimedOut, setIsTimedOut] = useState(false);

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

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
    activeJourney,
    departureTime
  } = useJourneyStore();

  useEffect(() => {
    if (!loading) {
      setIsTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setIsTimedOut(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [loading]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTimedOut(false);

    if (placeId && destId) {
      queryClient.invalidateQueries({ queryKey: directionKeys.segment(placeId, destId) });
      const places = activeJourney?.places || [];
      const originPlace = places.find(p => p.id === placeId);
      const destPlace = places.find(p => p.id === destId);
      if (originPlace && destPlace) {
        Promise.allSettled([
          queryClient.fetchQuery({
            queryKey: directionKeys.segmentPublic(placeId, destId, departureTime),
            queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace, departureTime || undefined)
          }),
          queryClient.fetchQuery({
            queryKey: directionKeys.segmentCar(placeId, destId, departureTime),
            queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace, departureTime || undefined)
          })
        ]).catch(console.error);
      }
    }

    if (onRetry) {
      onRetry();
    }
  };

  if (loading && !isTimedOut) {
    return <SegmentInfoSkeleton />;
  }

  if (isTimedOut || !data) {
    return (
      <div className="w-full px-4 py-3 bg-amber-50/50 border border-amber-200/80 rounded-xl shadow-2xs flex items-center justify-between gap-3 text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
          <span className="text-zinc-600 font-bold truncate">
            이동 정보를 불러올 수 없습니다.
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 hover:border-amber-400 hover:bg-amber-50 text-amber-700 hover:text-amber-800 rounded-lg shadow-2xs text-xs font-bold transition-all duration-200 shrink-0 cursor-pointer active:scale-95"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>재갱신</span>
        </button>
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

  const duration = data.duration ? formatDurationMinutes(data.duration) : '';
  const type = data.type || 'public';

  // Get active Places for Alternative route prefetching & distance calculation
  const places = activeJourney?.places || [];
  const originPlace = places.find(p => p.id === placeId);
  const destPlace = places.find(p => p.id === destId);

  const getDistanceKm = (): number | null => {
    if (data?.distance != null && data.distance > 0) {
      return data.distance;
    }
    if (data?.pathPoints && data.pathPoints.length > 1) {
      let totalMeters = 0;
      for (let i = 0; i < data.pathPoints.length - 1; i++) {
        totalMeters += calculateHaversineDistance(
          data.pathPoints[i].lat,
          data.pathPoints[i].lng,
          data.pathPoints[i + 1].lat,
          data.pathPoints[i + 1].lng
        );
      }
      if (totalMeters > 0) return totalMeters / 1000;
    }
    if (originPlace && destPlace) {
      const meters = calculateHaversineDistance(
        originPlace.lat,
        originPlace.lng,
        destPlace.lat,
        destPlace.lng
      );
      if (meters > 0) return meters / 1000;
    }
    return null;
  };

  const distKm = getDistanceKm();
  const formattedDistance = formatKmDistance(distKm);

  const getArrivalTimeStr = () => {
    if (!now || !data?.duration) return '';
    const arrTime = new Date(now.getTime() + data.duration * 60 * 1000);
    const arrHours = String(arrTime.getHours()).padStart(2, '0');
    const arrMins = String(arrTime.getMinutes()).padStart(2, '0');
    return `${arrHours}:${arrMins}`;
  };

  const arrStr = getArrivalTimeStr();

  // 1시간 이상 시 "1시간", "37분" 수직 2줄 분할 렌더링 헬퍼
  const durationMatch = duration ? duration.match(/^(\d+시간)\s*(\d+분)$/) : null;
  const isMultiLineDuration = Boolean(durationMatch);
  const hourPart = durationMatch ? durationMatch[1] : '';
  const minPart = durationMatch ? durationMatch[2] : '';

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

  // 이동 구간 내 첫 번째 대중교통 정보 추출 (실시간 칩 연결용 - 첫 번째 이동 수단 우선)
  const firstTransitStep = data.steps?.find((s: any) => s.type !== 'walk') || null;
  const targetBusStep = firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus') ? firstTransitStep : null;
  const targetSubwayStep = firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train') ? firstTransitStep : null;
  const targetSubwayStationName = targetSubwayStep?.startName || originPlace?.place_name;
  const rawStationId =
    (targetBusStep as any)?.realtimeStationId ||
    (targetBusStep as any)?.startStationID ||
    (targetBusStep as any)?.startID ||
    (targetBusStep as any)?.startStationId ||
    (targetBusStep as any)?.nodeId;
  const targetBusStationId = rawStationId ? String(rawStationId) : undefined;
  const targetBusStationName = targetBusStep?.startName || originPlace?.place_name;
  const targetBusName = targetBusStep?.name || '';
  const targetOdsayBusId = (targetBusStep as any)?.odsayBusId || (targetBusStep as any)?.busID;
  const targetTagoRouteId = (targetBusStep as any)?.tagoRouteId || (targetBusStep as any)?.busLocalBlID;
  const targetBusId = targetOdsayBusId || targetTagoRouteId;
  const targetBusType = (targetBusStep as any)?.busType;
  const targetBusDestination = targetBusStep?.endName;
  const targetBusHeadsign = targetBusStep?.headsign;
  const targetBusIntervalTime = (targetBusStep as any)?.intervalTime;
  const targetBusStartDateTime = (targetBusStep as any)?.startDateTime;
  const inferredRegion = (targetBusStep as any)?.startRegion || inferRegionFromPlace(originPlace);
  const targetBusLat = (targetBusStep as any)?.startY || (targetBusStep as any)?.startLat || (originPlace as any)?.y || (originPlace as any)?.lat;
  const targetBusLng = (targetBusStep as any)?.startX || (targetBusStep as any)?.startLng || (originPlace as any)?.x || (originPlace as any)?.lng;
  const targetCityCode = (targetBusStep as any)?.startCityCode;

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

  if (isMobile) {
    return (
      <div
        className="w-full px-4 py-3 rounded-xl transition-all duration-200 border select-none bg-white border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99]"
      >
        {/* 1. 이동 요약 정보 (가로형 요약 바 스타일 + 요약 카드 내 버튼 포함) */}
        <div className="flex items-center justify-between w-full min-w-0 gap-2">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            {/* 수단 아이콘 (구간 별 테마 컬러스킴 적용) */}
            <div
              style={{ backgroundColor: `${segmentColor}12`, color: segmentColor }}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200"
            >
              {getTransportIcon(type, data.steps)}
            </div>

            {/* 소요 시간(좌: 시간/도착예정) & 상세 정보(우: 수단·거리 뱃지/요금) Split 구조 */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
              {/* 좌: 분 단위 기준 너비 고정(w-[58px]) & 1시간 이상 시 수직 2줄 분할 렌더링 */}
              <div className="flex flex-col justify-center w-[58px] min-w-[58px] max-w-[58px] pr-2.5 border-r border-zinc-100 shrink-0">
                {isMultiLineDuration ? (
                  <div className="flex flex-col leading-none gap-0.5">
                    <span className="font-black text-[15px] text-zinc-900 tracking-tight leading-tight whitespace-nowrap text-left">
                      {hourPart}
                    </span>
                    <span className="font-black text-[15px] text-zinc-900 tracking-tight leading-tight whitespace-nowrap text-left">
                      {minPart}
                    </span>
                  </div>
                ) : (
                  <span className="font-extrabold text-[20px] text-zinc-800 leading-none whitespace-nowrap text-left tracking-tight">
                    {duration || '이동'}
                  </span>
                )}
                {arrStr && (
                  <span className={clsx("font-medium text-zinc-400 whitespace-nowrap text-left", isMultiLineDuration ? "text-[10px] mt-0.5" : "text-[11px] mt-1")}>
                    {arrStr} 도착
                  </span>
                )}
              </div>

              {/* 우: 정보 텍스트 (요금, 거리, 수단) 및 타깃 버스 실시간 (수직 구조 분리) */}
              <div className="flex flex-col justify-center min-w-0 flex-1 text-[12px] font-medium text-zinc-500 gap-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="shrink-0">
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
                  <span className="text-zinc-300 select-none shrink-0">·</span>
                  {formattedDistance && (
                    <>
                      <span className="shrink-0">{formattedDistance}</span>
                      <span className="text-zinc-300 select-none shrink-0">·</span>
                    </>
                  )}
                  <span className="shrink-0">
                    {type === 'public' ? transferLabel : type === 'car' ? '차량' : '도보'}
                  </span>
                </div>

                {/* 타깃 이동 수단 실시간 수직 독립 레이아웃 */}
                {targetBusStep && targetBusName ? (
                  <div
                    className="flex items-center pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <SegmentBusRealtimeChip
                      region={inferredRegion}
                      stationId={targetBusStationId}
                      stationName={targetBusStationName}
                      cityCode={targetCityCode}
                      busNo={targetBusName}
                      busId={targetBusId}
                      odsayBusId={targetOdsayBusId}
                      tagoRouteId={targetTagoRouteId}
                      destination={targetBusDestination}
                      headsign={targetBusHeadsign}
                      intervalTime={targetBusIntervalTime}
                      startDateTime={targetBusStartDateTime}
                      busType={targetBusType}
                      busColor={targetBusStep?.color}
                      lat={targetBusLat ? Number(targetBusLat) : undefined}
                      lng={targetBusLng ? Number(targetBusLng) : undefined}
                      variant="sidebar"
                    />
                  </div>
                ) : targetSubwayStep && targetSubwayStationName ? (
                  <div
                    className="flex items-center pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <SegmentSubwayRealtimeChip
                      stationName={targetSubwayStationName}
                      wayCode={targetSubwayStep.wayCode !== undefined ? String(targetSubwayStep.wayCode) : undefined}
                      subwayId={targetSubwayStep.rawLineName || targetSubwayStep.name}
                      destination={targetSubwayStep.endName}
                      headsign={targetSubwayStep.headsign}
                      variant="sidebar"
                    />
                  </div>

                ) : null}
              </div>
            </div>
          </div>

          {/* 대안 경로 탐색 버튼 (요약 카드 내부 우측 배치 & 마이크로 인터랙션) */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!placeId || !destId) return;
              const isCurrentlyOpen = alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId;

              if (!isCurrentlyOpen && originPlace && destPlace) {
                const wasFocused = focusedSegment?.originId === placeId && focusedSegment?.destId === destId;
                setIsAlternativeFromFocus(wasFocused);
                setAlternativeSegment({ originId: placeId, destId: destId });
                if (data) {
                  const bounds = calculateSegmentBounds(originPlace, destPlace, data);
                  setFocusBounds(bounds);
                }
                // prefetch alternate routes data
                const cacheKey = `${placeId}-${destId}`;
                const segmentDataInCache = queryClient.getQueryData(directionKeys.segmentPublic(placeId, destId, departureTime));
                if (!segmentDataInCache) {
                  Promise.allSettled([
                    queryClient.fetchQuery({
                      queryKey: directionKeys.segmentPublic(placeId, destId, departureTime),
                      queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace, departureTime || undefined)
                    }),
                    queryClient.fetchQuery({
                      queryKey: directionKeys.segmentCar(placeId, destId, departureTime),
                      queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace, departureTime || undefined)
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
              flex items-center justify-center w-6.5 h-6.5 rounded-md border transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer shrink-0
              ${alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'bg-zinc-50 border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600'
              }
            `}
            aria-label="대안 경로 탐색"
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
            <div 
              className="w-full overflow-x-auto scrollbar-none mt-1 mb-1 relative cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div 
                className="flex relative" 
                style={{ 
                  paddingLeft: '8px', 
                  paddingRight: '12px',
                  minWidth: data.steps.length >= 4 ? `${data.steps.length * 76}px` : '100%'
                }}
              >
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
                        width: data.steps.length >= 4 ? `${100 / data.steps.length}%` : `${pct}%`,
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
                          {(() => {
                            const nameStr = step.name || '';
                            if (step.type === 'subway') {
                              return nameStr.endsWith('선') && nameStr.length >= 4 ? nameStr.slice(0, -1) : (nameStr || '지하철');
                            }
                            return nameStr ? nameStr.replace(' 버스', '') : '대중교통';
                          })()}
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
        </div>
      )}
    </div>
  );
}

  // Desktop Web UI: Classic always-visible horizontal timeline bar (gauge bar) format
  const transitSteps = data.steps.filter((s: any) => s.type !== 'walk');
  const hasTransit = transitSteps.length > 0;

  return (
    <div
      className="w-full px-4 py-2.5 rounded-xl transition-all duration-200 border select-none cursor-pointer bg-white border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99]"
    >
      {/* 대안 2: 좌/우 Split 구조 (좌: 시간 & 도착예정 수직배치 / 우: 수단·거리 뱃지/요금) */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        {/* 좌측 영역: 소요시간(분 단위 기준 너비 고정 & 1시간 이상 시 수직 2줄 분할) + 아래 도착예정시간 */}
        <div className="flex flex-col justify-center w-[58px] min-w-[58px] max-w-[58px] pr-2.5 border-r border-zinc-100 shrink-0">
          {isMultiLineDuration ? (
            <div className="flex flex-col leading-none gap-0.5">
              <span className="font-black text-[15px] text-zinc-900 tracking-tight leading-tight whitespace-nowrap text-left">
                {hourPart}
              </span>
              <span className="font-black text-[15px] text-zinc-900 tracking-tight leading-tight whitespace-nowrap text-left">
                {minPart}
              </span>
            </div>
          ) : (
            <span className="font-extrabold text-[18px] text-zinc-900 leading-none whitespace-nowrap text-left tracking-tight">
              {duration || '이동'}
            </span>
          )}
          {arrStr && (
            <span className={clsx("font-medium text-zinc-400 whitespace-nowrap text-left", isMultiLineDuration ? "text-[10px] mt-0.5" : "text-[11px] mt-0.5")}>
              {arrStr} 도착
            </span>
          )}
        </div>

        {/* 우측 영역: 요금/거리/이동수단 (상단) 및 타깃 버스 실시간 (수직 구조 분리) */}
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div className="flex flex-col justify-center min-w-0 flex-1 text-[11px] font-medium text-zinc-500 gap-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="shrink-0">
                {type === 'car' || type === 'taxi' ? (
                  data.taxiFare ? `택시 ${data.taxiFare.toLocaleString()}원${data.fare > 0 ? ` (통행료 ${data.fare.toLocaleString()}원)` : ''}` : '비용 정보 없음'
                ) : type === 'walk' || type === 'bicycle' ? (
                  '무료'
                ) : (data.isIntercity || data.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && data.fare === 0 ? (
                  '예매처 확인'
                ) : data.fare > 0 ? (
                  data.isFareEstimated ? `약 ${data.fare.toLocaleString()}원` : `${data.fare.toLocaleString()}원`
                ) : (
                  '요금 정보 없음'
                )}
              </span>
              <span className="text-zinc-300 select-none shrink-0">·</span>
              {formattedDistance && (
                <>
                  <span className="shrink-0">{formattedDistance}</span>
                  <span className="text-zinc-300 select-none shrink-0">·</span>
                </>
              )}
              <span className="shrink-0">
                {type === 'public' ? transferLabel : type === 'car' ? '차량' : '도보'}
              </span>
            </div>

            {/* 타깃 이동 수단 실시간 수직 독립 레이아웃 */}
            {targetBusStep && targetBusName ? (
              <div
                className="flex items-center pt-0.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <SegmentBusRealtimeChip
                  region={inferredRegion}
                  stationId={targetBusStationId}
                  stationName={targetBusStationName}
                  cityCode={targetCityCode}
                  busNo={targetBusName}
                  busId={targetBusId}
                  odsayBusId={targetOdsayBusId}
                  tagoRouteId={targetTagoRouteId}
                  destination={targetBusDestination}
                  headsign={targetBusHeadsign}
                  intervalTime={targetBusIntervalTime}
                  startDateTime={targetBusStartDateTime}
                  busType={targetBusType}
                  busColor={targetBusStep?.color}
                  lat={targetBusLat ? Number(targetBusLat) : undefined}
                  lng={targetBusLng ? Number(targetBusLng) : undefined}
                  variant="sidebar"
                />
              </div>
            ) : targetSubwayStep && targetSubwayStationName ? (
              <div
                className="flex items-center pt-0.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <SegmentSubwayRealtimeChip
                  stationName={targetSubwayStationName}
                  wayCode={targetSubwayStep.wayCode !== undefined ? String(targetSubwayStep.wayCode) : undefined}
                  subwayId={targetSubwayStep.rawLineName || targetSubwayStep.name}
                  destination={targetSubwayStep.endName}
                  headsign={targetSubwayStep.headsign}
                  variant="sidebar"
                />
              </div>

            ) : null}
          </div>

          {/* 대안 경로 탐색 버튼 */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!placeId || !destId) return;
              const isCurrentlyOpen = alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId;

              if (!isCurrentlyOpen && originPlace && destPlace) {
                const wasFocused = focusedSegment?.originId === placeId && focusedSegment?.destId === destId;
                setIsAlternativeFromFocus(wasFocused);
                setAlternativeSegment({ originId: placeId, destId: destId });
                if (data) {
                  const bounds = calculateSegmentBounds(originPlace, destPlace, data);
                  setFocusBounds(bounds);
                }
                // prefetch alternate routes data
                const cacheKey = `${placeId}-${destId}`;
                const segmentDataInCache = queryClient.getQueryData(directionKeys.segmentPublic(placeId, destId, departureTime));
                if (!segmentDataInCache) {
                  Promise.allSettled([
                    queryClient.fetchQuery({
                      queryKey: directionKeys.segmentPublic(placeId, destId, departureTime),
                      queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace, departureTime || undefined)
                    }),
                    queryClient.fetchQuery({
                      queryKey: directionKeys.segmentCar(placeId, destId, departureTime),
                      queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace, departureTime || undefined)
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
            flex items-center justify-center w-6.5 h-6.5 rounded-md border transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer shrink-0
            ${alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                : 'bg-zinc-50 border-zinc-200 hover:border-blue-300 text-zinc-500 hover:text-blue-600'
              }
          `}
            aria-label="대안 경로 탐색"
            title="대안 경로 탐색"
          >
            <AlternativeRouteIcon
              isActive={alternativeSegment?.originId === placeId && alternativeSegment?.destId === destId}
              className="w-3.5 h-3.5"
            />
          </button>
        </div>
      </div>

      {/* 동적 타임라인 바 및 하단 노선 정보 (시인성 기준 조건부 가로 스크롤 적용) */}
      <RouteTimelineGaugeBar steps={data.steps} className="mt-1 mb-0" />
    </div>
  );
}
