'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Bus, Clock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useRealtimeTransit } from '@/hooks/useRealtimeTransit';
import { ReliabilityBadge } from './ReliabilityBadge';
import { ArrivalBusItem, BusType } from '@/types/realtimeTransit';

export interface RealtimeArrivalCardProps {
  region: string;
  stationId: string;
  stationName?: string;
  cityCode?: string;
  className?: string;
}

/**
 * API 수신 시간을 깔끔하게 "N분 후" 또는 "도착" 직관적 분 단위로 표출
 */
function formatRemainingTime(seconds: number): { primary: string; isImminent: boolean } {
  if (seconds <= 0) {
    return { primary: '도착', isImminent: true };
  }
  if (seconds < 60) {
    return { primary: '곧 도착', isImminent: true };
  }
  const mins = Math.floor(seconds / 60);
  return { primary: `${mins}분 후`, isImminent: mins <= 3 };
}

/**
 * 버스 노선 유형별 배지 스타일
 */
function getBusTypeStyle(busType: BusType) {
  switch (busType) {
    case 'express':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'circulation':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'limited':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'normal':
    default:
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  }
}

export const RealtimeArrivalCard: React.FC<RealtimeArrivalCardProps> = ({
  region,
  stationId,
  stationName = '정류소',
  cityCode,
  className,
}) => {
  const { data, isLoading, isError, isFetching, refetch, lastUpdated } =
    useRealtimeTransit({
      region,
      stationId,
      stationName,
      cityCode,
    });

  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (isFetching) {
      setIsSpinning(true);
      const timer = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isFetching]);

  const handleRefresh = () => {
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 600);
    refetch();
  };

  const formattedTimeAgo = useMemo(() => {
    if (!lastUpdated) return '방금 전';
    const diffSec = Math.floor((Date.now() - lastUpdated) / 1000);
    if (diffSec < 10) return '방금 전';
    if (diffSec < 60) return `${diffSec}초 전`;
    const diffMin = Math.floor(diffSec / 60);
    return `${diffMin}분 전`;
  }, [lastUpdated, isFetching]);

  const validArrivals = useMemo(() => {
    if (!data?.nextArrivals) return [];
    return data.nextArrivals.filter((bus) => bus.arrivedInSeconds > 0);
  }, [data]);

  return (
    <div
      className={clsx(
        'w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm transition-all hover:shadow-md',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <Bus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
              {data?.stationName || stationName}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              실시간 버스 도착 정보
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data && <ReliabilityBadge reliability={data.reliability} />}
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            title="새로고침"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={clsx('w-3.5 h-3.5', isSpinning && 'animate-spin-once')}
            />
          </button>
        </div>
      </div>

      {/* Body: Loading Skeleton */}
      {isLoading && (
        <div className="space-y-2.5 py-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Body: Error State */}
      {!isLoading && isError && (
        <div className="py-6 flex flex-col items-center justify-center text-center">
          <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
            도착 정보를 불러올 수 없습니다.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Body: Empty State */}
      {!isLoading && !isError && validArrivals.length === 0 && (
        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          현재 운행 중인 버스 도착 정보가 없습니다.
        </div>
      )}

      {/* Body: Arrival List */}
      {!isLoading && !isError && validArrivals.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {validArrivals.slice(0, 4).map((bus: ArrivalBusItem, idx: number) => {
              const { primary, isImminent } = formatRemainingTime(
                bus.arrivedInSeconds
              );
              return (
                <motion.div
                  key={`${bus.lineName}-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={clsx(
                        'px-2 py-1 text-xs font-bold rounded-lg border min-w-[44px] text-center',
                        getBusTypeStyle(bus.busType)
                      )}
                    >
                      {bus.lineName}
                    </span>
                    {bus.destination && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                        {bus.destination} 방향
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <div
                      className={clsx(
                        'text-xs font-semibold',
                        isImminent
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-900 dark:text-slate-100'
                      )}
                    >
                      {primary}
                    </div>
                    {bus.currentStationSequence !== undefined && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        {bus.currentStationSequence}번째 전
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formattedTimeAgo} 갱신됨 (15초 주기)</span>
        </div>
        {data?.mergedSources && data.mergedSources.length > 1 && (
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
            통합 데이터
          </span>
        )}
      </div>
    </div>
  );
};
