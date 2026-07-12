"use client";

import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';
import { formatDistance, formatDuration } from '@/lib/journeyUtils';
import { useJourneyStore } from '@/stores/journey-store';

interface CarGuideListProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  handleStepClick: (idx: number, step: any) => void;
}

export default function CarGuideList({ route, originPlace, destPlace, handleStepClick }: CarGuideListProps) {
  const guide = route.guide || [];
  const { focusedStep } = useJourneyStore();

  return (
    <div className="relative pl-1 flex flex-col gap-5">
      {/* 세로 연결선 */}
      <div className="absolute left-[9px] top-2.5 bottom-2.5 w-0.5 bg-zinc-100" />

      {guide.map((step, idx) => {
        const distStr = formatDistance(step.distance);
        const durStr = formatDuration(step.duration);

        // 아이콘과 색상 매핑
        let icon = '•';
        let iconColor = 'text-zinc-400 bg-white border-zinc-200';
        let iconSize = 'w-5 h-5 text-[10px]';

        const text = step.instructions;
        if (text.includes('출발')) {
          icon = '🏁';
          iconColor = 'text-blue-600 bg-blue-50 border-blue-200 shadow-sm';
          iconSize = 'w-6 h-6 text-[11px]';
        } else if (text.includes('도착')) {
          icon = '📍';
          iconColor = 'text-rose-600 bg-rose-50 border-rose-200 shadow-sm';
          iconSize = 'w-6 h-6 text-[11px]';
        } else if (text.includes('우회전') || text.includes('우측')) {
          icon = '→';
          iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
        } else if (text.includes('좌회전') || text.includes('좌측')) {
          icon = '←';
          iconColor = 'text-amber-600 bg-amber-50 border-amber-200';
        } else if (text.includes('유턴')) {
          icon = '↶';
          iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-200';
        } else if (text.includes('직진')) {
          icon = '↑';
          iconColor = 'text-zinc-600 bg-zinc-50 border-zinc-200';
        } else if (text.includes('지하차도') || text.includes('터널') || text.includes('고속도로')) {
          icon = '🛣️';
          iconColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
        }

        const isThisStepFocused = !!(
          focusedStep &&
          focusedStep.originId === originPlace.id &&
          focusedStep.destId === destPlace.id &&
          focusedStep.stepIndex === idx
        );

        return (
          <div 
            key={idx} 
            className={`relative flex gap-4 pl-8 pr-3 py-2 items-start group cursor-pointer transition-all duration-200 rounded-xl select-none snap-start snap-always ${
              isThisStepFocused
                ? 'bg-blue-50/60 border border-blue-200 shadow-sm scale-[1.01]'
                : 'bg-transparent border border-transparent hover:bg-zinc-50'
            }`}
            onClick={() => handleStepClick(idx, step)}
          >
            {/* 타임라인 노드 아이콘 */}
            <div
              className={`absolute left-0 top-2.5 rounded-full border flex items-center justify-center font-bold z-10 transition-all duration-200 group-hover:scale-110 ${iconColor} ${iconSize} ${
                isThisStepFocused ? 'ring-2 ring-blue-500/30' : ''
              }`}
              style={{ left: iconSize === 'w-6 h-6' ? '-2px' : '0px' }}
            >
              {icon}
            </div>

            {/* 경로 설명 및 거리/시간 */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-600 leading-snug group-hover:text-zinc-800 transition-colors">
                {step.instructions}
              </p>
              {(distStr || durStr) && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 font-semibold select-none">
                  {distStr && <span>{distStr}</span>}
                  {distStr && durStr && <span className="text-zinc-300">·</span>}
                  {durStr && <span>{durStr}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
