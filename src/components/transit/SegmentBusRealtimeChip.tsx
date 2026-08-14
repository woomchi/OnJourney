'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Bus, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeTransit } from '@/hooks/useRealtimeTransit';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { getBusColor } from '@/lib/services/directions/transit/transitColorUtils';

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
}

function formatCompactTime(seconds: number): { text: string; isImminent: boolean } {
  if (seconds <= 0) return { text: '도착', isImminent: true };
  if (seconds < 60) return { text: '곧 도착', isImminent: true };
  const mins = Math.floor(seconds / 60);
  return { text: `${mins}분 후`, isImminent: mins <= 3 };
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
}) => {
  const [hasActivated, setHasActivated] = useState<boolean>(!manualOnly);

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

  const { data, isLoading, isError, isFetching, refetch } = useRealtimeTransit({
    region: region || 'tago',
    stationId: String(stationId || ''),
    stationName,
    cityCode,
    lat,
    lng,
    enabled: Boolean(stationId && cleanBusNo && hasActivated),
  });

  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (isFetching) {
      setIsSpinning(true);
      const timer = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isFetching]);

  const { buttonText, buttonTitle, start, reset } = useAutoRefresh({
    intervalSeconds: 15,
    maxRefreshCount: 3,
    onRefresh: refetch,
  });

  // 구간 전환(stationId or busNo 변경) 시 초기 상태로 리셋
  useEffect(() => {
    setHasActivated(!manualOnly);
    reset();
  }, [stationId, cleanBusNo, manualOnly, reset]);

  // 유저가 새로고침 버튼 클릭 시 3회 자동 갱신 세션 시작/재개
  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFetching) return;
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 600);
    if (!hasActivated) {
      setHasActivated(true);
    }
    start();
  };

  const targetBuses = useMemo(() => {
    if (!data?.nextArrivals || data.nextArrivals.length === 0 || !cleanBusNo) return [];
    
    // arrivedInSeconds가 0 초과인 유효 항목만 대상으로 검색
    const validArrivals = data.nextArrivals.filter((item) => item.arrivedInSeconds > 0);

    const matches = validArrivals.filter((item) => {
      const line = item.lineName
        .replace(/^(일반|마을|직행|광역|지선|간선|순환|좌석|급행|시외|공항)/g, '')
        .replace(/버스|번/g, '')
        .trim();
      return (
        line === cleanBusNo ||
        line.replace(/[^0-9a-zA-Z]/g, '') === cleanBusNo.replace(/[^0-9a-zA-Z]/g, '') ||
        line.includes(cleanBusNo) ||
        cleanBusNo.includes(line)
      );
    });

    return matches.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);
  }, [data, cleanBusNo]);

  if (!stationId || !cleanBusNo) return null;

  // 새로고침 버튼 렌더링 (상태별 디자인 및 텍스트 표현)
  const renderRefreshButton = () => {
    return (
      <button
        type="button"
        onClick={handleManualRefresh}
        disabled={isFetching}
        title={buttonTitle}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-50 text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 cursor-pointer active:scale-95 text-[10px] transition-all"
      >
        <RefreshCw className={clsx('w-3 h-3 text-zinc-500 shrink-0', isSpinning && 'animate-spin-once')} />
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-[10px]">
          <span>확인 중...</span>
        </span>
      </div>
    );
  }

  if (isError || targetBuses.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 text-[10px]">
          <span>도착 정보 없음</span>
        </span>
      </div>
    );
  }

  const firstBus = targetBuses[0];
  const { text: timeText1 } = formatCompactTime(firstBus.arrivedInSeconds);

  // 대안 변경 UI 컴팩트 모드: min1, min2 표시 (예: 3분 후 · 12분 후)
  if (variant === 'compact') {
    const timeText2 = targetBuses[1] ? formatCompactTime(targetBuses[1].arrivedInSeconds).text : null;
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px] text-blue-600">
          <span>{timeText1}</span>
          {timeText2 && (
            <span className="text-zinc-400 font-normal"> · {timeText2}</span>
          )}
        </span>
      </div>
    );
  }

  // 여정 상세 사이드바 모드 (기본값): 가장 빠른 버스 도착 잔여 시간 + 남은 정거장 수 (예: 3분 후 · 2전)
  const stopCountText =
    typeof firstBus.currentStationSequence === 'number' && firstBus.currentStationSequence > 0
      ? `${firstBus.currentStationSequence}전`
      : null;

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
      {renderRefreshButton()}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px] text-blue-600">
        <span>{timeText1}</span>
        {stopCountText && (
          <span className="text-zinc-500 font-medium"> · {stopCountText}</span>
        )}
      </span>
    </div>
  );
};
