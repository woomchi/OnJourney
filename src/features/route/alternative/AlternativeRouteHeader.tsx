"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Place } from '@/types/journey';

interface AlternativeRouteHeaderProps {
  originPlace: Place;
  destPlace: Place;
  onCancel: () => void;
  onApply: () => void;
}

export function AlternativeRouteHeader({
  originPlace,
  destPlace,
  onCancel,
  onApply,
}: AlternativeRouteHeaderProps) {
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
    <div className="px-4 pt-1.5 pb-3 border-b border-zinc-100 flex flex-col gap-2.5">
      {/* 1층: 취소 / 변경 버튼을 양쪽 끝 엣지 영역에 가깝게 배치 */}
      <div className="flex items-center justify-between w-full px-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
        >
          취소
        </button>

        <button
          type="button"
          onClick={onApply}
          className="px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
        >
          변경
        </button>
      </div>

      {/* 2층: 중앙에 고정된 화살표와 좌우 균등 분할된 출발/도착지 텍스트 박스 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full mt-0.5 px-1 relative z-20">
        {/* 출발지 (왼쪽 영역 중앙 정렬) */}
        <div className="flex justify-center min-w-0 pr-1 relative tooltip-trigger">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(activeTooltip === 'origin' ? null : 'origin');
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`max-w-full px-2 py-0.5 rounded-lg text-sm font-extrabold truncate cursor-pointer transition-all select-none border ${
              activeTooltip === 'origin'
                ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs'
                : 'bg-transparent text-zinc-800 border-transparent hover:bg-zinc-100/80'
            }`}
            title={originPlace.place_name}
          >
            {originPlace.place_name}
          </button>
          <AnimatePresence>
            {activeTooltip === 'origin' && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute z-[1000] left-0 top-full mt-2 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto"
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

        {/* 화살표 아이콘 (정중앙 고정) */}
        <div className="flex items-center justify-center px-1 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5 text-zinc-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </div>

        {/* 도착지 (오른쪽 영역 중앙 정렬) */}
        <div className="flex justify-center min-w-0 pl-1 relative tooltip-trigger">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(activeTooltip === 'dest' ? null : 'dest');
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`max-w-full px-2 py-0.5 rounded-lg text-sm font-extrabold truncate cursor-pointer transition-all select-none border ${
              activeTooltip === 'dest'
                ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs'
                : 'bg-transparent text-zinc-800 border-transparent hover:bg-zinc-100/80'
            }`}
            title={destPlace.place_name}
          >
            {destPlace.place_name}
          </button>
          <AnimatePresence>
            {activeTooltip === 'dest' && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute z-[1000] right-0 top-full mt-2 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto"
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
                  className="absolute z-[1001] right-1/2 translate-x-1/2 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-violet-500 pointer-events-none"
                />
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
