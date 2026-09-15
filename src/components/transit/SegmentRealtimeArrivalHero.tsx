'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Bus, Train, Footprints, Car } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DirectionStep, SelectedRoute, DirectionResult, Place } from '@/types/journey';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';
import { resolveSubwayNameForApi } from '@/lib/constants/subwayLineMap';
import { getSubwayColor, getBusColor } from '@/lib/services/directions/transit/transitColorUtils';
import { useJourneyStore } from '@/stores/journey-store';
import { GESTURE_THRESHOLDS } from '@/constants/layout';

interface SegmentRealtimeArrivalHeroProps {
  route: SelectedRoute | DirectionResult | null;
  originPlace?: Place | null;
  destPlace?: Place | null;
  className?: string;
}

interface TransitStepContext {
  step: DirectionStep;
  originalIndex: number;
  prevStep?: DirectionStep;
  nextStep?: DirectionStep;
}

/**
 * 이동수단 고유 고대비 브랜드 색상 추출
 */
export function getTransitColor(step: DirectionStep): string {
  if (
    step.color &&
    step.color.startsWith('#') &&
    step.color !== '#9CA3AF' &&
    step.color !== '#A1A1AA' &&
    step.color !== '#E4E4E7'
  ) {
    return step.color;
  }
  if (step.busLaneColor && step.busLaneColor.startsWith('#')) {
    return step.busLaneColor;
  }
  if (step.type === 'subway' || step.type === 'train') {
    return getSubwayColor(step.rawLineName || step.name || '');
  }
  if (step.type === 'bus' || step.type === 'expressbus') {
    return getBusColor(Number(step.busType) || 0, step.name || '');
  }
  return '#3B82F6';
}

/**
 * 버스 노선명을 'n번' 형식으로 정규화
 */
export function formatBusName(rawName?: string): string {
  if (!rawName) return '버스';
  const cleaned = cleanBusNumber(rawName) || rawName.trim();
  if (!cleaned) return '버스';
  if (cleaned.endsWith('번') || cleaned.endsWith('버스')) return cleaned;
  return `${cleaned}번`;
}

/**
 * 지하철 노선명을 공식 호선명 전체로 정규화
 */
export function formatSubwayLineName(step: DirectionStep): string {
  const resolved = resolveSubwayNameForApi(step.rawLineName || step.name || '');
  if (resolved) return resolved;
  const raw = (step.name || '').replace(/^수도권\s*/, '').trim();
  if (raw && (raw.includes('호선') || raw.includes('선') || raw.includes('철도') || raw.includes('라인'))) {
    return raw;
  }
  if (step.startName) {
    return `${step.startName.replace(/역$/g, '')}역`;
  }
  return '지하철';
}

/**
 * 대중교통 스텝 데이터에서 실시간 조회에 필요한 파라미터를 복원하는 헬퍼
 */
