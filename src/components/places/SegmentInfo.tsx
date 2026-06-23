"use client";

import { useJourneyStore } from '@/stores/journey-store';
import type { DirectionResult } from '@/types/journey';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/naverMapRouteService';
import { SEQUENCE_COLORS } from '@/constants/colors';
import FittedDuration from './FittedDuration';

// 1. 구간 이동 정보 뼈대 로딩 UI
export function SegmentInfoSkeleton() {
  return (
    <div className="mx-4 mb-3 px-4 py-4 bg-white rounded-xl border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-zinc-200 rounded w-24"></div>
        <div className="h-4 bg-zinc-200 rounded w-16"></div>
      </div>
      <div className="h-3 bg-zinc-200 rounded-full w-full"></div>
    </div>
  );
}

interface SegmentInfoProps {
  data?: DirectionResult;
  loading?: boolean;
  index: number;
  placeId?: string;
  destId?: string;
}

// 2. 실시간 구간 이동 정보 렌더링 컴포넌트
export default function SegmentInfo({ data, loading, index, placeId, destId }: SegmentInfoProps) {
  const { focusedStep, setFocusedStep, focusedSegment, setFocusedSegment, setFocusBounds } = useJourneyStore();

  if (loading) {
    return <SegmentInfoSkeleton />;
  }

  if (!data) {
    return (
      <div className="mx-4 mb-3 px-4 py-3 bg-zinc-50 rounded-xl border border-zinc-100 text-center text-xs text-zinc-400">
        경로 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const transitSteps = data.steps.filter((s) => s.type !== 'walk');
  const hasTransit = transitSteps.length > 0;

  // Calculate percentage widths using a power-curve to compress proportions
  const COMPRESS_POWER = 0.3;
  const MIN_PCT = 12; // minimum percentage for any step
  const compressed = data.steps.map(s => Math.pow(Math.max(s.duration, 1), COMPRESS_POWER));
  const compressedTotal = compressed.reduce((a, b) => a + b, 0) || 1;
  const rawPcts = compressed.map(c => (c / compressedTotal) * 100);
  const clampedPcts = rawPcts.map(p => Math.max(p, MIN_PCT));
  const clampedSum = clampedPcts.reduce((a, b) => a + b, 0);
  const normalizedPcts = clampedPcts.map(p => (p / clampedSum) * 100);

  const isThisSegmentFocused = focusedSegment?.originId === placeId && focusedSegment?.destId === destId;

  return (
    <div 
      className={`mx-4 mb-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer ${
        isThisSegmentFocused
          ? 'bg-blue-50/50 border-2 border-blue-400 shadow-[0_4px_20px_rgba(59,130,246,0.2)] scale-[1.02]'
          : 'bg-white border border-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:border-blue-200 hover:scale-[1.01] hover:shadow-[0_4px_16px_rgba(59,130,246,0.06)] active:scale-[0.99]'
      }`}
    >
      {/* 상단 정보: 총 이동 시간, 요금, 실시간 상태 */}
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-lg font-extrabold text-zinc-800 leading-none tracking-tight">
            {data.duration}분
          </span>
          <span className="text-[12px] font-medium text-zinc-400 pb-[0.5px] leading-tight">
            {data.type === 'car' || data.type === 'taxi' ? (
              `택시 ${data.taxiFare?.toLocaleString()}원${data.fare > 0 ? ` (통행료 ${data.fare.toLocaleString()}원)` : ''}`
            ) : data.type === 'walk' || data.type === 'bicycle' ? (
              '무료'
            ) : (data.isIntercity || data.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && data.fare === 0 ? (
              '예매처 확인'
            ) : data.fare > 0 ? (
              data.isFareEstimated ? `약 ${data.fare.toLocaleString()}원` : `${data.fare.toLocaleString()}원`
            ) : (
              '요금 정보 없음'
            )}
          </span>
        </div>
      </div>

      {/* 동적 타임라인 바 및 하단 노선 정보 */}
      <div className="flex mt-4 mb-2 relative" style={{ paddingLeft: '8px', paddingRight: '4px' }}>
        {data.steps.map((step, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === data.steps.length - 1;
          const pct = normalizedPcts[idx];

          let icon = '🚶';
          if (step.type === 'subway') icon = '🚇';
          else if (step.type === 'bus') icon = '🚌';
          else if (step.type === 'car') icon = '🚗';
          else if (step.type === 'train') icon = '🚄';
          else if (step.type === 'expressbus') icon = '🚌';

          const segmentColor = SEQUENCE_COLORS[index % SEQUENCE_COLORS.length];
          const stepColor = step.type === 'walk' ? (step.color === '#A1A1AA' ? '#E4E4E7' : (step.color || '#E4E4E7')) : segmentColor;

          const isWalk = step.type === 'walk';

          const isThisStepFocused = !!(
            focusedStep &&
            focusedStep.originId === placeId &&
            focusedStep.destId === destId &&
            focusedStep.stepIndex === idx
          );
          const hasFocusedStep = !!(focusedStep && focusedStep.subType !== 'dest');

          return (
            <div
              key={idx}
              className="flex flex-col items-stretch min-w-0 relative group/step cursor-pointer"
              style={{
                width: `${pct}%`,
                flexShrink: 0,
                flexGrow: 0,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!placeId || !destId) return;

                // Ensure segment focus is active
                const isSegmentFocused = focusedSegment && focusedSegment.originId === placeId && focusedSegment.destId === destId;
                if (!isSegmentFocused) {
                  setFocusedSegment({ originId: placeId, destId });
                }

                if (isThisStepFocused) {
                  setFocusedStep(null);
                  const bounds = calculateSegmentBounds(
                    { lat: data.pathPoints[0].lat, lng: data.pathPoints[0].lng },
                    { lat: data.pathPoints[data.pathPoints.length - 1].lat, lng: data.pathPoints[data.pathPoints.length - 1].lng },
                    data
                  );
                  setFocusBounds(bounds);
                } else {
                  const bounds = calculateStepBounds(step);
                  if (bounds) {
                    setFocusBounds(bounds);
                  }
                  setFocusedStep({
                    originId: placeId,
                    destId,
                    stepIndex: idx
                  });
                }
              }}
            >
              {/* 아이콘 백그라운드 컷아웃 */}
              <div
                className="absolute left-0 -translate-x-1/2 bg-white rounded-full z-[15] transition-all duration-200"
                style={{ width: '20px', height: '20px', top: '-4px' }}
              />

              {/* 아이콘 */}
              <div
                className={`absolute left-0 -translate-x-1/2 flex items-center justify-center bg-white rounded-full shadow-sm border z-20 transition-all duration-200 ${isThisStepFocused ? 'scale-110' : ''}`}
                style={{
                  borderColor: stepColor,
                  width: '16px',
                  height: '16px',
                  top: '-2px',
                  opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                }}
              >
                <span className="text-[9px] leading-none">{icon}</span>
              </div>

              {/* 타임라인 바 조각 */}
              <div
                className="relative flex items-center justify-center h-3 overflow-hidden transition-all duration-200"
                style={{
                  backgroundColor: stepColor,
                  borderTopLeftRadius: isFirst ? '9999px' : '0px',
                  borderBottomLeftRadius: isFirst ? '9999px' : '0px',
                  borderTopRightRadius: isLast ? '9999px' : '0px',
                  borderBottomRightRadius: isLast ? '9999px' : '0px',
                  opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                  zIndex: isThisStepFocused ? 10 : 1,
                }}
              >
                <FittedDuration duration={step.duration} isWalk={isWalk} />
              </div>

              {/* 하단 노선명 텍스트 */}
              {hasTransit && (
                <div
                  className="text-center mt-1 text-[9px] font-extrabold truncate px-0.5 min-h-[12px] min-w-0 overflow-hidden transition-all duration-200"
                  style={{
                    opacity: hasFocusedStep ? (isThisStepFocused ? 1 : 0.35) : 1,
                  }}
                  title={step.type !== 'walk' ? step.name : undefined}
                >
                  {step.type !== 'walk' ? (
                    <span style={{ color: stepColor }} className="truncate">
                      {step.type === 'subway'
                        ? (step.name.endsWith('선') && step.name.length >= 4 ? step.name.slice(0, -1) : step.name)
                        : step.name.replace(' 버스', '')}
                    </span>
                  ) : (
                    <span className="invisible">&nbsp;</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
