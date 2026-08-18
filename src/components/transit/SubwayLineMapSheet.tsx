'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RefreshCw, Train, ArrowDown, ArrowUp, Navigation } from 'lucide-react';
import { clsx } from 'clsx';
import { useSubwayLinePositions } from '@/hooks/useSubwayLinePositions';
import { SubwayPosition, SubwayLineStation } from '@/types/journey';

export interface SubwayLineMapSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stationName: string;      // 탑승역명
  subwayId?: string;        // 노선 ID (예: '1002')
  subwayNm?: string;        // 노선명 (예: '2호선')
  wayCode?: string;         // '1': 상행/내선, '2': 하행/외선
  targetTrainNo?: string;   // 포커스할 열차번호
  targetMinutesLeft?: number;
  targetStatusText?: string;
}

// ─── 호선별 테마 색상 정의 ───────────────────────────────────────────────────

interface SubwayColorTheme {
  bg: string;
  text: string;
  border: string;
  line: string;
  badgeBg: string;
  badgeText: string;
  lightBg: string;
}

function getSubwayLineTheme(subwayNmOrId: string): SubwayColorTheme {
  const clean = String(subwayNmOrId || '').trim();

  if (clean === '1001' || clean === '1' || clean.includes('1호선')) {
    return {
      bg: 'bg-[#0052A4]',
      text: 'text-[#0052A4]',
      border: 'border-[#0052A4]',
      line: 'bg-[#0052A4]',
      badgeBg: 'bg-[#0052A4]',
      badgeText: 'text-white',
      lightBg: 'bg-[#0052A4]/10',
    };
  }
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) {
    return {
      bg: 'bg-[#00A84D]',
      text: 'text-[#00A84D]',
      border: 'border-[#00A84D]',
      line: 'bg-[#00A84D]',
      badgeBg: 'bg-[#00A84D]',
      badgeText: 'text-white',
      lightBg: 'bg-[#00A84D]/10',
    };
  }
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) {
    return {
      bg: 'bg-[#EF7C1C]',
      text: 'text-[#EF7C1C]',
      border: 'border-[#EF7C1C]',
      line: 'bg-[#EF7C1C]',
      badgeBg: 'bg-[#EF7C1C]',
      badgeText: 'text-white',
      lightBg: 'bg-[#EF7C1C]/10',
    };
  }
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) {
    return {
      bg: 'bg-[#00A5DE]',
      text: 'text-[#00A5DE]',
      border: 'border-[#00A5DE]',
      line: 'bg-[#00A5DE]',
      badgeBg: 'bg-[#00A5DE]',
      badgeText: 'text-white',
      lightBg: 'bg-[#00A5DE]/10',
    };
  }
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) {
    return {
      bg: 'bg-[#996CAC]',
      text: 'text-[#996CAC]',
      border: 'border-[#996CAC]',
      line: 'bg-[#996CAC]',
      badgeBg: 'bg-[#996CAC]',
      badgeText: 'text-white',
      lightBg: 'bg-[#996CAC]/10',
    };
  }
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) {
    return {
      bg: 'bg-[#CD7C2F]',
      text: 'text-[#CD7C2F]',
      border: 'border-[#CD7C2F]',
      line: 'bg-[#CD7C2F]',
      badgeBg: 'bg-[#CD7C2F]',
      badgeText: 'text-white',
      lightBg: 'bg-[#CD7C2F]/10',
    };
  }
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) {
    return {
      bg: 'bg-[#747F00]',
      text: 'text-[#747F00]',
      border: 'border-[#747F00]',
      line: 'bg-[#747F00]',
      badgeBg: 'bg-[#747F00]',
      badgeText: 'text-white',
      lightBg: 'bg-[#747F00]/10',
    };
  }
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) {
    return {
      bg: 'bg-[#EA545D]',
      text: 'text-[#EA545D]',
      border: 'border-[#EA545D]',
      line: 'bg-[#EA545D]',
      badgeBg: 'bg-[#EA545D]',
      badgeText: 'text-white',
      lightBg: 'bg-[#EA545D]/10',
    };
  }
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) {
    return {
      bg: 'bg-[#BDB092]',
      text: 'text-[#8C7B58]',
      border: 'border-[#BDB092]',
      line: 'bg-[#BDB092]',
      badgeBg: 'bg-[#BDB092]',
      badgeText: 'text-white',
      lightBg: 'bg-[#BDB092]/15',
    };
  }
  if (clean.includes('수인분당') || clean.includes('분당선')) {
    return {
      bg: 'bg-[#F5A200]',
      text: 'text-[#D88D00]',
      border: 'border-[#F5A200]',
      line: 'bg-[#F5A200]',
      badgeBg: 'bg-[#F5A200]',
      badgeText: 'text-white',
      lightBg: 'bg-[#F5A200]/15',
    };
  }
  if (clean.includes('신분당')) {
    return {
      bg: 'bg-[#D4003B]',
      text: 'text-[#D4003B]',
      border: 'border-[#D4003B]',
      line: 'bg-[#D4003B]',
      badgeBg: 'bg-[#D4003B]',
      badgeText: 'text-white',
      lightBg: 'bg-[#D4003B]/10',
    };
  }
  if (clean.includes('경의중앙')) {
    return {
      bg: 'bg-[#77C4A3]',
      text: 'text-[#4EA680]',
      border: 'border-[#77C4A3]',
      line: 'bg-[#77C4A3]',
      badgeBg: 'bg-[#77C4A3]',
      badgeText: 'text-white',
      lightBg: 'bg-[#77C4A3]/15',
    };
  }
  if (clean.includes('공항철도')) {
    return {
      bg: 'bg-[#0090D2]',
      text: 'text-[#0090D2]',
      border: 'border-[#0090D2]',
      line: 'bg-[#0090D2]',
      badgeBg: 'bg-[#0090D2]',
      badgeText: 'text-white',
      lightBg: 'bg-[#0090D2]/10',
    };
  }

  return {
    bg: 'bg-blue-600',
    text: 'text-blue-600',
    border: 'border-blue-600',
    line: 'bg-blue-600',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    lightBg: 'bg-blue-50',
  };
}

