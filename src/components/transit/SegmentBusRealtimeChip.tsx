'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeTransit } from '@/hooks/useRealtimeTransit';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { ArrivalBusItem } from '@/types/realtimeTransit';

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
  variant?: 'sidebar' | 'compact';
  hideRefreshButton?: boolean;
  onlyRefreshButton?: boolean;
}

function formatBusItemTime(seconds: number): string {
  if (seconds <= 0) return '도착';
  if (seconds < 60) return '곧 도착';
  const mins = Math.floor(seconds / 60);
  if (mins <= 0) return '곧 도착';
  return `${mins}분 후`;
}

function getBusLocationText(bus: ArrivalBusItem): string {
  if (typeof bus.currentStationSequence === 'number' && bus.currentStationSequence > 0) {
    return `${bus.currentStationSequence}전`;
  }
  if (bus.destination) {
    return bus.destination.replace(/방향$/, '').trim();
  }
  return '';
}

function getBusTypeBadge(bus: ArrivalBusItem, rawBusNo?: string) {
  const line = (rawBusNo || bus.lineName || '').trim();
  if (
    bus.busType === 'express' ||
    line.includes('광역') ||
    line.includes('직행') ||
    line.includes('급행') ||
    line.includes('좌석')
  ) {
    return <span className="text-rose-600 font-bold">급행</span>;
  }
  if (bus.busType === 'circulation' || line.includes('순환')) {
    return <span className="text-amber-600 font-semibold">순환</span>;
  }
  if (line.includes('마을')) {
    return <span className="text-emerald-600 font-semibold">마을</span>;
  }
  if (bus.busType === 'limited' || line.includes('맞춤')) {
    return <span className="text-purple-600 font-medium">맞춤</span>;
  }
  return <span className="text-zinc-500 font-medium">일반</span>;
}

function getBusTypeBadgeSecondary(bus: ArrivalBusItem, rawBusNo?: string) {
  const line = (rawBusNo || bus.lineName || '').trim();
  if (
    bus.busType === 'express' ||
    line.includes('광역') ||
    line.includes('직행') ||
    line.includes('급행') ||
    line.includes('좌석')
  ) {
    return <span className="text-rose-500 font-bold">급행</span>;
  }
  if (bus.busType === 'circulation' || line.includes('순환')) {
    return <span className="text-amber-600 font-normal">순환</span>;
  }
  if (line.includes('마을')) {
    return <span className="text-emerald-600 font-normal">마을</span>;
  }
  if (bus.busType === 'limited' || line.includes('맞춤')) {
    return <span className="text-purple-500 font-normal">맞춤</span>;
  }
  return <span className="text-zinc-400 font-normal">일반</span>;
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
  const cleanBusNo = useMemo(() => {
    if (!busNo) return '';
    // '일반10', '마을55', '직행5000', '10번 버스' 등 각종 수식어 제거
    const raw = busNo
      .replace(/^(일반|마을|직행|광역|지선|간선|순환|좌석|급행|시외|공항)/g, '')
      .replace(/버스|번/g, '')
      .trim();
    const match = raw.match(/([0-9]+[a-zA-Z가-힣\-]*|[가-힣]+[0-9\-]*)/);
    return match ? match[0].trim() : raw;
  }, [busNo]);

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

  const targetBuses = useMemo(() => {
    if (!data?.nextArrivals || data.nextArrivals.length === 0 || !cleanBusNo) return [];

    // arrivedInSeconds가 0 초과인 유효 항목만 대상으로 검색
    const validArrivals = data.nextArrivals.filter((item) => item.arrivedInSeconds > 0);
    const targetClean = cleanBusNo.trim();

    // 1단계: 완전 일치 (Strict Matching) 우선 탐색으로 유사 번호(10 vs 100 vs 10-1) 오매칭 완전 차단
    let matches = validArrivals.filter((item) => {
      const line = (item.lineName || '')
        .replace(/^(일반|마을|직행|광역|지선|간선|순환|좌석|급행|시외|공항)/g, '')
        .replace(/버스|번/g, '')
        .trim();
      return line === targetClean;
    });

    // 2단계: 괄호/예약 수식어 제거 후 일치 탐색 (예: "3000(예약)" vs "3000")
    if (matches.length === 0) {
      matches = validArrivals.filter((item) => {
        const line = (item.lineName || '')
          .replace(/^(일반|마을|직행|광역|지선|간선|순환|좌석|급행|시외|공항)/g, '')
          .replace(/버스|번/g, '')
          .trim();
        const lineWithoutParen = line.replace(/\(.*\)/g, '').trim();
        return (
          lineWithoutParen === targetClean ||
          line.replace(/[^0-9a-zA-Z가-힣]/g, '') === targetClean.replace(/[^0-9a-zA-Z가-힣]/g, '')
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
        <div className="inline-flex flex-col gap-0.5 justify-center">
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px]">
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
  const locText1 = getBusLocationText(bus1);
  const typeBadge1 = getBusTypeBadge(bus1, busNo);

  const timeText2 = bus2 ? formatBusItemTime(bus2.arrivedInSeconds) : null;
  const locText2 = bus2 ? getBusLocationText(bus2) : null;
  const typeBadge2 = bus2 ? getBusTypeBadgeSecondary(bus2, busNo) : null;

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
      {!hideRefreshButton && renderRefreshButton()}
      <div className="inline-flex flex-col gap-0.5 justify-center">
        {/* 1번째 버스 (가장 빠른 버스) */}
        <div className="inline-flex items-center justify-between w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-white border shadow-2xs text-[10px] whitespace-nowrap transition-all border-blue-200 text-blue-600">
          {/* 1. 잔여 시간 (좌측 정렬: w-[36px]) */}
          <span className="w-[36px] shrink-0 tabular-nums font-semibold text-blue-600 text-left">
            {timeText1}
          </span>

          {/* 2. 잔여 정거장 / 현재 위치 (중앙 정렬: w-[54px]) */}
          <span className="w-[54px] shrink-0 tabular-nums font-medium text-zinc-600 text-center truncate">
            {locText1 && locText1 !== timeText1 ? locText1 : ''}
          </span>

          {/* 3. 버스 유형 배지 (우측 정렬: w-[24px]) */}
          <span className="w-[24px] shrink-0 text-center">
            {typeBadge1}
          </span>
        </div>

        {/* 2번째 버스 (다음 버스: 없을 경우 도착 정보 없음 뱃지 항상 노출) */}
        {timeText2 ? (
          <div className="inline-flex items-center justify-between w-[148px] min-w-[148px] px-2.5 py-0.5 rounded-full bg-zinc-50/80 border border-zinc-200/90 shadow-2xs text-[10px] text-zinc-600 whitespace-nowrap transition-all">
            {/* 1. 잔여 시간 (좌측 정렬: w-[36px]) */}
            <span className="w-[36px] shrink-0 tabular-nums font-semibold text-zinc-700 text-left">
              {timeText2}
            </span>

            {/* 2. 잔여 정거장 / 현재 위치 (중앙 정렬: w-[54px]) */}
            <span className="w-[54px] shrink-0 tabular-nums font-normal text-zinc-500 text-center truncate">
              {locText2 && locText2 !== timeText2 ? locText2 : ''}
            </span>

            {/* 3. 버스 유형 배지 (우측 정렬: w-[24px]) */}
            <span className="w-[24px] shrink-0 text-center">
              {typeBadge2}
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

