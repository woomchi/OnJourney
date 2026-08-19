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
  busId?: string;
  odsayBusId?: string;
  tagoRouteId?: string;
  destination?: string;
  headsign?: string;
  intervalTime?: number;
  startDateTime?: string;
  busType?: any;
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

function getBusStationCountText(bus: ArrivalBusItem, liveStationCount?: number): string {
  // 1. 💡 [최우선] 노선도를 켰을 때 실제 버스 위치(GPS/노선 순번)로 계산된 liveStationCount가 있으면 최우선 표시
  if (typeof liveStationCount === 'number') {
    if (liveStationCount > 0) return `${liveStationCount}전`;
    if (liveStationCount === 0) return '진입';
  }

  // 2. API에서 직접 반환된 정류소 수(currentStationSequence)가 유효한 경우
  if (typeof bus.currentStationSequence === 'number') {
    if (bus.currentStationSequence > 0) return `${bus.currentStationSequence}전`;
    // 20분 등 장시간 소요 시 API가 0을 반환하더라도 '진입'으로 잘못 뜨지 않도록 방어 (2분 이하일 때만 진입)
    if (bus.currentStationSequence === 0 && bus.arrivedInSeconds <= 120) return '진입';
  }

  // 3. 60초 이하 도착 임박
  if (bus.arrivedInSeconds <= 60) {
    return '곧도착';
  }

  // 4. 차고지/기점/종점 출발 대기 상태이거나 10분 이상 소요되는 경우
  if (bus.isWaiting || bus.arrivedInSeconds >= 600) {
    return '대기';
  }

  return '대기';
}