function extractTransitParams(
  context: TransitStepContext,
  originPlace?: Place | null,
  currentIndex: number = 0
) {
  const { step, prevStep } = context;
  const isBus = step.type === 'bus' || step.type === 'expressbus';
  const isSubway = step.type === 'subway' || step.type === 'train';

  // 역/정류소 명칭 복원
  const firstPassStation = step.passStopList?.stationList?.[0]?.stationName;
  const prevWalkEndName = prevStep && prevStep.type === 'walk' ? prevStep.endName : undefined;

  const rawSubwayStation =
    step.startName ||
    firstPassStation ||
    prevWalkEndName ||
    (currentIndex === 0 ? originPlace?.place_name : undefined) ||
    '';
  const subwayStationName = rawSubwayStation ? rawSubwayStation.replace(/역$/g, '').trim() : '';

  const rawBusStation =
    step.startName ||
    firstPassStation ||
    prevWalkEndName ||
    (currentIndex === 0 ? originPlace?.place_name : undefined) ||
    '';
  const busStationName = rawBusStation.trim();

  // 버스/지하철 탑승 좌표 복원
  const prevWalkLat = prevStep && prevStep.type === 'walk' ? (prevStep.endY || prevStep.endLat) : undefined;
  const prevWalkLng = prevStep && prevStep.type === 'walk' ? (prevStep.endX || prevStep.endLng) : undefined;
  const firstPassLat = step.passStopList?.stationList?.[0]?.lat;
  const firstPassLng = step.passStopList?.stationList?.[0]?.lng;

  const busLat =
    step.startY ||
    step.startLat ||
    step.pathPoints?.[0]?.lat ||
    firstPassLat ||
    prevWalkLat ||
    (currentIndex === 0 ? originPlace?.lat : undefined);
  const busLng =
    step.startX ||
    step.startLng ||
    step.pathPoints?.[0]?.lng ||
    firstPassLng ||
    prevWalkLng ||
    (currentIndex === 0 ? originPlace?.lng : undefined);

  const rawStationId =
    step.realtimeStationId ||
    step.startStationID ||
    step.startID ||
    step.startStationId ||
    step.nodeId ||
    (busStationName && (busLat || busLng) ? 'auto' : undefined);
  const busStationId = rawStationId ? String(rawStationId) : undefined;

  // 순수 버스 번호 정규화
  const rawBusName = step.name || '';
  const cleanedBusNo = cleanBusNumber(rawBusName);
  const busName = cleanedBusNo || rawBusName;

  const odsayBusId = step.odsayBusId || step.busID;
  const tagoRouteId = step.tagoRouteId || step.busLocalBlID;
  const busId = odsayBusId ? String(odsayBusId) : (tagoRouteId ? String(tagoRouteId) : undefined);
  const busType = step.busType;
  const busDestination = step.endName || step.destination;
  const busHeadsign = step.headsign;
  const busIntervalTime = step.intervalTime;
  const busStartDateTime = step.startDateTime;

  // 탑승 위치 좌표 및 정류소명 기반 권역 동적 역추론
  const inferredRegion =
    step.startRegion ||
    (busLat && busLng
      ? inferRegionFromPlace({ lat: busLat, lng: busLng, place_name: busStationName })
      : (originPlace ? inferRegionFromPlace(originPlace) : undefined));
  const cityCode = step.startCityCode || step.cityCode;

  // 지하철 노선명/식별자 정규화
  const normalizedSubwayId =
    resolveSubwayNameForApi(step.rawLineName || step.name || '') || (step.rawLineName || step.name);

  return {
    step,
    isBus,
    isSubway,
    subwayStationName,
    busStationName,
    busStationId,
    busName,
    busId,
    odsayBusId,
    tagoRouteId,
    busType,
    busDestination,
    busHeadsign,
    busIntervalTime,
    busStartDateTime,
    inferredRegion,
    cityCode,
    normalizedSubwayId,
    busLat,
    busLng,
    transitColor: getTransitColor(step),
  };
}

