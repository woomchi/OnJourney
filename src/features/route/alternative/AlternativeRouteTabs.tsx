"use client";

import React, { useRef, useCallback } from 'react';
import ScrollContainer from 'react-indiana-drag-scroll';
import DepartureTimeSelector from '@/components/common/DepartureTimeSelector';

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
      {/* 3층: 출발 시각 설정 */}
      <div className="mx-4 pb-3 flex items-center justify-between border-t border-zinc-100/50 pt-2.5 bg-zinc-50/50 -mt-3 mb-2 px-3 rounded-lg">
        <span className="text-[11px] font-bold text-zinc-500">길찾기 출발 시각</span>
        <DepartureTimeSelector />
      </div>

      <div className={`px-5 ${isMobile ? 'pt-1.5 pb-1' : 'pt-4 pb-2'} flex-shrink-0 flex flex-col gap-1.5`}>
        {/* 데스크톱 전용 탭 바 */}
        {!isMobile && (
          <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-100">
            {(['public', 'car', 'walk'] as const).map((tab) => {
              const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
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
                  onPointerDown={(e) => e.stopPropagation()}
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
        )}

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
