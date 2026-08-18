'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, X, RefreshCw, Bus, ArrowDown, ArrowUp, Navigation } from 'lucide-react';
import { clsx } from 'clsx';
import { useBusLinePositions } from '@/hooks/useBusLinePositions';
import { CustomBottomSheet } from '@/components/common/CustomBottomSheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { BusPosition, BusLineStation, BusLineMapTarget } from '@/types/journey';

export interface BusLineMapPanelProps {
  isOpen: boolean;
  target: BusLineMapTarget;
  onClose: () => void;
  onExited?: () => void;
}

// ─── 버스 브랜드 테마 색상 정의 ─────────────────────────────────────────────

interface BusColorTheme {
  primary: string;
  badgeBg: string;
  badgeText: string;
  line: string;
  dot: string;
  activeTabBg: string;
  lightBg: string;
  speechBubbleActiveBg: string;
  speechBubbleActiveBorder: string;
  speechBubbleActiveText: string;
}

function getBusLineTheme(busType?: string, customColor?: string): BusColorTheme {
  if (customColor && customColor.startsWith('#')) {
    return {
      primary: customColor,
      badgeBg: 'bg-zinc-800 text-white',
      badgeText: 'text-white',
      line: 'bg-blue-600',
      dot: 'border-blue-600',
      activeTabBg: 'bg-blue-600 text-white',
      lightBg: 'bg-blue-50',
      speechBubbleActiveBg: 'bg-blue-600',
      speechBubbleActiveBorder: 'border-blue-700',
      speechBubbleActiveText: 'text-white',
    };
  }

  const type = String(busType || '').toLowerCase();

  // 광역 / 직행좌석 / 급행 (빨강)
  if (
    type.includes('광역') ||
    type.includes('직행') ||
    type.includes('express') ||
    type.includes('좌석') ||
    type === '3' ||
    type === '4'
  ) {
    return {
      primary: '#DC2626',
      badgeBg: 'bg-red-600',
      badgeText: 'text-white',
      line: 'bg-red-600',
      dot: 'border-red-600',
      activeTabBg: 'bg-red-600 text-white',
      lightBg: 'bg-red-50',
      speechBubbleActiveBg: 'bg-red-600',
      speechBubbleActiveBorder: 'border-red-700',
      speechBubbleActiveText: 'text-white',
    };
  }

  // 지선 / 일반 (초록)
  if (type.includes('지선') || type.includes('일반') || type === '2' || type === '12') {
    return {
      primary: '#16A34A',
      badgeBg: 'bg-emerald-600',
      badgeText: 'text-white',
      line: 'bg-emerald-600',
      dot: 'border-emerald-600',
      activeTabBg: 'bg-emerald-600 text-white',
      lightBg: 'bg-emerald-50',
      speechBubbleActiveBg: 'bg-emerald-600',
      speechBubbleActiveBorder: 'border-emerald-700',
      speechBubbleActiveText: 'text-white',
    };
  }

  // 마을 / 순환 (노랑/주황)
  if (
    type.includes('마을') ||
    type.includes('순환') ||
    type.includes('circulation') ||
    type === '5' ||
    type === '14'
  ) {
    return {
      primary: '#D97706',
      badgeBg: 'bg-amber-500',
      badgeText: 'text-white',
      line: 'bg-amber-500',
      dot: 'border-amber-500',
      activeTabBg: 'bg-amber-500 text-white',
      lightBg: 'bg-amber-50',
      speechBubbleActiveBg: 'bg-amber-500',
      speechBubbleActiveBorder: 'border-amber-600',
      speechBubbleActiveText: 'text-white',
    };
  }

  // 간선 (파랑 - 기본값)
  return {
    primary: '#2563EB',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    line: 'bg-blue-600',
    dot: 'border-blue-600',
    activeTabBg: 'bg-blue-600 text-white',
    lightBg: 'bg-blue-50',
    speechBubbleActiveBg: 'bg-blue-600',
    speechBubbleActiveBorder: 'border-blue-700',
    speechBubbleActiveText: 'text-white',
  };
}

