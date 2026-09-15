'use client';

import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeSubway } from '@/hooks/useRealtimeSubway';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useJourneyStore } from '@/stores/journey-store';
import { resolveSubwayNameForApi } from '@/lib/constants/subwayLineMap';
import { getSubwayRefreshSharedKey } from '@/lib/transit/transitSharedKey';

export interface SegmentSubwayRealtimeChipProps {
  stationName?: string;
  wayCode?: string;
  subwayId?: string;
  destination?: string;
  headsign?: string;
  variant?: 'sidebar' | 'compact' | 'hero';
  hideRefreshButton?: boolean;
  onlyRefreshButton?: boolean;
  subwayColor?: string;
}

export const SegmentSubwayRealtimeChip: React.FC<SegmentSubwayRealtimeChipProps> = ({
  stationName,
  wayCode,
  subwayId,
  destination,
  headsign,
  variant = 'sidebar',
  hideRefreshButton = false,
  onlyRefreshButton = false,
  subwayColor,
}) => {
  const setSubwayLineMapTarget = useJourneyStore((state) => state.setSubwayLineMapTarget);
  const storeDepartureTime = useJourneyStore((state) => state.departureTime);
  const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

  const isFuture = React.useMemo(() => {
    if (storeDepartureTime && typeof storeDepartureTime === 'number') {
      const diffMin = (storeDepartureTime - Date.now()) / (1000 * 60);
      // 현재 시점 대비 30분 초과 미래인 경우에만 미래/시간표 모드 (과거 시각은 실시간 모드 유지)
      if (diffMin > 30) return true;
    }
    return false;
  }, [storeDepartureTime]);

  const { data, isLoading: isQueryLoading, isError, isFetching, refetch } = useRealtimeSubway({
    stationName: cleanStationName,
    wayCode,
    subwayId,
    destination,
    headsign,
    enabled: Boolean(cleanStationName && !isFuture),
  });

  const sharedKey = getSubwayRefreshSharedKey({
    stationName: cleanStationName,
    wayCode,
    subwayId,
    destination,
    headsign,
  });

  const { status: refreshStatus, buttonText, buttonTitle, start, isLoading: isRefreshLoading } = useAutoRefresh({
    intervalSeconds: 15,
    maxRefreshCount: 3,
    onRefresh: refetch,
    autoStart: true,
    isFetching,
    minLoadingDurationMs: 400,
    sharedKey,
  });

  // 역명, 방면, 노선ID, 목적지가 실제 변경되었을 때만 타이머를 리셋합니다.
  const prevStationRef = React.useRef<string>(cleanStationName);
  const prevWayCodeRef = React.useRef<string | undefined>(wayCode);
  const prevSubwayIdRef = React.useRef<string | undefined>(subwayId);
  const prevDestRef = React.useRef<string | undefined>(destination);

  useEffect(() => {
    if (
      prevStationRef.current !== cleanStationName ||
      prevWayCodeRef.current !== wayCode ||
      prevSubwayIdRef.current !== subwayId ||
      prevDestRef.current !== destination
    ) {
      prevStationRef.current = cleanStationName;
      prevWayCodeRef.current = wayCode;
      prevSubwayIdRef.current = subwayId;
      prevDestRef.current = destination;
      start();
    }
  }, [cleanStationName, wayCode, subwayId, destination, start]);

  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshLoading || isFetching) return;
    refetch();
    start();
  };

  const handleOpenLineMap = (
    e: React.MouseEvent,
    trainNo?: string,
    minutesLeft?: number,
    statusText?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const rawIdentifier = subwayId || (data && data[0]?.subwayId) || undefined;
    const targetSubwayIdentifier = resolveSubwayNameForApi(rawIdentifier || '');
    setSubwayLineMapTarget({
      stationName: cleanStationName,
      subwayId: targetSubwayIdentifier || rawIdentifier,
      subwayNm: targetSubwayIdentifier || rawIdentifier,
      wayCode,
      targetTrainNo: trainNo,
      targetMinutesLeft: minutesLeft,
      targetStatusText: statusText,
    });
  };

  if (!cleanStationName) return null;

  const renderRefreshButton = () => {
    const isPaused = refreshStatus === 'paused';

    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleManualRefresh}
        disabled={isRefreshLoading || isFetching}
        title={buttonTitle}
        className={clsx(
          'inline-flex items-center justify-center w-[70px] min-w-[70px] h-[20px] min-h-[20px] max-h-[20px] gap-1 px-2 py-0.5 rounded-full font-semibold border shadow-2xs shrink-0 text-[10px] transition-all',
          isPaused
            ? 'bg-amber-50/90 border-amber-300 text-amber-800 hover:bg-amber-100/90 cursor-pointer active:scale-95'
            : 'bg-white border-zinc-200/90 text-zinc-700',
          isRefreshLoading
            ? 'opacity-90 cursor-wait'
            : (!isPaused ? 'hover:bg-zinc-50 cursor-pointer active:scale-95' : '')
        )}
      >
        <RefreshCw
          className={clsx(
            'w-3 h-3 shrink-0',
            isRefreshLoading
              ? 'animate-spin-fast text-blue-600'
              : isPaused
                ? 'text-amber-600'
                : 'text-zinc-500 transition-transform duration-300'
          )}
        />
        <span
          className={clsx(
            'tabular-nums font-semibold text-[10px] whitespace-nowrap',
            isPaused ? 'text-amber-800 font-bold' : 'text-zinc-700'
          )}
        >
          {buttonText}
        </span>
      </button>
    );
  };

  if (onlyRefreshButton) {
    return renderRefreshButton();
  }

  // 0. 미래 출발 시각: 실시간 도착 정보 대신 시간표 운행 안내 단일 뱃지 노출 (42px 중앙 정렬)
  if (isFuture) {
    if (variant === 'hero') {
      return (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => handleOpenLineMap(e)}
          title="지하철 노선도 보기"
          className="flex flex-col items-end justify-center min-w-0 shrink-0 cursor-pointer group"
        >
          <div className="inline-flex items-center gap-1 text-xs font-bold text-zinc-700 group-hover:text-emerald-600 transition-colors">
            <span>시간표 운행</span>
            <span className="text-[10px] text-emerald-500 font-semibold">노선도 ↗</span>
          </div>
          <span className="text-[10px] text-zinc-400 font-medium mt-0.5">시간표 기준 안내</span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]" onClick={(e) => e.stopPropagation()}>
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title="클릭하여 지하철 노선도 확인"
            className="inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-zinc-50/90 border border-zinc-200/90 shadow-2xs text-zinc-600 font-medium shrink-0 text-[10px] cursor-pointer hover:border-blue-300 hover:bg-zinc-100 transition-all active:scale-95"
          >
            <span className="font-semibold text-zinc-700">시간표 운행</span>
            <span className="text-zinc-400 text-[9px]">노선도</span>
          </div>
        </div>
      </div>
    );
  }

  const isAnyLoading = isQueryLoading || isFetching || isRefreshLoading;
  const hasData = Array.isArray(data) && data.length > 0;

  if (isAnyLoading && !hasData) {
    if (variant === 'hero') {
      return (
        <div className="flex flex-col items-end justify-center min-w-0 shrink-0 animate-pulse">
          <div className="h-5 w-18 bg-zinc-200/90 rounded-md" />
          <div className="h-3 w-12 bg-zinc-100 rounded mt-1" />
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]" onClick={(e) => e.stopPropagation()}>
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-[10px]">
            <span>확인 중...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!hasData || isError) {
    if (variant === 'hero') {
      return (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => handleOpenLineMap(e)}
          title={isError ? "실시간 정보 조회 실패 (클릭하여 노선도 확인)" : "지하철 실시간 노선도 보기"}
          className="flex flex-col items-end justify-center min-w-0 shrink-0 cursor-pointer group"
        >
          <span className="text-xs font-bold text-zinc-500 group-hover:text-emerald-600 transition-colors">
            {isError ? '정보 확인 실패' : '운행 정보 없음'}
          </span>
          <span className="text-[10px] text-zinc-400 font-medium group-hover:text-emerald-500 transition-colors mt-0.5">
            노선도 확인 ↗
          </span>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]" onClick={(e) => e.stopPropagation()}>
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title={isError ? "실시간 정보 조회 실패 (클릭하여 노선도 확인)" : "클릭하여 노선도 및 열차 위치 확인"}
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px] cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:shadow-xs transition-all active:scale-98"
          >
            <span>{isError ? '정보 확인 실패' : '운행 정보 없음'}</span>
          </div>
        </div>
      </div>
    );
  }

  const item1 = data[0];
  const item2 = data[1];

  const formatItemTime = (item: typeof item1) => {
    if (item.arvlCd === '1' || item.statusText?.startsWith('도착') || item.statusText === '도착') {
      return '도착';
    }
    if (item.arvlCd === '0' || item.statusText?.includes('진입')) {
      return '곧 도착';
    }
    if (item.arvlCd === '3' || item.statusText?.includes('전역출발') || item.statusText?.includes('곧 도착')) {
      return '곧 도착';
    }
    if (item.minutesLeft !== undefined && item.minutesLeft > 0) {
      return `${item.minutesLeft}분 후`;
    }
    if (item.statusText) {
      let clean = item.statusText.replace(/\[.*?\]/g, '').trim();
      if (/^\d+분$/.test(clean)) {
        return `${clean} 후`;
      }
      if (clean) return clean;
    }
    return item.isRealtime !== false ? '곧 도착' : '운행 중';
  };

  const getLocationText = (item: typeof item1) => {
    if (item.isRealtime === false) {
      return item.statusText ? item.statusText.replace(/\[.*?\]/g, '').replace(/\s*\([^)]*\)/g, '').trim() : `${item.updnLine || ''} 시간표`;
    }
    const rawMsg = item.arvlMsg2 || item.statusText || '';
    if (!rawMsg) return '';
    let cleanMsg = rawMsg.replace(/\s*\([^)]*\)/g, '').trim();
    cleanMsg = cleanMsg.replace(/\[?(\d+)\]?번째\s*전역/g, '$1전역');
    cleanMsg = cleanMsg.replace(/\[(.*?)\]/g, '$1');
    cleanMsg = cleanMsg.replace(/^\d+분\s*/g, '').trim();
    cleanMsg = cleanMsg.replace(/\[?급행\]?/g, '').trim();
    return cleanMsg;
  };

  const timeText1 = formatItemTime(item1);
  const locText1 = getLocationText(item1);
  const timeText2 = item2 ? formatItemTime(item2) : null;
  const locText2 = item2 ? getLocationText(item2) : null;

  const isRealtime = item1.isRealtime !== false;
  const isCanBoard1 = item1.canBoard !== false;
  const isCanBoard2 = item2 ? item2.canBoard !== false : true;
  const isExpress1 = Boolean(item1.isExpress);
  const isExpress2 = Boolean(item2?.isExpress);

  // --- [Hero Variant: 이동 상세 상단 Hero 전용 2열 우측 고가독성 카운트다운 레이아웃] ---
  if (variant === 'hero') {
    return (
      <div
        onClick={(e) =>
          handleOpenLineMap(
            e,
            item1.trainNo ? String(item1.trainNo) : undefined,
            item1.minutesLeft,
            timeText1
          )
        }
        title="클릭하여 지하철 실시간 노선도 및 열차 위치 확인"
        className="flex flex-col items-end justify-center min-w-0 shrink-0 cursor-pointer group select-none"
      >
        {/* 메인 카운트다운 타이머 & 상태 */}
        <div className="flex items-center gap-1.5 leading-none">
          <span
            style={isRealtime && isCanBoard1 && subwayColor ? { color: subwayColor } : undefined}
            className={clsx(
              'text-sm sm:text-base font-black tabular-nums tracking-tight transition-colors',
              !isCanBoard1
                ? 'text-amber-600'
                : isRealtime
                ? (!subwayColor ? 'text-emerald-600 group-hover:text-emerald-700' : '')
                : 'text-zinc-700'
            )}
          >
            {timeText1}
          </span>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 bg-zinc-100/90 px-1.5 py-0.5 rounded-md border border-zinc-200/60">
            {locText1 && locText1 !== timeText1 && (
              <span className="tabular-nums">{locText1}</span>
            )}
            {locText1 && locText1 !== timeText1 && (
              <span className="text-zinc-300">·</span>
            )}
            {!isCanBoard1 ? (
              <span className="text-amber-600 font-bold">당역종착</span>
            ) : isExpress1 ? (
              <span className="text-rose-600 font-bold">급행</span>
            ) : (
              <span className="text-zinc-500 font-medium">일반</span>
            )}
          </div>
        </div>

        {/* 2번째 열차 도착 보조 정보 or 노선도 힌트 */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium mt-1 leading-none">
          {timeText2 ? (
            <span className="tabular-nums">
              다음 <strong className="font-semibold text-zinc-600">{timeText2}</strong>
              {locText2 && locText2 !== timeText2 && ` (${locText2})`}
            </span>
          ) : (
            <span className="group-hover:text-emerald-600 transition-colors">실시간 노선도 ↗</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col gap-0.5 justify-center h-[42px] min-h-[42px]">
          {/* 1번째 열차 */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) =>
              handleOpenLineMap(
                e,
                item1.trainNo ? String(item1.trainNo) : undefined,
                item1.minutesLeft,
                timeText1
              )
            }
            className={clsx(
              'inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-white border shadow-2xs text-[10px] whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
              !isCanBoard1
                ? 'border-amber-300 text-amber-700 bg-amber-50/30'
                : isRealtime
                ? 'border-blue-200 text-blue-600'
                : 'border-zinc-200 text-slate-700'
            )}
            title={
              !isCanBoard1
                ? '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기'
                : '클릭하여 실시간 노선도 및 열차 위치 확인'
            }
          >
            <span className="w-[36px] shrink-0 tabular-nums font-semibold text-blue-600 text-left">
              {timeText1}
            </span>
            <span className="w-[54px] shrink-0 tabular-nums font-medium text-zinc-600 text-center truncate">
              {locText1 && locText1 !== timeText1 ? locText1 : ''}
            </span>
            <span className="w-[24px] shrink-0 text-center">
              {!isCanBoard1 ? (
                <span className="text-amber-600 font-bold text-[9px]">종착</span>
              ) : isExpress1 ? (
                <span className="text-rose-600 font-bold">급행</span>
              ) : (
                <span className="text-zinc-500 font-medium">일반</span>
              )}
            </span>
          </div>

          {/* 2번째 열차 (실제 다음 열차가 있을 때만 노출) */}
          {timeText2 && item2 && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) =>
                handleOpenLineMap(
                  e,
                  item2.trainNo ? String(item2.trainNo) : undefined,
                  item2.minutesLeft,
                  timeText2
                )
              }
              className={clsx(
                'inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-zinc-50/80 border border-zinc-200/90 shadow-2xs text-[10px] text-zinc-600 whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
                !isCanBoard2 && 'border-amber-200 text-amber-700 bg-amber-50/20'
              )}
              title={
                !isCanBoard2
                  ? '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기'
                  : '클릭하여 실시간 노선도 및 열차 위치 확인'
              }
            >
              <span className="w-[36px] shrink-0 tabular-nums font-semibold text-zinc-700 text-left">
                {timeText2}
              </span>
              <span className="w-[54px] shrink-0 tabular-nums font-normal text-zinc-500 text-center truncate">
                {locText2 && locText2 !== timeText2 ? locText2 : ''}
              </span>
              <span className="w-[24px] shrink-0 text-center">
                {!isCanBoard2 ? (
                  <span className="text-amber-600 font-semibold text-[9px]">종착</span>
                ) : isExpress2 ? (
                  <span className="text-rose-500 font-bold">급행</span>
                ) : (
                  <span className="text-zinc-400 font-normal">일반</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