export default function SegmentRealtimeArrivalHero({
  route,
  originPlace,
  destPlace: _destPlace,
  className = '',
}: SegmentRealtimeArrivalHeroProps) {
  const focusedStep = useJourneyStore((state) => state.focusedStep);

  // 1. 이동 구간 내 모든 대중교통 스텝 및 원본 스텝 체인 컨텍스트 추출 (도보 및 차량/택시 제외)
  const transitStepContexts: TransitStepContext[] = useMemo(() => {
    if (!route || !route.steps || !Array.isArray(route.steps)) return [];
    const allSteps = route.steps;
    const contexts: TransitStepContext[] = [];

    allSteps.forEach((s: DirectionStep, origIdx: number) => {
      if (s.type !== 'walk' && s.type !== 'car' && s.type !== 'taxi') {
        contexts.push({
          step: s,
          originalIndex: origIdx,
          prevStep: origIdx > 0 ? allSteps[origIdx - 1] : undefined,
          nextStep: origIdx < allSteps.length - 1 ? allSteps[origIdx + 1] : undefined,
        });
      }
    });

    return contexts;
  }, [route]);

  // 활성 대중교통 인덱스 관리 (0 ~ transitStepContexts.length - 1)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  // route 변경 시 인덱스 리셋
  useEffect(() => {
    setCurrentIndex(0);
  }, [route]);

  // 하단 타임라인/스텝 컨트롤러(focusedStep)와 상단 대중교통 카드 양방향 동기화
  useEffect(() => {
    if (!focusedStep) return;
    const matchIdx = transitStepContexts.findIndex(
      (ctx) => ctx.originalIndex === focusedStep.stepIndex
    );
    if (matchIdx !== -1 && matchIdx !== currentIndex) {
      setSlideDirection(matchIdx > currentIndex ? 1 : -1);
      setCurrentIndex(matchIdx);
    }
  }, [focusedStep, transitStepContexts, currentIndex]);

  // 스와이프 제스처 추적용 ref
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const totalTransits = transitStepContexts.length;
  const hasMultiple = totalTransits > 1;
  const canGoPrev = hasMultiple && currentIndex > 0;
  const canGoNext = hasMultiple && currentIndex < totalTransits - 1;

  const handlePrev = () => {
    if (canGoPrev) {
      setSlideDirection(-1);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setSlideDirection(1);
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // 터치 스와이프 핸들러 (수평 스와이프 감지)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!hasMultiple) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!hasMultiple || touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.changedTouches[0].clientY - touchStartYRef.current;

    // 수평 이동 거리가 수직 이동 거리보다 크고, 지정된 최소 임계값 이상 이동했을 때만 전환
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > GESTURE_THRESHOLDS.HERO_SWIPE_MIN_PX) {
      if (deltaX < 0 && canGoNext) {
        handleNext();
      } else if (deltaX > 0 && canGoPrev) {
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  // 대중교통이 없는 경우 (도보 또는 차량)
  if (transitStepContexts.length === 0) {
    const isCar = route?.type === 'car' || route?.type === 'taxi';

    return (
      <div
        className={`w-full px-4 py-2.5 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none min-h-[50px] bg-white ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
              isCar ? 'bg-blue-50 text-blue-600 border border-blue-100/60' : 'bg-emerald-50 text-emerald-600 border border-emerald-100/60'
            }`}
          >
            {isCar ? <Car className="w-4 h-4" /> : <Footprints className="w-4 h-4" />}
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-bold text-zinc-900 truncate">
              {isCar ? '차량 이동' : '도보 이동'}
            </span>
            <span className="text-zinc-300">·</span>
            <span className="text-xs font-medium text-zinc-600 truncate">
              {typeof route?.duration === 'number' ? `${route.duration}분` : '소요시간 계산 중'}
              {typeof route?.distance === 'number'
                ? ` (${route.distance >= 1 ? `${route.distance.toFixed(1)}km` : `${Math.round(route.distance * 1000)}m`})`
                : ''}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 현재 활성화된 대중교통 컨텍스트
  const currentContext = transitStepContexts[Math.min(currentIndex, totalTransits - 1)];

  return (
    <div
      className={`w-full px-3.5 py-2 flex flex-col gap-1 shrink-0 border-b border-zinc-100/80 select-none bg-zinc-50/50 min-h-[76px] ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. 상단 바: 환승 세그먼트 탭 or 탑승 라벨 (좌) + 새로고침 카운터 (우) */}
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        {hasMultiple ? (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 py-0.5">
            {transitStepContexts.map((ctx, idx) => {
              const isBus = ctx.step.type === 'bus' || ctx.step.type === 'expressbus';
              const isActive = idx === currentIndex;
              const transitName = isBus
                ? formatBusName(ctx.step.name)
                : formatSubwayLineName(ctx.step);
              const transitColor = getTransitColor(ctx.step);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (idx !== currentIndex) {
                      setSlideDirection(idx > currentIndex ? 1 : -1);
                      setCurrentIndex(idx);
                    }
                  }}
                  style={
                    isActive
                      ? {
                          backgroundColor: '#FFFFFF',
                          borderColor: `${transitColor}60`,
                          boxShadow: `0 1px 4px ${transitColor}25`,
                        }
                      : {
                          backgroundColor: `${transitColor}0F`,
                          borderColor: 'transparent',
                        }
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] transition-all cursor-pointer select-none shrink-0 border ${
                    isActive
                      ? 'font-black text-zinc-950'
                      : 'font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60'
                  }`}
                >
                  <span style={{ color: transitColor }} className="flex items-center justify-center shrink-0">
                    {isBus ? <Bus className="w-2.5 h-2.5" /> : <Train className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate max-w-[105px]">
                    {transitName}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            {(() => {
              const transitColor = getTransitColor(currentContext.step);
              return (
                <span
                  style={{
                    backgroundColor: `${transitColor}15`,
                    color: transitColor,
                    borderColor: `${transitColor}35`,
                  }}
                  className="text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 leading-none"
                >
                  {currentContext.step.type === 'subway' ? '지하철' : '버스'}
                </span>
              );
            })()}
            <span className="text-[11px] font-semibold text-zinc-400">실시간 도착 현황</span>
          </div>
        )}

        {/* 우측: 상단 새로고침 버튼 슬롯 */}
        <div className="shrink-0 flex items-center">
          <TopBarRefreshButton context={currentContext} originPlace={originPlace} />
        </div>
      </div>

      {/* 2. 중앙 메인 바디: 좌(노선/정류장) / 우(대형 카운트다운 타이머) 2열 분할 */}
      <div className="w-full min-w-0 overflow-hidden relative">
        <AnimatePresence initial={false} mode="wait" custom={slideDirection}>
          <motion.div
            key={currentIndex}
            custom={slideDirection}
            initial={{ opacity: 0, x: slideDirection * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -16 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="w-full"
          >
            <SingleTransitCardContent
              context={currentContext}
              originPlace={originPlace}
              currentIndex={currentIndex}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * 상단 바 우측용 초경량 실시간 새로고침 카운터 버튼
 */
function TopBarRefreshButton({
  context,
  originPlace,
}: {
  context: TransitStepContext;
  originPlace?: Place | null;
}) {
  const p = extractTransitParams(context, originPlace);

  if (p.isBus && p.busStationId && p.busName) {
    return (
      <SegmentBusRealtimeChip
        region={p.inferredRegion}
        stationId={p.busStationId}
        stationName={p.busStationName}
        cityCode={p.cityCode}
        busNo={p.busName}
        busId={p.busId}
        odsayBusId={p.odsayBusId ? String(p.odsayBusId) : undefined}
        tagoRouteId={p.tagoRouteId ? String(p.tagoRouteId) : undefined}
        destination={p.busDestination}
        headsign={p.busHeadsign}
        intervalTime={p.busIntervalTime}
        startDateTime={p.busStartDateTime}
        busType={p.busType}
        busColor={p.transitColor}
        lat={p.busLat ? Number(p.busLat) : undefined}
        lng={p.busLng ? Number(p.busLng) : undefined}
        onlyRefreshButton={true}
      />
    );
  }

  if (p.isSubway && p.subwayStationName) {
    return (
      <SegmentSubwayRealtimeChip
        stationName={p.subwayStationName}
        wayCode={p.step.wayCode !== undefined ? String(p.step.wayCode) : undefined}
        subwayId={p.normalizedSubwayId}
        destination={p.step.endName || p.step.destination}
        headsign={p.step.headsign}
        subwayColor={p.transitColor}
        onlyRefreshButton={true}
      />
    );
  }

  return null;
}

/**
 * 개별 대중교통 수단 정보 및 실시간 도착 카운트다운 2열 렌더러
 */
function SingleTransitCardContent({
  context,
  originPlace,
  currentIndex = 0,
}: {
  context: TransitStepContext;
  originPlace?: Place | null;
  currentIndex?: number;
}) {
  const p = extractTransitParams(context, originPlace, currentIndex);

  return (
    <div className="flex items-center justify-between gap-3 w-full min-w-0 py-0.5">
      {/* 좌측 열: 대중교통 아이콘 + 노선명 (굵게) + 방면 / 탑승 정류소명 */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span
          style={{
            backgroundColor: `${p.transitColor}15`,
            color: p.transitColor,
            borderColor: `${p.transitColor}35`,
          }}
          className="w-7.5 h-7.5 rounded-xl flex items-center justify-center shrink-0 shadow-2xs border"
        >
          {p.isBus ? <Bus className="w-4 h-4" /> : <Train className="w-4 h-4" />}
        </span>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-black text-zinc-900 truncate tracking-tight">
              {p.isBus
                ? formatBusName(p.step.name || p.busName)
                : formatSubwayLineName(p.step)}
            </span>
            {p.busDestination && (
              <span className="text-[11px] font-medium text-zinc-400 truncate">
                ({p.busDestination} 방면)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium truncate mt-0.5">
            <span className="truncate">
              {p.isBus
                ? (p.busStationName ? `${p.busStationName} 탑승` : '버스 정류소 탑승')
                : (p.subwayStationName ? `${p.subwayStationName}역 승차` : '지하철 승차')}
            </span>
          </div>
        </div>
      </div>

      {/* 우측 열: 실시간 도착 카운트다운 타이머 & 상태 정보 */}
      <div
        className="shrink-0 flex items-center justify-end"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {p.isBus && p.busStationId && p.busName ? (
          <SegmentBusRealtimeChip
            region={p.inferredRegion}
            stationId={p.busStationId}
            stationName={p.busStationName}
            cityCode={p.cityCode}
            busNo={p.busName}
            busId={p.busId}
            odsayBusId={p.odsayBusId ? String(p.odsayBusId) : undefined}
            tagoRouteId={p.tagoRouteId ? String(p.tagoRouteId) : undefined}
            destination={p.busDestination}
            headsign={p.busHeadsign}
            intervalTime={p.busIntervalTime}
            startDateTime={p.busStartDateTime}
            busType={p.busType}
            busColor={p.transitColor}
            lat={p.busLat ? Number(p.busLat) : undefined}
            lng={p.busLng ? Number(p.busLng) : undefined}
            variant="hero"
            hideRefreshButton={true}
          />
        ) : p.isSubway && p.subwayStationName ? (
          <SegmentSubwayRealtimeChip
            stationName={p.subwayStationName}
            wayCode={p.step.wayCode !== undefined ? String(p.step.wayCode) : undefined}
            subwayId={p.normalizedSubwayId}
            destination={p.step.endName || p.step.destination}
            headsign={p.step.headsign}
            subwayColor={p.transitColor}
            variant="hero"
            hideRefreshButton={true}
          />
        ) : (
          <span className="text-xs text-zinc-400 font-medium">도착 정보 없음</span>
        )}
      </div>
    </div>
  );
}
