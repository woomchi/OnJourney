'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Bus, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeTransit } from '@/hooks/useRealtimeTransit';
import { getBusColor } from '@/lib/services/directions/transit/transitColorUtils';

export interface SegmentBusRealtimeChipProps {
  region?: string;
  stationId?: string;
  stationName?: string;
  busNo?: string;
  busColor?: string;
}

type AutoRefreshState = 'idle' | 'active' | 'paused';
const MAX_REFRESH_COUNT = 3; // 사용자가 버튼 클릭 시 3회(약 45초) 자동 갱신 후 일시정지

function formatCompactTime(seconds: number): { text: string; isImminent: boolean } {
  const mins = Math.floor(seconds / 60);
  if (mins <= 0) return { text: '도착', isImminent: true };
  return { text: `${mins}분 후`, isImminent: mins <= 3 };
}

export const SegmentBusRealtimeChip: React.FC<SegmentBusRealtimeChipProps> = ({
  region = 'seoul',
  stationId,
  stationName,
  busNo,
  busColor,
}) => {
  // 상태 관리: 'idle' (최초 1회 조회 후 대기), 'active' (3회 자동 갱신 진행), 'paused' (3회 완료 후 정지)
  const [autoRefreshState, setAutoRefreshState] = useState<AutoRefreshState>('idle');
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(15);

  const cleanBusNo = useMemo(() => {
    if (!busNo) return '';
    const match = busNo.match(/([0-9]+[a-zA-Z가-힣\-]*|[가-힣]+[0-9\-]*)/);
    return match ? match[0].replace(/버스|번/g, '').trim() : busNo.replace(/버스|번/g, '').trim();
  }, [busNo]);

  // 구간 전환(stationId or busNo 변경) 시 초기 1회 상태로 리셋
  useEffect(() => {
    setAutoRefreshState('idle');
    setRefreshCount(0);
    setCountdown(15);
  }, [stationId, cleanBusNo]);

  const { data, isLoading, isError, isFetching, refetch } = useRealtimeTransit({
    region: region || 'seoul',
    stationId: String(stationId || ''),
    stationName,
    enabled: Boolean(stationId && cleanBusNo),
  });

  // 'active' 상태일 때 1초 마다 카운트다운 및 15초 주기 만료 시 실제 refetch() 호출
  useEffect(() => {
    if (autoRefreshState !== 'active') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refetch();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefreshState, refetch]);

  // 실제 데이터 갱신 시 카운터 카운팅
  const prevLastUpdatedRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (autoRefreshState !== 'active') return;

    if (data?.lastUpdated && data.lastUpdated !== prevLastUpdatedRef.current) {
      prevLastUpdatedRef.current = data.lastUpdated;
      setRefreshCount((prevCount) => {
        const nextCount = prevCount + 1;
        if (nextCount >= MAX_REFRESH_COUNT) {
          setAutoRefreshState('paused');
        }
        return nextCount;
      });
    }
  }, [data?.lastUpdated, autoRefreshState]);

  // 유저가 새로고침 버튼 클릭 시 3회 자동 갱신 세션 시작/재개
  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFetching) return;
    setRefreshCount(0);
    setCountdown(15);
    setAutoRefreshState('active');
    refetch();
  };

  const targetBus = useMemo(() => {
    if (!data?.nextArrivals || data.nextArrivals.length === 0 || !cleanBusNo) return null;
    
    // arrivedInSeconds가 0 초과인 유효 항목만 대상으로 검색
    const validArrivals = data.nextArrivals.filter((item) => item.arrivedInSeconds > 0);

    const exact = validArrivals.find((item) => {
      const line = item.lineName.replace(/버스|번/g, '').trim();
      return line === cleanBusNo;
    });
    if (exact) return exact;

    const partial = validArrivals.find((item) => {
      const line = item.lineName.replace(/버스|번/g, '').trim();
      return line.includes(cleanBusNo) || cleanBusNo.includes(line);
    });
    if (partial) return partial;

    return null;
  }, [data, cleanBusNo]);

  const busInherentColor = useMemo(() => {
    if (busColor) return busColor;
    if (!targetBus) return getBusColor(1, cleanBusNo);
    const busTypeNum =
      targetBus.busType === 'express'
        ? 4
        : targetBus.busType === 'circulation'
        ? 13
        : targetBus.busType === 'limited'
        ? 3
        : 1;
    return getBusColor(busTypeNum, cleanBusNo);
  }, [busColor, targetBus, cleanBusNo]);

  if (!stationId || !cleanBusNo) return null;

  // 새로고침 버튼 렌더링 (상태별 디자인 및 텍스트 표현)
  const renderRefreshButton = () => {
    let buttonText = '갱신';
    let buttonTitle = '클릭 시 3회(45초) 자동 갱신 시작';

    if (autoRefreshState === 'active') {
      buttonText = `${countdown}초`;
      buttonTitle = `자동 갱신 진행 중 (${refreshCount + 1}/${MAX_REFRESH_COUNT}회)`;
    } else if (autoRefreshState === 'paused') {
      buttonText = '갱신';
      buttonTitle = '3회 자동 갱신 완료 (클릭 시 갱신 재개)';
    }

    return (
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isFetching}
        title={buttonTitle}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-50 dark:bg-white text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 cursor-pointer active:scale-95 text-[11px] transition-all"
      >
        <RefreshCw className={clsx('w-3 h-3 text-zinc-500 shrink-0', isFetching && 'animate-spin')} />
        <span className="tabular-nums font-semibold text-[10px] text-zinc-700">
          {buttonText}
        </span>
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-xs">
          <Bus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>{cleanBusNo}번 실시간 확인 중</span>
        </span>
      </div>
    );
  }

  if (isError || !targetBus) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 text-xs">
          <Bus className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>{cleanBusNo}번 도착 대기 중</span>
        </span>
      </div>
    );
  }

  const { text: timeText } = formatCompactTime(targetBus.arrivedInSeconds);

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
      {renderRefreshButton()}
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-medium shrink-0">
        <Bus
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: busInherentColor }}
        />
        <span
          className="font-bold"
          style={{ color: busInherentColor }}
        >
          {cleanBusNo}번
        </span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-900">
          {timeText}
        </span>
        {targetBus.currentStationSequence !== undefined && targetBus.currentStationSequence > 0 && (
          <span className="text-[10px] text-zinc-400 font-normal">
            ({targetBus.currentStationSequence}전)
          </span>
        )}
      </span>
    </div>
  );
};
