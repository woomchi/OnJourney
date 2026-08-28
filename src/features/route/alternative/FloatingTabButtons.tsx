"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface FloatingTabButtonsProps {
  activeTab: 'public' | 'car' | 'walk';
  setActiveTab: (tab: 'public' | 'car' | 'walk') => void;
  setActiveSubTab: (subTab: string) => void;
  setDisplayLimit: (limit: number) => void;
}

export function FloatingTabButtons({
  activeTab,
  setActiveTab,
  setActiveSubTab,
  setDisplayLimit,
}: FloatingTabButtonsProps) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[46] flex bg-white/95 backdrop-blur-md p-1 rounded-full border border-blue-100/80 shadow-[0_12px_32px_rgba(0,0,0,0.12),_0_4px_12px_rgba(0,0,0,0.06)] min-w-[310px] justify-between pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {(['public', 'car', 'walk'] as const).map((tab) => {
        const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
        const icon = tab === 'public' ? '🚌' : tab === 'car' ? '🚗' : '🚶';
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              setActiveSubTab('추천');
              setDisplayLimit(3);
            }}
            className={`
              relative flex items-center justify-center gap-1.5 px-4.5 py-2 text-xs font-bold rounded-full transition-colors duration-200 cursor-pointer select-none min-w-[96px]
              ${isActive
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-800 active:bg-zinc-150/40'
              }
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeAlternativeTab"
                className="absolute inset-0 bg-blue-600 rounded-full z-0 shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10 text-[13px]">{icon}</span>
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
