"use client";

import React, { useRef, useState, useCallback } from 'react';
import type { DirectionStep } from '@/types/journey';
import FittedDuration from '@/components/places/FittedDuration';

interface RouteTimelineGaugeBarProps {
  steps?: DirectionStep[];
  className?: string;
}

export default function RouteTimelineGaugeBar({ steps, className = '' }: RouteTimelineGaugeBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const [hasMoved, setHasMoved] = useState(false);

  const validSteps = (steps || []).filter((s) => s.duration > 0);
  if (validSteps.length === 0) return null;

  // 비율 계산 (Power Curve 기법)
  const COMPRESS_POWER = 0.3;
  const MIN_PCT = 12;
  const compressed = validSteps.map((s) => Math.pow(Math.max(s.duration, 1), COMPRESS_POWER));
  const compressedTotal = compressed.reduce((a, b) => a + b, 0) || 1;
  const rawPcts = compressed.map((c) => (c / compressedTotal) * 100);
  const clampedPcts = rawPcts.map((p) => Math.max(p, MIN_PCT));
  const clampedSum = clampedPcts.reduce((a, b) => a + b, 0);
  const normalizedPcts = clampedPcts.map((p) => (p / clampedSum) * 100);

  // 스텝 수가 5개를 초과(6개 이상)할 때만 스크롤 활성화 (5개 이하까지는 무조건 카드 내 100% 배치)
  const needScroll = validSteps.length > 5;

  // 스텝별 가변 너비 계산 유틸 (도보는 46px~54px, 대중교통은 70px~90px로 여유롭게 설정)
  const getStepWidthPx = (step: DirectionStep, pct: number): number => {
    if (step.type === 'walk') {
      return Math.max(46, Math.min(54, Math.round(pct * 0.9)));
    }
    return Math.max(70, Math.min(90, Math.round(pct * 1.6)));
  };

  const calculatedWidths = validSteps.map((s, i) => getStepWidthPx(s, normalizedPcts[i]));
  const totalScrollWidth = calculatedWidths.reduce((a, b) => a + b, 0);

  // 마우스 휠 조작 시 부모 리스트의 세로 스크롤이 동시에 동작하지 않도록 preventDefault() 및 stopPropagation() 처리
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el || !needScroll) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [needScroll]);

  // 마우스 드래그 스크롤
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!needScroll || !containerRef.current) return;
    isDragging.current = true;
    setHasMoved(false);
    startX.current = e.pageX - containerRef.current.offsetLeft;
    scrollLeft.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    if (Math.abs(walk) > 3) setHasMoved(true);
    containerRef.current.scrollLeft = scrollLeft.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      onClick={(e) => {
        if (hasMoved) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => {
        if (needScroll) e.stopPropagation();
      }}
      className={`w-full relative select-none py-0.5 ${
        needScroll
          ? 'overflow-x-auto scrollbar-none touch-pan-x cursor-grab active:cursor-grabbing'
          : 'overflow-hidden'
      } ${className}`}
      style={{ paddingLeft: '8px', paddingRight: '12px', touchAction: needScroll ? 'pan-x' : 'auto' }}
    >
      <div
        className="flex relative"
        style={{
          minWidth: needScroll ? `${totalScrollWidth}px` : '100%',
          width: needScroll ? 'max-content' : '100%',
        }}
      >
        {validSteps.map((step, idx) => {
          const pct = normalizedPcts[idx];
          const stepWidth = calculatedWidths[idx];
          const isFirst = idx === 0;
          const isLast = idx === validSteps.length - 1;
          const isWalk = step.type === 'walk';
          const stepColor = step.color || (isWalk ? '#E4E4E7' : '#3b82f6');

          let icon = '🚶';
          if (step.type === 'subway') icon = '🚇';
          else if (step.type === 'bus') icon = '🚌';
          else if (step.type === 'car') icon = '🚗';
          else if (step.type === 'train') icon = '🚄';
          else if (step.type === 'expressbus') icon = '🚌';
          else if (step.type === 'taxi') icon = '🚕';

          return (
            <div
              key={idx}
              className="flex flex-col items-stretch min-w-0 relative"
              style={{
                width: needScroll ? `${stepWidth}px` : `${pct}%`,
                flexShrink: 0,
                flexGrow: 0,
              }}
            >
              {/* 아이콘 백그라운드 컷아웃 */}
              <div
                className="absolute left-0 -translate-x-1/2 bg-white rounded-full z-[15]"
                style={{ width: '18px', height: '18px', top: '-3px' }}
              />

              {/* 아이콘 */}
              <div
                className="absolute left-0 -translate-x-1/2 flex items-center justify-center bg-white rounded-full shadow-sm border z-20"
                style={{
                  borderColor: stepColor,
                  width: '14px',
                  height: '14px',
                  top: '-1px',
                }}
              >
                <span className="text-[8px] leading-none">{icon}</span>
              </div>

              {/* 타임라인 바 조각 */}
              <div
                className="relative flex items-center justify-center h-3 overflow-hidden"
                style={{
                  backgroundColor: stepColor,
                  borderTopLeftRadius: isFirst ? '9999px' : '0px',
                  borderBottomLeftRadius: isFirst ? '9999px' : '0px',
                  borderTopRightRadius: isLast ? '9999px' : '0px',
                  borderBottomRightRadius: isLast ? '9999px' : '0px',
                  zIndex: 1,
                }}
              >
                <FittedDuration duration={step.duration} isWalk={isWalk} />
              </div>

              {/* 하단 노선명 텍스트 */}
              <div className="text-center mt-1 text-[9px] font-extrabold truncate px-0.5 min-h-[12px] min-w-0 overflow-hidden">
                {step.type !== 'walk' ? (
                  <span style={{ color: stepColor }} className="truncate">
                    {(() => {
                      const nameStr = step.name || '';
                      if (step.type === 'subway') {
                        return nameStr.endsWith('선') && nameStr.length >= 4 ? nameStr.slice(0, -1) : (nameStr || '지하철');
                      }
                      return nameStr ? nameStr.replace(' 버스', '').replace(' 일반', '').replace(' 간선', '').replace(' 지선', '') : '대중교통';
                    })()}
                  </span>
                ) : (
                  <span className="invisible">&nbsp;</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