function checkIsFutureDeparture(storeDepartureTime?: number | null, startDateTime?: string): boolean {
  const nowMs = Date.now();
  // 1. 유저가 UI에서 설정한 출발 시각(departureTime)이 있는 경우 최우선 판별
  if (storeDepartureTime && typeof storeDepartureTime === 'number') {
    const diffMinutes = (storeDepartureTime - nowMs) / (1000 * 60);
    // 현재 시점 대비 30분 이상 미래인 경우에만 미래/예정 모드
    // ⚠️ 과거 시각이라도 isFuture로 처리하지 않음 (경로가 오래 됐어도 실시간 표시)
    if (diffMinutes > 30) return true;
  }

  // 2. 길찾기 결과의 startDateTime 판별
  if (startDateTime && startDateTime.length >= 12) {
    try {
      const year = parseInt(startDateTime.slice(0, 4), 10);
      const month = parseInt(startDateTime.slice(4, 6), 10) - 1;
      const day = parseInt(startDateTime.slice(6, 8), 10);
      const hour = parseInt(startDateTime.slice(8, 10), 10);
      const min = parseInt(startDateTime.slice(10, 12), 10);
      const departureDate = new Date(year, month, day, hour, min);
      if (isNaN(departureDate.getTime())) return false;
      const diffMinutes = (departureDate.getTime() - nowMs) / (1000 * 60);
      // 30분 초과 미래인 경우에만 미래 모드 (과거 시각은 실시간 모드 유지)
      if (diffMinutes > 30) return true;
    } catch {
      // ignore
    }
  }

  return false;
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
  busId,
  odsayBusId,
  tagoRouteId,
  destination,
  headsign,
  intervalTime,
  startDateTime,
  busType,
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
  const storeDepartureTime = useJourneyStore((state) => state.departureTime);
  const busLiveStationsAwayMap = useJourneyStore((state) => state.busLiveStationsAwayMap);
  const cleanTargetStation = useMemo(
    () => (stationName ? stationName.replace(/정류소$|정류장$|역$/, '').trim().toUpperCase() : ''),
    [stationName]
  );

  const liveStationCount = useMemo(() => {
    if (!cleanBusNo || !busLiveStationsAwayMap) return undefined;
    const cleanNo = cleanBusNo.toUpperCase();
    if (stationId) {
      const byId = busLiveStationsAwayMap[`bus:${cleanNo}:${stationId}`];
      if (byId && Date.now() - byId.updatedAt < 180000) return byId.stationsAway;
    }
    if (cleanTargetStation) {
      const byName = busLiveStationsAwayMap[`bus:${cleanNo}:${cleanTargetStation}`];
      if (byName && Date.now() - byName.updatedAt < 180000) return byName.stationsAway;
    }
    return undefined;
  }, [busLiveStationsAwayMap, cleanBusNo, stationId, cleanTargetStation]);

  const isFuture = useMemo(
    () => checkIsFutureDeparture(storeDepartureTime, startDateTime),
    [storeDepartureTime, startDateTime]
  );
  const setBusLineMapTarget = useJourneyStore((state) => state.setBusLineMapTarget);

  const { data, isLoading: isQueryLoading, isError, isFetching, refetch } = useRealtimeTransit({
    region: region || 'tago',
    stationId: String(stationId || ''),
    stationName,
    cityCode,
    destination,
    headsign,
    lat,
    lng,
    enabled: Boolean(stationId && cleanBusNo && !isFuture),
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
      destination: destination || targetBus?.destination,
      headsign: headsign,
      busNo: cleanBusNo,
      busId: busId,
      odsayBusId: odsayBusId || (busId && busId.length <= 6 ? busId : undefined),
      tagoRouteId: tagoRouteId || (targetBus?.lineId && targetBus.lineId.length > 6 ? targetBus.lineId : undefined),
      routeId: tagoRouteId || targetBus?.lineId,
      busColor,
      busType: busType || targetBus?.busType,
      busCityCode: cityCode,
      region,
      targetVehicleNo: targetBus?.vehicleId ? String(targetBus.vehicleId) : undefined,
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

    // 1단계: cleanBusNumber 및 원본 노선명 완전 일치 탐색 (Strict Match)
    let matches = validArrivals.filter((item) => {
      const lineClean = cleanBusNumber(item.lineName);
      if (lineClean === targetClean) return true;

      const rawLineClean = String(item.lineName || '').replace(/\s+/g, '').toUpperCase();
      const rawTargetClean = String(busNo || '').replace(/\s+/g, '').toUpperCase();
      if (rawLineClean === rawTargetClean) return true;
      if (rawLineClean.replace(/번$/, '') === rawTargetClean.replace(/번$/, '')) return true;

      // 급행/지선/간선/외곽/마을/특구/첨단 등 접두사 유연 매칭 (예: "급행1" vs "1", "특구1" vs "1", "외곽20" vs "20")
      const lineWithoutPrefix = rawLineClean.replace(/^(급행|간선|지선|외곽|마을|특구|첨단|순환|좌석|직행|BRT)/, '').replace(/번$/, '');
      const targetWithoutPrefix = rawTargetClean.replace(/^(급행|간선|지선|외곽|마을|특구|첨단|순환|좌석|직행|BRT)/, '').replace(/번$/, '');
      if (lineWithoutPrefix && lineWithoutPrefix === targetWithoutPrefix) return true;

      return false;
    });

    // 2단계: 분기 노선(예: 5002 -> 5002A, 5002B) 또는 숫자/영문 정규화 매칭
    if (matches.length === 0) {
      matches = validArrivals.filter((item) => {
        const lineClean = cleanBusNumber(item.lineName);
        // 5002 vs 5002A, 5002B 등 영문 분기 노선 매칭 (10 vs 100 오매칭은 차단)
        const isBranchMatch =
          lineClean.startsWith(targetClean) &&
          /^[A-Z]$/.test(lineClean.slice(targetClean.length));
        if (isBranchMatch) return true;

        const numOnlyTarget = targetClean.replace(/[^0-9]/g, '');
        const numOnlyLine = lineClean.replace(/[^0-9]/g, '');
        if (numOnlyTarget && numOnlyLine && numOnlyTarget === numOnlyLine) {
          return true;
        }

        return (
          lineClean.replace(/[^0-9a-zA-Z]/g, '') === targetClean.replace(/[^0-9a-zA-Z]/g, '')
        );
      });
    }

    const rawTargetDir = (destination || headsign || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
    // 만약 targetDir가 버스 번호 자체(예: "101", "101번", cleanBusNo)인 경우 방면 필터링에서 제외하여 불필요한 왜곡 방지
    const targetDir =
      rawTargetDir &&
      rawTargetDir !== targetClean.toLowerCase() &&
      rawTargetDir !== `${targetClean.toLowerCase()}번` &&
      !rawTargetDir.endsWith('번')
        ? rawTargetDir
        : '';

    return matches.sort((a, b) => {
      if (targetDir) {
        const aDest = (a.destination || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        const bDest = (b.destination || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        const aMatch = aDest && (aDest.includes(targetDir) || targetDir.includes(aDest));
        const bMatch = bDest && (bDest.includes(targetDir) || targetDir.includes(bDest));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
      }
      return a.arrivedInSeconds - b.arrivedInSeconds;
    });
  }, [data, cleanBusNo, destination, headsign, busNo]);

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
          'inline-flex items-center justify-center w-[70px] min-w-[70px] h-[20px] min-h-[20px] max-h-[20px] gap-1 px-2 py-0.5 rounded-full bg-white text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 text-[10px] transition-all',
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

  // 0. 미래 출발 시각: 배차 간격 안내 단일 뱃지 중앙 정렬 노출
  if (isFuture) {
    const intervalLabel = intervalTime ? `배차 ${intervalTime}분` : '배차 운행';
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]">
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div
            onClick={(e) => handleOpenBusLineMap(e)}
            title="버스 실시간 노선도 보기"
            className="inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-zinc-50/90 border border-zinc-200/90 shadow-2xs text-zinc-600 font-medium shrink-0 text-[10px] cursor-pointer hover:border-blue-300 hover:bg-zinc-100 transition-all active:scale-95"
          >
            <span className="font-semibold text-zinc-700">{intervalLabel}</span>
            <span className="text-zinc-400 text-[9px]">노선도</span>
          </div>
        </div>
      </div>
    );
  }

  const isAnyLoading = isQueryLoading || isFetching || isRefreshLoading;
  const hasData = targetBuses.length > 0;

  // 1. 로딩 상태: 단일 펄스 스켈레톤 중앙 정렬
  if (isAnyLoading && !hasData && (!data || isQueryLoading || isFetching)) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]">
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div className="inline-flex items-center justify-center w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-400 font-medium shrink-0 animate-pulse text-[10px]">
            <span>확인 중...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. 에러 또는 데이터 없음: 1개의 '도착 정보 없음' 슬롯 중앙 정렬
  if (!hasData || isError) {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]">
        {!hideRefreshButton && renderRefreshButton()}
        <div className="inline-flex flex-col justify-center h-[42px] min-h-[42px]">
          <div
            onClick={(e) => handleOpenBusLineMap(e)}
            title="버스 실시간 노선도 보기"
            className="inline-flex items-center justify-center w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs text-zinc-500 font-semibold shrink-0 text-[10px] hover:border-blue-300 cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>도착 정보 없음</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0 text-xs h-[42px] min-h-[42px]">
      {!hideRefreshButton && renderRefreshButton()}
      <div
        title="버스 실시간 노선도 보기"
        className="inline-flex flex-col gap-0.5 justify-center h-[42px] min-h-[42px]"
      >
        {targetBuses.slice(0, 2).map((bus, idx) => {
          const isFirst = idx === 0;
          const timeText = formatBusItemTime(bus.arrivedInSeconds);
          const stationText = getBusStationCountText(bus, isFirst ? liveStationCount : undefined);
          const statusBadge = renderSeatOrCrowdedBadge(bus, isFirst);

          return (
            <div
              key={`${bus.lineId || bus.lineName}-${bus.vehicleId || idx}`}
              onClick={(e) => handleOpenBusLineMap(e, bus)}
              className={clsx(
                'inline-flex items-center justify-between w-[148px] min-w-[148px] h-[20px] min-h-[20px] max-h-[20px] px-2 py-0.5 rounded-full shadow-2xs text-[10px] whitespace-nowrap transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
                isFirst
                  ? 'bg-white border border-blue-200 text-blue-600 hover:border-blue-400 hover:shadow-xs'
                  : 'bg-zinc-50/80 border border-zinc-200/90 text-zinc-600 hover:border-zinc-300 hover:shadow-xs'
              )}
            >
              {/* 1. 잔여 시간 */}
              <span
                className={clsx(
                  'w-[40px] shrink-0 tabular-nums font-semibold text-left truncate',
                  isFirst ? 'text-blue-600' : 'text-zinc-700'
                )}
              >
                {timeText}
              </span>

              {/* 2. 남은 정거장 수 */}
              <span
                className={clsx(
                  'w-[32px] shrink-0 tabular-nums text-center truncate',
                  isFirst ? 'font-medium text-zinc-500' : 'font-normal text-zinc-400'
                )}
              >
                {stationText}
              </span>

              {/* 3. 여석 / 혼잡도 */}
              <span className="w-[44px] shrink-0 text-right truncate flex justify-end">
                {statusBadge}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

