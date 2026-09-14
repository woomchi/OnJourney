'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Bus, Train, Footprints, Car, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DirectionStep, SelectedRoute, DirectionResult, Place } from '@/types/journey';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';
import { resolveSubwayNameForApi } from '@/lib/constants/subwayLineMap';

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

export default function SegmentRealtimeArrivalHero({
  route,
  originPlace,
  destPlace,
  className = '',
}: SegmentRealtimeArrivalHeroProps) {
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

    // 수평 이동 거리가 수직 이동 거리보다 크고, 35px 이상 이동했을 때만 전환
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
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
      <div className={`w-full px-4 py-2 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none min-h-[50px] ${className}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isCar ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {isCar ? <Car className="w-4 h-4" /> : <Footprints className="w-4 h-4" />}
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-bold text-zinc-900 truncate">
              {isCar ? '차량 이동' : '도보 이동'}
            </span>
            <span className="text-zinc-300">·</span>
            <span className="text-xs font-medium text-zinc-600 truncate">
              {typeof route?.duration === 'number' ? `${route.duration}분` : '소요시간 계산 중'}
              {typeof route?.distance === 'number' ? ` (${route.distance >= 1 ? `${route.distance.toFixed(1)}km` : `${Math.round(route.distance * 1000)}m`})` : ''}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 현재 활성화된 대중교통 컨텍스트
  const currentContext = transitStepContexts[Math.min(currentIndex, totalTransits - 1)];

  // 탑승 단계 배지 라벨 및 스타일
  let orderLabel = '탑승';
  let badgeStyle = 'bg-blue-50 text-blue-700 border-blue-100/80';

  if (hasMultiple) {
    if (currentIndex === 0) {
      orderLabel = '1차 탑승';
      badgeStyle = 'bg-blue-50 text-blue-700 border-blue-100/80';
    } else if (currentIndex === 1) {
      orderLabel = '2차 환승';
      badgeStyle = 'bg-purple-50 text-purple-700 border-purple-100/80';
    } else if (currentIndex === 2) {
      orderLabel = '3차 환승';
      badgeStyle = 'bg-amber-50 text-amber-700 border-amber-100/80';
    } else {
      orderLabel = `${currentIndex + 1}차 환승`;
      badgeStyle = 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  }

  return (
    <div
      className={`w-full px-2 py-2 flex items-center justify-between gap-1.5 shrink-0 border-b border-zinc-100/80 select-none bg-zinc-50/50 min-h-[68px] ${className}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. 좌측 이전 버튼 (상시 배치, 불가능 시 disabled) */}
      <button
        type="button"
        aria-label="이전 대중교통 정보"
        disabled={!canGoPrev}
        onClick={handlePrev}
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
          canGoPrev
            ? 'text-zinc-600 hover:text-zinc-900 active:bg-zinc-200/70 hover:bg-zinc-100 active:scale-95 cursor-pointer'
            : 'text-zinc-400/60 pointer-events-none cursor-not-allowed'
        }`}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* 2. 중앙 슬라이드 컨테이너 (2단 수직 분리) */}
      <div className="flex-1 min-w-0 overflow-hidden relative">
        <AnimatePresence initial={false} mode="wait" custom={slideDirection}>
          <motion.div
            key={currentIndex}
            custom={slideDirection}
            initial={{ opacity: 0, x: slideDirection * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -20 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full"
          >
            <SingleTransitCardContent
              context={currentContext}
              originPlace={originPlace}
              orderLabel={orderLabel}
              badgeStyle={badgeStyle}
              currentIndex={currentIndex}
              totalTransits={totalTransits}
              hasMultiple={hasMultiple}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. 우측 다음 버튼 (상시 배치, 불가능 시 disabled) */}
      <button
        type="button"
        aria-label="다음 대중교통 정보"
        disabled={!canGoNext}
        onClick={handleNext}
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
          canGoNext
            ? 'text-zinc-600 hover:text-zinc-900 active:bg-zinc-200/70 hover:bg-zinc-100 active:scale-95 cursor-pointer'
            : 'text-zinc-400/60 pointer-events-none cursor-not-allowed'
        }`}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * 개별 대중교통 수단 정보 및 실시간 도착 칩 렌더러 (2단 수직 분리 구조)
 */
