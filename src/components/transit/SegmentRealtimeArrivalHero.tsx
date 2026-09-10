'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Bus, Train, Footprints, Car, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DirectionStep, SelectedRoute, DirectionResult, Place } from '@/types/journey';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';

interface SegmentRealtimeArrivalHeroProps {
  route: SelectedRoute | DirectionResult | null;
  originPlace?: Place | null;
  destPlace?: Place | null;
  className?: string;
}

export default function SegmentRealtimeArrivalHero({
  route,
  originPlace,
  destPlace,
  className = '',
}: SegmentRealtimeArrivalHeroProps) {
  // 1. 이동 구간 내 모든 대중교통 스텝 추출 (도보 및 차량/택시 제외)
  const transitSteps: DirectionStep[] = useMemo(() => {
    if (!route || !route.steps) return [];
    return route.steps.filter(
      (s: DirectionStep) => s.type !== 'walk' && s.type !== 'car' && s.type !== 'taxi'
    );
  }, [route]);

  // 활성 대중교통 인덱스 관리 (0 ~ transitSteps.length - 1)
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);

  // route 변경 시 인덱스 리셋
  useEffect(() => {
    setCurrentIndex(0);
  }, [route]);

  // 스와이프 제스처 추적용 ref
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const totalTransits = transitSteps.length;
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
  if (transitSteps.length === 0) {
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

  // 현재 활성화된 대중교통 스텝
  const currentStep = transitSteps[Math.min(currentIndex, totalTransits - 1)];

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
      className={`w-full px-2 py-2 flex items-center justify-between gap-1 shrink-0 border-b border-zinc-100/80 select-none bg-zinc-50/50 min-h-[52px] ${className}`}
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

      {/* 2. 중앙 슬라이드 컨테이너 */}
      <div className="flex-1 min-w-0 overflow-hidden relative py-0.5">
        <AnimatePresence initial={false} mode="wait" custom={slideDirection}>
          <motion.div
            key={currentIndex}
            custom={slideDirection}
            initial={{ opacity: 0, x: slideDirection * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDirection * -20 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full flex items-center justify-between gap-2"
          >
            <SingleTransitCardContent
              step={currentStep}
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
 * 개별 대중교통 수단 정보 및 실시간 도착 칩 렌더러
 */
function SingleTransitCardContent({
  step,
  originPlace,
  orderLabel,
  badgeStyle,
  currentIndex,
  totalTransits,
  hasMultiple,
}: {
  step: DirectionStep;
  originPlace?: Place | null;
  orderLabel: string;
  badgeStyle: string;
  currentIndex: number;
  totalTransits: number;
  hasMultiple: boolean;
}) {
  const isBus = step.type === 'bus' || step.type === 'expressbus';
  const isSubway = step.type === 'subway' || step.type === 'train';

  // 지하철 속성 추출
  const subwayStationName = step.startName || originPlace?.place_name;

  // 버스 속성 추출
  const rawStationId =
    step.realtimeStationId ||
    step.startStationID ||
    step.startID ||
    step.startStationId ||
    step.nodeId;
  const busStationId = rawStationId ? String(rawStationId) : undefined;
  const busStationName = step.startName || originPlace?.place_name;
  const busName = step.name || '';
  const odsayBusId = step.odsayBusId || step.busID;
  const tagoRouteId = step.tagoRouteId || step.busLocalBlID;
  const busId = odsayBusId ? String(odsayBusId) : (tagoRouteId ? String(tagoRouteId) : undefined);
  const busType = step.busType;
  const busDestination = step.endName || step.destination;
  const busHeadsign = step.headsign;
  const busIntervalTime = step.intervalTime;
  const busStartDateTime = step.startDateTime;
  const inferredRegion = step.startRegion || (originPlace ? inferRegionFromPlace(originPlace) : undefined);
  const busLat = step.startY || step.startLat || originPlace?.lat;
  const busLng = step.startX || step.startLng || originPlace?.lng;
  const cityCode = step.startCityCode || step.cityCode;

  return (
    <>
      {/* 1. 이동 수단 아이콘, 순서 배지 & 정류장 텍스트 */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
            isBus
              ? 'bg-blue-50 text-blue-600 border border-blue-100/60'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-100/60'
          }`}
        >
          {isBus ? <Bus className="w-4 h-4" /> : <Train className="w-4 h-4" />}
        </span>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 leading-none ${badgeStyle}`}
            >
              {orderLabel}
            </span>
            <span className="text-xs font-bold text-zinc-900 truncate">
              {isBus ? busName : subwayStationName}
            </span>
            {busDestination && (
              <span className="text-[10px] font-medium text-zinc-500 truncate max-w-[100px]">
                ({busDestination} 방면)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium mt-0.5 min-w-0">
            <span className="truncate">
              {isBus ? `${busStationName} 탑승` : `${subwayStationName} 승차`}
            </span>
            {hasMultiple && (
              <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                {currentIndex + 1}/{totalTransits}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. 실시간 도착 정보 칩 연결 (우측 - 터치 이벤트 전파 방지) */}
      <div
        className="shrink-0 flex items-center"
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
            variant="sidebar"
          />
        ) : isSubway && subwayStationName ? (
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={step.wayCode !== undefined ? String(step.wayCode) : undefined}
            subwayId={step.rawLineName || step.name}
            destination={step.endName || step.destination}
            headsign={step.headsign}
            variant="sidebar"
          />
        ) : null}
      </div>
    </>
  );
}
