"use client";

import { useState, useEffect } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, DirectionsApiResponse, DirectionResult } from '@/types/journey';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';

interface AlternativeRoutePanelProps {
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
}

export default function AlternativeRoutePanel({
  originPlace,
  destPlace,
  onClose,
}: AlternativeRoutePanelProps) {
  const [mounted, setMounted] = useState(false);
  const { 
    activeJourney, 
    directionsCache, 
    directionsLoading,
    selectSegmentRoute, 
    setFocusBounds, 
    setFocusedSegment, 
    setFocusedStep,
    fetchSegmentDirections 
  } = useJourneyStore();

  const cacheKey = `${originPlace.id}-${destPlace.id}`;
  const segmentData = directionsCache[cacheKey];
  const loading = directionsLoading[cacheKey];
  const transportType = activeJourney?.transport_type || 'public';

  let activeRoute: SelectedRoute | DirectionResult | undefined = originPlace.selected_route && originPlace.selected_route.destId === destPlace.id
    ? originPlace.selected_route
    : undefined;

  if (!activeRoute && segmentData) {
    if (transportType === 'car') {
      activeRoute = segmentData.car?.[0];
    } else if (transportType === 'walk') {
      activeRoute = segmentData.walk?.[0];
    } else {
      const publicRoute = segmentData.public?.[0];
      const walkRoute = segmentData.walk?.[0];

      if (walkRoute && (!publicRoute || (publicRoute.name === '대중교통(예상)' && walkRoute.duration <= 40) || walkRoute.duration <= 15)) {
        activeRoute = walkRoute;
      } else {
        activeRoute = publicRoute || walkRoute;
      }
    }
  }

  const [activeTab, setActiveTab] = useState<'public' | 'car' | 'walk'>(
    activeRoute?.type === 'public' || activeRoute?.type === 'car' || activeRoute?.type === 'walk'
      ? activeRoute.type
      : transportType
  );

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!segmentData && !loading) {
      fetchSegmentDirections(originPlace, destPlace);
    }
  }, [segmentData, loading, fetchSegmentDirections, originPlace, destPlace]);

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

  const routes = segmentData ? (segmentData[activeTab] || []) : [];
  const selectedRoute = originPlace.selected_route && originPlace.selected_route.destId === destPlace.id ? originPlace.selected_route : null;

  return (
    <div
      className={`absolute top-6 bottom-6 left-4 z-40 w-[360px] bg-white/95 backdrop-blur-md rounded-3xl border border-zinc-150/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col transition-all duration-300 ease-out transform ${
        mounted ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="p-5 border-b border-zinc-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] font-bold tracking-wide uppercase select-none">
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-amber-500 to-orange-500 shadow shadow-amber-500/20 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            대안 이동 수단
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 active:scale-95 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-all cursor-pointer"
            aria-label="닫기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Origin -> Destination */}
        <h3 className="text-sm font-extrabold text-zinc-800 flex items-center gap-1.5 truncate mt-2">
          <span className="truncate max-w-[130px]" title={originPlace.place_name}>{originPlace.place_name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-zinc-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
          <span className="truncate max-w-[130px]" title={destPlace.place_name}>{destPlace.place_name}</span>
        </h3>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-100">
          {(['public', 'car', 'walk'] as const).map((tab) => {
            const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`
                  flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer
                  ${isActive
                    ? 'bg-white text-blue-600 shadow-sm border border-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50 border border-transparent'
                  }
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2 flex flex-col gap-1.5 scrollbar-thin">
        {loading ? (
          <div className="animate-pulse flex flex-col gap-3 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[60px] bg-zinc-100 rounded-xl w-full border border-zinc-50"></div>
            ))}
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12 text-sm font-medium text-zinc-400">
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
                    destId: destPlace.id,
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
                  selectSegmentRoute(originPlace.id, selectedRouteObj);
                  
                  const bounds = calculateSegmentBounds(originPlace, destPlace, selectedRouteObj);
                  setFocusBounds(bounds);
                  setFocusedSegment({ originId: originPlace.id, destId: destPlace.id });
                  setFocusedStep(null);
                  
                  onClose();
                }}
                className={`
                  flex items-center justify-between w-full py-2 px-3 min-h-[48px] rounded-xl border transition-all duration-200 text-left cursor-pointer group
                  ${isSelected
                    ? 'border-blue-400 bg-blue-50/80 shadow-[0_2px_10px_rgba(59,130,246,0.12)]'
                    : 'border-zinc-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm'
                  }
                `}
              >
                {/* Left: Icon and Name/Fare */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 transition-colors ${isSelected ? 'bg-white shadow-sm' : 'bg-zinc-50 group-hover:bg-white group-hover:shadow-sm'}`}>
                    {emoji}
                  </div>
                  <div className="flex flex-col min-w-0 justify-center">
                    <span className={`text-xs font-bold truncate leading-tight ${isSelected ? 'text-blue-700' : 'text-zinc-800 group-hover:text-blue-600'}`}>
                      {route.name.replace(/\s*\+\s*/g, ' → ')}
                    </span>
                    {activeTab === 'car' ? (
                      <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        택시 {route.taxiFare?.toLocaleString()}원 {route.fare > 0 ? `(통행료 ${route.fare.toLocaleString()}원)` : '(통행료 무료)'}
                      </span>
                    ) : activeTab === 'walk' ? (
                      <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        무료
                      </span>
                    ) : (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? (
                      <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        예매처 확인
                      </span>
                    ) : route.fare > 0 ? (
                      <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        {route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}
                      </span>
                    ) : (
                      <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                        요금 정보 없음
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Duration & Status Check */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <span className={`text-[13px] font-black tracking-tight ${isSelected ? 'text-blue-600' : 'text-zinc-900'}`}>
                    {route.duration}분
                  </span>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    </div>
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
