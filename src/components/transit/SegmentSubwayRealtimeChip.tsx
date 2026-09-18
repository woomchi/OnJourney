'use client';

import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeSubway } from '@/hooks/useRealtimeSubway';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useJourneyStore } from '@/stores/journey-store';
import { resolveSubwayNameForApi } from '@/lib/constants/subwayLineMap';
import { getSubwayRefreshSharedKey } from '@/lib/transit/transitSharedKey';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';
import { inferBusanDirection } from '@/lib/services/busanSubwayStations';
import { inferDaeguDirection } from '@/lib/services/daeguSubwayStations';
import { getSubwayLineTheme } from '@/lib/constants/subwayThemes';

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
  const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

  const { data, isLoading: isQueryLoading, isError, isFetching, refetch } = useRealtimeSubway({
    stationName: cleanStationName,
    wayCode,
    subwayId,
    destination,
    headsign,
    enabled: Boolean(cleanStationName),
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
    start();
  };

  const handleOpenLineMap = (
    e: React.MouseEvent,
    trainNo?: string,
    minutesLeft?: number,
    statusText?: string,
    itemUpdnLine?: string
  ) => {
    e.stopPropagation();
    e.preventDefault();

    // 1. data[0]?.subwayId(실시간 API 응답)에 지역명이 포함되어 있으면 우선 채택
    const dataSubwayId = data && data[0]?.subwayId;
    let baseIdentifier = subwayId || dataSubwayId || undefined;
    if (dataSubwayId && (/부산|대전|대구|광주/.test(dataSubwayId))) {
      baseIdentifier = dataSubwayId;
    }

    // 2. 지역 감지
    const region = detectSubwayRegion({
      station: cleanStationName,
      subwayId: baseIdentifier,
      destination,
      headsign,
    });

    // 3. 지역에 맞춘 표준 노선명 해석
    let targetSubwayIdentifier = resolveSubwayNameForApi(baseIdentifier || '');
    if (region === 'busan') {
      const numMatch = (baseIdentifier || '').match(/\d/);
      targetSubwayIdentifier = numMatch ? `부산${numMatch[0]}호선` : '부산1호선';
    } else if (region === 'daejeon') {
      targetSubwayIdentifier = '대전1호선';
    } else if (region === 'daegu') {
      if (baseIdentifier?.includes('대경')) {
        targetSubwayIdentifier = '대경선';
      } else {
        const numMatch = (baseIdentifier || '').match(/[1-3]/);
        targetSubwayIdentifier = numMatch ? `대구${numMatch[0]}호선` : '대구1호선';
      }
    }

    // 4. 방향(wayCode) 자동 산출 ('1': 상행/내선, '2': 하행/외선)
    let effectiveWayCode = wayCode;
    const cleanDest = destination ? destination.replace(/역$/, '').trim() : '';
    const cleanHead = headsign ? headsign.replace(/역$/, '').replace(/방면$/, '').trim() : '';
    let parsedHeadDest = cleanHead;
    const arrowMatch = cleanHead.match(/>\s*([가-힣0-9a-zA-Z]+)/);
    if (arrowMatch) {
      parsedHeadDest = arrowMatch[1].replace(/역$/, '').trim();
    }

    // 4-1. 클릭된 열차의 updnLine 명시 정보 우선 (수도권 내선/외선/상행/하행 및 지역 노선 완벽 지원)
    if (!effectiveWayCode && itemUpdnLine) {
      if (/다대포|하행|외선|신평|양산|대저|안평|반석|인천|신창|수원|오이도/.test(itemUpdnLine)) {
        effectiveWayCode = '2';
      } else if (/노포|상행|내선|장산|수영|미남|판암|소요산|청량리|의정부|왕십리/.test(itemUpdnLine)) {
        effectiveWayCode = '1';
      }
    }

    // 4-2. 실시간 응답 첫 번째 열차 기준
    if (!effectiveWayCode && data && data[0]?.updnLine) {
      const firstLine = data[0].updnLine;
      if (/다대포|하행|외선|신평|양산|대저|안평|반석|인천|신창|수원|오이도/.test(firstLine)) {
        effectiveWayCode = '2';
      } else if (/노포|상행|내선|장산|수영|미남|판암|소요산|청량리|의정부|왕십리/.test(firstLine)) {
        effectiveWayCode = '1';
      }
    }

    // 4-3. 부산 도시철도 목적지/방면 기반 정밀 판별
    if (!effectiveWayCode && region === 'busan') {
      const numMatch = (baseIdentifier || '').match(/\d/);
      const lNum = numMatch ? numMatch[0] : '1';
      const bDir = (cleanDest && inferBusanDirection(lNum, cleanStationName, cleanDest)) ||
                   (parsedHeadDest && inferBusanDirection(lNum, cleanStationName, parsedHeadDest));
      if (bDir) {
        effectiveWayCode = bDir === 'UP' ? '1' : '2';
      }
    }

    // 4-4. 대구 도시철도 및 대경선 목적지/방면 기반 정밀 판별
    if (!effectiveWayCode && region === 'daegu') {
      const numMatch = (baseIdentifier || '').match(/[1-3]/);
      const lNum = baseIdentifier?.includes('대경') ? '대경선' : (numMatch ? numMatch[0] : '1');
      const dDir = inferDaeguDirection(lNum, cleanDest || parsedHeadDest, cleanHead);
      if (dDir) {
        effectiveWayCode = dDir === 'UP' ? '1' : '2';
      }
    }

    // 4-5. 수도권 및 전국 키워드 기반 Fallback
    if (!effectiveWayCode) {
      const hint = `${destination || ''} ${headsign || ''}`;
      if (/다대포|하행|외선|신평|양산|대저|안평|반석|설화명곡|문양|칠곡경대병원|경산|인천|신창|수원|오이도/.test(hint)) {
        effectiveWayCode = '2';
      } else if (/노포|상행|내선|장산|수영|미남|판암|하양|안심|영남대|용지|구미|소요산|청량리|의정부|왕십리/.test(hint)) {
        effectiveWayCode = '1';
      }
    }

    setSubwayLineMapTarget({
      stationName: cleanStationName,
      subwayId: targetSubwayIdentifier || baseIdentifier,
      subwayNm: targetSubwayIdentifier || baseIdentifier,
      wayCode: effectiveWayCode,
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

  const isItemEndedOrFirstTrain = (item: typeof item1) => {
    return (
      item.trainNo === 'LAST_TRAIN_ENDED' ||
      item.trainNo === 'FIRST_TRAIN_WAITING' ||
      (item.minutesLeft !== undefined && item.minutesLeft >= 120) ||
      (item.statusText && (item.statusText.includes('운행종료') || item.statusText.includes('운행 종료') || item.statusText.includes('첫차')))
    );
  };

  const formatItemTime = (item: typeof item1) => {
    // 1. 시간표 기반 운행 정보인 경우 (isRealtime === false)
    if (item.isRealtime === false) {
      // 심야 운행 종료 또는 첫차 대기
      if (isItemEndedOrFirstTrain(item)) {
        if (item.arrivalTime && item.arrivalTime !== '--:--' && /^\d{1,2}:\d{2}/.test(item.arrivalTime)) {
          return item.arrivalTime; // "05:30" 등 첫차 시각 표시
        }
        return '운행종료';
      }

      // 일반 시간표 운행 상태: 도착 예정 시각(HH:mm) 최우선 반환
      if (item.arrivalTime && item.arrivalTime !== '--:--' && /^\d{1,2}:\d{2}/.test(item.arrivalTime)) {
        return item.arrivalTime;
      }

      if (item.minutesLeft !== undefined && item.minutesLeft >= 0 && item.minutesLeft < 999) {
        return item.minutesLeft === 0 ? '곧 도착' : `${item.minutesLeft}분 후`;
      }

      return '시간표';
    }

    // 2. 실시간 정보인 경우 (isRealtime !== false)
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
    return '곧 도착';
  };

  const getLocationText = (item: typeof item1) => {
    if (item.isRealtime === false) {
      if (isItemEndedOrFirstTrain(item)) {
        if (item.arrivalTime && item.arrivalTime !== '--:--' && /^\d{1,2}:\d{2}/.test(item.arrivalTime)) {
          return '첫차 대기';
        }
        return '운행 종료';
      }
      // 일반 시간표인 경우: 행선지 또는 방면명 우선
      if (item.destinationStationNm) {
        return `${item.destinationStationNm.replace(/역$/, '')}행`;
      }
      if (item.updnLine) {
        return item.updnLine.includes('행') || item.updnLine.includes('선') ? item.updnLine : `${item.updnLine} 방면`;
      }
      return '시간표';
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
  const isEnded1 = !isRealtime && isItemEndedOrFirstTrain(item1);
  const isEnded2 = item2 ? (!isRealtime && isItemEndedOrFirstTrain(item2)) : false;
  const isCanBoard1 = item1.canBoard !== false && !isEnded1;
  const isCanBoard2 = item2 ? (item2.canBoard !== false && !isEnded2) : true;
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
            timeText1,
            item1.updnLine
          )
        }
        title={
          isRealtime
            ? '클릭하여 지하철 실시간 노선도 및 열차 위치 확인'
            : isEnded1
            ? `운행종료 안내 (첫차: ${timeText1}) - 클릭하여 노선도 보기`
            : `시간표 기준 운행 정보 (${timeText1}) - 클릭하여 지하철 노선도 보기`
        }
        className="flex flex-col items-end justify-center min-w-0 shrink-0 cursor-pointer group select-none"
      >
        {/* 메인 카운트다운 타이머 & 상태 */}
        <div className="flex items-center gap-1.5 leading-none">
          <span
            style={isRealtime && isCanBoard1 && subwayColor ? { color: subwayColor } : undefined}
            className={clsx(
              'text-sm sm:text-base font-black tabular-nums tracking-tight transition-colors',
              !isCanBoard1 && !isEnded1
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
            {!isCanBoard1 && !isEnded1 ? (
              <span className="text-amber-600 font-bold">당역종착</span>
            ) : isExpress1 ? (
              <span className="text-rose-600 font-bold">급행</span>
            ) : !isRealtime ? (
              <span className="text-zinc-600 font-semibold">{isEnded1 ? '첫차' : '시간표'}</span>
            ) : (
              <span className="text-zinc-500 font-medium">일반</span>
            )}
          </div>
        </div>

        {/* 2번째 열차 도착 보조 정보 or 노선도 힌트 */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium mt-1 leading-none">
          {timeText2 && !isEnded1 ? (
            <span className="tabular-nums">
              다음 <strong className="font-semibold text-zinc-600">{timeText2}</strong>
              {locText2 && locText2 !== timeText2 && ` (${locText2})`}
            </span>
          ) : !isRealtime && item1.minutesLeft !== undefined && item1.minutesLeft > 0 && item1.minutesLeft < 999 ? (
            <span className="tabular-nums text-zinc-500">
              약 <strong className="font-semibold text-zinc-700">{item1.minutesLeft}분 후</strong> 도착 예정
            </span>
          ) : (
            <span className="group-hover:text-emerald-600 transition-colors">
              {isRealtime ? '실시간 노선도 ↗' : '노선도 확인 ↗'}
            </span>
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
                timeText1,
                item1.updnLine
              )
            }
            className={clsx(
              'inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2 py-0.5 rounded-full bg-white border shadow-2xs text-[10px] whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
              !isCanBoard1 && !isEnded1
                ? 'border-amber-300 text-amber-700 bg-amber-50/30'
                : isRealtime
                ? 'border-blue-200 text-blue-600'
                : 'border-zinc-200 text-slate-700 bg-zinc-50/50'
            )}
            title={
              !isCanBoard1 && !isEnded1
                ? '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기'
                : isRealtime
                ? '클릭하여 실시간 노선도 및 열차 위치 확인'
                : isEnded1
                ? `운행종료 안내 (첫차: ${timeText1}) - 클릭하여 노선도 보기`
                : `시간표 기준 운행 정보 (${timeText1}) - 클릭하여 지하철 노선도 보기`
            }
          >
            <span
              className={clsx(
                'w-[40px] min-w-[40px] shrink-0 tabular-nums font-semibold text-left',
                isRealtime ? 'text-blue-600' : 'text-zinc-700'
              )}
            >
              {timeText1}
            </span>
            <span className="flex-1 min-w-0 tabular-nums font-medium text-zinc-600 text-center truncate px-0.5">
              {locText1 && locText1 !== timeText1 ? locText1 : ''}
            </span>
            <span className="w-[30px] min-w-[30px] shrink-0 text-right">
              {!isCanBoard1 && !isEnded1 ? (
                <span className="text-amber-600 font-bold text-[9px]">종착</span>
              ) : isExpress1 ? (
                <span className="text-rose-600 font-bold text-[9px]">급행</span>
              ) : !isRealtime ? (
                <span className="text-zinc-600 font-bold text-[9px]">{isEnded1 ? '첫차' : '시간표'}</span>
              ) : (
                <span className="text-zinc-500 font-medium text-[9px]">일반</span>
              )}
            </span>
          </div>

          {/* 2번째 열차 (실제 다음 열차가 있고 운행종료가 아닐 때만 노출) */}
          {timeText2 && item2 && !isEnded1 && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) =>
                handleOpenLineMap(
                  e,
                  item2.trainNo ? String(item2.trainNo) : undefined,
                  item2.minutesLeft,
                  timeText2,
                  item2.updnLine
                )
              }
              className={clsx(
                'inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2 py-0.5 rounded-full bg-zinc-50/80 border border-zinc-200/90 shadow-2xs text-[10px] text-zinc-600 whitespace-nowrap transition-all cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-98',
                !isCanBoard2 && !isEnded2 && 'border-amber-200 text-amber-700 bg-amber-50/20'
              )}
              title={
                !isCanBoard2 && !isEnded2
                  ? '목적지 미도달 (중간종착 열차) - 클릭하여 노선도 보기'
                  : isRealtime
                  ? '클릭하여 실시간 노선도 및 열차 위치 확인'
                  : `시간표 기준 운행 정보 (${timeText2}) - 클릭하여 지하철 노선도 보기`
              }
            >
              <span className="w-[40px] min-w-[40px] shrink-0 tabular-nums font-semibold text-zinc-700 text-left">
                {timeText2}
              </span>
              <span className="flex-1 min-w-0 tabular-nums font-normal text-zinc-500 text-center truncate px-0.5">
                {locText2 && locText2 !== timeText2 ? locText2 : ''}
              </span>
              <span className="w-[30px] min-w-[30px] shrink-0 text-right">
                {!isCanBoard2 && !isEnded2 ? (
                  <span className="text-amber-600 font-semibold text-[9px]">종착</span>
                ) : isExpress2 ? (
                  <span className="text-rose-500 font-bold text-[9px]">급행</span>
                ) : !isRealtime ? (
                  <span className="text-zinc-600 font-semibold text-[9px]">시간표</span>
                ) : (
                  <span className="text-zinc-400 font-normal text-[9px]">일반</span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

