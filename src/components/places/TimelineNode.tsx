"use client";

import { useJourneyStore } from '@/stores/journey-store';
import { getSequenceTheme } from '@/constants/colors';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import type { Place } from '@/types/journey';

interface TimelineNodeProps {
  index: number;
  totalPlaces: number;
  isLast: boolean;
  editMode: boolean;
  isFocused: boolean;
  isSegmentPlaying: boolean;
  place: Place;
  nextPlace: Place | null;
  activeRoute: any;
}

export default function TimelineNode({
  index,
  totalPlaces,
  isLast,
  editMode,
  isFocused,
  isSegmentPlaying,
  place,
  nextPlace,
  activeRoute,
}: TimelineNodeProps) {
  const {
    setFocusedStep,
    setFocusedSegment,
    setAlternativeSegment,
    setFocusBounds,
  } = useJourneyStore();

  const theme = getSequenceTheme(index, totalPlaces);
  const isInteractive = !isLast && !editMode;

  const handleClick = () => {
    if (isInteractive && nextPlace) {
      if (isFocused) {
        setFocusedStep(null);
        setFocusedSegment(null);
        setAlternativeSegment(null);
        setFocusBounds(null);
      } else {
        const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
        setFocusBounds(bounds);
        setFocusedSegment({ originId: place.id, destId: nextPlace.id });
        setFocusedStep(null);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-16 flex-shrink-0 self-stretch select-none pt-1 group/timeline">
      {/* 타임라인 노드 컨테이너 (앨범 슬리브 + 레코드판) */}
      <div
        className={`relative flex items-center justify-center mt-2 mb-2 w-full h-10 ${isInteractive ? 'cursor-pointer' : ''}`}
        onClick={handleClick}
      >
        {/* 재생 중 주변 오라(Aura) - 앨범 커버 뒤에 퍼짐 */}
        {isSegmentPlaying && (
          <>
            <div className="absolute z-10 w-9 h-9 rounded-md animate-ping opacity-30 pointer-events-none" style={{ backgroundColor: theme.color }} />
            <div className="absolute z-10 w-10 h-10 rounded-md opacity-45 animate-pulse blur-[4px] pointer-events-none" style={{ backgroundColor: theme.color }} />
          </>
        )}

        {/* 레코드판 본체 (앨범 커버 뒤에 숨어있다가 호버 시 우측으로 나옴, 클릭/포커스 시 앞으로 나옴, 재생 시 회전) */}
        {isInteractive && (
          <div
            className={`absolute flex items-center justify-center rounded-full bg-zinc-950 border border-zinc-800 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden shadow-md
              ${isFocused
                ? `z-40 translate-x-[8px] scale-110 shadow-[0_6px_16px_rgba(0,0,0,0.5)] ${isSegmentPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`
                : 'z-20 translate-x-0 group-hover/timeline:translate-x-[14px] group-hover/timeline:rotate-[60deg] shadow-sm'}`}
            style={{ width: '34px', height: '34px' }}
          >
            {/* 그루브 (Concentric circles) - 깊이감 보강 */}
            <div className="absolute inset-0 rounded-full border border-zinc-900/60 m-[2px]"></div>
            <div className="absolute inset-0 rounded-full border border-zinc-850/40 m-[4px]"></div>
            <div className="absolute inset-0 rounded-full border border-zinc-900/60 m-[6px]"></div>
            <div className="absolute inset-0 rounded-full border border-zinc-850/40 m-[8px]"></div>
            <div className="absolute inset-0 rounded-full border border-zinc-900/50 m-[10px]"></div>

            {/* 비닐 특유의 무지갯빛 반사광 (Conic Gradient) */}
            <div
              className="absolute inset-0 rounded-full opacity-80"
              style={{
                background: 'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.18) 30deg, transparent 60deg, transparent 180deg, rgba(255,255,255,0.18) 210deg, transparent 240deg)'
              }}
            />

            {/* 중앙 라벨 (포커스 시에는 커지고 장소 번호 표시, 아닐 때는 작은 스핀들) */}
            <div
              className={`relative flex items-center justify-center rounded-full z-10 shadow-sm transition-all duration-500 ${isFocused ? 'w-[16px] h-[16px]' : 'w-[10px] h-[10px]'}`}
              style={{
                background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`
              }}
            >
              {!isFocused ? (
                <div className="w-[3px] h-[3px] rounded-full bg-zinc-900 border-[0.5px] border-zinc-700 shadow-inner" />
              ) : (
                <span className="text-[10px] font-black text-white leading-none tracking-tighter drop-shadow-sm font-sans">
                  {index + 1}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 앨범 커버 슬리브 (마지막 장소나 편집 모드 시 가만히 있고, 일반 장소는 포커스 시 레코드가 튀어나옴) */}
        <div
          className={`absolute z-30 w-[38px] h-[38px] rounded-[4px] flex flex-col items-center justify-center overflow-hidden border border-white/20 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isLast || editMode
              ? 'opacity-100 shadow-[0_3px_10px_rgba(0,0,0,0.2)] pointer-events-none'
              : isFocused
                ? 'opacity-90 scale-[0.95] -translate-x-[4px] translate-y-0 rotate-0 shadow-sm pointer-events-none'
                : 'opacity-100 translate-x-0 translate-y-0 rotate-0 shadow-[0_5px_15px_rgba(0,0,0,0.35)] group-hover/timeline:scale-[1.03]'
            }`}
          style={{
            background: `linear-gradient(135deg, ${theme.gradientStart}, ${theme.gradientEnd})`,
            borderLeft: '3.5px solid rgba(0,0,0,0.35)' // 앨범 척추(Spine) 느낌 입체화
          }}
        >
          {/* 빈티지 링웨어(Ringwear - 레코드판 자국) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[34px] h-[34px] rounded-full border border-white/10 mix-blend-overlay" />
            <div className="absolute w-[32px] h-[32px] rounded-full border border-black/5 mix-blend-multiply" />
          </div>

          {/* 슈링크 랩 (비닐 포장) 광택 효과 */}
          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 opacity-60" />

          {/* 부드러운 상단 빛 반사 */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45)_0%,transparent_60%)]" />

          {/* 중앙 장소 순서 타이포그래피 (모던한 느낌의 라벨 뱃지) */}
          <div className="relative z-10 w-[22px] h-[22px] flex items-center justify-center rounded-full bg-white/95 shadow-[0_2px_5px_rgba(0,0,0,0.25)]">
            <span className="text-[12px] font-black tracking-tighter mt-[1px] font-sans" style={{ color: theme.color }}>
              {index + 1}
            </span>
          </div>
        </div>

        {/* 마우스 호버 시 뜨는 재생/일시정지 오버레이 (상태에 따라 모양 변경) */}
        {isInteractive && (
          <div
            className={`absolute flex items-center justify-center transition-all duration-300 z-40 bg-black/45 backdrop-blur-[1px] pointer-events-none 
              ${isFocused ? 'w-[38px] h-[38px] rounded-full opacity-0 group-hover/timeline:opacity-100 scale-100 translate-x-[8px]' : 'w-[38px] h-[38px] rounded-[4px] opacity-0 scale-75 group-hover/timeline:opacity-100 group-hover/timeline:scale-[1.03] translate-x-0'}`}
          >
            {isSegmentPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[14px] h-[14px] text-white/95 shadow-sm">
                <rect x="6" y="5" width="4" height="14" rx="1.5" />
                <rect x="14" y="5" width="4" height="14" rx="1.5" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white/95 ml-0.5 shadow-sm">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* 세로 연결선 (오디오 케이블 / 네온 트랙 라인 느낌) */}
      {!isLast && (
        <div className="flex-1 w-full flex justify-center py-1 relative z-0">
          {/* 배경 라인 */}
          <div className="absolute inset-y-0 w-2 bg-zinc-100/80 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] border border-zinc-200/50" />

          {/* 기본 그라데이션 선 */}
          <div
            className="absolute inset-y-0 w-2 rounded-full opacity-50"
            style={{
              background: `linear-gradient(180deg, ${theme.color} 0%, transparent 90%)`
            }}
          />

          {/* 활성화 상태 (네온 글로우) */}
          {(isFocused || isSegmentPlaying) && (
            <div
              className="absolute inset-y-0 w-2 rounded-full animate-pulse"
              style={{
                background: `linear-gradient(180deg, ${theme.color} 0%, ${theme.color} 100%)`,
                boxShadow: `0 0 12px ${theme.color}a0, 0 0 4px ${theme.color}`
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
