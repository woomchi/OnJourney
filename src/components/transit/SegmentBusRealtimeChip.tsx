'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeTransit } from '@/hooks/useRealtimeTransit';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useJourneyStore } from '@/stores/journey-store';
import { ArrivalBusItem } from '@/types/realtimeTransit';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';

export interface SegmentBusRealtimeChipProps {
  region?: string;
  stationId?: string;
  stationName?: string;
  busNo?: string;
  busColor?: string;
  cityCode?: string;
  lat?: number;
  lng?: number;
  manualOnly?: boolean;
  variant?: 'card' | 'sidebar' | 'compact';
  hideRefreshButton?: boolean;
  onlyRefreshButton?: boolean;
}

function formatBusItemTime(seconds: number): string {
  if (seconds <= 0) return '도착';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}초`;
  return `${mins}분`;
}

function getBusStationCountText(bus: ArrivalBusItem): string {
  if (typeof bus.currentStationSequence === 'number' && bus.currentStationSequence > 0) {
    return `${bus.currentStationSequence}전`;
  }
  return '전역';
}

function renderSeatOrCrowdedBadge(bus: ArrivalBusItem, isPrimary: boolean = true) {
  // 1. 잔여 좌석 (광역/직행 등)
  if (typeof bus.remainSeats === 'number') {
    if (bus.remainSeats === 0) {
      return <span className="text-red-500 font-bold">만석</span>;
    }
    return (
      <span className={clsx('font-semibold', isPrimary ? 'text-blue-600' : 'text-zinc-600')}>
        {bus.remainSeats}석
      </span>
    );
  }

  // 2. 혼잡도 (서울/시내 등)
  if (bus.crowded) {
    const cr = bus.crowded.trim();
    if (cr.includes('여유') || cr === '1' || cr === '3') {
      return <span className="text-emerald-600 font-medium">여유</span>;
    }
    if (cr.includes('보통') || cr === '2' || cr === '4') {
      return <span className="text-amber-600 font-medium">보통</span>;
    }
    if (cr.includes('혼잡') || cr === '3' || cr === '5') {
      return <span className="text-red-500 font-bold">혼잡</span>;
    }
    if (cr.includes('매우') || cr === '6') {
      return <span className="text-rose-600 font-extrabold">포화</span>;
    }
  }

  // 3. 둘 다 없을 경우 종점 약칭 또는 공백
  if (bus.destination) {
    return <span className="text-zinc-400 font-normal truncate">{bus.destination.replace(/방향$/, '').trim()}</span>;
  }

  return null;
}

export const SegmentBusRealtimeChip: React.FC<SegmentBusRealtimeChipProps> = ({
  region,
  stationId,
  stationName,
  busNo,
  busColor,
  cityCode,
  lat,
  lng,
  manualOnly = false,
  variant = 'sidebar',
  hideRefreshButton = false,
  onlyRefreshButton = false,
}) => {
  const cleanBusNo = useMemo(() => cleanBusNumber(busNo), [busNo]);
  const setBusLineMapTarget = useJourneyStore((state) => state.setBusLineMapTarget);

  const { data, isLoading: isQueryLoading, isError, isFetching, refetch } = useRealtimeTransit({
    region: region || 'tago',
    stationId: String(stationId || ''),
    stationName,
    cityCode,
    lat,
    lng,
    enabled: Boolean(stationId && cleanBusNo),
  });

  const sharedKey = stationId && cleanBusNo
    ? `bus:${region || 'tago'}:${stationId}:${cleanBusNo}`
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

  // 정류소 및 버스 번호가 변경되었을 때만 타이머를 리셋 및 자동 시작합니다.
  const prevStationRef = useRef<string | undefined>(stationId);
  const prevBusNoRef = useRef<string | undefined>(cleanBusNo);
  const isFirstMountRef = useRef<boolean>(true);

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    if (prevStationRef.current !== stationId || prevBusNoRef.current !== cleanBusNo) {
      prevStationRef.current = stationId;
      prevBusNoRef.current = cleanBusNo;
      start();
    }
  }, [stationId, cleanBusNo, start]);

  // 유저가 새로고침 버튼 클릭 시 3회 자동 갱신 세션 시작/재개
  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshLoading || isFetching) return;
    refetch();
    start();
  };

  const handleOpenBusLineMap = (e: React.MouseEvent, targetBus?: ArrivalBusItem) => {
    e.stopPropagation();
    e.preventDefault();
    if (!cleanBusNo) return;

    setBusLineMapTarget({
      stationName: stationName || '정류소',
      stationId: stationId ? String(stationId) : undefined,
      busNo: cleanBusNo,
      routeId: targetBus?.lineId,
      busColor,
      busCityCode: cityCode,
      region,
      targetVehicleNo: undefined,
      targetMinutesLeft: targetBus ? Math.max(1, Math.round(targetBus.arrivedInSeconds / 60)) : undefined,
      targetStationsLeft: targetBus?.currentStationSequence,
      targetStatusText: targetBus ? formatBusItemTime(targetBus.arrivedInSeconds) : undefined,
    });
  };

  const targetBuses = useMemo(() => {
    if (!data?.nextArrivals || data.nextArrivals.length === 0 || !cleanBusNo) return [];

    // arrivedInSeconds가 0 초과인 유효 항목만 대상으로 검색
    const validArrivals = data.nextArrivals.filter((item) => item.arrivedInSeconds > 0);
    const targetClean = cleanBusNo.trim().toUpperCase();

    // 1단계: cleanBusNumber 기반 완전 일치 탐색 (Strict Matching)
    let matches = validArrivals.filter((item) => {
      const lineClean = cleanBusNumber(item.lineName);
      return lineClean === targetClean;
    });

    // 2단계: 분기 노선(예: 5002 -> 5002A, 5002B) 또는 기호 정규화 일치 탐색
    if (matches.length === 0) {
      matches = validArrivals.filter((item) => {
        const lineClean = cleanBusNumber(item.lineName);
        // 5002 vs 5002A, 5002B 등 영문 분기 노선 매칭 (10 vs 100 오매칭은 차단)
        const isBranchMatch =
          lineClean.startsWith(targetClean) &&
          /^[A-Z]$/.test(lineClean.slice(targetClean.length));
        return (
          isBranchMatch ||
          lineClean.replace(/[^0-9a-zA-Z]/g, '') === targetClean.replace(/[^0-9a-zA-Z]/g, '')
        );
      });
    }

    return matches.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);
  }, [data, cleanBusNo]);

  if (!stationId || !cleanBusNo) return null;

  // 새로고침 버튼 렌더링 (상태별 디자인 및 텍스트 표현)
  const renderRefreshButton = () => {
    return (
      <button
        type="button"
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
  const hasData = targetBuses.length > 0;

  // 1. 로딩 상태: 초기 로딩 중이거나 새로고침 진행 중일 때만 2슬롯 펄스 스켈레톤
  if (isAnyLoading && !hasData && (!data || isQueryLoading || isFetching)) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col gap-0.5 justify-center">
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-[10px]">
            <span>확인 중...</span>
          </div>
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-zinc-300 font-medium shrink-0 animate-pulse text-[10px]">
            <span>확인 중...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. 에러 또는 데이터 없음: 항상 2개의 '도착 정보 없음' 슬롯 노출
  if (!hasData || isError) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {!hideRefreshButton && renderRefreshButton()}
        <div
          onClick={(e) => handleOpenBusLineMap(e)}
          title="버스 실시간 노선도 보기"
          className="inline-flex flex-col gap-0.5 justify-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px] hover:border-blue-300">
            <span>도착 정보 없음</span>
          </div>
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-zinc-400 font-medium shrink-0 text-[10px]">
            <span>도착 정보 없음</span>
          </div>
        </div>
      </div>
    );
  }

  const bus1 = targetBuses[0];
  const bus2 = targetBuses[1];

  const timeText1 = formatBusItemTime(bus1.arrivedInSeconds);
  const stationText1 = getBusStationCountText(bus1);
  const statusBadge1 = renderSeatOrCrowdedBadge(bus1, true);

  const timeText2 = bus2 ? formatBusItemTime(bus2.arrivedInSeconds) : null;
  const stationText2 = bus2 ? getBusStationCountText(bus2) : null;
  const statusBadge2 = bus2 ? renderSeatOrCrowdedBadge(bus2, false) : null;

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
      {!hideRefreshButton && renderRefreshButton()}
      <div
        onClick={(e) => handleOpenBusLineMap(e, bus1)}
        title="버스 실시간 노선도 보기"
        className="inline-flex flex-col gap-0.5 justify-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {/* 1번째 버스 (가장 빠른 버스) */}
        <div className="inline-flex items-center justify-between w-[148px] min-w-[148px] px-2 py-0.5 rounded-full bg-white border shadow-2xs text-[10px] whitespace-nowrap transition-all border-blue-200 text-blue-600 hover:border-blue-400 hover:shadow-xs">
          {/* 1. 잔여 시간 (좌측 정렬: w-[40px]) */}
          <span className="w-[40px] shrink-0 tabular-nums font-semibold text-blue-600 text-left truncate">
            {timeText1}
          </span>

          {/* 2. 남은 정거장 수 (중앙 정렬: w-[32px]) */}
          <span className="w-[32px] shrink-0 tabular-nums font-medium text-zinc-500 text-center truncate">
            {stationText1}
          </span>

          {/* 3. 여석 / 혼잡도 (우측 정렬: w-[44px]) */}
          <span className="w-[44px] shrink-0 text-right truncate flex justify-end">
            {statusBadge1}
          </span>
        </div>

        {/* 2번째 버스 (다음 버스: 없을 경우 도착 정보 없음 뱃지 항상 노출) */}
        {timeText2 ? (
          <div
            onClick={(e) => handleOpenBusLineMap(e, bus2)}
            className="inline-flex items-center justify-between w-[148px] min-w-[148px] px-2 py-0.5 rounded-full bg-zinc-50/80 border border-zinc-200/90 shadow-2xs text-[10px] text-zinc-600 whitespace-nowrap transition-all hover:border-zinc-300 hover:shadow-xs"
          >
            {/* 1. 잔여 시간 (좌측 정렬: w-[40px]) */}
            <span className="w-[40px] shrink-0 tabular-nums font-semibold text-zinc-700 text-left truncate">
              {timeText2}
            </span>

            {/* 2. 남은 정거장 수 (중앙 정렬: w-[32px]) */}
            <span className="w-[32px] shrink-0 tabular-nums font-normal text-zinc-400 text-center truncate">
              {stationText2}
            </span>

            {/* 3. 여석 / 혼잡도 (우측 정렬: w-[44px]) */}
            <span className="w-[44px] shrink-0 text-right truncate flex justify-end">
              {statusBadge2}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/60 border border-zinc-200/70 shadow-2xs text-[10px] text-zinc-400 font-medium whitespace-nowrap text-center">
            <span>도착 정보 없음</span>
          </div>
        )}
      </div>
    </div>
  );
};

