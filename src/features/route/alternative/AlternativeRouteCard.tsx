"use client";

import React, { useState, useCallback } from 'react';
import { formatDurationMinutes, inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import RouteTimelineGaugeBar from '@/components/route/RouteTimelineGaugeBar';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';
import FareBreakdownTooltip from '@/components/route/FareBreakdownTooltip';
import { RefreshCw } from 'lucide-react';
import { getRouteEmoji, isRouteMatch } from './hooks/useAlternativeRoutes';
import type { Place, DirectionResult, SelectedRoute } from '@/types/journey';

interface AlternativeRouteCardProps {
  route: DirectionResult;
  originPlace: Place;
  isSelected: boolean;
  activeTab: 'public' | 'car' | 'walk';
  tags: string[];
  isDetailLoading: boolean;
  onClick: () => void;
}

export function AlternativeRouteCard({
  route,
  originPlace,
  isSelected,
  activeTab,
  tags,
  isDetailLoading,
  onClick,
}: AlternativeRouteCardProps) {
  const [isCarRefreshing, setIsCarRefreshing] = useState(false);
  const emoji = getRouteEmoji(route);

  const renderRealtimeRefreshButton = () => {
    const firstTransitStep = route.steps?.find((s) => s.type !== 'walk');

    if (firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus')) {
      const firstBusStep = firstTransitStep;
      const busStationId =
        firstBusStep.realtimeStationId ||
        firstBusStep.startStationID ||
        firstBusStep.startID ||
        firstBusStep.nodeId;
      const busNo = firstBusStep.name;
      const busStationName = firstBusStep.startName || originPlace.place_name;
      const busRegion = firstBusStep.startRegion || inferRegionFromPlace(originPlace);
      const busLat = firstBusStep.startY || firstBusStep.startLat || originPlace.lat;
      const busLng = firstBusStep.startX || firstBusStep.startLng || originPlace.lng;
      const busCityCode = firstBusStep.startCityCode || firstBusStep.cityCode;
      const odsayBusId = firstBusStep.odsayBusId || firstBusStep.busID;
      const tagoRouteId = firstBusStep.tagoRouteId || firstBusStep.busLocalBlID;
      const busId = odsayBusId || tagoRouteId;
      const busType = firstBusStep.busType;
      const busDestination = firstBusStep.endName || firstBusStep.destination;
      const busHeadsign = firstBusStep.headsign;
      const busIntervalTime = firstBusStep.intervalTime;
      const busStartDateTime = firstBusStep.startDateTime;

      if (busStationId && busNo) {
        return (
          <div
            className="shrink-0 flex items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SegmentBusRealtimeChip
              region={busRegion}
              stationId={String(busStationId)}
              stationName={busStationName}
              busNo={busNo}
              busId={busId !== undefined ? String(busId) : undefined}
              odsayBusId={odsayBusId !== undefined ? String(odsayBusId) : undefined}
              tagoRouteId={tagoRouteId !== undefined ? String(tagoRouteId) : undefined}
              destination={busDestination}
              headsign={busHeadsign}
              intervalTime={busIntervalTime}
              startDateTime={busStartDateTime}
              busType={busType}
              busColor={firstBusStep.busLaneColor || firstBusStep.color}
              cityCode={busCityCode}
              lat={busLat ? Number(busLat) : undefined}
              lng={busLng ? Number(busLng) : undefined}
              variant="compact"
              onlyRefreshButton
            />
          </div>
        );
      }
    }

    if (firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train')) {
      const firstSubwayStep = firstTransitStep;
      const subwayStationName = firstSubwayStep.startName || originPlace.place_name;
      return (
        <div
          className="shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={firstSubwayStep.wayCode !== undefined ? String(firstSubwayStep.wayCode) : undefined}
            subwayId={firstSubwayStep.rawLineName || firstSubwayStep.name}
            destination={firstSubwayStep.endName}
            headsign={firstSubwayStep.headsign}
            variant="compact"
            onlyRefreshButton
          />
        </div>
      );
    }

    if (route.type === 'car') {
      const handleCarRefresh = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCarRefreshing(true);
        setTimeout(() => setIsCarRefreshing(false), 600);
      };

      return (
        <button
          type="button"
          onClick={handleCarRefresh}
          disabled={isCarRefreshing}
          className="inline-flex items-center justify-center w-[70px] min-w-[70px] gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-50 text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 cursor-pointer active:scale-95 text-[10px] transition-all"
        >
          <RefreshCw className={`w-3 h-3 text-zinc-500 shrink-0 ${isCarRefreshing ? 'animate-spin-once' : ''}`} />
          <span className="tabular-nums font-semibold text-[10px] text-zinc-700 whitespace-nowrap">갱신</span>
        </button>
      );
    }

    return null;
  };

  const renderRealtimeArrivalChip = () => {
    const firstTransitStep = route.steps?.find((s) => s.type !== 'walk');

    if (firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus')) {
      const firstBusStep = firstTransitStep;
      const busStationId =
        firstBusStep.realtimeStationId ||
        firstBusStep.startStationID ||
        firstBusStep.startID ||
        firstBusStep.nodeId;
      const busNo = firstBusStep.name;
      const busStationName = firstBusStep.startName || originPlace.place_name;
      const busRegion = firstBusStep.startRegion || inferRegionFromPlace(originPlace);
      const busLat = firstBusStep.startY || firstBusStep.startLat || originPlace.lat;
      const busLng = firstBusStep.startX || firstBusStep.startLng || originPlace.lng;
      const busCityCode = firstBusStep.startCityCode || firstBusStep.cityCode;
      const odsayBusId = firstBusStep.odsayBusId || firstBusStep.busID;
      const tagoRouteId = firstBusStep.tagoRouteId || firstBusStep.busLocalBlID;
      const busId = odsayBusId || tagoRouteId;
      const busType = firstBusStep.busType;
      const busDestination = firstBusStep.endName || firstBusStep.destination;
      const busHeadsign = firstBusStep.headsign;
      const busIntervalTime = firstBusStep.intervalTime;
      const busStartDateTime = firstBusStep.startDateTime;

      if (busStationId && busNo) {
        return (
          <div
            className="shrink-0 flex items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SegmentBusRealtimeChip
              region={busRegion}
              stationId={String(busStationId)}
              stationName={busStationName}
              busNo={busNo}
              busId={busId !== undefined ? String(busId) : undefined}
              odsayBusId={odsayBusId !== undefined ? String(odsayBusId) : undefined}
              tagoRouteId={tagoRouteId !== undefined ? String(tagoRouteId) : undefined}
              destination={busDestination}
              headsign={busHeadsign}
              intervalTime={busIntervalTime}
              startDateTime={busStartDateTime}
              busType={busType}
              busColor={firstBusStep.busLaneColor || firstBusStep.color}
              cityCode={busCityCode}
              lat={busLat ? Number(busLat) : undefined}
              lng={busLng ? Number(busLng) : undefined}
              variant="compact"
              hideRefreshButton
            />
          </div>
        );
      }
    }

    if (firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train')) {
      const firstSubwayStep = firstTransitStep;
      const subwayStationName = firstSubwayStep.startName || originPlace.place_name;
      return (
        <div
          className="shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={firstSubwayStep.wayCode !== undefined ? String(firstSubwayStep.wayCode) : undefined}
            subwayId={firstSubwayStep.rawLineName || firstSubwayStep.name}
            destination={firstSubwayStep.endName}
            headsign={firstSubwayStep.headsign}
            variant="compact"
            hideRefreshButton
          />
        </div>
      );
    }

    if (route.type === 'car') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px] text-emerald-600">
          <span>실시간 교통 반영</span>
        </span>
      );
    }

    return null;
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`
        flex flex-col w-full py-3 px-3.5 rounded-xl border transition-all duration-200 text-left cursor-pointer group gap-2.5
        ${isSelected
          ? 'border-blue-400 bg-blue-50/80 shadow-[0_2px_10px_rgba(59,130,246,0.12)]'
          : 'border-zinc-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm'
        }
      `}
    >
      {/* Top Section: Duration, Fare, Icon, Tags, Realtime */}
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* 좌: 이동수단 아이콘 + 시간 + 요금 및 아래 갱신 버튼 */}
          <div className={`flex flex-col min-w-0 justify-center shrink-0 pr-3 border-r ${isSelected ? 'border-blue-200' : 'border-zinc-200/80'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-base flex-shrink-0 transition-colors ${isSelected ? 'bg-white shadow-sm' : 'bg-zinc-50 group-hover:bg-white group-hover:shadow-sm'}`}>
                {emoji}
              </div>
              <div className="flex flex-col">
                <span className={`text-sm font-black tracking-tight leading-tight ${isSelected ? 'text-blue-600' : 'text-zinc-900'}`}>
                  {formatDurationMinutes(route.duration)}
                </span>
                <div className="flex items-center mt-0.5">
                  {activeTab === 'car' ? (
                    <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                      택시 {route.taxiFare?.toLocaleString()}원
                    </span>
                  ) : activeTab === 'walk' ? (
                    <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                      무료
                    </span>
                  ) : (route.isIntercity || route.steps?.some((s) => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? (
                    <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                      예매처 확인
                    </span>
                  ) : route.fare > 0 ? (
                    <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                      <span>{route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}</span>
                      <FareBreakdownTooltip fareBreakdown={route.fareBreakdown} />
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                      요금 정보 없음
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 이동 수단 정보 바로 아래에 갱신 버튼 배치 */}
            <div className="mt-1 flex items-center">
              {renderRealtimeRefreshButton()}
            </div>
          </div>

          {/* 우: 태그 & 실시간 정보 (독립 수직 컨테이너) 영역 */}
          <div className="flex flex-col min-w-0 justify-center flex-1 pl-1">
            {/* Row 1: 태그 전용 수직 컨테이너 */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 w-full min-h-[20px]">
              {tags.map((tag) => {
                let colorClass = 'bg-blue-50 text-blue-600 border border-blue-100';
                if (tag === '최단시간' || tag === '추천' || tag === '최단 시간') {
                  colorClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
                } else if (tag === '최단 산길') {
                  colorClass = 'bg-amber-50 text-amber-600 border border-amber-100';
                } else if (tag === '완만한 코스') {
                  colorClass = 'bg-zinc-100 text-zinc-600 border border-zinc-200';
                }
                return (
                  <span key={tag} className={`px-1.5 py-[2px] text-[9px] font-extrabold rounded whitespace-nowrap flex-shrink-0 ${colorClass}`}>
                    {tag}
                  </span>
                );
              })}
            </div>

            {/* Row 2: 실시간 도착 정보 칩 단독 배치 */}
            <div className="flex items-center justify-start min-w-0 w-full min-h-[24px] mt-1">
              {renderRealtimeArrivalChip()}
            </div>
          </div>
        </div>

        {/* Right side check mark or arrow */}
        <div className="flex-shrink-0 ml-2">
          {isDetailLoading ? (
            <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin block" />
          ) : isSelected ? (
            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
            </div>
          ) : (
            <div className="w-5 h-5 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-150 text-zinc-400 group-hover:border-zinc-300 group-hover:text-zinc-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Gauge Timeline Bar */}
      <RouteTimelineGaugeBar steps={route.steps} className="mt-1.5 mb-1" />
    </div>
  );
}
