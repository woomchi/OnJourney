"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { AlternativeRouteIcon } from '@/components/ui/icons';
import type { Place } from '@/types/journey';

interface MobileSegmentHeaderProps {
  originPlace: Place;
  destPlace: Place;
  onClose: () => void;
  onOpenAlternative: () => void;
  onChangePlace: (placeId: string, e: React.SyntheticEvent) => void;
}

export function MobileSegmentHeader({
  originPlace,
  destPlace,
  onClose,
  onOpenAlternative,
  onChangePlace,
}: MobileSegmentHeaderProps) {
  const [activeTooltip, setActiveTooltip] = useState<'origin' | 'dest' | 'changeMenu' | null>(null);

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
    <div className="relative flex flex-col items-center justify-center px-4 pb-0 mb-2">
      {/* Top Centered Alternative Change Button */}
      <div className="w-full flex items-center justify-center min-h-[28px] mb-1.5">
        <button
          onClick={onOpenAlternative}
          className="px-2.5 py-1 text-[11px] font-bold text-blue-600 bg-[#FFFFFF] hover:text-blue-700 flex items-center gap-1 shadow-md hover:scale-105 active:scale-95 transition-all border border-zinc-200/80 rounded-full cursor-pointer z-10 whitespace-nowrap shrink-0"
          aria-label="대안 경로 변경"
          title="대안 경로 변경"
        >
          <AlternativeRouteIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">대안 변경</span>
        </button>
      </div>

      {/* Back Button (Left) & Center Origin -> Destination Pill UI & Right Place Change Button */}
      <div className="relative w-full flex items-center justify-center">
        {/* Back Button on Left */}
        <button
          onClick={onClose}
          className="absolute left-0 w-8 h-8 rounded-full bg-[#FFFFFF] text-zinc-700 hover:text-zinc-950 flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all border border-zinc-200/80 cursor-pointer z-10"
          aria-label="여정 상세로 돌아가기"
          title="여정 상세로 돌아가기"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
        </button>

        {/* Center Origin -> Destination Pill UI with Tooltip Popups */}
        <div className="w-full max-w-[calc(100%-88px)] bg-[#FFFFFF] text-zinc-900 p-1 rounded-2xl shadow-md text-xs font-extrabold flex items-center justify-between gap-1.5 border border-zinc-200/80 min-w-0">
          {/* 출발 지점 칩 */}
          <div className="relative tooltip-trigger min-w-0 flex-1">
            <div
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'origin' ? null : 'origin');
              }}
              className={`px-2.5 py-1 rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-1 min-w-0 flex-1 cursor-pointer select-none ${
                activeTooltip === 'origin'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                  : 'bg-zinc-100/90 text-zinc-800 font-bold border border-zinc-200/50 hover:bg-blue-50/60 hover:border-blue-200'
              }`}
            >
              <span className="truncate min-w-0" title={originPlace.place_name}>
                {originPlace.place_name}
              </span>
            </div>

            <AnimatePresence>
              {activeTooltip === 'origin' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] left-0 top-full mt-2.5 w-56 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto flex flex-col gap-2"
                  >
                    <div>
                      <p className="font-bold text-[13px] mb-0.5">{originPlace.place_name}</p>
                      {originPlace.address && (
                        <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{originPlace.address}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        setActiveTooltip(null);
                        onChangePlace(originPlace.id, e);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/30"
                    >
                      <RefreshCw className="w-3 h-3" strokeWidth={2.2} />
                      <span>출발지 변경</span>
                    </button>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/3 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>

          <svg className="w-4 h-4 text-blue-600 shrink-0 px-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>

          {/* 도착 지점 칩 */}
          <div className="relative tooltip-trigger min-w-0 flex-1">
            <div
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'dest' ? null : 'dest');
              }}
              className={`px-2.5 py-1 rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-1 min-w-0 flex-1 cursor-pointer select-none ${
                activeTooltip === 'dest'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                  : 'bg-zinc-100/90 text-zinc-800 font-bold border border-zinc-200/50 hover:bg-blue-50/60 hover:border-blue-200'
              }`}
            >
              <span className="truncate min-w-0" title={destPlace.place_name}>
                {destPlace.place_name}
              </span>
            </div>

            <AnimatePresence>
              {activeTooltip === 'dest' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] right-0 top-full mt-2.5 w-56 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto flex flex-col gap-2"
                  >
                    <div>
                      <p className="font-bold text-[13px] mb-0.5">{destPlace.place_name}</p>
                      {destPlace.address && (
                        <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{destPlace.address}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        setActiveTooltip(null);
                        onChangePlace(destPlace.id, e);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/30"
                    >
                      <RefreshCw className="w-3 h-3" strokeWidth={2.2} />
                      <span>도착지 변경</span>
                    </button>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] right-1/3 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-violet-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Place Change Button & Popover Selection Menu */}
        <div className="absolute right-0 z-10 tooltip-trigger">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(activeTooltip === 'changeMenu' ? null : 'changeMenu');
            }}
            className="w-8 h-8 rounded-full bg-[#FFFFFF] text-zinc-700 hover:text-blue-600 flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all border border-zinc-200/80 cursor-pointer"
            aria-label="장소 변경"
            title="장소 변경"
          >
            <RefreshCw className="w-4 h-4 stroke-[2]" />
          </button>

          <AnimatePresence>
            {activeTooltip === 'changeMenu' && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute z-[1000] right-0 top-full mt-2 w-36 p-1.5 bg-white text-zinc-900 text-xs font-bold rounded-xl shadow-xl border border-zinc-200/80 flex flex-col gap-1 tooltip-content pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    setActiveTooltip(null);
                    onChangePlace(originPlace.id, e);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg hover:bg-blue-50 text-zinc-700 hover:text-blue-600 flex items-center gap-2 transition-colors cursor-pointer text-left"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>출발지 변경</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    setActiveTooltip(null);
                    onChangePlace(destPlace.id, e);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg hover:bg-blue-50 text-zinc-700 hover:text-blue-600 flex items-center gap-2 transition-colors cursor-pointer text-left border-t border-zinc-100 pt-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span>도착지 변경</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
