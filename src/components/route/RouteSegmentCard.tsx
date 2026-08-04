'use client';

import React from 'react';
import { DirectionStep } from '@/types/journey';
import { Bus, Footprints, Train, Car, Navigation, ChevronRight } from 'lucide-react';

interface RouteSegmentCardProps {
  step: DirectionStep;
  index: number;
  totalSteps: number;
  prevStep?: DirectionStep;
  nextStep?: DirectionStep;
  originPlace?: { place_name: string };
  destPlace?: { place_name: string };
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
  prevStep,
  nextStep,
  originPlace,
  destPlace,
  isActive = false,
  isStartHighlighted = false,
  isEndHighlighted = false,
  onClick,
  onOpenDetailSheet,
  onSelectStartPoint,
  onSelectEndPoint,
}) => {
  // Contextual Place/Station Name Resolution
  const displayStartName =
    step.startName ||
    (index === 0 ? (originPlace?.place_name || '출발지') : (prevStep?.endName || prevStep?.name || '이전 지점'));

  const displayEndName =
    step.endName ||
    (index === totalSteps - 1 ? (destPlace?.place_name || '도착지') : (nextStep?.startName || nextStep?.name || '다음 지점'));

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

  const [isExpanded, setIsExpanded] = React.useState(false);

  const handleCardClick = (e: React.MouseEvent) => {
    if (onClick) onClick();
  };

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
    if (onOpenDetailSheet) {
      onOpenDetailSheet(step);
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

  const stationList = step.passStopList?.stationList || [];

  return (
    <div
      onClick={handleCardClick}
      data-card-index={index}
      className={`
        timeline-card-inner w-full rounded-2xl p-4 transition-all duration-300 select-none cursor-pointer
        bg-white text-zinc-900 border flex flex-col justify-between overflow-hidden
        ${isActive
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

      {/* Middle Direction / Station Detail with Top-Labeled Chips & Pure Place Names */}
      <div className="my-2 py-2 px-2.5 rounded-xl bg-zinc-50/80 border border-zinc-100 flex items-center justify-between gap-2">
        {step.type === 'walk' ? (
          /* 도보 전용 단일 통합 이동 칩 UI (대중교통 카드와 상단 라벨 문구 및 배치 100% 동기화) */
          <div className="min-w-0 flex-1 flex flex-col">
            {/* 상단 각각 출발지 / 도착지 라벨 영역 (대중교통과 동일한 레이아웃 및 문구) */}
            <div className="flex items-center gap-2 mb-0.5">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-extrabold text-zinc-400 tracking-tight flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${isStartHighlighted
                      ? 'bg-blue-600'
                      : index === 0
                        ? 'bg-emerald-500'
                        : 'bg-indigo-500'
                      }`}
                  />
                  {index === 0 ? '출발' : '이전 하차'}
                </span>
              </div>

              <span className="text-transparent font-extrabold text-xs shrink-0 select-none">➔</span>

              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-extrabold text-zinc-400 tracking-tight flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEndHighlighted
                      ? 'bg-blue-600'
                      : index === totalSteps - 1
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                      }`}
                  />
                  {index === totalSteps - 1 ? '최종 도착' : '도착'}
                </span>
              </div>
            </div>

            {/* 통합 칩 박스 (대중교통 칩과 동일한 py-1.5 크기) */}
            <div
              onClick={handleStartClick}
              className={`w-full flex items-center justify-between text-xs font-extrabold px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${(isStartHighlighted || isEndHighlighted || isActive)
                ? 'bg-blue-50 text-blue-600 border border-blue-200/90 shadow-xs ring-2 ring-blue-500/20'
                : 'bg-white text-zinc-800 border border-zinc-200/70 hover:bg-blue-50/50 hover:border-blue-200 shadow-2xs'
                }`}
            >
              <div className="flex-1 min-w-0 text-center">
                <span className="truncate block" title={displayStartName}>{displayStartName}</span>
              </div>
              <span className="text-blue-500 font-black text-xs shrink-0 px-2">➔</span>
              <div className="flex-1 min-w-0 text-center">
                <span className="truncate block" title={displayEndName}>{displayEndName}</span>
              </div>
            </div>
          </div>
        ) : (
          /* 기존 대중교통/차량용 독립된 2개 칩 UI */
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {/* Left Block (Start / Previous Alighting) */}
            <div className="min-w-0 flex-1 flex flex-col">
              <span className="text-[10px] font-extrabold text-zinc-400 mb-0.5 tracking-tight flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isStartHighlighted
                    ? 'bg-blue-600'
                    : index === 0
                      ? 'bg-emerald-500'
                      : 'bg-indigo-500'
                    }`}
                />
                {index === 0 ? '출발지' : '이전 하차'}
              </span>
              <div
                onClick={handleStartClick}
                className={`flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1.5 rounded-lg transition-all duration-200 truncate cursor-pointer ${isStartHighlighted
                  ? 'bg-blue-50 text-blue-600 border border-blue-200/90 shadow-xs ring-2 ring-blue-500/20'
                  : 'bg-white text-zinc-800 border border-zinc-200/70 hover:bg-blue-50/50 hover:border-blue-200 shadow-2xs'
                  }`}
                title={displayStartName}
              >
                <span className="truncate">{displayStartName}</span>
              </div>
            </div>

            {/* Arrow Icon Separator */}
            <span className="text-zinc-300 font-extrabold text-xs shrink-0 self-end mb-2">➔</span>

            {/* Right Block (End / Boarding / Destination) */}
            <div className="min-w-0 flex-1 flex flex-col">
              <span className="text-[10px] font-extrabold text-zinc-400 mb-0.5 tracking-tight flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isEndHighlighted
                    ? 'bg-blue-600'
                    : index === totalSteps - 1
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                    }`}
                />
                {index === totalSteps - 1
                  ? '최종 도착'
                  : '승차'}
              </span>
              <div
                onClick={handleEndClick}
                className={`flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1.5 rounded-lg transition-all duration-200 truncate cursor-pointer ${isEndHighlighted
                  ? 'bg-blue-50 text-blue-600 border border-blue-200/90 shadow-xs ring-2 ring-blue-500/20'
                  : 'bg-white text-zinc-800 border border-zinc-200/70 hover:bg-blue-50/50 hover:border-blue-200 shadow-2xs'
                  }`}
                title={displayEndName}
              >
                <span className="truncate">{displayEndName}</span>
              </div>
            </div>
          </div>
        )}

        {step.headsign && (
          <div className="text-[11px] font-medium text-zinc-500 text-right shrink-0 pl-1">
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
          className="flex items-center gap-0.5 text-blue-600 font-extrabold text-[11px] hover:text-blue-700 cursor-pointer p-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <span>{isExpanded ? '접기' : '상세 보기'}</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {/* In-Card Accordion Expanded Detail Section */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-zinc-100 max-h-48 overflow-y-auto space-y-2 text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="font-extrabold text-zinc-700 text-[11px] mb-1 flex items-center justify-between">
            <span>세부 정류장 / 이동 안내</span>
            <span className="text-zinc-400 font-normal">{stationList.length > 0 ? `${stationList.length}개 지점` : '도보 가이드'}</span>
          </div>

          {stationList.length > 0 ? (
            <div className="space-y-1.5 pl-1">
              {stationList.map((st: any, sIdx: number) => (
                <div
                  key={sIdx}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-zinc-50 hover:bg-blue-50/60 border border-zinc-100 transition-colors text-zinc-800"
                >
                  <span className="font-bold text-[11px] truncate">
                    #{sIdx + 1} {st.stationName}
                  </span>
                  {sIdx === 0 && <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-700">승차</span>}
                  {sIdx === stationList.length - 1 && <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">하차</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2 text-center text-zinc-500 text-[11px] bg-zinc-50 rounded-lg">
              출발지에서 목적지까지 추천 경로를 따라 안전하게 이동하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RouteSegmentCard;
