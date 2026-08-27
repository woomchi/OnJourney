"use client";

import React from 'react';
import type { Place } from '@/types/journey';
import { getSequenceTheme } from '@/constants/colors';
import { RefreshCw } from 'lucide-react';

interface HorizontalTimelinePlaceNodeProps {
  place: Place;
  index: number;
  totalPlaces: number;
  focusedPlaceId: string | null;
  prevSegmentType?: string;
  prevSegmentIsFocused?: boolean;
  nextSegmentType?: string;
  nextSegmentIsFocused?: boolean;
  onPlaceClick: (place: Place) => void;
  onChangePlaceClick: (placeId: string) => void;
  onBindRef: (key: string, el: HTMLElement | null) => void;
}

export function HorizontalTimelinePlaceNode({
  place,
  index,
  totalPlaces,
  focusedPlaceId,
  prevSegmentType,
  prevSegmentIsFocused,
  nextSegmentType,
  nextSegmentIsFocused,
  onPlaceClick,
  onChangePlaceClick,
  onBindRef,
}: HorizontalTimelinePlaceNodeProps) {
  const categoryLabel = place.category ? (place.category.split(' > ').pop() || place.category) : '';
  const shortAddress = place.address ? place.address.split(' ').slice(0, 2).join(' ') : '';
  const placeTheme = getSequenceTheme(index, totalPlaces);
  const isFocused = focusedPlaceId === place.id;

  return (
    <div className="flex flex-col items-center justify-between w-[96px] shrink-0 h-[100px] relative">
      {/* 상단 핀 위 영역 (장소 정보 변경 버튼) */}
      <div className="h-[32px] w-full flex items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangePlaceClick(place.id);
          }}
          className="w-7.5 h-7.5 rounded-lg text-zinc-500 hover:text-blue-600 bg-zinc-50 hover:bg-blue-50/80 border border-zinc-200 hover:border-blue-300 flex items-center justify-center transition-all duration-300 cursor-pointer shadow-2xs active:scale-95 group/mobile-change-btn shrink-0"
          title="장소 정보 변경"
        >
          <RefreshCw className="w-4 h-4 text-zinc-500 group-hover/mobile-change-btn:text-blue-600 transition-colors" strokeWidth={2.2} />
        </button>
      </div>

      {/* 중앙: 원형 핀 노드 & 연결 선 */}
      <div className="relative w-full flex items-center justify-center h-[26px]">
        {/* 이전 구간 연결 엣지 선 */}
        {index > 0 && (
          <svg className="absolute left-0 w-1/2 top-1/2 -translate-y-1/2 h-[4px] pointer-events-none z-0">
            <line
              x1="3px"
              y1="50%"
              x2="calc(100% - 22px)"
              y2="50%"
              stroke={prevSegmentIsFocused ? '#09090b' : '#e4e4e7'}
              strokeWidth="2.5"
              strokeDasharray={prevSegmentType === 'walk' ? '4 7' : undefined}
              strokeLinecap="round"
            />
          </svg>
        )}

        {/* 원형 핀 버튼 */}
        <button
          type="button"
          onClick={() => onPlaceClick(place)}
          ref={(el) => onBindRef(`place-${place.id}`, el)}
          className={`relative z-10 w-[24px] h-[24px] rounded-full flex items-center justify-center text-white text-[11px] font-black tracking-tighter cursor-pointer transition-all duration-300 shrink-0 ${
            isFocused
              ? 'scale-125 ring-3 ring-blue-500/40 ring-offset-2 ring-offset-white shadow-md z-20'
              : 'hover:scale-115 shadow-xs'
          }`}
          style={{
            background: `linear-gradient(135deg, ${placeTheme.gradientStart}, ${placeTheme.gradientEnd})`
          }}
          title={`${place.place_name} 지도 위치로 이동`}
        >
          {index + 1}
        </button>

        {/* 다음 구간 연결 엣지 선 */}
        {index < totalPlaces - 1 && (
          <svg className="absolute right-0 w-1/2 top-1/2 -translate-y-1/2 h-[4px] pointer-events-none z-0">
            <line
              x1="22px"
              y1="50%"
              x2="calc(100% - 3px)"
              y2="50%"
              stroke={nextSegmentIsFocused ? '#09090b' : '#e4e4e7'}
              strokeWidth="2.5"
              strokeDasharray={nextSegmentType === 'walk' ? '4 7' : undefined}
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* 하단: 장소 이름 및 태그 */}
      <button
        type="button"
        onClick={() => onPlaceClick(place)}
        className="flex flex-col items-center justify-start h-[36px] w-full text-center px-0.5 cursor-pointer group"
      >
        <span className={`truncate text-[12px] transition-colors leading-tight max-w-full ${
          isFocused
            ? 'font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600'
            : 'font-bold text-zinc-900 group-hover:text-blue-600'
        }`}>
          {place.place_name}
        </span>
        <span className={`truncate text-[9.5px] font-medium leading-tight max-w-full mt-0.5 ${
          isFocused ? 'text-indigo-600 font-bold' : 'text-zinc-400'
        }`}>
          {categoryLabel || shortAddress || '장소'}
        </span>
      </button>
    </div>
  );
}
