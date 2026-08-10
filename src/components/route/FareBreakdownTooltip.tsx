"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { FareSection } from '@/types/journey';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';

interface FareBreakdownTooltipProps {
  fareBreakdown?: FareSection[];
  className?: string;
}

export default function FareBreakdownTooltip({ fareBreakdown, className = '' }: FareBreakdownTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isOpen]);

  if (!fareBreakdown || fareBreakdown.length === 0) {
    return null;
  }

  const totalFare = fareBreakdown.reduce((sum, item) => sum + item.payment, 0);

  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className="p-0.5 text-zinc-400 hover:text-blue-600 transition-colors rounded-full focus:outline-none cursor-pointer"
        title="요금 세부 정보"
        aria-label="요금 세부 정보"
        aria-expanded={isOpen}
      >
        <Info className="w-3.5 h-3.5" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="absolute z-[3000] bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3.5 bg-white border border-zinc-200 rounded-xl shadow-xl text-zinc-800 text-xs cursor-default"
          >
            <div className="flex items-center justify-between font-bold text-zinc-900 border-b border-zinc-100 pb-2 mb-2">
              <span className="flex items-center gap-1.5">
                💳 구간별 요금 상세
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">승차 요금 기준</span>
            </div>

            <div className="flex flex-col gap-2">
              {fareBreakdown.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-zinc-700 font-medium">
                    <span className="truncate max-w-[140px]" title={item.label}>
                      {item.label}
                    </span>
                    <span className="font-bold text-zinc-900">
                      {item.payment.toLocaleString()}원
                    </span>
                  </div>

                  {item.trainSpSeatFare && item.trainSpSeatFare > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-indigo-600 bg-indigo-50/70 px-2 py-0.5 rounded font-semibold pl-3">
                      <span>∟ 특실 이용 시</span>
                      <span>+{item.trainSpSeatFare.toLocaleString()}원</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-100 mt-2.5 pt-2 flex items-center justify-between font-extrabold text-blue-600">
              <span>총 승차 요금</span>
              <span className="text-sm">{totalFare.toLocaleString()}원</span>
            </div>

            {/* 말풍선 화살표 */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white drop-shadow-sm pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