/** 버스 4분위 운행 상태 배지 렌더러 */
function getBusStatusBadge(stage?: string) {
  switch (stage) {
    case 'departed':
      return { text: '출발', color: 'bg-indigo-600 text-white border-indigo-700' };
    case 'approaching':
      return { text: '진입', color: 'bg-amber-500 text-white border-amber-600' };
    case 'at_station':
      return { text: '도착', color: 'bg-emerald-600 text-white border-emerald-700' };
    case 'at_prev_station':
      return { text: '정차', color: 'bg-zinc-600 text-white border-zinc-700' };
    default:
      return { text: '운행중', color: 'bg-blue-600 text-white border-blue-700' };
  }
}

/** 정류소 명칭 정규화 헬퍼 (공백, 특수문자, 정류소/역 접미사 제거) */
function normalizeStationName(name?: string): string {
  if (!name) return '';
  return name
    .replace(/정류소$|정류장$|역$/, '')
    .replace(/[\s\.\(\)\[\]\-_,\/·]/g, '')
    .trim()
    .toLowerCase();
}

/** 정류소 명칭에서 핵심 키워드 토큰 분리 (예: "기흥역 수인분당선" -> ["기흥", "수인분당"]) */
function extractStationTokens(name?: string): string[] {
  if (!name) return [];
  const clean = name
    .replace(/정류소$|정류장$|역$/, '')
    .replace(/[\.\(\)\[\]\-_,\/·]/g, ' ')
    .trim();
  return clean
    .split(/\s+/)
    .map((t) => t.replace(/역$|선$/, '').trim())
    .filter((t) => t.length >= 2);
}

/** 대상 탑승 정류소 일치 여부 정밀 다단계 판별 */
function isTargetStationMatch(
  station: BusLineStation,
  targetStationId?: string,
  rawTargetStationName?: string
): boolean {
  if (!rawTargetStationName && !targetStationId) return false;

  // Tier 1: ID / ARS 번호 일치
  if (targetStationId && station.stationId && String(station.stationId) === String(targetStationId)) {
    return true;
  }
  if (targetStationId && station.arsNo && String(station.arsNo) === String(targetStationId)) {
    return true;
  }

  const normTarget = normalizeStationName(rawTargetStationName);
  const normStation = normalizeStationName(station.stationName);
  if (!normTarget || !normStation) return false;

  // Tier 2: 정규화 문자열 완전 일치
  if (normStation === normTarget) return true;

  // Tier 3: 부분 포함 일치 (예: "기흥" in "기흥수인분당" or "기흥수인분당" in "기흥")
  if (normStation.includes(normTarget) || normTarget.includes(normStation)) {
    return true;
  }

  // Tier 4: 핵심 토큰 일치 (첫 번째 핵심 지명 토큰이 정확히 일치하는지)
  const targetTokens = extractStationTokens(rawTargetStationName);
  const stationTokens = extractStationTokens(station.stationName);
  if (targetTokens.length > 0 && stationTokens.length > 0) {
    if (targetTokens[0] === stationTokens[0]) return true;
    const hasSharedToken = targetTokens.some((tt) =>
      stationTokens.some((st) => st.includes(tt) || tt.includes(st))
    );
    if (hasSharedToken) return true;
  }

  return false;
}

