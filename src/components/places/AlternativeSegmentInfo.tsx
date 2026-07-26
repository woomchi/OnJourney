"use client";

import { useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, DirectionsApiResponse, DirectionResult } from '@/types/journey';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';

interface AlternativeSegmentInfoProps {
  place: Place;
  nextPlace: Place | null;
  segmentData?: DirectionsApiResponse;
  loading?: boolean;
  onSelect?: () => void;
  transportType: 'public' | 'car' | 'walk';
  activeRoute?: DirectionResult;
}

export default function AlternativeSegmentInfo({
  place,
  nextPlace,
  segmentData,
  loading,
  onSelect,
  transportType,
  activeRoute,
}: AlternativeSegmentInfoProps) {
  const [activeTab, setActiveTab] = useState<'public' | 'car' | 'walk'>(
    activeRoute?.type === 'public' || activeRoute?.type === 'car' || activeRoute?.type === 'walk' 
      ? activeRoute.type 
      : transportType
  );
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
      <div 
        className="max-h-[126px] overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-sleek"
      >
        {routes.length === 0 ? (
          <div className="text-center py-6 text-xs text-zinc-400">
            선택 가능한 경로가 없습니다.
          </div>
        ) : (
          routes.map((route) => {
            const isSelected = selectedRoute 
              ? selectedRoute.id === route.id 
              : activeRoute 
                ? activeRoute.id === route.id 
                : false;
            const emoji = getEmoji(route.type, route.name);

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => {
                  const selectedRouteObj = {
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
                  selectSegmentRoute(place.id, selectedRouteObj);
                  onSelect?.();
                }}
                className={`
                  flex items-center justify-between w-full min-h-[46px] py-1.5 px-3 rounded-lg border transition-all duration-200 text-left cursor-pointer
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[11px] font-bold truncate leading-tight ${isSelected ? 'text-blue-700' : 'text-zinc-700'}`}>
                        {route.name}
                      </span>
                      {route.tags?.map(tag => {
                        let colorClass = 'bg-blue-50 text-blue-600';
                        if (tag === '최단시간' || tag === '추천' || tag === '최단 시간') {
                          colorClass = 'bg-emerald-50 text-emerald-600';
                        } else if (tag === '최단 산길') {
                          colorClass = 'bg-amber-50 text-amber-600';
                        } else if (tag === '완만한 코스') {
                          colorClass = 'bg-zinc-100 text-zinc-600';
                        }
                        return (
                          <span key={tag} className={`px-1 py-[1px] text-[8px] font-extrabold rounded whitespace-nowrap ${colorClass}`}>
                            {tag}
                          </span>
                        );
                      })}
                    </div>
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
