"use client";

import { useEffect, useState } from 'react';
import type { Place, SelectedRoute, DirectionResult, SubwayArrival, BusArrival } from '@/types/journey';
import { useJourneyStore } from '@/stores/journey-store';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';



function SubwayStepBadge({ 
  startName, 
  endName,
  headsign,
  wayCode
}: { 
  startName: string; 
  endName?: string; 
  headsign?: string;
  wayCode?: number;
}) {
  const [arrival, setArrival] = useState<SubwayArrival | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // State Manager states
  const [failCount, setFailCount] = useState(0);
  const [lastSuccessData, setLastSuccessData] = useState<SubwayArrival | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  const loadArrivalData = async () => {
    if (!startName) return;
    const cleanStart = startName.replace(/역$/, '').trim();

    try {
      const res = await fetch(`/api/subway/realtime?station=${encodeURIComponent(cleanStart)}&wayCode=${wayCode || ''}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
        let cleanHeadsign = headsign ? headsign.replace(/방면$/, '').replace(/역$/, '').trim() : '';
        let matched = null;

        if (cleanHeadsign) {
          matched = data.find((item: any) => 
            item.trainLineNm?.includes(cleanHeadsign) || 
            item.bstatnNm?.includes(cleanHeadsign)
          );
        }

        if (!matched && wayCode) {
          let expectedDirs: string[] = [];
          if (wayCode === 1) expectedDirs = ['상행', '내선', '상선'];
          else if (wayCode === 2) expectedDirs = ['하행', '외선', '하선'];
          
          if (expectedDirs.length > 0) {
            matched = data.find((item: any) => expectedDirs.some(dir => item.updnLine?.includes(dir)));
          }
        }

        if (!matched) matched = data[0];

        setArrival(matched);
        setLastSuccessData(matched);
        setLastFetchTime(Date.now());
        setFailCount(0);
      } else {
        throw new Error('No data');
      }
    } catch (err) {
      const newFailCount = failCount + 1;
      setFailCount(newFailCount);
      
      if (newFailCount <= 3 && lastSuccessData) {
        // Time Extrapolation
        const elapsedMinutes = Math.floor((Date.now() - lastFetchTime) / 60000);
        let newMinutes = lastSuccessData.minutesLeft;
        let newStatusText = lastSuccessData.statusText;
        let isApproaching = lastSuccessData.isApproaching;
        
        if (elapsedMinutes > 0 && newMinutes < 99) {
          newMinutes = Math.max(1, newMinutes - elapsedMinutes);
          newStatusText = newStatusText.replace(/\d+분/, `${newMinutes}분`);
          isApproaching = newMinutes <= 1;
        }
        
        setArrival({
          ...lastSuccessData,
          minutesLeft: newMinutes,
          statusText: newStatusText,
          isApproaching
        });
      } else {
        setArrival(null);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadArrivalData();
  }, [startName, endName]);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleRefresh = async () => {
    if (cooldown > 0 || isRefreshing) return;
    setIsRefreshing(true);
    setCooldown(5);
    await loadArrivalData();
  };

  if (loading && !arrival) {
    return (
      <div className="flex items-center gap-1 text-[9px] font-black text-zinc-400 bg-zinc-50 border border-zinc-150 px-1.5 py-0.5 rounded-full select-none flex-shrink-0 animate-pulse">
        조회 중
      </div>
    );
  }

  if (!arrival) {
    return (
      <div className="flex items-center gap-1 text-[9px] font-black text-zinc-400 bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded-full select-none flex-shrink-0">
        정보 없음
      </div>
    );
  }

  const isApproaching = arrival.isApproaching;
  const isRealtime = arrival.isRealtime !== false;
  const badgeText = arrival.statusText;

  return (
    <div 
      className={`flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full select-none border flex-shrink-0 transition-all duration-300 ${
        isRealtime ? 'text-emerald-600 bg-emerald-50 border-emerald-100 shadow-sm' : 'text-amber-600 bg-amber-50 border-amber-100 shadow-sm'
      } ${isApproaching ? 'animate-pulse' : ''}`}
      title={`${arrival.trainNo ? `열차번호 ${arrival.trainNo} · ` : ''}위치: ${arrival.arvlMsg2 || '정보 없음'}`}
    >
      <span className="relative flex h-1 w-1">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRealtime ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
        <span className={`relative inline-flex rounded-full h-1 w-1 ${isRealtime ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
      </span>
      
      {!isRealtime && (
        <span className="px-1 py-[1px] rounded-[3px] text-[7.5px] font-extrabold uppercase tracking-tight bg-amber-100/50 text-amber-700">
          시간표
        </span>
      )}

      <span>{badgeText}</span>
      <button
        type="button"
        disabled={cooldown > 0}
        onClick={(e) => {
          e.stopPropagation();
          handleRefresh();
        }}
        className={`ml-1 p-0.5 rounded-full hover:bg-black/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center ${
          cooldown > 0 ? 'text-zinc-300 cursor-not-allowed' : (isRealtime ? 'text-emerald-600/70 hover:text-emerald-800' : 'text-amber-600/70 hover:text-amber-800')
        }`}
        title={cooldown > 0 ? `${cooldown}초 후 새로고침 가능` : '새로고침'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </button>
    </div>
  );
}

function BusStepBadge({ 
  startName, 
  busNo 
}: { 
  startName: string; 
  busNo: string; 
}) {
  const [arrival, setArrival] = useState<BusArrival | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const loadArrivalData = async () => {
    if (!startName || !busNo) return;
    const cleanStart = startName.replace(/역$/, '').trim();
    const cleanBusNo = busNo.replace(/번\s*버스$/, '').trim();

    try {
      const res = await fetch(`/api/bus/realtime?station=${encodeURIComponent(cleanStart)}&busNo=${encodeURIComponent(cleanBusNo)}`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setArrival(data);
    } catch (err) {
      console.error('Failed to fetch bus realtime:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadArrivalData();
  }, [startName, busNo]);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = setTimeout(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleRefresh = async () => {
    if (cooldown > 0 || isRefreshing) return;
    setIsRefreshing(true);
    setCooldown(5);
    await loadArrivalData();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-[9px] font-black text-zinc-400 bg-zinc-50 border border-zinc-150 px-1.5 py-0.5 rounded-full select-none flex-shrink-0 animate-pulse">
        조회 중
      </div>
    );
  }

  if (!arrival) {
    return (
      <div className="flex items-center gap-1 text-[9px] font-black text-zinc-400 bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded-full select-none flex-shrink-0">
        정보 없음
      </div>
    );
  }

  const isApproaching = arrival.isApproaching1;
  const isRealtime = true;

  return (
    <div 
      className={`flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full select-none border flex-shrink-0 transition-all duration-300 text-emerald-600 bg-emerald-50 border-emerald-100 shadow-sm ${
        isApproaching ? 'animate-pulse' : ''
      }`}
      title={arrival.predictTime2 ? `다음 버스: ${arrival.statusText2}` : undefined}
    >
      <span className="relative flex h-1 w-1">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400`}></span>
        <span className={`relative inline-flex rounded-full h-1 w-1 bg-emerald-500`}></span>
      </span>



      <span>{arrival.statusText1}</span>
      <button
        type="button"
        disabled={cooldown > 0}
        onClick={(e) => {
          e.stopPropagation();
          handleRefresh();
        }}
        className={`ml-1 p-0.5 rounded-full hover:bg-black/5 active:scale-95 transition-all cursor-pointer flex items-center justify-center ${
          cooldown > 0 ? 'text-zinc-300 cursor-not-allowed' : 'text-emerald-600/70 hover:text-emerald-800'
        }`}
        title={cooldown > 0 ? `${cooldown}초 후 새로고침 가능` : '새로고침'}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </button>
    </div>
  );
}


interface RouteGuidePanelProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
  onNextSegment?: () => void;
  nextDestPlace?: Place;
}

export default function RouteGuidePanel({
  route,
  originPlace,
  destPlace,
  onClose,
  onNextSegment,
  nextDestPlace,
}: RouteGuidePanelProps) {
  const [mounted, setMounted] = useState(false);
  const { focusedStep, setFocusedStep, setFocusBounds } = useJourneyStore();

  useEffect(() => {
    // Small delay to trigger the slide-in transition
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (
      mounted &&
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id
    ) {
      const element = document.getElementById(`step-${originPlace.id}-${destPlace.id}-${focusedStep.stepIndex}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [focusedStep, originPlace.id, destPlace.id, mounted]);

  const formatDistance = (meters: number) => {
    if (meters < 10) return '';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return '';
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}초`;
    const minutes = Math.round(seconds / 60);
    return `${minutes}분`;
  };

  const guide = route.guide || [];
  const steps = route.steps || [];
  const hasGuide = guide.length > 0;

  const handleStepClick = (idx: number, step: any) => {
    const isThisStepFocused = !!(
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id &&
      focusedStep.stepIndex === idx
    );

    if (isThisStepFocused) {
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, route);
      setFocusBounds(bounds);
    } else {
      // 기본적으로 탑승/시작 지점으로 줌인
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
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: idx
      });
    }
  };

  const handleZoomToPoint = (idx: number, step: any, type: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();

    setFocusedStep({
      originId: originPlace.id,
      destId: destPlace.id,
      stepIndex: idx
    });

    let lat = type === 'start' ? step.startLat : step.endLat;
    let lng = type === 'start' ? step.startLng : step.endLng;

    if (lat === undefined || lng === undefined) {
      if (step.pathPoints && step.pathPoints.length > 0) {
        const pt = type === 'start' ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
        lat = pt.lat;
        lng = pt.lng;
      }
    }

    if (lat !== undefined && lng !== undefined) {
      setFocusBounds({
        sw: { lat, lng },
        ne: { lat, lng }
      });
    }
  };

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
            {route.type === 'public' ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500">
                  <path d="M4.5 2A2.5 2.5 0 0 0 2 4.5v11A2.5 2.5 0 0 0 4.5 18h11a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 15.5 2h-11ZM4 4.5A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5v3h-12v-3ZM16 9v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16V9h12Z" />
                  <circle cx="7" cy="12" r="1" />
                  <circle cx="13" cy="12" r="1" />
                </svg>
                대중교통 경로 안내
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-500">
                  <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.343 7.587.829.799 1.655 1.38 2.274 1.765.31.192.57.337.757.433.113.06.211.107.282.14l.017.008.006.003zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                상세 경로 안내
              </>
            )}
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
        <h3 className="text-sm font-extrabold text-zinc-800 flex items-center gap-1.5 truncate">
          <span className="truncate max-w-[130px]" title={originPlace.place_name}>{originPlace.place_name}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3 h-3 text-zinc-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
          <span className="truncate max-w-[130px]" title={destPlace.place_name}>{destPlace.place_name}</span>
        </h3>

        {/* Summary Info */}
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-black text-zinc-900 tracking-tight">{route.duration}분</span>
          <span className="text-xs font-semibold text-zinc-400">
            {route.type === 'public' ? (
              (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? '예매처 확인' : route.fare > 0 ? (route.isFareEstimated ? `요금 약 ${route.fare.toLocaleString()}원` : `요금 ${route.fare.toLocaleString()}원`) : '요금 정보 없음'
            ) : route.type === 'walk' || route.type === 'bicycle' ? (
              '무료'
            ) : (
              <>
                {route.distance ? `${route.distance.toFixed(1)}km` : ''}
                {route.taxiFare ? ` · 택시 약 ${route.taxiFare.toLocaleString()}원` : ''}
                {route.fare > 0 ? ` (통행료 ${route.fare.toLocaleString()}원)` : ''}
              </>
            )}
          </span>
        </div>

        {/* 예매처 빠른 링크 버튼 (장거리 노선이며 요금이 0인 경우 표출) */}
        {route.type === 'public' && (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {route.steps.some(s => s.type === 'train') && (
              <>
                {route.steps.some(s => s.type === 'train' && s.name.includes('SRT')) && (
                  <a
                    href="https://etk.srail.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#582E55] bg-[#582E55]/5 border border-[#582E55]/20 hover:bg-[#582E55]/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <span>SRT 예매</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
                {route.steps.some(s => s.type === 'train' && !s.name.includes('SRT')) && (
                  <a
                    href="https://www.letskorail.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#003366] bg-[#003366]/5 border border-[#003366]/20 hover:bg-[#003366]/10 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                  >
                    <span>코레일 예매</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
              </>
            )}
            {route.steps.some(s => s.type === 'expressbus') && (
              <>
                <a
                  href="https://www.kobus.co.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100/50 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <span>고속버스 예매</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
                <a
                  href="https://www.bustago.or.kr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 hover:bg-orange-100/50 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-colors"
                >
                  <span>시외버스 예매</span>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {/* Guide List */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {hasGuide ? (
          // 차량 turn-by-turn 안내 노출
          <div className="relative pl-1 flex flex-col gap-5">
            {/* 세로 연결선 */}
            <div className="absolute left-[9px] top-2.5 bottom-2.5 w-0.5 bg-zinc-100" />

            {guide.map((step, idx) => {
              const distStr = formatDistance(step.distance);
              const durStr = formatDuration(step.duration);

              // 아이콘과 색상 매핑
              let icon = '•';
              let iconColor = 'text-zinc-400 bg-white border-zinc-200';
              let iconSize = 'w-5 h-5 text-[10px]';

              const text = step.instructions;
              if (text.includes('출발')) {
                icon = '🏁';
                iconColor = 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm';
                iconSize = 'w-6 h-6 text-[11px]';
              } else if (text.includes('도착')) {
                icon = '📍';
                iconColor = 'text-rose-600 bg-rose-50 border-rose-200 shadow-sm';
                iconSize = 'w-6 h-6 text-[11px]';
              } else if (text.includes('우회전') || text.includes('우측')) {
                icon = '→';
                iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
              } else if (text.includes('좌회전') || text.includes('좌측')) {
                icon = '←';
                iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
              } else if (text.includes('유턴')) {
                icon = '↶';
                iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
              } else if (text.includes('직진')) {
                icon = '↑';
                iconColor = 'text-zinc-600 bg-zinc-50 border-zinc-200';
              } else if (text.includes('지하차도') || text.includes('터널') || text.includes('고속도로')) {
                icon = '🛣️';
                iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
              }

              return (
                <div key={idx} className="relative flex gap-4 pl-8 items-start group">
                  {/* 타임라인 노드 아이콘 */}
                  <div
                    className={`absolute left-0 top-0.5 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 ${iconColor} ${iconSize}`}
                    style={{ left: iconSize === 'w-6 h-6' ? '-2px' : '0px' }}
                  >
                    {icon}
                  </div>

                  {/* 경로 설명 및 거리/시간 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-zinc-600 leading-snug group-hover:text-zinc-800 transition-colors">
                      {step.instructions}
                    </p>
                    {(distStr || durStr) && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 font-semibold select-none">
                        {distStr && <span>{distStr}</span>}
                        {distStr && durStr && <span className="text-zinc-300">·</span>}
                        {durStr && <span>{durStr}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : steps.length > 0 ? (
          // 대중교통 또는 도보 step-by-step 노선 리스트 노출
          <div className="relative pl-1 flex flex-col gap-6">
            {/* 세로 연결선 */}
            <div className="absolute left-[24.5px] top-4 bottom-4 w-[3px] bg-zinc-100" />

            {steps.map((step, idx) => {
              const stepColor = step.color || '#A1A1AA';

              // 아이콘과 색상 매핑
              let icon = '•';
              let iconColor = 'text-zinc-500 bg-white border-zinc-200';

              if (step.type === 'walk') {
                icon = '🚶';
                iconColor = 'text-zinc-500 bg-zinc-50 border-zinc-200';
              } else if (step.type === 'subway') {
                icon = '🚇';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'bus') {
                icon = '🚌';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'car') {
                icon = '🚗';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'train') {
                icon = '🚄';
                iconColor = 'text-white border-transparent';
              } else if (step.type === 'expressbus') {
                icon = '🚌';
                iconColor = 'text-white border-transparent';
              }

              const isThisStepFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id &&
                focusedStep.stepIndex === idx
              );
              const isAnyStepFocused = !!(
                focusedStep &&
                focusedStep.originId === originPlace.id &&
                focusedStep.destId === destPlace.id
              );

              return (
                <div
                  key={idx}
                  id={`step-${originPlace.id}-${destPlace.id}-${idx}`}
                  onClick={() => handleStepClick(idx, step)}
                  className={`relative flex gap-4 pl-9 pr-3 py-2 rounded-2xl border transition-all duration-200 cursor-pointer select-none ${
                    isThisStepFocused
                      ? 'bg-blue-50/60 border-blue-200 shadow-sm scale-[1.01]'
                      : isAnyStepFocused
                      ? 'bg-transparent border-transparent opacity-40 hover:opacity-75 hover:bg-zinc-50/50'
                      : 'bg-transparent border-transparent hover:bg-zinc-50/50 hover:border-zinc-100'
                  }`}
                  style={{
                    opacity: isAnyStepFocused ? (isThisStepFocused ? 1 : 0.4) : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* 타임라인 노드 아이콘 */}
                  <div
                    className={`absolute left-2.5 top-2.5 w-6 h-6 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 shadow-sm ${iconColor} ${
                      isThisStepFocused ? 'ring-2 ring-blue-500/30' : ''
                    }`}
                    style={{
                      backgroundColor: step.type === 'walk' ? '#F4F4F5' : stepColor,
                      borderColor: step.type === 'walk' ? '#E4E4E7' : 'transparent',
                    }}
                  >
                    <span className="text-xs leading-none">{icon}</span>
                  </div>

                  {/* 경로 설명 및 거리/시간 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="text-[14px] font-bold text-zinc-800 group-hover:text-blue-600 transition-colors truncate">
                          {step.type === 'walk' ? '도보 이동' : step.name}
                        </h4>
                        {step.type === 'subway' && step.startName ? (
                          <SubwayStepBadge startName={step.startName} endName={step.endName} headsign={step.headsign} wayCode={step.wayCode} />
                        ) : step.type === 'bus' && step.startName ? (
                          <BusStepBadge startName={step.startName} busNo={step.name} />
                        ) : (
                          step.type !== 'walk' && (
                            <div className="flex items-center gap-1 text-[9px] font-black text-zinc-500 bg-zinc-50 border border-zinc-100 px-1.5 py-0.5 rounded-full select-none flex-shrink-0">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-zinc-400"></span>
                              </span>
                              <>
                                <span className="text-zinc-500">{idx % 2 === 0 ? '3' : '5'}분</span>
                                <span className="text-zinc-400 font-bold ml-1">{idx % 2 === 0 ? '전역' : '3전'}</span>
                              </>
                            </div>
                          )
                        )}
                      </div>
                      <span className="text-[12px] font-bold text-zinc-600 flex-shrink-0">
                        {step.duration}분
                      </span>
                    </div>

                    {/* 승차 / 하차 정보 */}
                    {(step.startName || step.endName) && (
                      <div className="mt-1.5 p-1 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col gap-0.5 select-none">
                        {step.startName && (
                          <div
                            onClick={(e) => handleZoomToPoint(idx, step, 'start', e)}
                            className="flex items-center justify-between gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer hover:bg-blue-50/70 p-2 rounded-xl transition-all duration-200 group/sub"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              <span className="text-zinc-400 font-bold">승차</span>
                              <span className="truncate text-zinc-700 group-hover/sub:text-blue-700 transition-colors">{step.startName}</span>
                            </div>
                            <div className="flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity duration-200 text-blue-500 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 animate-pulse">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                              </svg>
                            </div>
                          </div>
                        )}
                        {step.startName && step.endName && (
                          <div className="w-px h-2 bg-zinc-200 ml-[13px]" />
                        )}
                        {step.endName && (
                          <div
                            onClick={(e) => handleZoomToPoint(idx, step, 'end', e)}
                            className="flex items-center justify-between gap-1.5 text-xs text-zinc-600 font-semibold cursor-pointer hover:bg-rose-50/70 p-2 rounded-xl transition-all duration-200 group/sub"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                              <span className="text-zinc-400 font-bold">하차</span>
                              <span className="truncate text-zinc-700 group-hover/sub:text-rose-700 transition-colors">{step.endName}</span>
                            </div>
                            <div className="flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity duration-200 text-rose-500 flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 animate-pulse">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 예약 링크 추가 */}
                    {(step.type === 'train' || step.type === 'expressbus') && (
                      <div className="mt-2 flex justify-end">
                        <a
                          href={
                            step.type === 'train'
                              ? (step.name.includes('SRT') ? 'https://etk.srail.kr/' : 'https://www.letskorail.com/')
                              : (step.name.includes('고속') ? 'https://www.kobus.co.kr/' : 'https://www.bustago.or.kr/')
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100/50 hover:bg-blue-100/50 transition-colors"
                        >
                          <span>{step.name} 예매</span>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-2.5 h-2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    )}

                    {step.type === 'walk' && !step.startName && !step.endName && (
                      <p className="text-xs text-zinc-400 font-semibold mt-1">
                        약 {step.duration}분 동안 도보로 이동합니다.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 text-zinc-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mb-2 text-zinc-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-xs font-medium">세부 경로 안내 정보가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 다음 이동 정보 버튼 */}
      {onNextSegment && nextDestPlace && (
        <div className="flex-shrink-0 px-4 pb-4">
          <button
            type="button"
            onClick={onNextSegment}
            className="
              group w-full flex items-center justify-between gap-3
              px-5 py-3.5 rounded-2xl
              bg-gradient-to-r from-blue-50 to-indigo-50
              border border-blue-100 hover:border-blue-300
              hover:from-blue-100 hover:to-indigo-100
              hover:shadow-[0_4px_16px_rgba(59,130,246,0.12)]
              active:scale-[0.98]
              transition-all duration-200 cursor-pointer
            "
          >
            <div className="flex flex-col items-start gap-0.5 min-w-0">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider select-none">
                다음 이동 정보
              </span>
              <span className="text-[13px] font-bold text-blue-700 truncate max-w-[230px]" title={nextDestPlace.place_name}>
                {destPlace.place_name}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3 inline-block mx-1 text-blue-400 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
                {nextDestPlace.place_name}
              </span>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 group-hover:bg-blue-600 flex items-center justify-center shadow-sm transition-colors duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </button>
        </div>
      )}

      {/* 최종 목적지 배너 */}
      {!onNextSegment && (
        <div className="flex-shrink-0 px-4 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="
              group w-full flex items-center justify-between gap-3
              px-5 py-3.5 rounded-2xl
              bg-gradient-to-r from-blue-50 to-indigo-50
              border border-blue-100 hover:border-blue-300
              hover:from-blue-100 hover:to-indigo-100
              hover:shadow-[0_4px_16px_rgba(59,130,246,0.12)]
              active:scale-[0.98]
              transition-all duration-200 cursor-pointer
            "
          >
            <div className="flex flex-col items-start gap-0.5 min-w-0">
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider select-none">
                최종 목적지 도착
              </span>
              <span className="text-[13px] font-bold text-blue-700 truncate max-w-[230px]" title={destPlace.place_name}>
                {destPlace.place_name}
              </span>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 group-hover:bg-blue-600 flex items-center justify-center shadow-sm transition-colors duration-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white group-hover:scale-110 transition-transform duration-300">
                <path fillRule="evenodd" d="M3 2.25a.75.75 0 0 1 .75.75v.54l1.838-.46a9.75 9.75 0 0 1 6.725.738l.108.054a8.25 8.25 0 0 0 5.58.652l3.109-.732a.75.75 0 0 1 .917.81 47.784 47.784 0 0 0 .005 10.337.75.75 0 0 1-.574.812l-3.114.733a9.75 9.75 0 0 1-6.594-.77l-.108-.054a8.25 8.25 0 0 0-5.69-.625l-2.202.55V21a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
              </svg>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
