'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, Bus, ArrowDown, ArrowUp, Navigation, Info } from 'lucide-react';
import { clsx } from 'clsx';
import { useBusLinePositions } from '@/hooks/useBusLinePositions';
import { CustomBottomSheet } from '@/components/common/CustomBottomSheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useJourneyStore } from '@/stores/journey-store';
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

/** 정류소 명칭 정규화 헬퍼 (공백, 특수문자, 정류소/역 접미사, 출구 제거) */
function normalizeStationName(name?: string): string {
  if (!name) return '';
  return name
    .replace(/\([^)]*\)/g, '') // 괄호 및 괄호 안 텍스트 제거
    .replace(/\s*\d+번출구$/, '') // 출구 제거
    .replace(/정류소$|정류장$|역$/, '')
    .replace(/[\s\.\(\)\[\]\-_,\/·]/g, '')
    .trim()
    .toLowerCase();
}

/** 대상 탑승 정류소 일치 여부 정밀 판별 */
function isTargetStationMatch(
  station: BusLineStation,
  targetStationId?: string,
  rawTargetStationName?: string
): boolean {
  if (!rawTargetStationName && !targetStationId) return false;

  // Tier 1: ID / ARS 번호 일치
  if (targetStationId) {
    const rawTarget = String(targetStationId).trim();
    const pureTargetId = rawTarget.replace(/[^0-9]/g, '');

    if (station.stationId) {
      const rawStation = String(station.stationId).trim();
      const pureStationId = rawStation.replace(/[^0-9]/g, '');
      if (rawStation === rawTarget || (pureTargetId && pureStationId && pureTargetId === pureStationId)) {
        return true;
      }
    }
    if (station.arsNo) {
      const rawArs = String(station.arsNo).trim();
      const pureArs = rawArs.replace(/[^0-9]/g, '');
      if (rawArs === rawTarget || (pureTargetId && pureArs && pureTargetId === pureArs)) {
        return true;
      }
    }
  }

  const normTarget = normalizeStationName(rawTargetStationName);
  const normStation = normalizeStationName(station.stationName);
  if (!normTarget || !normStation) return false;

  // Tier 2: 정규화 문자열 완전 일치 (예: "dcc종점" === "dcc종점")
  if (normStation === normTarget) return true;

  // Tier 3: 접두사/접미사 일치 (예: "카이스트정문" vs "카이스트")
  if (normStation.startsWith(normTarget) || normTarget.startsWith(normStation)) {
    return true;
  }

  // Tier 4: 상호 포함 일치 (글자 수가 3자 이상일 때만 안전하게 허용)
  if (normTarget.length >= 3 && normStation.length >= 3) {
    if (normStation.includes(normTarget) || normTarget.includes(normStation)) {
      return true;
    }
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

  // 1순위: ID/ARS 완전 일치
  if (targetStationId) {
    const idIdx = stations.findIndex((st) => isTargetStationMatch(st, targetStationId, undefined));
    if (idIdx !== -1) return idIdx;
  }

  // 2순위: 정규화 명칭 완전 일치
  const normTarget = normalizeStationName(rawTargetName);
  if (normTarget) {
    const exactIdx = stations.findIndex((st) => normalizeStationName(st.stationName) === normTarget);
    if (exactIdx !== -1) return exactIdx;
  }

  // 3순위: 접두사 또는 포함 매칭
  const matchIdx = stations.findIndex((st) => isTargetStationMatch(st, targetStationId, rawTargetName));
  if (matchIdx !== -1) return matchIdx;

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
    destination,
    headsign,
    busNo,
    busId,
    odsayBusId,
    tagoRouteId,
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
    odsayBusId,
    tagoRouteId,
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
  const turningStationNodeRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);

  // 💡 [단일 통합 노선도] 기점 ➔ 회차점 ➔ 종점 전체 정류소 목록 단일 연속 렌더링
  const orderedStations = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) return [];
    return data.stations;
  }, [data?.stations]);

  // 💡 [핵심 UX 정합성] 이동 정보(Journey)에 따른 단일 고유 실제 승차 정류소 및 방향 확정
  const actualBoardingInfo = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) {
      return { index: -1, seq: -1, direction: '0' as '0' | '1' };
    }
    const stations = data.stations;
    const turningSeq = data.turningStationSeq || Math.ceil(stations.length / 2);

    let finalIndex = -1;

    // 1단계: stationId / ARS 번호 기반 완전 일치 탐색 (상행/하행 정류소는 고유 ID/ARS가 다름)
    if (stationId) {
      const pureTarget = String(stationId).replace(/[^0-9]/g, '').trim();
      const rawTarget = String(stationId).trim();

      finalIndex = stations.findIndex((st) => {
        const pureStId = String(st.stationId || '').replace(/[^0-9]/g, '').trim();
        const pureArs = String(st.arsNo || '').replace(/[^0-9]/g, '').trim();
        const rawStId = String(st.stationId || '').trim();
        const rawArs = String(st.arsNo || '').trim();

        if (rawStId && (rawStId === rawTarget || (pureTarget && pureStId === pureTarget))) return true;
        if (rawArs && (rawArs === rawTarget || (pureTarget && pureArs === pureTarget))) return true;
        return false;
      });
    }

    // 2단계: stationId로 못 찾았거나 이름으로 매칭해야 하는 경우 (동일 명칭 다중 후보 처리)
    if (finalIndex === -1) {
      const dir0Stations = stations.slice(0, turningSeq);
      const dir1Stations = stations.slice(turningSeq - 1);

      const match0 = findBestMatchingStationIndex(dir0Stations, stationId, stationName);
      const match1 = findBestMatchingStationIndex(dir1Stations, stationId, stationName);

      // destination / headsign 기반 방향 힌트 검증
      const targetDirText = (destination || headsign || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
      let preferDir1 = false;

      if (targetDirText) {
        const startName = (data.startStationName || stations[0]?.stationName || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        const endName = (data.endStationName || stations[stations.length - 1]?.stationName || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        const turningName = (data.turningStationName || stations[turningSeq - 1]?.stationName || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();

        // 기점(startName) 방면으로 가는 경우 -> 회차 후 하행('1')
        if (startName && (targetDirText.includes(startName) || startName.includes(targetDirText))) {
          preferDir1 = true;
        } else if (turningName && (targetDirText.includes(turningName) || turningName.includes(targetDirText))) {
          preferDir1 = false; // 회차지 방면 -> 상행('0')
        } else if (endName && (targetDirText.includes(endName) || endName.includes(targetDirText))) {
          // 회차지가 별도로 있는 노선의 endName은 상행 종점 또는 하행 종점
          preferDir1 = Boolean(data.turningStationName);
        }
      }

      if (match0 !== -1 && match1 === -1) {
        finalIndex = match0;
      } else if (match1 !== -1 && match0 === -1) {
        finalIndex = (turningSeq - 1) + match1;
      } else if (match0 !== -1 && match1 !== -1) {
        finalIndex = preferDir1 ? (turningSeq - 1) + match1 : match0;
      } else {
        finalIndex = findBestMatchingStationIndex(stations, stationId, stationName);
      }
    }

    if (finalIndex === -1) {
      return { index: -1, seq: -1, direction: '0' as '0' | '1' };
    }

    // 💡 최종 인덱스로부터 해당 정류소가 상행 구간(0 ~ turningSeq-1)인지 하행 구간(turningSeq-1 ~ N)인지 결정
    const finalDirection: '0' | '1' = finalIndex >= (turningSeq - 1) ? '1' : '0';
    const finalSeq = stations[finalIndex].stationSeq;

    return {
      index: finalIndex,
      seq: finalSeq,
      direction: finalDirection,
    };
  }, [data?.stations, data?.turningStationSeq, data?.startStationName, data?.endStationName, data?.turningStationName, stationId, stationName, destination, headsign]);

  // 💡 패널이 열렸을 때 실제 승차 방향으로 탭 기본 선택
  useEffect(() => {
    if (isOpen && actualBoardingInfo.index !== -1) {
      setSelectedDirection(actualBoardingInfo.direction);
    }
  }, [isOpen, actualBoardingInfo.direction, actualBoardingInfo.index]);

  // 4분위별 실시간 버스 맵핑
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

  // 💡 [단일 통합 노선도] 승차 정류소는 전체 노선도 상에서 언제나 명확하게 하이라이트 유지
  const targetStationIdx = actualBoardingInfo.index;

  // 탑승 정류소로 접근 중인 버스 분석
  const approachingBusesAnalysis = useMemo(() => {
    if (targetStationIdx === -1) {
      return {
        approachingBus: null,
        primaryVehNo: userSelectedVehNo || targetVehicleNo || '',
        busStationsAwayMap: new Map<string, number>(),
      };
    }

    // 💡 회차점/종점(예: DCC종점) 및 하행 정류소에서도 상행선에서 다가오는 버스를 온전히 찾을 수 있도록 전체 이전 구간(0까지) 탐색
    const sectionStartIdx = 0;

    const approachingList: Array<{ bus: BusPosition; stationsAway: number }> = [];

    for (let idx = targetStationIdx; idx >= sectionStartIdx; idx--) {
      const seq = orderedStations[idx].stationSeq;
      const atBuses = busPositionsMap.get(`${seq}_at_station`) || [];
      const appBuses = busPositionsMap.get(`${seq}_approaching`) || [];
      const depBuses = busPositionsMap.get(`${seq}_departed`) || [];
      const prevBuses = busPositionsMap.get(`${seq}_at_prev_station`) || [];

      const stationsAway = targetStationIdx - idx;

      const validAtTarget =
        stationsAway === 0
          ? [...atBuses, ...appBuses, ...prevBuses]
          : [...atBuses, ...appBuses, ...depBuses, ...prevBuses];

      for (const b of validAtTarget) {
        approachingList.push({ bus: b, stationsAway });
      }
    }

    approachingList.sort((a, b) => a.stationsAway - b.stationsAway);
    const firstApproaching = approachingList[0] || null;

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

    const busStationsAwayMap = new Map<string, number>();
    for (const item of approachingList) {
      if (!busStationsAwayMap.has(item.bus.vehicleno)) {
        busStationsAwayMap.set(item.bus.vehicleno, item.stationsAway);
      }
    }

    return {
      approachingBus: firstApproaching,
      primaryVehNo,
      busStationsAwayMap,
    };
  }, [targetStationIdx, orderedStations, busPositionsMap, userSelectedVehNo, targetVehicleNo, data?.turningStationSeq, actualBoardingInfo.direction]);

  const { approachingBus, primaryVehNo, busStationsAwayMap } = approachingBusesAnalysis;
  const setBusLiveStationsAway = useJourneyStore((state) => state.setBusLiveStationsAway);

  // 💡 [핵심 연동] 노선도를 켰을 때 실제 버스 위치 기반으로 산출된 승차 정류소 기준 남은 정류소 수(stationsAway)를 전역 스토어에 동기화
  useEffect(() => {
    if (approachingBus && approachingBus.stationsAway !== undefined && busNo) {
      const cleanBus = busNo.trim().toUpperCase();
      if (stationId) {
        setBusLiveStationsAway(`bus:${cleanBus}:${stationId}`, approachingBus.stationsAway, approachingBus.bus.vehicleno);
      }
      if (cleanTargetStation) {
        setBusLiveStationsAway(`bus:${cleanBus}:${cleanTargetStation}`, approachingBus.stationsAway, approachingBus.bus.vehicleno);
      }
    }
  }, [approachingBus, busNo, stationId, cleanTargetStation, setBusLiveStationsAway]);

  // 💡 방면 탭 클릭 시 해당 방면 시작 위치로 즉시 부드럽게 스크롤
  const handleDirectionTabClick = (direction: '0' | '1') => {
    setSelectedDirection(direction);
    const container = scrollContainerRef.current;
    if (!container) return;

    if (direction === '0') {
      // 상행 시작 위치 (기점/최상단)으로 스크롤
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } else {
      // 하행 시작 위치 (회차점)으로 스크롤
      const turningEl = turningStationNodeRef.current;
      if (turningEl) {
        container.scrollTo({
          top: Math.max(0, turningEl.offsetTop - 8),
          behavior: 'smooth',
        });
      } else {
        const turningSeq = data?.turningStationSeq || Math.ceil(orderedStations.length / 2);
        const turningIdx = Math.max(0, turningSeq - 1);
        container.scrollTo({
          top: turningIdx * ROW_HEIGHT_PX,
          behavior: 'smooth',
        });
      }
    }
  };

  // 💡 스크롤 위치에 따른 상/하행 탭 활성 상태 자동 동기화 (Scroll Spy)
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !data?.stations || data.stations.length === 0) return;

    const turningEl = turningStationNodeRef.current;
    const turningOffset = turningEl
      ? turningEl.offsetTop
      : ((data.turningStationSeq || Math.ceil(data.stations.length / 2)) - 1) * ROW_HEIGHT_PX;

    if (container.scrollTop >= turningOffset - 60) {
      if (selectedDirection !== '1') setSelectedDirection('1');
    } else {
      if (selectedDirection !== '0') setSelectedDirection('0');
    }
  };

  // 💡 초기 진입 시 탑승역 중앙 자동 포커싱 스크롤
  useEffect(() => {
    if (isOpen) {
      hasInitialScrolled.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading || orderedStations.length === 0 || hasInitialScrolled.current) return;

    const performInitialScroll = (behavior: ScrollBehavior = 'smooth') => {
      const container = scrollContainerRef.current;
      const targetEl = targetStationNodeRef.current;
      if (!container) return;

      if (targetEl) {
        const offsetTop = targetEl.offsetTop;
        const centerScrollTop = offsetTop - container.clientHeight / 2 + targetEl.clientHeight / 2;
        container.scrollTo({
          top: Math.max(0, centerScrollTop),
          behavior,
        });
        hasInitialScrolled.current = true;
      } else if (actualBoardingInfo.direction === '1') {
        const turningEl = turningStationNodeRef.current;
        if (turningEl) {
          container.scrollTo({
            top: Math.max(0, turningEl.offsetTop - 8),
            behavior,
          });
          hasInitialScrolled.current = true;
        }
      }
    };

    const rafId = requestAnimationFrame(() => {
      performInitialScroll('auto');
    });

    const timer = setTimeout(() => {
      performInitialScroll('smooth');
    }, 300);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [isOpen, isLoading, orderedStations, actualBoardingInfo]);

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
  const firstStation = orderedStations[0]?.stationName || data?.startStationName || '기점';
  const lastStation =
    orderedStations[orderedStations.length - 1]?.stationName || data?.endStationName || '종점';
  const turningStation = data?.turningStationName;

  // 상행 (순방향 / 기점 ➔ 회차점) 방면 라벨
  const dir0Target = turningStation || lastStation;
  const dir0Label = `${dir0Target} 방면`;

  // 하행 (역방향 / 회차점 ➔ 종점 또는 기점으로 복귀) 방면 라벨
  let dir1Target = lastStation;
  if (turningStation) {
    if (dir1Target === turningStation) {
      dir1Target = firstStation;
    }
  } else {
    dir1Target = firstStation;
  }
  const dir1Label = `${dir1Target} 방면`;

  // 2층 기점 ↔ 종점 정보 텍스트
  const startStationDisplay = firstStation;
  const endStationDisplay =
    turningStation && firstStation === lastStation ? turningStation : lastStation;

  // ─── 1. 패널 헤더 ────────────────────────────────────────────────────────
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

        <div className="flex items-center">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="실시간 위치 새로고침"
            className="p-1 -mr-0.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors disabled:opacity-50 cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* 2층: 기점 ↔ 종점 정보 */}
      <div className="px-3 pb-2 flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium truncate">
        <span className="truncate">{startStationDisplay}</span>
        <span className="text-zinc-300 shrink-0">↔</span>
        <span className="truncate">{endStationDisplay}</span>
      </div>

      {/* 3층: 콤팩트 방향 전환 탭 (클릭 시 해당 방면 시작 위치로 스크롤) */}
      <div className="flex px-3 pb-2.5 gap-1.5">
        <button
          type="button"
          onClick={() => handleDirectionTabClick('0')}
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
          onClick={() => handleDirectionTabClick('1')}
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

  // ─── 2. 단일 통합 노선도 & 비율적 Absolute Overlay 타임라인 ───────────────
  const ROW_HEIGHT_PX = 48;

  const listContent = (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
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
            const isTurningStation = station.isTurningPoint;

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
              <React.Fragment key={`${station.stationId || idx}_${station.stationSeq}`}>
                <div
                  ref={isTargetStation ? targetStationNodeRef : isTurningStation ? turningStationNodeRef : undefined}
                  style={{ height: `${ROW_HEIGHT_PX}px` }}
                  className="relative w-full transition-none group"
                >
                  {/* 💡 탑승 정류소 배경 하이라이트 */}
                  {isTargetStation && (
                    <div className="absolute inset-0 bg-blue-50/90 rounded-2xl -z-10 pointer-events-none border-2 border-blue-400/80 shadow-2xs" />
                  )}

                  {/* 💡 깔끔한 단색 수직 간선 트랙 (left-[98px], 중심 x=100px) */}
                  {orderedStations.length > 1 && (
                    <div
                      className={clsx(
                        'absolute left-[98px] w-[3px] rounded-full pointer-events-none z-0',
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
                          ? 'w-4 h-4 bg-blue-600 ring-4 ring-blue-300/80 shadow-md'
                          : clsx('w-2.5 h-2.5 bg-white border-2', theme.dot)
                      )}
                    />
                  </div>

                  {/* 💡 노드선 좌측 회차지점 뱃지 (노드선 왼쪽 x=0~84px 영역에 정확히 배치) */}
                  {station.isTurningPoint && (
                    <div className="absolute left-0 w-[84px] top-1/2 -translate-y-1/2 flex items-center justify-end pr-1.5 z-10 pointer-events-none">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200/90 shadow-2xs">
                        <RefreshCw className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                        회차지점
                      </span>
                    </div>
                  )}

                  {/* 💡 우측 정류소명 & 고유 번호(아래 배치) & 승차 뱃지 - Y축 정중앙 배치 (left-[116px]) */}
                  <div className="absolute left-[116px] right-2 top-1/2 -translate-y-1/2 flex flex-col justify-center min-w-0 z-10">
                    {/* 1층: 정류소명 + 승차 정류장 뱃지 */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={clsx(
                          'truncate',
                          isTargetStation
                            ? 'font-black text-blue-700 text-[13.5px]'
                            : 'font-semibold text-zinc-800 text-[12px]'
                        )}
                      >
                        {station.stationName}
                      </span>

                      {isTargetStation && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9.5px] font-extrabold shadow-xs shrink-0 animate-pulse">
                          <Navigation className="w-2.5 h-2.5 fill-current" />
                          승차 정류장
                        </span>
                      )}
                    </div>

                    {/* 2층: 정류소 고유 번호(arsNo) */}
                    {station.arsNo && (
                      <span className="text-[10px] text-zinc-400 font-mono leading-tight truncate">
                        {station.arsNo}
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
                    const stationsAway = busStationsAwayMap.get(bus.vehicleno);
                    const badge = getBusStatusBadge(stage);
                    const statusText = stationsAway !== undefined
                      ? (stationsAway === 0 ? '당역' : `${stationsAway}전`)
                      : badge.text;

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
                        <div className="w-[86px] min-w-[86px] flex items-center justify-end pr-2 shrink-0 pointer-events-auto z-20">
                          <button
                            type="button"
                            onClick={() => setUserSelectedVehNo(bus.vehicleno)}
                            title={`버스 #${bus.vehicleno} (${stationsAway !== undefined ? `${stationsAway}정류장 전` : badge.text})`}
                            className={clsx(
                              'relative flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-lg text-[9px] font-bold shadow-2xs border transition-all cursor-pointer select-none text-left w-[74px]',
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
                                'text-[8px] font-extrabold px-1 py-0.2 rounded shrink-0 shadow-2xs border',
                                stationsAway !== undefined
                                  ? (isTarget ? 'bg-white/20 text-white border-white/30' : 'bg-blue-100 text-blue-800 border-blue-200')
                                  : badge.color
                              )}
                            >
                              {statusText}
                            </span>
                            {/* 말풍선 꼬리 */}
                            <div
                              className={clsx(
                                'absolute -right-[4px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[3.5px] border-y-transparent border-l-[4px]',
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

                        {/* 2) 간선 위 버스 원형 아이콘 (간선 중심 x=100px과 완벽 일치) */}
                        <div className="w-6 h-6 flex items-center justify-center shrink-0 pointer-events-auto z-30">
                          <button
                            type="button"
                            onClick={() => setUserSelectedVehNo(bus.vehicleno)}
                            title={`차량번호: ${bus.vehicleno}`}
                            className={clsx(
                              'w-5 h-5 rounded-full flex items-center justify-center text-white transition-all cursor-pointer shadow-md active:scale-95',
                              isTarget
                                ? 'bg-blue-600 ring-3 ring-blue-400 animate-pulse scale-110'
                                : clsx(theme.speechBubbleActiveBg, 'hover:scale-105')
                            )}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Bus className="w-2.8 h-2.8 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
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
      {approachingBus?.stationsAway !== undefined ? (
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {targetMinutesLeft !== undefined && (
            <span className="text-zinc-500 font-medium">약 {targetMinutesLeft}분 후</span>
          )}
          <span className="font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">
            {approachingBus.stationsAway === 0 ? '곧 도착' : `${approachingBus.stationsAway}번째 전`}
          </span>
        </div>
      ) : targetMinutesLeft !== undefined ? (
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
        zIndex={120}
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
        zIndex: 120,
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
