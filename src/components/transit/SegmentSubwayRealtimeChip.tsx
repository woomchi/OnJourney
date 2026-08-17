'use client';

import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeSubway } from '@/hooks/useRealtimeSubway';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useJourneyStore } from '@/stores/journey-store';

export interface SegmentSubwayRealtimeChipProps {
  stationName?: string;
  wayCode?: string;
  subwayId?: string;
  destination?: string;
  headsign?: string;
  variant?: 'sidebar' | 'compact';
  hideRefreshButton?: boolean;
  onlyRefreshButton?: boolean;
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
}) => {
  const setSubwayLineMapTarget = useJourneyStore((state) => state.setSubwayLineMapTarget);
  const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

  const { data, isLoading: isQueryLoading, isError, isFetching, refetch } = useRealtimeSubway({
    stationName: cleanStationName,
    wayCode,
    subwayId,
    destination,
    headsign,
    enabled: Boolean(cleanStationName),
  });

  const sharedKey = cleanStationName
    ? `subway:${cleanStationName}:${wayCode || ''}:${subwayId || ''}:${destination || ''}:${headsign || ''}`
    : undefined;

  const { buttonText, buttonTitle, start, isLoading: isRefreshLoading } = useAutoRefresh({
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
    setSubwayLineMapTarget({
      stationName: cleanStationName,
      subwayId: subwayId || (data && data[0]?.subwayId) || undefined,
      wayCode,
      targetTrainNo: trainNo,
      targetMinutesLeft: minutesLeft,
      targetStatusText: statusText,
    });
  };

  if (!cleanStationName) return null;

  const renderRefreshButton = () => {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleManualRefresh}
        disabled={isRefreshLoading || isFetching}
        title={buttonTitle}
        className={clsx(
          'inline-flex items-center justify-center w-[70px] min-w-[70px] gap-1 px-2 py-0.5 rounded-full bg-white text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 text-[10px] transition-all',
          isRefreshLoading
            ? 'opacity-90 cursor-wait'
            : 'hover:bg-zinc-50 cursor-pointer active:scale-95'
        )}
      >
        <RefreshCw
          className={clsx(
            'w-3 h-3 text-zinc-500 shrink-0',
            isRefreshLoading ? 'animate-spin-fast text-blue-600' : 'transition-transform duration-300'
          )}
        />
        <span className="tabular-nums font-semibold text-[10px] text-zinc-700 whitespace-nowrap">
          {buttonText}
        </span>
      </button>
    );
  };

  if (onlyRefreshButton) {
    return renderRefreshButton();
  }

  const isAnyLoading = isQueryLoading || isFetching || isRefreshLoading;
  const hasData = Array.isArray(data) && data.length > 0;

  if (isAnyLoading && !hasData) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs" onClick={(e) => e.stopPropagation()}>
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col gap-0.5 justify-center">
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title="클릭하여 노선도 및 열차 위치 확인"
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-[10px] cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-all"
          >
            <span>확인 중...</span>
          </div>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title="클릭하여 노선도 및 열차 위치 확인"
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-zinc-300 font-medium shrink-0 animate-pulse text-[10px] cursor-pointer hover:border-blue-400 transition-all"
          >
            <span>확인 중...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!hasData || isError) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs" onClick={(e) => e.stopPropagation()}>
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col gap-0.5 justify-center">
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title="클릭하여 노선도 및 열차 위치 확인"
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px] cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:shadow-xs transition-all active:scale-98"
          >
            <span>운행 정보 없음</span>
          </div>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleOpenLineMap(e)}
            title="클릭하여 노선도 및 열차 위치 확인"
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-zinc-400 font-medium shrink-0 text-[10px] cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:shadow-xs transition-all active:scale-98"
          >
            <span>운행 정보 없음</span>
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
      // "[전역]", "[진입]", "[전역출발]" 등 모든 대괄호 태그 제거
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

    // 1. 행선지 괄호 (광운대) 등 제거
    let cleanMsg = rawMsg.replace(/\s*\([^)]*\)/g, '').trim();

    // 2. "[2]번째 전역" -> "2전역"
    cleanMsg = cleanMsg.replace(/\[?(\d+)\]?번째\s*전역/g, '$1전역');

    // 3. "[전역]" -> "전역"
    cleanMsg = cleanMsg.replace(/\[(.*?)\]/g, '$1');

    // 4. "1분 전역" / "1분 2전역" 처럼 앞에 잔여시간 숫자가 섞여있으면 시간 부분 제거
    cleanMsg = cleanMsg.replace(/^\d+분\s*/g, '').trim();

    // 5. "급행", "(급)" 등 열차 종류 텍스트가 섞여있으면 제거
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

  return (
    <>
      <div
        className="inline-flex items-center gap-1.5 shrink-0 text-xs"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col gap-0.5 justify-center">
          {/* 1번째 열차 (가장 빠른 열차) */}
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
              'inline-flex items-center justify-between w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border shadow-2xs text-[10px] whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
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
            {/* 1. 잔여 시간 (축소: w-[36px], 좌측 정렬) */}
            <span className="w-[36px] shrink-0 tabular-nums font-semibold text-blue-600 text-left">
              {timeText1}
            </span>

            {/* 2. 잔여 정거장 / 현재 위치 (확장: w-[54px], 중앙 정렬) */}
            <span className="w-[54px] shrink-0 tabular-nums font-medium text-zinc-600 text-center truncate">
              {locText1 && locText1 !== timeText1 ? locText1 : ''}
            </span>

            {/* 3. 열차 종류 (일반 / 급행 / 중간종착, 우측 정렬) */}
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

          {/* 2번째 열차 (다음 열차: 없을 경우 운행 정보 없음 뱃지 항상 노출) */}
          {timeText2 && item2 ? (
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
                'inline-flex items-center justify-between w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/80 border border-zinc-200/90 shadow-2xs text-[10px] text-zinc-600 whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
                !isCanBoard2 && 'border-amber-200 text-amber-700 bg-amber-50/20'
              )}
              title={
                !isCanBoard2
                  ? '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기'
                  : '클릭하여 실시간 노선도 및 열차 위치 확인'
              }
            >
              {/* 1. 잔여 시간 (축소: w-[36px], 좌측 정렬) */}
              <span className="w-[36px] shrink-0 tabular-nums font-semibold text-zinc-700 text-left">
                {timeText2}
              </span>

              {/* 2. 잔여 정거장 / 현재 위치 (확장: w-[54px], 중앙 정렬) */}
              <span className="w-[54px] shrink-0 tabular-nums font-normal text-zinc-500 text-center truncate">
                {locText2 && locText2 !== timeText2 ? locText2 : ''}
              </span>

              {/* 3. 열차 종류 (일반 / 급행 / 중간종착, 우측 정렬) */}
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
          ) : (
            <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-[10px] text-zinc-400 font-medium whitespace-nowrap">
              <span>운행 정보 없음</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

