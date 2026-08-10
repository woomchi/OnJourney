'use client';

import React, { useState } from 'react';
import { useTransitSchedule } from '@/hooks/useTransitSchedule';
import { Clock, Train, Bus, ExternalLink, Calendar, AlertCircle, RefreshCw, ChevronRight, Footprints, Subtitles } from 'lucide-react';
import { FirstLegInfo, ParsedTrainItem, ParsedBusItem } from '@/lib/services/directions/transit/odsayResponseParser';

interface IntercityTransitScheduleWidgetProps {
  type: 'train' | 'bus';
  startStationID: string | number;
  endStationID: string | number;
  startStationName: string;
  endStationName: string;
  sx?: string | number;
  sy?: string | number;
  ex?: string | number;
  ey?: string | number;
  onClose?: () => void;
}

export const IntercityTransitScheduleWidget: React.FC<IntercityTransitScheduleWidgetProps> = ({
  type,
  startStationID,
  endStationID,
  startStationName,
  endStationName,
  sx,
  sy,
  ex,
  ey,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'fare'>('schedule');
  const [filterType, setFilterType] = useState<string>('ALL');

  const { data, isLoading, isError, error, refetch } = useTransitSchedule({
    type,
    startStationID,
    endStationID,
    startStationName,
    endStationName,
    sx,
    sy,
    ex,
    ey,
  });

  const firstLeg: FirstLegInfo | null = data?.firstLeg || null;
  const itemsList: (ParsedTrainItem | ParsedBusItem)[] = data?.items || [];

  // 기차 vs 버스 구분
  const isTrain = type === 'train';

  // 필터링된 운행 목록
  const filteredList = itemsList.filter((item: any) => {
    if (filterType === 'ALL') return true;
    if (isTrain) {
      const trainClass = item.trainClass || '';
      if (filterType === 'KTX_SRT') return trainClass.includes('KTX') || trainClass.includes('SRT');
      if (filterType === 'NORMAL') return !trainClass.includes('KTX') && !trainClass.includes('SRT');
    } else {
      // 버스
      const normalFare = item.normalFare || 0;
      const specialFare = item.specialFare || 0;
      if (filterType === 'PREMIUM') return specialFare > 0 || (item.busTypeLabel || '').includes('우등');
      if (filterType === 'GENERAL') return normalFare > 0;
    }
    return true;
  });

  // 예약 링크 (코레일/SRT/티머니GO)
  const getBookingLink = () => {
    if (isTrain) {
      return {
        korail: 'https://www.letskorail.com/',
        srt: 'https://etk.srail.kr/',
      };
    }
    return {
      tmoney: 'https://txbus.t-money.co.kr/',
      bustago: 'https://www.bustago.or.kr/',
    };
  };

  const bookingLinks = getBookingLink();

  return (
    <div className="w-full max-w-lg mx-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 transition-all">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">
            {isTrain ? <Train className="w-3.5 h-3.5" /> : <Bus className="w-3.5 h-3.5" />}
            <span>{isTrain ? '실시간 열차 운행 정보' : '고속/시외버스 운행 정보'}</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white bg-black/10 hover:bg-black/20 rounded-full p-1.5 transition"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-lg font-bold">
          <span className="truncate max-w-[40%]">{startStationName}</span>
          <ChevronRight className="w-5 h-5 text-white/70 flex-shrink-0" />
          <span className="truncate max-w-[40%] text-right">{endStationName}</span>
        </div>
      </div>

      {/* 출발지 ➔ 역 접속 수단 (First Leg) 헤더 카드 */}
      {firstLeg && (
        <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-100 dark:border-indigo-900/50 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              {firstLeg.type === 'walk' ? '🚶' : firstLeg.type === 'subway' ? '🚇' : '🚌'}
            </div>
            <div>
              <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                출발지 ➔ {startStationName} 접속 수단
              </div>
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                {firstLeg.typeLabel} · {firstLeg.details}
              </div>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 bg-white dark:bg-zinc-800 px-2 py-1 rounded-md shadow-2xs">
            1단계 접속
          </span>
        </div>
      )}

      {/* 탭 헤더 */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 mt-2">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition ${
            activeTab === 'schedule'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          🕒 운행 시간표 ({itemsList.length}편)
        </button>
        <button
          onClick={() => setActiveTab('fare')}
          className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition ${
            activeTab === 'fare'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-zinc-900'
              : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          💰 상세 요금표
        </button>
      </div>

      {/* 필터 칩 */}
      <div className="p-3 bg-zinc-100/60 dark:bg-zinc-800/30 flex items-center gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-3 py-1 rounded-full transition font-medium ${
            filterType === 'ALL'
              ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
              : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
          }`}
        >
          전체 보기
        </button>
        {isTrain ? (
          <>
            <button
              onClick={() => setFilterType('KTX_SRT')}
              className={`px-3 py-1 rounded-full transition font-medium ${
                filterType === 'KTX_SRT'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              KTX / SRT 만
            </button>
            <button
              onClick={() => setFilterType('NORMAL')}
              className={`px-3 py-1 rounded-full transition font-medium ${
                filterType === 'NORMAL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              일반열차 (ITX/무궁화)
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setFilterType('PREMIUM')}
              className={`px-3 py-1 rounded-full transition font-medium ${
                filterType === 'PREMIUM'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              우등/프리미엄
            </button>
            <button
              onClick={() => setFilterType('GENERAL')}
              className={`px-3 py-1 rounded-full transition font-medium ${
                filterType === 'GENERAL'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              일반 버스
            </button>
          </>
        )}
      </div>

      {/* 본문 콘텐츠 */}
      <div className="p-4 max-h-[360px] overflow-y-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-sm font-medium">실시간 운행 정보 및 접속 수단을 조회하고 있습니다...</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-10 text-red-500 gap-2">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm font-semibold">{error?.message || '운행 정보를 가져오지 못했습니다.'}</span>
            <button
              onClick={() => refetch()}
              className="mt-2 text-xs bg-red-50 text-red-600 dark:bg-red-950/30 px-3 py-1.5 rounded-md hover:bg-red-100 transition"
            >
              다시 시도
            </button>
          </div>
        )}

        {!isLoading && !isError && filteredList.length === 0 && (
          <div className="text-center py-10 text-zinc-500 text-sm">
            해당 조건의 운행 정보가 존재하지 않습니다.
          </div>
        )}

        {/* 1. 시간표 탭 */}
        {!isLoading && !isError && activeTab === 'schedule' && (
          <div className="space-y-3">
            {filteredList.map((item: any, idx: number) => {
              if (isTrain) {
                const isExpress = item.trainClass?.includes('KTX') || item.trainClass?.includes('SRT');
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-300 dark:hover:border-blue-700 transition shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-bold ${
                            isExpress
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {item.trainNumber || item.trainClass}
                        </span>
                        {item.runDay && (
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                            운행: {item.runDay}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-base font-bold text-zinc-900 dark:text-white">
                        <span>{item.departureTime}</span>
                        <span className="text-xs font-normal text-zinc-400">➔</span>
                        <span>{item.arrivalTime}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-end gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>소요 {item.wasteTime || '-'}</span>
                      </div>
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-1">
                        {item.fare?.general
                          ? `${Number(item.fare.general).toLocaleString()}원`
                          : '요금 표 참조'}
                      </div>
                    </div>
                  </div>
                );
              } else {
                // 버스 시간표
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700 transition shadow-xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                        {item.busTypeLabel || '시외버스'} ({item.startTerminal || startStationName} ➔ {item.destTerminal || endStationName})
                      </span>
                      <div className="text-xs text-zinc-500 flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>소요 {item.wasteTime || '-'}</span>
                      </div>
                    </div>

                    {item.schedule && (
                      <div className="mt-2 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-lg leading-relaxed">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                          주요 운행 시간표
                        </div>
                        <p className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                          {item.schedule}
                        </p>
                      </div>
                    )}

                    {item.nightSchedule && (
                      <div className="mt-1.5 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 p-2 rounded-lg">
                        <span className="font-semibold">🌙 심야 운행:</span> {item.nightSchedule}
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        )}

        {/* 2. 상세 요금표 탭 */}
        {!isLoading && !isError && activeTab === 'fare' && (
          <div className="space-y-3">
            {filteredList.map((item: any, idx: number) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs"
              >
                {isTrain ? (
                  <>
                    <div className="font-bold text-sm text-zinc-800 dark:text-zinc-100 mb-2 flex items-center justify-between">
                      <span>{item.trainNumber || item.trainClass}</span>
                      <span className="text-xs text-zinc-500 font-normal">운행일: {item.runDay || '-'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">일반실</div>
                        <div className="font-bold text-blue-700 dark:text-blue-300">
                          {item.fare?.general ? `${Number(item.fare.general).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">특실</div>
                        <div className="font-bold text-purple-700 dark:text-purple-300">
                          {item.fare?.special ? `${Number(item.fare.special).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                      <div className="bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">입석/자유석</div>
                        <div className="font-bold text-zinc-700 dark:text-zinc-300">
                          {item.fare?.standing ? `${Number(item.fare.standing).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-sm text-zinc-800 dark:text-zinc-100 mb-2">
                      버스 등급별 요금 정보 ({item.busTypeLabel || '시외버스'})
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">일반 버스</div>
                        <div className="font-bold text-indigo-700 dark:text-indigo-300">
                          {item.normalFare ? `${Number(item.normalFare).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">우등 버스</div>
                        <div className="font-bold text-emerald-700 dark:text-emerald-300">
                          {item.specialFare ? `${Number(item.specialFare).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">심야 일반</div>
                        <div className="font-bold text-purple-700 dark:text-purple-300">
                          {item.nightFare ? `${Number(item.nightFare).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg">
                        <div className="text-zinc-500 dark:text-zinc-400 text-[11px] mb-1 font-medium">심야 우등</div>
                        <div className="font-bold text-rose-700 dark:text-rose-300">
                          {item.nightSpecialFare ? `${Number(item.nightSpecialFare).toLocaleString()}원` : '-'}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 아웃링크 및 하단 푸터 */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/80 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 font-medium">
          <Calendar className="w-3.5 h-3.5" />
          실시간 공시 시간표 기준
        </span>

        <div className="flex items-center gap-2">
          {isTrain ? (
            <>
              <a
                href={bookingLinks.korail}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <span>코레일 예매</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={bookingLinks.srt}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline bg-purple-50 dark:bg-purple-950/50 px-2.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800"
              >
                <span>SRT 예매</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </>
          ) : (
            <a
              href={bookingLinks.tmoney}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800"
            >
              <span>티머니GO 예매</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
