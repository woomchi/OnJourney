"use client";

import { useState } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place } from '@/types/journey';

interface PlaceListProps {
  editMode?: boolean;
}

interface PlaceCardProps {
  place: Place;
  index: number;
  isLast: boolean;
  onRemove: (id: string) => void;
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// 구간 이동 정보 플레이스홀더 (향후 ODsay API 연동)
function SegmentInfo() {
  return (
    <div className="mx-4 mb-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">구간 이동 정보</span>
        <span className="text-[11px] text-zinc-400">실시간 정보</span>
      </div>
      {/* 교통수단 바 플레이스홀더 */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-[11px] font-bold">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
            <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875H3.75a3 3 0 1 0 6 0h3a3 3 0 1 0 6 0h.375a1.875 1.875 0 0 0 1.875-1.875V15H13.5z"/>
          </svg>
          8분
        </div>
        <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-green-400 to-green-500 relative overflow-hidden">
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
        <div className="text-[11px] font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">29분</div>
        <div className="flex-none text-[11px] text-zinc-400 px-1">6분</div>
        <div className="flex-none bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full text-[11px] font-bold">10분</div>
      </div>
      <p className="text-[10px] text-zinc-400 mt-2">경로 계산 대기 중 · 대중교통 기준</p>
    </div>
  );
}

function PlaceCard({ place, index, isLast, onRemove }: PlaceCardProps) {
  const [segmentOpen, setSegmentOpen] = useState(false);

  return (
    <li className="relative">
      {/* 카드 + 번호 행 */}
      <div className="flex items-center gap-0 group">
        {/* 번호 + 세로선 컬럼 */}
        <div className="flex flex-col items-center w-10 flex-shrink-0 self-stretch">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200 flex items-center justify-center text-white text-xs font-bold z-10 flex-shrink-0">
            {index + 1}
          </div>
          {/* 세로 연결선 (마지막 카드 제외) */}
          {!isLast && (
            <div className="flex-1 w-px bg-gradient-to-b from-blue-200 via-blue-100 to-transparent min-h-[2rem] mt-1" />
          )}
        </div>

        {/* 장소 카드 */}
        <div className="flex-1 min-w-0 mx-2 mb-1 bg-white border border-zinc-100 rounded-2xl shadow-sm group-hover:border-blue-100 group-hover:shadow-[0_2px_12px_rgba(59,130,246,0.08)] transition-all duration-200">
          <div className="flex items-center px-4 py-3 gap-2">
            {/* 장소 정보 */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-800 truncate leading-tight">
                {place.place_name}
              </p>
              {place.address && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{place.address}</p>
              )}
            </div>

            {/* 대안 교통정보 토글 (∨ 버튼) */}
            {!isLast && (
              <button
                type="button"
                onClick={() => setSegmentOpen((v) => !v)}
                className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                  transition-all duration-200
                  ${segmentOpen
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-zinc-50 text-zinc-400 hover:bg-blue-50 hover:text-blue-500'
                  }
                `}
                aria-label="대안 교통정보 보기"
              >
                <ChevronDownIcon open={segmentOpen} />
              </button>
            )}

            {/* 삭제 버튼 (hover 시) */}
            <button
              type="button"
              onClick={() => onRemove(place.id)}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-zinc-50 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 text-zinc-400 flex items-center justify-center transition-all duration-150"
              aria-label={`${place.place_name} 삭제`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
              </svg>
            </button>
          </div>

          {/* 카테고리 뱃지 */}
          {place.category && (
            <div className="px-4 pb-2.5">
              <span className="inline-block text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {place.category.split('>').pop()?.trim() || place.category}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 구간 이동 정보 (토글) */}
      {!isLast && segmentOpen && (
        <div className="pl-10 animate-in fade-in slide-in-from-top-1 duration-200">
          <SegmentInfo />
        </div>
      )}
    </li>
  );
}

export default function PlaceList({ editMode = false }: PlaceListProps) {
  const { activeJourney, removePlace } = useJourneyStore();

  if (!activeJourney || activeJourney.places.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-6 flex-1">
        <div className="w-20 h-20 mb-5 rounded-3xl bg-blue-50 flex items-center justify-center shadow-inner">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
            className="w-10 h-10 text-blue-300"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-600 mb-1">아직 추가된 장소가 없습니다.</p>
        <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
          아래 버튼이나 지도 위 검색창으로 장소를 추가해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pt-4 pb-2">
      <ul className="flex flex-col px-2">
        {activeJourney.places.map((place, idx) => (
          <PlaceCard
            key={place.id}
            place={place}
            index={idx}
            isLast={idx === activeJourney.places.length - 1}
            onRemove={removePlace}
          />
        ))}
      </ul>
    </div>
  );
}
