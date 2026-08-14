'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeSubway } from '@/hooks/useRealtimeSubway';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

export interface SegmentSubwayRealtimeChipProps {
  stationName?: string;
  wayCode?: string;
  subwayId?: string;
  variant?: 'sidebar' | 'compact';
}

export const SegmentSubwayRealtimeChip: React.FC<SegmentSubwayRealtimeChipProps> = ({
  stationName,
  wayCode,
  subwayId,
  variant = 'sidebar',
}) => {
  const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

  const { data, isLoading, isError, isFetching, refetch } = useRealtimeSubway({
    stationName: cleanStationName,
    wayCode,
    subwayId,
    enabled: Boolean(cleanStationName),
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
    maxRefreshCount: 10,
    onRefresh: refetch,
    autoStart: true,
  });

  // 역명, 방면, 노선ID가 실제 변경되었을 때만 타이머를 리셋합니다.
  const prevStationRef = React.useRef<string>(cleanStationName);
  const prevWayCodeRef = React.useRef<string | undefined>(wayCode);
  const prevSubwayIdRef = React.useRef<string | undefined>(subwayId);

  useEffect(() => {
    if (
      prevStationRef.current !== cleanStationName ||
      prevWayCodeRef.current !== wayCode ||
      prevSubwayIdRef.current !== subwayId
    ) {
      prevStationRef.current = cleanStationName;
      prevWayCodeRef.current = wayCode;
      prevSubwayIdRef.current = subwayId;
      start();
    }
  }, [cleanStationName, wayCode, subwayId, start]);




  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFetching) return;
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 600);
    start();
  };

  if (!cleanStationName) return null;

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

  if (isError || !data || data.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px]">
          <span>운행 정보 없음</span>
        </span>
      </div>
    );
  }

  const item1 = data[0];
  const item2 = data[1];

  const formatItemTime = (item: typeof item1) => {
    if (item.minutesLeft !== undefined && item.minutesLeft > 0) {
      return `${item.minutesLeft}분 후`;
    }
    return item.statusText || (item.isRealtime !== false ? '진입 중' : '운행 중');
  };

  const timeText1 = formatItemTime(item1);

  if (variant === 'compact') {
    const timeText2 = item2 ? formatItemTime(item2) : null;
    const isRealtime = item1.isRealtime !== false;

    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
        {renderRefreshButton()}
        <span
          className={clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px]',
            isRealtime ? 'text-blue-600' : 'text-slate-700'
          )}
        >
          <span>{timeText1}</span>
          {timeText2 && (
            <span className="text-zinc-400 font-normal"> · {timeText2}</span>
          )}
        </span>
      </div>
    );
  }

  const isRealtime = item1.isRealtime !== false;
  const detailText = isRealtime
    ? item1.arvlMsg2 || item1.updnLine || '실시간'
    : item1.statusText || `${item1.updnLine || ''} 시간표`;

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs">
      {renderRefreshButton()}
      <span
        className={clsx(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px]',
          isRealtime ? 'text-blue-600' : 'text-slate-700'
        )}
      >
        <span>{timeText1}</span>
        {detailText && detailText !== timeText1 && (
          <span className="text-zinc-500 font-medium"> · {detailText}</span>
        )}
      </span>
    </div>
  );
};
