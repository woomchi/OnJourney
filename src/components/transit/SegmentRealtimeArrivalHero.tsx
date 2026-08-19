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
    return route.steps.find((s: any) => s.type !== 'walk') || null;
  }, [route]);

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
  const targetBusDestination = targetBusStep?.endName || (targetBusStep as any)?.destination;
  const targetBusHeadsign = targetBusStep?.headsign;
  const targetBusIntervalTime = (targetBusStep as any)?.intervalTime;
  const targetBusStartDateTime = (targetBusStep as any)?.startDateTime;
  const inferredRegion = (targetBusStep as any)?.startRegion || (originPlace ? inferRegionFromPlace(originPlace) : undefined);
  const targetBusLat = (targetBusStep as any)?.startY || (targetBusStep as any)?.startLat || (originPlace as any)?.y || (originPlace as any)?.lat;
  const targetBusLng = (targetBusStep as any)?.startX || (targetBusStep as any)?.startLng || (originPlace as any)?.x || (originPlace as any)?.lng;
  const targetCityCode = (targetBusStep as any)?.startCityCode || (targetBusStep as any)?.cityCode;

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
    <div className={`w-full px-4 py-1.5 flex items-center justify-between gap-2 shrink-0 border-b border-zinc-100/80 select-none min-h-[50px] ${className}`}>
      {/* 좌측: 수단 아이콘 및 승차 위치 명 */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSubway ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
          {isSubway ? <Train className="w-4 h-4" /> : <Bus className="w-4 h-4" />}
        </span>
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="text-[11.5px] font-extrabold text-zinc-900 truncate max-w-[100px] min-[400px]:max-w-[130px]">
            {firstTransitStep.startName || (isSubway ? '지하철역' : '버스정류소')}
          </span>
          <span className="text-[10px] font-semibold text-zinc-500 truncate max-w-[100px] min-[400px]:max-w-[130px]">
            {firstTransitStep.name || (isSubway ? '지하철' : '버스')}
          </span>
        </div>
      </div>

      {/* 우측: 사이드바와 동일한 수직 2행 실시간 칩 + 타이머 새로고침 버튼 */}
      <div
        className="flex items-center justify-end shrink-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {targetBusStep && targetBusName ? (
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
        ) : targetSubwayStep && targetSubwayStationName ? (
          <SegmentSubwayRealtimeChip
            stationName={targetSubwayStationName}
            wayCode={targetSubwayStep.wayCode !== undefined ? String(targetSubwayStep.wayCode) : undefined}
            subwayId={targetSubwayStep.rawLineName || targetSubwayStep.name}
            destination={targetSubwayStep.endName || (targetSubwayStep as any)?.destination}
            headsign={targetSubwayStep.headsign}
            variant="sidebar"
          />
        ) : null}
      </div>
    </div>
  );
}
