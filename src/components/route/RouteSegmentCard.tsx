'use client';

import React from 'react';
import { DirectionStep } from '@/types/journey';
import { Bus, Footprints, Train, Car, Navigation, ChevronRight } from 'lucide-react';

interface RouteSegmentCardProps {
  step: DirectionStep;
  index: number;
  totalSteps: number;
  isActive?: boolean;
  isStartHighlighted?: boolean;
  isEndHighlighted?: boolean;
  onClick?: () => void;
  onOpenDetailSheet?: (step: DirectionStep) => void;
  onSelectStartPoint?: (e: React.MouseEvent) => void;
  onSelectEndPoint?: (e: React.MouseEvent) => void;
}

export const RouteSegmentCard: React.FC<RouteSegmentCardProps> = ({
  step,
  index,
  totalSteps,
  isActive = false,
  isStartHighlighted = false,
  isEndHighlighted = false,
  onClick,
  onOpenDetailSheet,
  onSelectStartPoint,
  onSelectEndPoint,
}) => {
  // Transport Icon Mapping
  const getTransportIcon = () => {
    switch (step.type) {
      case 'bus':
      case 'expressbus':
        return <Bus className="w-5 h-5" />;
      case 'subway':
      case 'train':
        return <Train className="w-5 h-5" />;
      case 'car':
      case 'taxi':
        return <Car className="w-5 h-5" />;
      case 'walk':
      default:
        return <Footprints className="w-5 h-5 text-zinc-700" />;
    }
  };

  // Transport Color Badge Accent
  const badgeColor = step.color || (step.type === 'walk' ? '#F4F4F5' : '#3B82F6');
  const badgeTextColor = step.type === 'walk' ? '#3F3F46' : '#FFFFFF';
  const stopCount = step.passStopList?.stationList?.length;

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) onClick();
  };

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDetailSheet) {
      onOpenDetailSheet(step);
    } else if (onClick) {
      onClick();
    }
  };

  const handleStartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectStartPoint) onSelectStartPoint(e);
  };

  const handleEndClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectEndPoint) onSelectEndPoint(e);
  };

  return (
    <div
      onClick={handleCardClick}
      data-card-index={index}
      className={`
        timeline-card-inner w-full h-full rounded-2xl p-4 transition-colors transition-shadow duration-200 select-none cursor-pointer
        bg-white text-zinc-900 border flex flex-col justify-between overflow-hidden
        ${
          isActive
            ? 'border-blue-500 shadow-md shadow-blue-500/10 ring-1 ring-blue-500/20 opacity-100'
            : 'border-zinc-200/80 shadow-sm opacity-80 hover:border-blue-300'
        }
      `}
    >
      {/* Upper Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs font-bold"
            style={{ backgroundColor: badgeColor, color: badgeTextColor }}
          >
            {getTransportIcon()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700">
                구간 {index + 1} / {totalSteps}
              </span>
              {stopCount && stopCount > 0 ? (
                <span className="text-[11px] font-semibold text-zinc-500">
                  • {stopCount}개 정류장
                </span>
              ) : null}
            </div>
            <h4 className="text-sm font-extrabold text-zinc-900 truncate mt-0.5">
              {step.name || (step.type === 'walk' ? '도보 이동' : '이동 구간')}
            </h4>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xl font-black text-blue-600">
            {step.duration}
          </span>
          <span className="text-xs font-bold text-zinc-500 ml-0.5">
            분
          </span>
        </div>
      </div>

      {/* Middle Direction / Station Detail with Soft Blue Highlight Chips */}
      <div className="my-2 py-2 px-2.5 rounded-xl bg-zinc-50/80 border border-zinc-100 flex items-center justify-between gap-1.5">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {/* 출발 지점 UI (연한 파란색 하이라이트 & 클릭 시 재생 시점 전환) */}
          <div
            onClick={handleStartClick}
            className={`flex items-center gap-2 text-xs font-bold px-2.5 py-1 rounded-lg transition-all duration-200 truncate cursor-pointer ${
              isStartHighlighted
                ? 'bg-blue-50 text-blue-600 border border-blue-200/90 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                : 'bg-white/80 text-zinc-800 border border-zinc-200/60 hover:bg-blue-50/50 hover:border-blue-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-sm shrink-0 transition-colors ${
                isStartHighlighted ? 'bg-blue-600' : 'bg-emerald-500'
              }`}
            />
            <span className="truncate">{step.startName || '출발 지점'}</span>
          </div>

          {/* 도착 지점 UI (연한 파란색 하이라이트 & 클릭 시 재생 시점 전환) */}
          <div
            onClick={handleEndClick}
            className={`flex items-center gap-2 text-xs font-bold px-2.5 py-1 rounded-lg transition-all duration-200 truncate cursor-pointer ${
              isEndHighlighted
                ? 'bg-blue-50 text-blue-600 border border-blue-200/90 shadow-xs font-extrabold ring-2 ring-blue-500/20'
                : 'bg-white/80 text-zinc-800 border border-zinc-200/60 hover:bg-blue-50/50 hover:border-blue-200'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-sm shrink-0 transition-colors ${
                isEndHighlighted ? 'bg-blue-600' : 'bg-rose-500'
              }`}
            />
            <span className="truncate">{step.endName || '도착 지점'}</span>
          </div>
        </div>

        {step.headsign && (
          <div className="text-[11px] font-medium text-zinc-500 text-right shrink-0 pl-1.5">
            <div className="text-[10px] text-zinc-400 font-semibold">방面</div>
            <div className="truncate max-w-[85px] font-bold text-zinc-700">{step.headsign}</div>
          </div>
        )}
      </div>

      {/* Bottom Footer / Action Helper */}
      <div className="flex items-center justify-between text-xs text-zinc-500 pt-0.5">
        <div className="flex items-center gap-1">
          <Navigation className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-bold text-[11px] text-zinc-600">
            {step.type === 'walk' ? '경로 따라 걷기' : '하차 알림 제공 중'}
          </span>
        </div>
        <div
          onClick={handleDetailClick}
          className="flex items-center gap-0.5 text-blue-600 font-extrabold text-[11px] hover:text-blue-700 hover:underline cursor-pointer p-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <span>상세 보기</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
};

export default RouteSegmentCard;