/** 열차 운행 상태 뱃지 렌더러 */
function getTrainStatusBadge(trainSttus: string) {
  switch (trainSttus) {
    case '0':
      return { text: '진입', color: 'bg-amber-500 text-white' };
    case '1':
      return { text: '도착', color: 'bg-emerald-600 text-white' };
    case '2':
      return { text: '출발', color: 'bg-blue-600 text-white' };
    case '3':
      return { text: '전역출발', color: 'bg-indigo-500 text-white' };
    default:
      return { text: '운행중', color: 'bg-zinc-600 text-white' };
  }
}

export const SubwayLineMapSheet: React.FC<SubwayLineMapSheetProps> = ({
  isOpen,
  onClose,
  stationName,
  subwayId,
  subwayNm,
  wayCode = '1',
  targetTrainNo,
  targetMinutesLeft,
  targetStatusText,
}) => {
  const cleanTargetStation = stationName ? stationName.replace(/역$/, '').trim() : '';

  // 현재 방향 탭: '0' (상행/내선), '1' (하행/외선)
  // wayCode가 '1'이면 상행('0'), '2'이면 하행('1')
  const initialDirection = wayCode === '2' ? '1' : '0';
  const [selectedDirection, setSelectedDirection] = useState<'0' | '1'>(initialDirection);

  useEffect(() => {
    if (isOpen) {
      setSelectedDirection(wayCode === '2' ? '1' : '0');
    }
  }, [isOpen, wayCode]);

  const lineTarget = subwayNm || subwayId || '2호선';
  const theme = useMemo(() => getSubwayLineTheme(lineTarget), [lineTarget]);

  const { data, isLoading, isFetching, refetch } = useSubwayLinePositions({
    subwayId,
    subwayNm,
    enabled: isOpen,
    refetchInterval: 30000,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const targetStationNodeRef = useRef<HTMLDivElement>(null);

  // 방향별 라벨 산출 (예: 2호선은 내선/외선, 기타는 상행/하행)
  const isLine2 = lineTarget === '1002' || lineTarget === '2' || lineTarget.includes('2호선');
  const upLabel = isLine2 ? '내선 순환' : '상행';
  const downLabel = isLine2 ? '외선 순환' : '하행';

  // 정차역 목록 (진행 방향에 맞춰 순서 정렬)
  // - 일반 노선: 기본 DB는 하행(인천/신창 방면) 순서이므로 상행('0')일 때 반전(reverse)
  // - 2호선: 기본 DB는 내선순환(시계방향) 순서이므로 외선순환('1')일 때 반전(reverse)
  const orderedStations = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) return [];
    const stationsCopy = [...data.stations];

    const shouldReverse = isLine2 ? selectedDirection === '1' : selectedDirection === '0';
    return shouldReverse ? stationsCopy.reverse() : stationsCopy;
  }, [data?.stations, selectedDirection, isLine2]);

  // 역별 실시간 열차 위치 맵 (stationName -> SubwayPosition[])
  const stationTrainsMap = useMemo(() => {
    const map = new Map<string, SubwayPosition[]>();
    if (!data?.positions) return map;

    const seenTrainNos = new Set<string>();

    for (const pos of data.positions) {
      // 선택된 방향과 일치하는 열차만 포함
      if (pos.updnLine !== selectedDirection) continue;
      if (!pos.trainNo || seenTrainNos.has(pos.trainNo)) continue;

      seenTrainNos.add(pos.trainNo);
      const cleanStatn = pos.statnNm.replace(/역$/, '').trim();
      const list = map.get(cleanStatn) || [];
      list.push(pos);
      map.set(cleanStatn, list);
    }

    return map;
  }, [data?.positions, selectedDirection]);

  // 열차 번호 기준 타겟 열차 매칭
  const cleanTargetTrainNo = targetTrainNo ? targetTrainNo.trim().replace(/^0+/, '') : '';

  // 열리면 탑승역으로 자동 스크롤
  useEffect(() => {
    if (isOpen && targetStationNodeRef.current && scrollContainerRef.current) {
      const timer = setTimeout(() => {
        targetStationNodeRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, orderedStations]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const displayLineName = data?.subwayNm || subwayNm || (subwayId ? `${subwayId}호선` : '지하철 노선');

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        />

        {/* Modal / Sheet Container */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex flex-col border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-bold shadow-2xs',
                    theme.badgeBg,
                    theme.badgeText
                  )}
                >
                  {displayLineName}
                </span>
                <div className="flex flex-col">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <span>{cleanTargetStation}역</span>
                    <span className="text-xs font-normal text-zinc-500">실시간 노선도</span>
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  title="실시간 위치 새로고침"
                  className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Direction Tabs */}
            <div className="flex px-5 pb-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedDirection('0')}
                className={clsx(
                  'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all',
                  selectedDirection === '0'
                    ? clsx(theme.lightBg, theme.text, 'border', theme.border, 'shadow-2xs font-bold')
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 hover:bg-zinc-200/60'
                )}
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>{upLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDirection('1')}
                className={clsx(
                  'flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all',
                  selectedDirection === '1'
                    ? clsx(theme.lightBg, theme.text, 'border', theme.border, 'shadow-2xs font-bold')
                    : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 hover:bg-zinc-200/60'
                )}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>{downLabel}</span>
              </button>
            </div>
          </div>

          {/* Body: Stations Line Timeline */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-5 py-4 space-y-0.5 relative"
          >
            {isLoading && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
                <p className="text-xs text-zinc-500">실시간 노선도 및 열차 위치 확인 중...</p>
              </div>
            )}

            {!isLoading && orderedStations.length === 0 && (
              <div className="py-12 text-center text-xs text-zinc-500">
                정차역 정보를 불러올 수 없습니다.
              </div>
            )}

            {!isLoading && orderedStations.length > 0 && (
              <div className="relative pl-6 py-2">
                {/* Central Line Track */}
                <div
                  className={clsx(
                    'absolute left-[35px] top-4 bottom-4 w-1.5 rounded-full',
                    theme.line,
                    'opacity-80'
                  )}
                />

                {/* Stations List */}
                {orderedStations.map((station: SubwayLineStation, idx: number) => {
                  const isTargetStation =
                    station.stationName.replace(/역$/, '').trim() === cleanTargetStation;
                  const trainsAtStation = stationTrainsMap.get(
                    station.stationName.replace(/역$/, '').trim()
                  ) || [];

                  return (
                    <div
                      key={`${station.stationName}-${idx}`}
                      ref={isTargetStation ? targetStationNodeRef : undefined}
                      className={clsx(
                        'relative flex items-center justify-between py-2.5 px-3 rounded-2xl transition-all',
                        isTargetStation
                          ? 'bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 shadow-xs my-1'
                          : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                      )}
                    >
                      {/* Left: Station Node & Name */}
                      <div className="flex items-center gap-3 relative z-10">
                        {/* Dot Node */}
                        <div
                          className={clsx(
                            'w-5 h-5 rounded-full flex items-center justify-center border-2 bg-white dark:bg-zinc-900 transition-all shadow-2xs',
                            isTargetStation
                              ? clsx('border-blue-600 scale-110 ring-4 ring-blue-500/20')
                              : theme.border
                          )}
                        >
                          <div
                            className={clsx(
                              'w-2 h-2 rounded-full',
                              isTargetStation ? 'bg-blue-600' : theme.bg
                            )}
                          />
                        </div>

                        {/* Station Name & Tag */}
                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              'text-sm transition-all',
                              isTargetStation
                                ? 'font-extrabold text-blue-700 dark:text-blue-400 text-[15px]'
                                : 'font-medium text-zinc-800 dark:text-zinc-200'
                            )}
                          >
                            {station.stationName}
                          </span>

                          {isTargetStation && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold shadow-2xs animate-pulse">
                              <Navigation className="w-2.5 h-2.5 fill-current" />
                              탑승역
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Trains at this Station */}
                      <div className="flex flex-col items-end gap-1 z-10">
                        {trainsAtStation.map((train, trainIdx) => {
                          const cleanNo = train.trainNo.replace(/^0+/, '');
                          const isTargetTrain =
                            cleanTargetTrainNo && (cleanNo === cleanTargetTrainNo || train.trainNo === targetTrainNo);
                          const statusBadge = getTrainStatusBadge(train.trainSttus);

                          return (
                            <div
                              key={`${train.trainNo}-${trainIdx}`}
                              className={clsx(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs shadow-2xs border transition-all',
                                isTargetTrain
                                  ? 'bg-rose-500 text-white border-rose-600 font-bold scale-105 ring-2 ring-rose-300'
                                  : train.isExpress
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300'
                                  : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'
                              )}
                            >
                              <Train className="w-3.5 h-3.5 shrink-0" />
                              <span className="tabular-nums font-semibold">
                                #{train.trainNo}
                              </span>

                              {train.isExpress && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-rose-600 text-white">
                                  급행
                                </span>
                              )}

                              <span
                                className={clsx(
                                  'px-1.5 py-0.2 rounded text-[9px] font-bold',
                                  isTargetTrain ? 'bg-white text-rose-600' : statusBadge.color
                                )}
                              >
                                {statusBadge.text}
                              </span>

                              {isTargetTrain && targetMinutesLeft !== undefined && targetMinutesLeft > 0 && (
                                <span className="text-[10px] underline font-extrabold ml-0.5">
                                  {targetMinutesLeft}분 후
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>실시간 운행 정보 (15초 주기 갱신)</span>
            </div>
            {targetStatusText && (
              <span className="font-semibold text-blue-600 dark:text-blue-400">
                {targetStatusText}
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