/** 정류소 목록에서 탑승 정류소의 최적 인덱스 탐색 */
function findBestMatchingStationIndex(
  stations: BusLineStation[],
  targetStationId?: string,
  rawTargetName?: string
): number {
  if (!stations || stations.length === 0) return -1;

  // 1순위: isTargetStationMatch
  const matchIdx = stations.findIndex((st) =>
    isTargetStationMatch(st, targetStationId, rawTargetName)
  );
  if (matchIdx !== -1) return matchIdx;

  // 2순위: 첫 단어(2자 이상) 포함 검색
  const normTarget = normalizeStationName(rawTargetName);
  if (normTarget.length >= 2) {
    const prefix = normTarget.slice(0, 2);
    const prefixIdx = stations.findIndex((st) =>
      normalizeStationName(st.stationName).includes(prefix)
    );
    if (prefixIdx !== -1) return prefixIdx;
  }

  return -1;
}

export const BusLineMapPanel: React.FC<BusLineMapPanelProps> = ({
  isOpen,
  target,
  onClose,
  onExited,
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    stationName,
    stationId,
    busNo,
    busId,
    routeId,
    busCityCode,
    region,
    busColor,
    busType,
    targetVehicleNo,
    targetMinutesLeft,
    targetStationsLeft,
  } = target;

  const cleanTargetStation = stationName
    ? stationName.replace(/정류소$|정류장$|역$/, '').trim()
    : '';

  // 방향 탭: '0' (종점/순방향), '1' (기점/역방향)
  const [selectedDirection, setSelectedDirection] = useState<'0' | '1'>('0');
  const [userSelectedVehNo, setUserSelectedVehNo] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUserSelectedVehNo(null);
    }
  }, [isOpen, busNo]);

  const theme = useMemo(() => getBusLineTheme(busType, busColor), [busType, busColor]);

  const { data, isLoading, isFetching, refetch } = useBusLinePositions({
    busNo,
    busId,
    routeId,
    cityCode: busCityCode,
    region,
    stationId,
    stationName: cleanTargetStation,
    enabled: isOpen,
    refetchInterval: 30000,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const targetStationNodeRef = useRef<HTMLDivElement>(null);

  // 💡 [핵심 개선 1] 회차 노선에서 탑승 정류소가 속한 상행/하행 방향 탭 자동 선택
  useEffect(() => {
    if (isOpen && data?.stations && data.stations.length > 0) {
      const all = data.stations;
      const turningSeq = data.turningStationSeq;

      if (turningSeq && turningSeq > 1 && turningSeq < all.length) {
        const dir0Stations = all.slice(0, turningSeq);
        const dir1Stations = all.slice(turningSeq - 1);

        const matchInDir0 = findBestMatchingStationIndex(dir0Stations, stationId, stationName);
        const matchInDir1 = findBestMatchingStationIndex(dir1Stations, stationId, stationName);

        if (matchInDir0 !== -1 && matchInDir1 === -1) {
          setSelectedDirection('0');
        } else if (matchInDir1 !== -1 && matchInDir0 === -1) {
          setSelectedDirection('1');
        }
      }
    }
  }, [isOpen, data?.stations, data?.turningStationSeq, stationId, stationName]);

  // 회차지점 정보 기준 상행(기점->회차지) / 하행(회차지->종점) 정류소 필터링
  const orderedStations = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) return [];
    const all = data.stations;
    const turningSeq = data.turningStationSeq;

    if (turningSeq && turningSeq > 1 && turningSeq < all.length) {
      if (selectedDirection === '0') {
        // 순방향: 기점 ~ 회차지
        return all.slice(0, turningSeq);
      } else {
        // 역방향: 회차지 ~ 종점
        return all.slice(turningSeq - 1);
      }
    }

    if (selectedDirection === '1') {
      return [...all].reverse();
    }
    return all;
  }, [data?.stations, data?.turningStationSeq, selectedDirection]);

  // 4분위별 실시간 버스 맵핑
  // key: `${stationSeq}_${stage}` -> BusPosition[]
  const busPositionsMap = useMemo(() => {
    const map = new Map<string, BusPosition[]>();
    if (!data?.positions) return map;

    for (const pos of data.positions) {
      const stage = pos.stage || 'at_station';
      const seq = pos.nodeord;
      if (seq !== undefined) {
        const key = `${seq}_${stage}`;
        const list = map.get(key) || [];
        list.push(pos);
        map.set(key, list);
      }
    }
    return map;
  }, [data?.positions]);

  // 탑승 정류소 인덱스 (정밀 다단계 매칭 엔진)
  const targetStationIdx = useMemo(() => {
    return findBestMatchingStationIndex(orderedStations, stationId, stationName);
  }, [orderedStations, stationId, stationName]);

  // 탑승 정류소로 접근 중인 버스 분석 (승차 대상 버스 목록 및 자동 타겟 산정)
  const approachingBusesAnalysis = useMemo(() => {
    if (targetStationIdx === -1) {
      return {
        approachingBus: null,
        primaryVehNo: userSelectedVehNo || targetVehicleNo || '',
      };
    }

    const approachingList: Array<{ bus: BusPosition; stationsAway: number }> = [];

    // 탑승역 및 이전 역들에 위치한 버스 수집 (0 <= idx <= targetStationIdx)
    for (let idx = targetStationIdx; idx >= 0; idx--) {
      const seq = orderedStations[idx].stationSeq;
      const atBuses = busPositionsMap.get(`${seq}_at_station`) || [];
      const appBuses = busPositionsMap.get(`${seq}_approaching`) || [];
      const depBuses = busPositionsMap.get(`${seq}_departed`) || [];
      const prevBuses = busPositionsMap.get(`${seq}_at_prev_station`) || [];

      const stationsAway = targetStationIdx - idx;

      // 💡 탑승 정류소(stationsAway === 0)에서 'departed'(출발/다음 정류소로 이동)인 버스는
      // 이미 정류소를 떠나 승차할 수 없는 지나간 버스이므로 승차 접근 목록에서 제외
      const validAtTarget =
        stationsAway === 0
          ? [...atBuses, ...appBuses, ...prevBuses]
          : [...atBuses, ...appBuses, ...depBuses, ...prevBuses];

      for (const b of validAtTarget) {
        approachingList.push({ bus: b, stationsAway });
      }
    }

    // stationsAway 오름차순 정렬 (0: 당역 진입/도착, 1: 1정류소전, ...)
    approachingList.sort((a, b) => a.stationsAway - b.stationsAway);

    const firstApproaching = approachingList[0] || null;

    // 하이라이트할 타겟 버스 번호 결정:
    // 1) 사용자가 수동 선택한 버스 최우선
    // 2) 전달된 targetVehicleNo가 접근 목록에 아직 유효하게 남아있다면 유지
    // 3) 전달된 버스가 이미 정류소를 지나쳤거나 목록에 없으면, 가장 가까이 오고 있는 1순위 버스로 자동 승계(Auto Handover)
    // 4) 접근 중인 버스가 없으면 빈 문자열 (지나간 버스 재하이라이트 방지)
    let primaryVehNo = '';
    if (userSelectedVehNo) {
      primaryVehNo = userSelectedVehNo;
    } else {
      const cleanTargetVeh = targetVehicleNo ? targetVehicleNo.trim() : '';
      const matched = cleanTargetVeh
        ? approachingList.find((item) => item.bus.vehicleno.includes(cleanTargetVeh))
        : null;

      if (matched) {
        primaryVehNo = matched.bus.vehicleno;
      } else if (firstApproaching) {
        primaryVehNo = firstApproaching.bus.vehicleno;
      } else {
        primaryVehNo = '';
      }
    }

    return {
      approachingBus: firstApproaching,
      primaryVehNo,
    };
  }, [targetStationIdx, orderedStations, busPositionsMap, userSelectedVehNo, targetVehicleNo]);

  const { approachingBus, primaryVehNo } = approachingBusesAnalysis;

  // 💡 [핵심 개선 2] offsetTop 기반 2단계 무결점 자동 스크롤
  useEffect(() => {
    if (!isOpen || isLoading || orderedStations.length === 0) return;

    const performScroll = (behavior: ScrollBehavior = 'smooth') => {
      const container = scrollContainerRef.current;
      const targetEl = targetStationNodeRef.current;
      if (!container || !targetEl) return;

      const offsetTop = targetEl.offsetTop;
      const centerScrollTop = offsetTop - container.clientHeight / 2 + targetEl.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, centerScrollTop),
        behavior,
      });
    };

    // 1차: DOM 마운트 직후 신속 스크롤
    const rafId = requestAnimationFrame(() => {
      performScroll('auto');
    });

    // 2차: 슬라이드/바텀시트 애니메이션 완료 시점(350ms) 부드러운 정밀 센터 스크롤
    const timer = setTimeout(() => {
      performScroll('smooth');
    }, 350);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [isOpen, isLoading, orderedStations, selectedDirection]);

  // 데스크톱 애니메이션 상태
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 20);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  const displayBusName = data?.busNo || busNo || '버스 노선';
  const startStation = data?.startStationName || orderedStations[0]?.stationName || '기점';
  const endStation =
    data?.endStationName || orderedStations[orderedStations.length - 1]?.stationName || '종점';
  const turningStation = data?.turningStationName;

  const dir0Label = turningStation ? `${turningStation} 방면` : `${endStation} 방면`;
  const dir1Label = turningStation ? `${endStation} 방면` : `${startStation} 방면`;

  // ─── 1. 패널 헤더 (SubwayLineMapPanel과 1:1 완벽 일치) ────────────────────
  const headerContent = (
    <div className="flex flex-col border-b border-zinc-100 shrink-0 bg-white select-none">
      {/* 1층: 뒤로가기 + 버스 번호 뱃지 + 정류소명 + 새로고침/닫기 */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1 -ml-0.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="뒤로가기"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <span
            className={clsx(
              'px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 shadow-2xs',
              theme.badgeBg,
              theme.badgeText
            )}
          >
            {displayBusName}
          </span>

          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <h2 className="text-[15px] font-extrabold text-zinc-900 truncate">
              {cleanTargetStation ? `${cleanTargetStation} 정류소` : '탑승 정류소'}
            </h2>
            <span className="text-[11px] font-medium text-zinc-400 shrink-0">노선도</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="실시간 위치 새로고침"
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50 cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2층: 기점 ↔ 종점 정보 */}
      <div className="px-3 pb-2 flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium truncate">
        <span className="truncate">{startStation}</span>
        <span className="text-zinc-300 shrink-0">↔</span>
        <span className="truncate">{endStation}</span>
      </div>

      {/* 3층: 콤팩트 방향 전환 탭 */}
      <div className="flex px-3 pb-2.5 gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedDirection('0')}
          className={clsx(
            'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer select-none truncate',
            selectedDirection === '0'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ArrowUp className="w-3 h-3 shrink-0" />
          <span className="truncate">{dir0Label}</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedDirection('1')}
          className={clsx(
            'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer select-none truncate',
            selectedDirection === '1'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ArrowDown className="w-3 h-3 shrink-0" />
          <span className="truncate">{dir1Label}</span>
        </button>
      </div>
    </div>
  );

  // ─── 2. 네이버 지도 스타일 고정 간선 & 비율적 Absolute Overlay 타임라인 ───
  // 각 정류소 행의 높이를 h-[46px]로 고정하여 간선 길이가 왜곡되지 않도록 보장하고,
  // 운행 중인 버스를 간선 위 비율적 위치(0%/33%/66%)에 Absolute Overlay로 매끄럽게 배치합니다.
  const ROW_HEIGHT_PX = 46;

  const listContent = (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0 relative bg-white scrollbar-thin select-none"
    >
      {isLoading && (
        <div className="py-14 flex flex-col items-center justify-center text-center space-y-2.5">
          <RefreshCw className="w-6 h-6 text-zinc-400 animate-spin" />
          <p className="text-xs text-zinc-500">실시간 노선도 확인 중...</p>
        </div>
      )}

      {!isLoading && orderedStations.length === 0 && (
        <div className="py-14 text-center text-xs text-zinc-500">
          정류소 정보를 불러올 수 없습니다.
        </div>
      )}

      {!isLoading && orderedStations.length > 0 && (
        <div className="relative py-1">
          {orderedStations.map((station: BusLineStation, idx: number) => {
            const isFirst = idx === 0;
            const isLast = idx === orderedStations.length - 1;
            const isTargetStation = targetStationIdx === idx;

            const seq = station.stationSeq;
            const atStationBuses = busPositionsMap.get(`${seq}_at_station`) || [];
            const prevStationBuses = busPositionsMap.get(`${seq}_at_prev_station`) || [];
            const currentStationBuses = [...atStationBuses, ...prevStationBuses];

            const departedBuses = busPositionsMap.get(`${seq}_departed`) || [];
            const approachingBuses = busPositionsMap.get(`${seq}_approaching`) || [];

            // 이 정류소 및 다음 정류소로 가는 간선 위 버스 목록 통합 (비율 계산용)
            const edgeBuses: Array<{ bus: BusPosition; ratio: number; stage: string }> = [];

            // 1) 정류소 도트 위치 (0.0)
            currentStationBuses.forEach((bus) => {
              edgeBuses.push({ bus, ratio: 0.0, stage: bus.stage || 'at_station' });
            });

            // 2) 출발 주행 위치 (0.33) - 마지막 역 제외
            if (!isLast) {
              departedBuses.forEach((bus) => {
                const ratio = typeof bus.progressRate === 'number' && bus.progressRate > 0
                  ? bus.progressRate
                  : 0.33;
                edgeBuses.push({ bus, ratio, stage: 'departed' });
              });

              // 3) 다음 정류소 진입 위치 (0.66)
              approachingBuses.forEach((bus) => {
                const ratio = typeof bus.progressRate === 'number' && bus.progressRate > 0
                  ? bus.progressRate
                  : 0.66;
                edgeBuses.push({ bus, ratio, stage: 'approaching' });
              });
            }

            return (
              <div
                key={`${station.stationId || idx}_${station.stationSeq}`}
                ref={isTargetStation ? targetStationNodeRef : undefined}
                style={{ height: `${ROW_HEIGHT_PX}px` }}
                className="relative w-full transition-none group"
              >
                {/* 💡 탑승 정류소 눈에 띄는 배경 하이라이트 */}
                {isTargetStation && (
                  <div className="absolute inset-0 bg-blue-50/90 rounded-2xl -z-10 pointer-events-none border-2 border-blue-400/80 shadow-2xs" />
                )}

                {/* 💡 수직 간선 (left-[99px] 2px 간선 - 노드 중심 x=100px와 정확히 일치) */}
                {orderedStations.length > 1 && (
                  <div
                    className={clsx(
                      'absolute left-[99px] w-[2px] pointer-events-none opacity-60 z-0',
                      theme.line,
                      isFirst && 'top-1/2 bottom-0',
                      isLast && 'top-0 bottom-1/2',
                      !isFirst && !isLast && 'top-0 bottom-0'
                    )}
                  />
                )}

                {/* 💡 기본 정차역 도트(Dot) - Y축 정중앙 배치 (top: 50%, left: 88px) */}
                <div className="absolute left-[88px] top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center shrink-0 z-10 pointer-events-none">
                  <div
                    className={clsx(
                      'rounded-full transition-all shrink-0',
                      isTargetStation
                        ? 'w-3.5 h-3.5 bg-blue-600 ring-4 ring-blue-300/80 shadow-md'
                        : clsx('w-2 h-2', theme.badgeBg)
                    )}
                  />
                </div>

                {/* 💡 우측 정류소명 & 탑승지/회차 정보 - Y축 정중앙 고정 배치 */}
                <div className="absolute left-[116px] right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 min-w-0 truncate z-10">
                  <span
                    className={clsx(
                      'truncate',
                      isTargetStation
                        ? 'font-black text-blue-700 text-[13.5px]'
                        : 'font-semibold text-zinc-800 text-xs'
                    )}
                  >
                    {station.stationName}
                  </span>

                  {station.arsNo && (
                    <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                      {station.arsNo}
                    </span>
                  )}

                  {station.isTurningPoint && (
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0">
                      회차
                    </span>
                  )}

                  {isTargetStation && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9.5px] font-extrabold shadow-xs shrink-0 animate-pulse">
                      <Navigation className="w-2.5 h-2.5 fill-current" />
                      승차 정류장
                    </span>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────
                    🚌 Absolute Overlay 버스 레이어 (간선 위 비율적 위치 0%/33%/66% 배치)
                   ───────────────────────────────────────────────────────── */}
                {edgeBuses.map((item, bIdx) => {
                  const { bus, ratio, stage } = item;
                  const cleanVeh = bus.vehicleno.slice(-4);
                  const isTarget =
                    Boolean(primaryVehNo) &&
                    (bus.vehicleno === primaryVehNo ||
                      bus.vehicleno.includes(primaryVehNo) ||
                      (userSelectedVehNo && bus.vehicleno === userSelectedVehNo));
                  const badge = getBusStatusBadge(stage);

                  // 정류소 중심(50%)에서 시작하여 다음 정류소 방향으로 ratio * ROW_HEIGHT_PX 만큼 오프셋
                  const topOffsetPx = ratio * ROW_HEIGHT_PX;

                  return (
                    <div
                      key={`overlay_bus_${bus.vehicleno}_${stage}_${bIdx}`}
                      style={{
                        top: `calc(50% + ${topOffsetPx}px)`,
                      }}
                      className="absolute left-0 right-0 -translate-y-1/2 flex items-center z-20 pointer-events-none"
                    >
                      {/* 1) 좌측 말풍선 카드 (네이버 지도 스타일 Tooltip) */}
                      <div className="w-[88px] min-w-[88px] flex items-center justify-end pr-2 shrink-0 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => setUserSelectedVehNo(bus.vehicleno)}
                          title={`버스 #${bus.vehicleno} 선택`}
                          className={clsx(
                            'relative flex items-center justify-between gap-1 px-1.5 py-0.8 rounded-lg text-[9px] font-bold shadow-2xs border transition-all cursor-pointer select-none text-left w-[78px]',
                            isTarget
                              ? clsx(
                                  theme.speechBubbleActiveBg,
                                  theme.speechBubbleActiveBorder,
                                  theme.speechBubbleActiveText,
                                  'scale-105 ring-2 ring-blue-300/80 shadow-xs'
                                )
                              : stage === 'departed'
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                              : stage === 'approaching'
                              ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                              : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50'
                          )}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <span className="tabular-nums font-extrabold truncate">
                            #{cleanVeh}
                          </span>

                          <span
                            className={clsx(
                              'px-1 py-0.2 rounded text-[8px] font-bold shrink-0',
                              isTarget ? 'bg-white/20 text-white' : badge.color
                            )}
                          >
                            {badge.text}
                          </span>

                          {/* 말풍선 꼬리 */}
                          <div
                            className={clsx(
                              'absolute -right-[5px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[4px] border-y-transparent border-l-[5px]',
                              isTarget
                                ? theme.primary === '#DC2626'
                                  ? 'border-l-red-600'
                                  : theme.primary === '#16A34A'
                                  ? 'border-l-emerald-600'
                                  : theme.primary === '#D97706'
                                  ? 'border-l-amber-500'
                                  : 'border-l-blue-600'
                                : stage === 'departed'
                                ? 'border-l-indigo-300'
                                : stage === 'approaching'
                                ? 'border-l-amber-300'
                                : 'border-l-zinc-300'
                            )}
                          />
                        </button>
                      </div>

                      {/* 2) 중앙 간선 위 버스 아이콘 마커 */}
                      <div className="w-6 h-6 flex items-center justify-center shrink-0 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => setUserSelectedVehNo(bus.vehicleno)}
                          className={clsx(
                            'rounded-full flex items-center justify-center transition-all cursor-pointer select-none shrink-0 shadow-xs border border-white',
                            isTarget
                              ? clsx(
                                  theme.badgeBg,
                                  'w-6 h-6 ring-2 ring-blue-400 scale-115 animate-bounce-subtle z-30'
                                )
                              : stage === 'departed'
                              ? 'w-5 h-5 bg-indigo-600 hover:scale-110 z-20'
                              : stage === 'approaching'
                              ? 'w-5 h-5 bg-amber-500 hover:scale-110 z-20'
                              : clsx(theme.badgeBg, 'w-6 h-6 hover:scale-110 z-20')
                          )}
                          title={`버스 #${bus.vehicleno} (${badge.text})`}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Bus className={clsx('text-white', ratio === 0 ? 'w-3.5 h-3.5' : 'w-3 h-3')} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── 3. 패널 풋터 (Subway와 완벽 일치하는 요약 바) ───────────────────────
  const footerContent = (
    <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/90 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
        <span className="truncate">
          {approachingBus ? (
            <span className="font-medium text-zinc-700">
              추적 버스:{' '}
              <strong className="text-blue-700">
                #{approachingBus.bus.vehicleno.slice(-4)}
              </strong>
              {approachingBus.stationsAway !== undefined && (
                <span>
                  {' '}
                  (
                  {approachingBus.stationsAway === 0
                    ? '당역'
                    : `${approachingBus.stationsAway}번째 전`}
                  )
                </span>
              )}
            </span>
          ) : (
            <span>실시간 운행 (30초 자동 갱신)</span>
          )}
        </span>
      </div>
      {targetMinutesLeft !== undefined ? (
        <span className="font-bold text-blue-600 shrink-0 ml-2">
          약 {targetMinutesLeft}분 후 도착
        </span>
      ) : targetStationsLeft !== undefined ? (
        <span className="font-bold text-blue-600 shrink-0 ml-2">
          {targetStationsLeft}번째 전
        </span>
      ) : null}
    </div>
  );

  // 모바일 UI (CustomBottomSheet)
  if (isMobile) {
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const sheetHeight = Math.round(windowHeight * 0.65);

    return (
      <CustomBottomSheet
        isOpen={isOpen}
        minHeight={sheetHeight}
        defaultHeight={sheetHeight}
        maxHeight={windowHeight - 16}
        zIndex={45}
        onClose={onClose}
        onExited={onExited}
      >
        <div className="flex flex-col relative w-full h-full min-h-0 bg-white pb-6">
          {headerContent}
          {listContent}
          {footerContent}
        </div>
      </CustomBottomSheet>
    );
  }

  // 데스크톱 Web UI (SubwayLineMapPanel과 완벽 일치하는 좌측 슬라이드 패널)
  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !isOpen && onExited) {
          onExited();
        }
      }}
      style={{
        zIndex: 45,
        transition: animate
          ? 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms ease-out'
          : 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out',
      }}
      className={clsx(
        'absolute bg-white border border-zinc-200 flex flex-col overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.12)]',
        'top-6 bottom-6 left-4 w-[360px] rounded-3xl h-[calc(100%-48px)]',
        animate
          ? 'translate-x-0 opacity-100 pointer-events-auto'
          : '-translate-x-[calc(100%+24px)] opacity-0 pointer-events-none'
      )}
    >
      <div className="flex flex-col h-full bg-white relative">
        {headerContent}
        {listContent}
        {footerContent}
      </div>
    </div>
  );
};
