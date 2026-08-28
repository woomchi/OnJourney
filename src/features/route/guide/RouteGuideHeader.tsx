"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { AlternativeRouteIcon } from '@/components/ui/icons';
import DepartureTimeSelector from '@/components/common/DepartureTimeSelector';
import FareBreakdownTooltip from '@/components/route/FareBreakdownTooltip';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';

interface RouteGuideHeaderProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
  onOpenAlternative: () => void;
}

export function RouteGuideHeader({
  route,
  originPlace,
  destPlace,
  onClose,
  onOpenAlternative,
}: RouteGuideHeaderProps) {
  const [activeTooltip, setActiveTooltip] = useState<'origin' | 'dest' | null>(null);

  useEffect(() => {
    if (!activeTooltip) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tooltip-trigger') && !target.closest('.tooltip-content')) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [activeTooltip]);

  return (
    <div className="border-b border-zinc-100 flex-shrink-0 bg-white w-full">
      {/* 첫 번째 행: 좌측 뒤로가기 버튼 & 중앙 대안 경로 변경 버튼 & 우측 대중교통/승용차 태그 */}
      <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between relative">
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="p-1 -ml-0.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer z-10"
          aria-label="뒤로가기"
          title="뒤로가기"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* 중앙 정렬 대안 변경 버튼 */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2.5 flex items-center z-10">
          <button
            type="button"
            onClick={onOpenAlternative}
            onPointerDown={(e) => e.stopPropagation()}
            className="px-2.5 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/60 rounded-full flex items-center gap-1 shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            title="대안 경로 변경"
            aria-label="대안 경로 변경"
          >
            <AlternativeRouteIcon className="w-3.5 h-3.5" />
            <span>대안 변경</span>
          </button>
        </div>

        <span className="text-[10px] font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full flex-shrink-0 z-10">
          {route.type === 'public' ? '대중교통' : '승용차'}
        </span>
      </div>

      {/* 두 번째 행: 출발지 → 도착지 (클릭 시 상세 정보 말풍선 툴팁 표시) */}
      <div className="px-5 pb-3.5 pt-0.5">
        <div className="flex items-center w-full min-w-0 gap-2">
          {/* 출발지 */}
          <div className="flex-1 min-w-0 text-center relative tooltip-trigger">
            <span
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'origin' ? null : 'origin');
              }}
              className={`block px-3 py-1.5 rounded-xl text-[14px] truncate cursor-pointer transition-all duration-200 select-none ${
                activeTooltip === 'origin'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                  : 'bg-zinc-100/90 text-zinc-800 font-bold hover:bg-blue-50/60 hover:border-blue-200 hover:text-blue-600 border border-zinc-200/60'
              }`}
              title={originPlace.place_name}
            >
              {originPlace.place_name}
            </span>
            <AnimatePresence>
              {activeTooltip === 'origin' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] left-0 top-full mt-2.5 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15"
                  >
                    <p className="font-bold text-[13px] mb-1">{originPlace.place_name}</p>
                    {originPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{originPlace.address}</p>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/2 -translate-x-1/2 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>

          {/* 화살표 */}
          <div className="flex-shrink-0 px-1 flex justify-center items-center">
            <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* 도착지 */}
          <div className="flex-1 min-w-0 text-center relative tooltip-trigger">
            <span
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'dest' ? null : 'dest');
              }}
              className={`block px-3 py-1.5 rounded-xl text-[14px] truncate cursor-pointer transition-all duration-200 select-none ${
                activeTooltip === 'dest'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                  : 'bg-zinc-100/90 text-zinc-800 font-bold hover:bg-blue-50/60 hover:border-blue-200 hover:text-blue-600 border border-zinc-200/60'
              }`}
              title={destPlace.place_name}
            >
              {destPlace.place_name}
            </span>
            <AnimatePresence>
              {activeTooltip === 'dest' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] right-0 top-full mt-2.5 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15"
                  >
                    <p className="font-bold text-[13px] mb-1">{destPlace.place_name}</p>
                    {destPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{destPlace.address}</p>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/2 -translate-x-1/2 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-violet-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 세 번째 행: 출발 시각 선택기 */}
      <div className="px-5 pb-2.5 flex items-center justify-between border-t border-zinc-100/50 pt-2.5 bg-zinc-50/50">
        <span className="text-[11px] font-bold text-zinc-500">길찾기 출발 시각</span>
        <DepartureTimeSelector />
      </div>

      {/* 네 번째 행: 예상 요금 정보 */}
      {route.type === 'public' && (route.fare ?? 0) > 0 && (
        <div className="px-5 pb-2.5 flex items-center justify-between bg-zinc-50/50">
          <span className="text-[11px] font-bold text-zinc-500">예상 요금</span>
          <span className="flex items-center gap-1 text-[12px] font-bold text-zinc-800">
            <span>{route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}</span>
            <FareBreakdownTooltip fareBreakdown={route.fareBreakdown} />
          </span>
        </div>
      )}

      {route.isEstimated && (
        <div className="mx-5 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-xs font-semibold">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>네트워크 지연으로 인한 예상 경로입니다.</span>
        </div>
      )}
    </div>
  );
}
