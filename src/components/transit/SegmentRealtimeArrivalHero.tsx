'use client';

import React, { useMemo } from 'react';
import { Bus, Train, Footprints, Car } from 'lucide-react';
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
  // 이동 구간 내 첫 번째 대중교통 정보 추출 (실시간 칩 연결용 - 첫 번째 이동 수단 우선)
  const firstTransitStep: DirectionStep | null = useMemo(() => {
    if (!route || !route.steps) return null;
    return route.steps.find((s: DirectionStep) => s.type !== 'walk') || null;
  }, [route]);

  const targetBusStep = firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus') ? firstTransitStep : null;
  const targetSubwayStep = firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train') ? firstTransitStep : null;

  const targetSubwayStationName = targetSubwayStep?.startName || originPlace?.place_name;
  const rawStationId =
    targetBusStep?.realtimeStationId ||
    targetBusStep?.startStationID ||
    targetBusStep?.startID ||
    targetBusStep?.startStationId ||
    targetBusStep?.nodeId;
  const targetBusStationId = rawStationId ? String(rawStationId) : undefined;
  const targetBusStationName = targetBusStep?.startName || originPlace?.place_name;
  const targetBusName = targetBusStep?.name || '';
  const targetOdsayBusId = targetBusStep?.odsayBusId || targetBusStep?.busID;
  const targetTagoRouteId = targetBusStep?.tagoRouteId || targetBusStep?.busLocalBlID;
  const targetBusId = targetOdsayBusId ? String(targetOdsayBusId) : (targetTagoRouteId ? String(targetTagoRouteId) : undefined);
  const targetBusType = targetBusStep?.busType;
  const targetBusDestination = targetBusStep?.endName || targetBusStep?.destination;
  const targetBusHeadsign = targetBusStep?.headsign;
  const targetBusIntervalTime = targetBusStep?.intervalTime;
  const targetBusStartDateTime = targetBusStep?.startDateTime;
  const inferredRegion = targetBusStep?.startRegion || (originPlace ? inferRegionFromPlace(originPlace) : undefined);
  const targetBusLat = targetBusStep?.startY || targetBusStep?.startLat || originPlace?.lat;
  const targetBusLng = targetBusStep?.startX || targetBusStep?.startLng || originPlace?.lng;
  const targetCityCode = targetBusStep?.startCityCode || targetBusStep?.cityCode;

  const isSubway = Boolean(targetSubwayStep);
  const isBus = Boolean(targetBusStep);

  // 대중교통이 아닌 경우 (도보 또는 차량)
  if (!firstTransitStep) {
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

  return (
    <div className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 border-b border-zinc-100/80 select-none bg-zinc-50/50 min-h-[52px] ${className}`}>
      {/* 1. 이동 수단 아이콘 & 단계 텍스트 */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${isBus ? 'bg-blue-50 text-blue-600 border border-blue-100/60' : 'bg-emerald-50 text-emerald-600 border border-emerald-100/60'}`}>
          {isBus ? <Bus className="w-4 h-4" /> : <Train className="w-4 h-4" />}
        </span>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-zinc-900 truncate">
              {isBus ? targetBusName : targetSubwayStationName}
            </span>
            {targetBusDestination && (
              <span className="text-[10.5px] font-medium text-zinc-600 truncate max-w-[120px]">
                ({targetBusDestination} 방면)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-medium">
            <span>{isBus ? `${targetBusStationName} 탑승` : `${targetSubwayStationName} 승차`}</span>
          </div>
        </div>
      </div>

      {/* 2. 실시간 도착 정보 칩 연결 (우측) */}
      <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {targetBusStep && targetBusStationId && targetBusName ? (
          <SegmentBusRealtimeChip
            region={inferredRegion}
            stationId={targetBusStationId}
            stationName={targetBusStationName}
            cityCode={targetCityCode}
            busNo={targetBusName}
            busId={targetBusId}
            odsayBusId={targetOdsayBusId ? String(targetOdsayBusId) : undefined}
            tagoRouteId={targetTagoRouteId ? String(targetTagoRouteId) : undefined}
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
        ) : targetSubwayStep && targetSubwayStationName ? (
          <SegmentSubwayRealtimeChip
            stationName={targetSubwayStationName}
            wayCode={targetSubwayStep.wayCode !== undefined ? String(targetSubwayStep.wayCode) : undefined}
            subwayId={targetSubwayStep.rawLineName || targetSubwayStep.name}
            destination={targetSubwayStep.endName || targetSubwayStep.destination}
            headsign={targetSubwayStep.headsign}
            variant="sidebar"
          />
        ) : null}
      </div>
    </div>
  );
}
