"use client";

import React, { useRef, useCallback } from 'react';
import ScrollContainer from 'react-indiana-drag-scroll';
import { motion } from 'framer-motion';

interface AlternativeRouteTabsProps {
  activeTab: 'public' | 'car' | 'walk';
  setActiveTab: (tab: 'public' | 'car' | 'walk') => void;
  activeSubTab: string;
  setActiveSubTab: (subTab: string) => void;
  subTabs: string[];
  publicRouteGroups: Record<string, any[]>;
  recommendedRouteCount: number;
  totalPublicRoutesCount: number;
  setDisplayLimit: (limit: number) => void;
  isMobile: boolean;
}

export function AlternativeRouteTabs({
  activeTab,
  setActiveTab,
  activeSubTab,
  setActiveSubTab,
  subTabs,
  publicRouteGroups,
  recommendedRouteCount,
  totalPublicRoutesCount,
  setDisplayLimit,
  isMobile,
}: AlternativeRouteTabsProps) {
  const isDraggedRef = useRef(false);

  const withClickPrevent = useCallback((fn: () => void) => {
    return () => {
      if (isDraggedRef.current) return;
      fn();
    };
  }, []);

  return (
    <>
      <div className={`px-5 ${isMobile ? 'pt-1.5 pb-1' : 'pt-4 pb-2'} flex-shrink-0 flex flex-col gap-1.5`}>
        {/* 이동 수단 탭 바 (대안 카드 스크롤 영역 위 상단 배치) */}
        <div
          className="flex bg-zinc-100/90 p-1 rounded-xl border border-zinc-200/60 relative"
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
                  relative flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition-colors duration-200 cursor-pointer select-none flex items-center justify-center gap-1.5
                  ${isActive
                    ? 'text-blue-600'
                    : 'text-zinc-500 hover:text-zinc-800 active:bg-zinc-200/50'
                  }
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeAlternativeTab"
                    className="absolute inset-0 bg-white rounded-lg shadow-xs border border-zinc-200/80 z-0"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10 text-[13px] leading-none">{icon}</span>
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        {/* 대중교통 카테고리 서브탭 칩 목록 */}
        {activeTab === 'public' && subTabs.length > 1 && (
          <div onPointerDown={(e) => e.stopPropagation()}>
            <ScrollContainer
              className="flex items-center gap-1.5 pb-1 pt-0 cursor-grab"
              horizontal
              vertical={false}
              hideScrollbars
              onStartScroll={() => { isDraggedRef.current = false; }}
              onScroll={() => { isDraggedRef.current = true; }}
              onEndScroll={() => { setTimeout(() => { isDraggedRef.current = false; }, 50); }}
            >
              {subTabs.map((subTab) => {
                const count =
                  subTab === '추천'
                    ? recommendedRouteCount
                    : subTab === '전체'
                    ? totalPublicRoutesCount
                    : (publicRouteGroups[subTab]?.length || 0);

                return (
                  <button
                    key={subTab}
                    type="button"
                    onClick={withClickPrevent(() => {
                      setActiveSubTab(subTab);
                      setDisplayLimit(3);
                    })}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`
                      flex-shrink-0 px-2.5 py-1 text-[10.5px] font-bold rounded-full transition-all duration-200 border cursor-pointer flex items-center gap-1
                      ${activeSubTab === subTab
                        ? 'bg-zinc-800 text-white border-zinc-800 shadow-sm'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }
                    `}
                  >
                    <span>{subTab}</span>
                    <span className={`text-[10px] ${activeSubTab === subTab ? 'text-zinc-400' : 'text-zinc-400'}`}>{count}</span>
                  </button>
                );
              })}
            </ScrollContainer>
          </div>
        )}
      </div>
    </>
  );
}
