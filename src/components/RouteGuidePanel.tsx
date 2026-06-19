"use client";

import { useEffect, useState } from 'react';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';

interface RouteGuidePanelProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
}

export default function RouteGuidePanel({
  route,
  originPlace,
  destPlace,
  onClose
}: RouteGuidePanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Small delay to trigger the slide-in transition
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

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

  return (
    <div
      className={`absolute top-[84px] left-4 z-40 w-[360px] h-[calc(100vh-108px)] bg-white/95 backdrop-blur-md rounded-3xl border border-zinc-150/80 shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col transition-all duration-300 ease-out transform ${
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
          <span className="text-2xl font-black text-blue-600 tracking-tight">{route.duration}분</span>
          <span className="text-xs font-semibold text-zinc-400">
            {route.type === 'public' ? (
              route.fare > 0 ? `요금 ${route.fare.toLocaleString()}원` : '요금 정보 없음'
            ) : (
              <>
                {route.distance ? `${route.distance.toFixed(1)}km` : ''}
                {route.taxiFare ? ` · 택시 약 ${route.taxiFare.toLocaleString()}원` : ''}
                {route.fare > 0 ? ` (통행료 ${route.fare.toLocaleString()}원)` : ''}
              </>
            )}
          </span>
        </div>
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
            <div className="absolute left-[11px] top-4 bottom-4 w-[3px] bg-zinc-100" />

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
              }

              return (
                <div key={idx} className="relative flex gap-4 pl-9 items-start group">
                  {/* 타임라인 노드 아이콘 */}
                  <div
                    className={`absolute left-0 top-0.5 w-6 h-6 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 shadow-sm ${iconColor}`}
                    style={{
                      backgroundColor: step.type === 'walk' ? '#F4F4F5' : stepColor,
                      borderColor: step.type === 'walk' ? '#E4E4E7' : 'transparent',
                    }}
                  >
                    <span className="text-xs leading-none">{icon}</span>
                  </div>

                  {/* 경로 설명 및 거리/시간 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-[14px] font-bold text-zinc-800 group-hover:text-blue-600 transition-colors">
                        {step.type === 'walk' ? '도보 이동' : step.name}
                      </h4>
                      <span className="text-[12px] font-bold text-zinc-600 flex-shrink-0">
                        {step.duration}분
                      </span>
                    </div>

                    {/* 승차 / 하차 정보 */}
                    {(step.startName || step.endName) && (
                      <div className="mt-1.5 p-3 rounded-2xl bg-zinc-50/50 border border-zinc-100 flex flex-col gap-1 select-none">
                        {step.startName && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="text-zinc-400 font-medium">승차</span>
                            <span className="truncate">{step.startName}</span>
                          </div>
                        )}
                        {step.startName && step.endName && (
                          <div className="w-px h-3 bg-zinc-200 ml-[11px]" />
                        )}
                        {step.endName && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-600 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                            <span className="text-zinc-400 font-medium">하차</span>
                            <span className="truncate">{step.endName}</span>
                          </div>
                        )}
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
    </div>
  );
}