function SingleTransitCardContent({
  context,
  originPlace,
  orderLabel,
  badgeStyle,
  currentIndex,
  totalTransits,
  hasMultiple,
}: {
  context: TransitStepContext;
  originPlace?: Place | null;
  orderLabel: string;
  badgeStyle: string;
  currentIndex: number;
  totalTransits: number;
  hasMultiple: boolean;
}) {
  const { step, prevStep } = context;
  const isBus = step.type === 'bus' || step.type === 'expressbus';
  const isSubway = step.type === 'subway' || step.type === 'train';

  // 1. 역/정류소 명칭 지능형 복원:
  // step.startName ➔ passStopList 첫 정류소 ➔ 직전 도보(walk)의 endName ➔ (첫 스텝인 경우만 originPlace.place_name)
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

  // 2. 버스/지하철 탑승 좌표 정밀 복원:
  // step 좌표 ➔ pathPoints 첫 점 ➔ passStopList 첫 점 ➔ 직전 도보 도착점 ➔ (첫 스텝인 경우만 originPlace)
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

  // 3. 탑승 위치 좌표 및 정류소명 기반 권역 동적 역추론:
  // 출발지(originPlace)에 종속되지 않고, 실제 버스 탑승 위치 기준으로 권역 판별
  const inferredRegion =
    step.startRegion ||
    (busLat && busLng
      ? inferRegionFromPlace({ lat: busLat, lng: busLng, place_name: busStationName })
      : (originPlace ? inferRegionFromPlace(originPlace) : undefined));
  const cityCode = step.startCityCode || step.cityCode;

  // 지하철 노선명/식별자 정규화 (서울시 API 및 지방 도시철도 표준 식별자 매핑)
  const normalizedSubwayId =
    resolveSubwayNameForApi(step.rawLineName || step.name || '') || (step.rawLineName || step.name);

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      {/* Row 1: 이동 수단 아이콘, 순서 배지, 노선명, 방면 & 환승 네비게이터 */}
      <div className="flex items-center justify-between gap-2 w-full min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
              isBus
                ? 'bg-blue-50 text-blue-600 border border-blue-100/60'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100/60'
            }`}
          >
            {isBus ? <Bus className="w-4 h-4" /> : <Train className="w-4 h-4" />}
          </span>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 leading-none ${badgeStyle}`}
              >
                {orderLabel}
              </span>
              <span className="text-[13px] font-extrabold text-zinc-900 truncate">
                {isBus ? (step.name || busName) : (subwayStationName ? `${subwayStationName}역` : '지하철역')}
              </span>
              {busDestination && (
                <span className="text-[11px] font-medium text-zinc-500 truncate">
                  ({busDestination} 방면)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium mt-0.5 min-w-0">
              <span className="truncate">
                {isBus
                  ? (busStationName ? `${busStationName} 탑승` : '버스 정류소 탑승')
                  : (subwayStationName ? `${subwayStationName}역 승차` : '지하철 승차')}
              </span>
            </div>
          </div>
        </div>

        {/* 다중 환승 시 인디케이터 */}
        {hasMultiple && (
          <span className="text-[10px] font-bold text-zinc-500 bg-white/90 border border-zinc-200/90 rounded-full px-2 py-0.5 shrink-0 tabular-nums shadow-2xs">
            {currentIndex + 1} / {totalTransits}
          </span>
        )}
      </div>

      {/* Row 2: 실시간 도착 정보 칩 연결 (가로 1줄 hero variant) */}
      <div
        className="w-full flex items-center pt-1 border-t border-zinc-200/60"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isBus && busStationId && busName ? (
          <SegmentBusRealtimeChip
            region={inferredRegion}
            stationId={busStationId}
            stationName={busStationName}
            cityCode={cityCode}
            busNo={busName}
            busId={busId}
            odsayBusId={odsayBusId ? String(odsayBusId) : undefined}
            tagoRouteId={tagoRouteId ? String(tagoRouteId) : undefined}
            destination={busDestination}
            headsign={busHeadsign}
            intervalTime={busIntervalTime}
            startDateTime={busStartDateTime}
            busType={busType}
            busColor={step?.color}
            lat={busLat ? Number(busLat) : undefined}
            lng={busLng ? Number(busLng) : undefined}
            variant="hero"
          />
        ) : isSubway && subwayStationName ? (
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={step.wayCode !== undefined ? String(step.wayCode) : undefined}
            subwayId={normalizedSubwayId}
            destination={step.endName || step.destination}
            headsign={step.headsign}
            variant="hero"
          />
        ) : null}
      </div>
    </div>
  );
}
