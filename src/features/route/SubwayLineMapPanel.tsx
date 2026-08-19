'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, Train, ArrowDown, ArrowUp, Navigation } from 'lucide-react';
import { clsx } from 'clsx';
import { useSubwayLinePositions } from '@/hooks/useSubwayLinePositions';
import { CustomBottomSheet } from '@/components/common/CustomBottomSheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SubwayPosition, SubwayLineStation, SubwayLineMapTarget } from '@/types/journey';
import { getBranchDataById, isTrainMatchingBranch } from '@/lib/data/subwayBranches';

export interface SubwayLineMapPanelProps {
  isOpen: boolean;
  target: SubwayLineMapTarget;
  onClose: () => void;
  onExited?: () => void;
}

// ─── 호선별 브랜드 테마 색상 ─────────────────────────────────────────────────

interface SubwayColorTheme {
  primary: string;
  badgeBg: string;
  badgeText: string;
  line: string;
  dot: string;
  activeTabBg: string;
}

function getSubwayLineTheme(subwayNmOrId: string): SubwayColorTheme {
  const clean = String(subwayNmOrId || '').trim();

  // 1. 지방 도시철도
  if (clean.includes('대전')) {
    return {
      primary: '#007448',
      badgeBg: 'bg-[#007448]',
      badgeText: 'text-white',
      line: 'bg-[#007448]',
      dot: 'border-[#007448]',
      activeTabBg: 'bg-[#007448] text-white',
    };
  }

  // 2. 수도권 1~9호선
  if (clean === '1001' || clean === '1' || clean === '1호선' || clean === '수도권 1호선') {
    return {
      primary: '#0052A4',
      badgeBg: 'bg-[#0052A4]',
      badgeText: 'text-white',
      line: 'bg-[#0052A4]',
      dot: 'border-[#0052A4]',
      activeTabBg: 'bg-[#0052A4] text-white',
    };
  }
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) {
    return {
      primary: '#00A84D',
      badgeBg: 'bg-[#00A84D]',
      badgeText: 'text-white',
      line: 'bg-[#00A84D]',
      dot: 'border-[#00A84D]',
      activeTabBg: 'bg-[#00A84D] text-white',
    };
  }
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) {
    return {
      primary: '#EF7C1C',
      badgeBg: 'bg-[#EF7C1C]',
      badgeText: 'text-white',
      line: 'bg-[#EF7C1C]',
      dot: 'border-[#EF7C1C]',
      activeTabBg: 'bg-[#EF7C1C] text-white',
    };
  }
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) {
    return {
      primary: '#00A5DE',
      badgeBg: 'bg-[#00A5DE]',
      badgeText: 'text-white',
      line: 'bg-[#00A5DE]',
      dot: 'border-[#00A5DE]',
      activeTabBg: 'bg-[#00A5DE] text-white',
    };
  }
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) {
    return {
      primary: '#996CAC',
      badgeBg: 'bg-[#996CAC]',
      badgeText: 'text-white',
      line: 'bg-[#996CAC]',
      dot: 'border-[#996CAC]',
      activeTabBg: 'bg-[#996CAC] text-white',
    };
  }
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) {
    return {
      primary: '#CD7C2F',
      badgeBg: 'bg-[#CD7C2F]',
      badgeText: 'text-white',
      line: 'bg-[#CD7C2F]',
      dot: 'border-[#CD7C2F]',
      activeTabBg: 'bg-[#CD7C2F] text-white',
    };
  }
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) {
    return {
      primary: '#747F00',
      badgeBg: 'bg-[#747F00]',
      badgeText: 'text-white',
      line: 'bg-[#747F00]',
      dot: 'border-[#747F00]',
      activeTabBg: 'bg-[#747F00] text-white',
    };
  }
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) {
    return {
      primary: '#EA545D',
      badgeBg: 'bg-[#EA545D]',
      badgeText: 'text-white',
      line: 'bg-[#EA545D]',
      dot: 'border-[#EA545D]',
      activeTabBg: 'bg-[#EA545D] text-white',
    };
  }
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) {
    return {
      primary: '#BDB092',
      badgeBg: 'bg-[#BDB092]',
      badgeText: 'text-white',
      line: 'bg-[#BDB092]',
      dot: 'border-[#BDB092]',
      activeTabBg: 'bg-[#8C7B58] text-white',
    };
  }
  if (clean.includes('신분당')) {
    return {
      primary: '#D4003B',
      badgeBg: 'bg-[#D4003B]',
      badgeText: 'text-white',
      line: 'bg-[#D4003B]',
      dot: 'border-[#D4003B]',
      activeTabBg: 'bg-[#D4003B] text-white',
    };
  }
  if (clean.includes('수인분당') || clean.includes('분당선')) {
    return {
      primary: '#F5A200',
      badgeBg: 'bg-[#F5A200]',
      badgeText: 'text-white',
      line: 'bg-[#F5A200]',
      dot: 'border-[#F5A200]',
      activeTabBg: 'bg-[#D88D00] text-white',
    };
  }
  if (clean.includes('경의중앙')) {
    return {
      primary: '#77C4A3',
      badgeBg: 'bg-[#77C4A3]',
      badgeText: 'text-white',
      line: 'bg-[#77C4A3]',
      dot: 'border-[#77C4A3]',
      activeTabBg: 'bg-[#4EA680] text-white',
    };
  }
  if (clean.includes('공항철도')) {
    return {
      primary: '#0090D2',
      badgeBg: 'bg-[#0090D2]',
      badgeText: 'text-white',
      line: 'bg-[#0090D2]',
      dot: 'border-[#0090D2]',
      activeTabBg: 'bg-[#0090D2] text-white',
    };
  }

  return {
    primary: '#2563eb',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    line: 'bg-blue-600',
    dot: 'border-blue-600',
    activeTabBg: 'bg-blue-600 text-white',
  };
}

/** 열차 운행 상태 뱃지 렌더러 */
function getTrainStatusBadge(trainSttus: string) {
  switch (trainSttus) {
    case '0':
      return { text: '진입', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    case '1':
      return { text: '도착', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case '2':
      return { text: '출발', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    case '3':
      return { text: '전역출발', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    default:
      return { text: '운행중', color: 'bg-zinc-100 text-zinc-700 border-zinc-200' };
  }
}

// ─── 물리적 위치(남은 역 수) 기반 ETA(도착 예정 시간) 동적 계산 헬퍼 ────────────

function calculateDynamicETA(
  stationsAway: number | undefined,
  trainStatus: string, // '0': 진입, '1': 도착, '2': 출발, '3': 전역출발
  originalMinutesLeft?: number
): { text: string; minutes: number } {
  if (stationsAway === undefined) {
    return {
      text: originalMinutesLeft && originalMinutesLeft > 0 ? `${originalMinutesLeft}분 후` : '운행 중',
      minutes: originalMinutesLeft || 0,
    };
  }

  if (stationsAway === 0) {
    if (trainStatus === '0') return { text: '진입 중', minutes: 0 };
    if (trainStatus === '1') return { text: '도착', minutes: 0 };
    return { text: '곧 도착', minutes: 0 };
  }

  // 역당 평균 약 2.2분 소요
  const estimatedMin = Math.max(1, Math.round(stationsAway * 2.2));

  // 기존 칩 값과의 정합성: 오차가 2분 이내면 원래 칩 시간 존중
  if (
    originalMinutesLeft &&
    originalMinutesLeft > 0 &&
    Math.abs(originalMinutesLeft - estimatedMin) <= 2
  ) {
    return { text: `${originalMinutesLeft}분 후`, minutes: originalMinutesLeft };
  }

  return {
    text: `${estimatedMin}분 후`,
    minutes: estimatedMin,
  };
}

export const SubwayLineMapPanel: React.FC<SubwayLineMapPanelProps> = ({
  isOpen,
  target,
  onClose,
  onExited,
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    stationName,
    subwayId,
    subwayNm,
    wayCode = '1',
    targetTrainNo,
    targetMinutesLeft,
    targetStatusText,
  } = target;

  const cleanTargetStation = stationName ? stationName.replace(/역$/, '').trim() : '';

  // 운행 계통(Branch) 탭 상태 (네이버 지도 스타일)
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(undefined);

  // 사용자 수동 선택 열차 번호 (Step 3)
  const [userSelectedTrainNo, setUserSelectedTrainNo] = useState<string | null>(null);

  // 방향 탭: '0' (상행/내선), '1' (하행/외선)
  const initialDirection = wayCode === '2' ? '1' : '0';
  const [selectedDirection, setSelectedDirection] = useState<'0' | '1'>(initialDirection);

  const lineTarget = subwayNm || subwayId || '2호선';
  const isDaejeon = lineTarget.includes('대전') || cleanTargetStation === '대전역' || cleanTargetStation === '대전';

  // 뷰 모드: 'timetable' (시간표 리스트) vs 'map' (노선도)
  const [viewMode, setViewMode] = useState<'timetable' | 'map'>(isDaejeon ? 'timetable' : 'map');

  useEffect(() => {
    if (isOpen) {
      setSelectedDirection(wayCode === '2' ? '1' : '0');
      setUserSelectedTrainNo(null);
      if (isDaejeon) {
        setViewMode('timetable');
      }
    }
  }, [isOpen, wayCode, isDaejeon]);

  const theme = useMemo(() => getSubwayLineTheme(lineTarget), [lineTarget]);

  const { data, isLoading, isFetching, refetch } = useSubwayLinePositions({
    subwayId,
    subwayNm,
    branchId: selectedBranchId,
    stationName: cleanTargetStation,
    enabled: isOpen,
    refetchInterval: 30000,
  });

  // 서버에서 기본 추천된 branchId가 오면 동기화 (초기 1회)
  useEffect(() => {
    if (data?.selectedBranchId && !selectedBranchId) {
      setSelectedBranchId(data.selectedBranchId);
    }
  }, [data?.selectedBranchId, selectedBranchId]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const targetStationNodeRef = useRef<HTMLDivElement>(null);

  // 방향별 라벨 산출 (2호선은 내선/외선, 대전은 판암/반석, 기타는 상행/하행)
  const isLine2 = lineTarget === '1002' || lineTarget === '2' || lineTarget.includes('2호선');
  const upLabel = isLine2
    ? '내선 순환'
    : isDaejeon
    ? '판암 방면 (상행)'
    : '상행';
  const downLabel = isLine2
    ? '외선 순환'
    : isDaejeon
    ? '반석 방면 (하행)'
    : '하행';

  // 정차역 목록 (진행 방향에 맞춰 순서 정렬)
  // - 일반 노선: 기본 DB는 하행(인천/신창 방면) 순서이므로 상행('0')일 때 반전(reverse)
  // - 2호선: 기본 DB는 내선순환(시계방향) 순서이므로 외선순환('1')일 때 반전(reverse)
  const orderedStations = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) return [];
    const stationsCopy = [...data.stations];

    const shouldReverse = isLine2 ? selectedDirection === '1' : selectedDirection === '0';
    return shouldReverse ? stationsCopy.reverse() : stationsCopy;
  }, [data?.stations, selectedDirection, isLine2]);

  // 대전 시간표 필터링 (선택된 방향에 맞는 현재 시각 이후 열차 목록)
  const filteredTimetable = useMemo(() => {
    if (!data?.timetable) return [];
    return data.timetable.filter((t) => t.drctType === selectedDirection);
  }, [data?.timetable, selectedDirection]);

  // 현재 가장 빠른 다음 열차 (시간표 기준)
  const upcomingTimetableTrain = filteredTimetable.length > 0 ? filteredTimetable[0] : null;

  // 현재 활성화된 운행 계통 데이터
  const activeBranchConfig = useMemo(() => {
    const activeId = selectedBranchId || data?.selectedBranchId;
    return getBranchDataById(lineTarget, activeId);
  }, [lineTarget, selectedBranchId, data?.selectedBranchId]);

  // 역별 실시간 열차 위치 맵 (계통 매칭 + trainNo 기준 단일 유일)
  const stationTrainsMap = useMemo(() => {
    const map = new Map<string, SubwayPosition[]>();
    if (!data?.positions) return map;

    const seenTrainNos = new Set<string>();

    for (const pos of data.positions) {
      // 1. 방향 필터링
      if (pos.updnLine !== selectedDirection) continue;
      // 2. 중복 trainNo 방어
      if (!pos.trainNo || seenTrainNos.has(pos.trainNo)) continue;
      // 3. 현재 운행 계통(Branch) 매칭 필터링 (종착역 및 경로 일치 검사)
      if (!isTrainMatchingBranch(pos, activeBranchConfig, selectedDirection)) continue;

      seenTrainNos.add(pos.trainNo);
      const cleanStatn = pos.statnNm.replace(/역$/, '').trim();
      const list = map.get(cleanStatn) || [];
      list.push(pos);
      map.set(cleanStatn, list);
    }

    return map;
  }, [data?.positions, selectedDirection, activeBranchConfig]);

  // 타겟 열차 번호 정규화
  const cleanTargetTrainNo = targetTrainNo ? targetTrainNo.trim().replace(/^0+/, '') : '';

  // 탑승역 인덱스 및 접근 중인 최인접 열차 자동 산정 (Step 2 & Step 3)
  const targetStationIdx = useMemo(() => {
    return orderedStations.findIndex(
      (st) => st.stationName.replace(/역$/, '').trim() === cleanTargetStation
    );
  }, [orderedStations, cleanTargetStation]);

  // 탑승역으로 접근 중인 열차 분석 (역순 정렬: 당역/1역전/2역전... + 종착역 도달 가능 여부 동적 판별)
  const approachingTrainsAnalysis = useMemo(() => {
    if (targetStationIdx === -1) {
      return {
        trainAwayMap: new Map<string, number>(),
        trainObjectMap: new Map<string, SubwayPosition>(),
        primaryTrainNo: userSelectedTrainNo || cleanTargetTrainNo || '',
      };
    }

    const trainAwayMap = new Map<string, number>();
    const trainObjectMap = new Map<string, SubwayPosition>();
    const approachingList: Array<{
      trainNo: string;
      stationsAway: number;
      canReachTarget: boolean;
      train: SubwayPosition;
    }> = [];

    // 탑승역 및 그 이전 역들(0 <= idx <= targetStationIdx)에 있는 열차 수집
    for (let idx = 0; idx <= targetStationIdx; idx++) {
      const st = orderedStations[idx];
      const cleanName = st.stationName.replace(/역$/, '').trim();
      const trains = stationTrainsMap.get(cleanName) || [];
      const stationsAway = targetStationIdx - idx;

      for (const t of trains) {
        const cleanNo = t.trainNo.replace(/^0+/, '');
        trainAwayMap.set(cleanNo, stationsAway);
        trainAwayMap.set(t.trainNo, stationsAway);
        trainObjectMap.set(cleanNo, t);
        trainObjectMap.set(t.trainNo, t);

        // API statnTnm 기반 탑승역 도달 가능 여부 동적 계산
        const cleanDest = t.statnTnm ? t.statnTnm.replace(/역$/, '').trim() : '';
        const destIdx = cleanDest
          ? orderedStations.findIndex(
              (s) => s.stationName.replace(/역$/, '').trim() === cleanDest
            )
          : -1;
        // 종착역이 탑승역보다 앞서 있으면 중간종착(미도달) 열차
        const canReachTarget = destIdx === -1 || destIdx >= targetStationIdx;

        // 탑승역(stationsAway === 0)에서 이미 '출발'(trainSttus === '2')한 열차는 제외
        const isDepartedAtTarget = stationsAway === 0 && String(t.trainSttus) === '2';
        if (!isDepartedAtTarget) {
          approachingList.push({
            trainNo: cleanNo,
            stationsAway,
            canReachTarget,
            train: t,
          });
        }
      }
    }

    // 1차: canReachTarget(탑승역 도달 가능 열차 우선), 2차: stationsAway 오름차순
    approachingList.sort((a, b) => {
      const crA = a.canReachTarget ? 1 : 0;
      const crB = b.canReachTarget ? 1 : 0;
      if (crA !== crB) return crB - crA;
      return a.stationsAway - b.stationsAway;
    });

    // 하이라이트할 최우선 열차 번호 결정:
    // 1) 사용자가 수동으로 선택한 열차가 있으면 우선 반영
    // 2) 칩에서 전달된 targetTrainNo가 접근 목록에 아직 유효하게 남아있으면 유지
    // 3) 도달 가능한 1순위 다가오는 열차로 자동 승계(Auto Handover)
    let primaryTrainNo = '';
    if (userSelectedTrainNo) {
      primaryTrainNo = userSelectedTrainNo.replace(/^0+/, '');
    } else {
      const matchedTarget = cleanTargetTrainNo
        ? approachingList.find((item) => item.trainNo === cleanTargetTrainNo)
        : null;

      if (matchedTarget) {
        primaryTrainNo = matchedTarget.trainNo;
      } else if (approachingList.length > 0) {
        primaryTrainNo = approachingList[0].trainNo;
      } else {
        primaryTrainNo = '';
      }
    }

    return {
      trainAwayMap,
      trainObjectMap,
      primaryTrainNo,
    };
  }, [targetStationIdx, orderedStations, stationTrainsMap, cleanTargetTrainNo, userSelectedTrainNo]);

  const { trainAwayMap, trainObjectMap, primaryTrainNo } = approachingTrainsAnalysis;

  // 현재 하이라이트된 열차의 상세 정보 및 보정된 ETA
  const activeHighlightedTrain = useMemo(() => {
    if (!primaryTrainNo) return null;
    const cleanNo = primaryTrainNo.replace(/^0+/, '');
    const trainObj = trainObjectMap.get(cleanNo);
    const away = trainAwayMap.get(cleanNo);
    if (!trainObj) return null;

    const eta = calculateDynamicETA(away, trainObj.trainSttus, targetMinutesLeft);
    const destName = trainObj.statnTnm ? trainObj.statnTnm.replace(/역$/, '').trim() : '';

    return {
      train: trainObj,
      destinationName: destName ? `${destName}행` : '',
      stationsAway: away,
      eta,
    };
  }, [primaryTrainNo, trainObjectMap, trainAwayMap, targetMinutesLeft]);

  // 탑승역으로 자동 센터 스크롤 (상위 창/지도 스크롤 없이 내부 컨테이너만 안전하게 스크롤)
  useEffect(() => {
    if (isOpen && targetStationNodeRef.current && scrollContainerRef.current) {
      const timer = setTimeout(() => {
        const container = scrollContainerRef.current;
        const target = targetStationNodeRef.current;
        if (!container || !target) return;

        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const relativeOffsetTop = targetRect.top - containerRect.top + container.scrollTop;
        const centerScrollTop = relativeOffsetTop - (container.clientHeight / 2) + (target.clientHeight / 2);

        container.scrollTo({
          top: Math.max(0, centerScrollTop),
          behavior: 'smooth',
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, orderedStations, selectedBranchId]);

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

  const displayLineName = data?.subwayNm || subwayNm || (subwayId ? `${subwayId}호선` : '지하철');
  const branches = data?.branches || [];

  // ─── 가로 탭 바 마우스 드래그 & 휠 스와이프 핸들러 ──────────────────────
  const branchTabsRef = useRef<HTMLDivElement>(null);
  const isDraggingTabsRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleTabsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!branchTabsRef.current) return;
    isDraggingTabsRef.current = true;
    startXRef.current = e.pageX - branchTabsRef.current.offsetLeft;
    scrollLeftRef.current = branchTabsRef.current.scrollLeft;
    dragDistanceRef.current = 0;
  };

  const handleTabsMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingTabsRef.current || !branchTabsRef.current) return;
    e.preventDefault();
    const x = e.pageX - branchTabsRef.current.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    branchTabsRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleTabsMouseUpOrLeave = () => {
    isDraggingTabsRef.current = false;
  };

  const handleTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!branchTabsRef.current) return;
    if (e.deltaY !== 0) {
      branchTabsRef.current.scrollLeft += e.deltaY;
    }
  };

  // ─── 패널 헤더 ─────────────────────────────────────────────────────────
  const headerContent = (
    <div className="flex flex-col border-b border-zinc-100 shrink-0 bg-white select-none">
      {/* 1층: 뒤로가기 + 호선 뱃지 + 역명 + 새로고침/닫기 */}
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
            {displayLineName}
          </span>

          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <h2 className="text-[15px] font-extrabold text-zinc-900 truncate">
              {cleanTargetStation}역
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

      {/* 2층: 운행 계통 가로 스와이프 탭 바 */}
      {branches.length > 1 && (
        <div
          ref={branchTabsRef}
          onMouseDown={handleTabsMouseDown}
          onMouseMove={handleTabsMouseMove}
          onMouseUp={handleTabsMouseUpOrLeave}
          onMouseLeave={handleTabsMouseUpOrLeave}
          onWheel={handleTabsWheel}
          className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x cursor-grab active:cursor-grabbing select-none"
        >
          {branches.map((b) => {
            const isSelected = b.id === (selectedBranchId || data?.selectedBranchId);
            return (
              <button
                key={b.id}
                type="button"
                onClick={(e) => {
                  if (dragDistanceRef.current > 5) {
                    e.preventDefault();
                    return;
                  }
                  setSelectedBranchId(b.id);
                }}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer select-none shrink-0 shadow-2xs border',
                  isSelected
                    ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                    : 'bg-zinc-50 text-zinc-600 border-zinc-200/80 hover:bg-zinc-100 hover:text-zinc-900'
                )}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 2.5층: 뷰 모드 토글 (시간표 보기 vs 노선도 보기 - 대전 등 지원) */}
      {(isDaejeon || (data?.timetable && data.timetable.length > 0)) && (
        <div className="px-3 pb-2">
          <div className="flex bg-zinc-100 p-0.5 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode('timetable')}
              className={clsx(
                'flex-1 py-1 rounded-lg transition-all text-center cursor-pointer',
                viewMode === 'timetable'
                  ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                  : 'text-zinc-500 hover:text-zinc-800'
              )}
            >
              시간표 보기 ({filteredTimetable.length}대)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={clsx(
                'flex-1 py-1 rounded-lg transition-all text-center cursor-pointer',
                viewMode === 'map'
                  ? 'bg-white text-zinc-900 shadow-2xs font-extrabold'
                  : 'text-zinc-500 hover:text-zinc-800'
              )}
            >
              노선도 보기
            </button>
          </div>
        </div>
      )}

      {/* 3층: 방향 전환 탭 */}
      <div className="flex px-3 pb-2.5 gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedDirection('0')}
          className={clsx(
            'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer select-none',
            selectedDirection === '0'
              ? isDaejeon
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-blue-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ArrowUp className="w-3 h-3" />
          <span>{upLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedDirection('1')}
          className={clsx(
            'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer select-none',
            selectedDirection === '1'
              ? isDaejeon
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-blue-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <ArrowDown className="w-3 h-3" />
          <span>{downLabel}</span>
        </button>
      </div>
    </div>
  );

  // ─── 2. 버스 스타일 3열 고정 간선 & 비율적 Absolute Overlay 타임라인 바디 ───
  const ROW_HEIGHT_PX = 48;

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
          정차역 정보를 불러올 수 없습니다.
        </div>
      )}

      {!isLoading && orderedStations.length > 0 && (
        <div className="relative py-1">
          {orderedStations.map((station: SubwayLineStation, idx: number) => {
            const isFirst = idx === 0;
            const isLast = idx === orderedStations.length - 1;
            const isTargetStation = targetStationIdx === idx;
            const cleanStatn = station.stationName.replace(/역$/, '').trim();

            const trainsAtStation = stationTrainsMap.get(cleanStatn) || [];

            // 열차 상태별 오버레이 배치를 위한 가공
            const edgeTrains: Array<{
              train: SubwayPosition;
              ratio: number;
              stageText: string;
            }> = [];

            trainsAtStation.forEach((t) => {
              let ratio = 0.0;
              let stageText = 'at_station';

              if (t.trainSttus === '2' && !isLast) {
                // 출발 (해당 역 출발 33% 구간)
                ratio = 0.33;
                stageText = 'departed';
              } else if (t.trainSttus === '3') {
                // 전역출발 (간선 중간 50% 구간)
                ratio = !isFirst ? -0.5 : 0.0;
                stageText = 'departed';
              } else if (t.trainSttus === '0') {
                // 진입 (이전 역에서 66% 구간 = 해당 역 진입 직전)
                ratio = !isFirst ? -0.34 : 0.0;
                stageText = 'approaching';
              } else {
                // 도착/정차 (정차역 노드 정중앙 0%)
                ratio = 0.0;
                stageText = 'at_station';
              }

              edgeTrains.push({ train: t, ratio, stageText });
            });

            return (
              <div
                key={`${station.stationName}-${idx}`}
                ref={isTargetStation ? targetStationNodeRef : undefined}
                style={{ height: `${ROW_HEIGHT_PX}px` }}
                className="relative w-full transition-none group"
              >
                {/* 💡 탑승역 눈에 띄는 배경 하이라이트 */}
                {isTargetStation && (
                  <div className="absolute inset-0 bg-blue-50/90 rounded-2xl -z-10 pointer-events-none border-2 border-blue-400/80 shadow-2xs" />
                )}

                {/* 💡 수직 간선 (left-[109px] 2px 간선 - 노드 중심 x=110px와 일치) */}
                {orderedStations.length > 1 && (
                  <div
                    className={clsx(
                      'absolute left-[109px] w-[2px] pointer-events-none opacity-60 z-0',
                      theme.line,
                      isFirst && 'top-1/2 bottom-0',
                      isLast && 'top-0 bottom-1/2',
                      !isFirst && !isLast && 'top-0 bottom-0'
                    )}
                  />
                )}

                {/* 💡 기본 정차역 도트(Dot) - Y축 정중앙 배치 (top: 50%, left: 98px) */}
                <div className="absolute left-[98px] top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center shrink-0 z-10 pointer-events-none">
                  <div
                    className={clsx(
                      'rounded-full transition-all shrink-0',
                      isTargetStation
                        ? 'w-3.5 h-3.5 bg-blue-600 ring-4 ring-blue-300/80 shadow-md'
                        : clsx('w-2 h-2', theme.badgeBg)
                    )}
                  />
                </div>

                {/* 💡 우측 정차역명 & 탑승역 정보 - Y축 정중앙 고정 배치 */}
                <div className="absolute left-[126px] right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 min-w-0 truncate z-10">
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

                  {isTargetStation && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9.5px] font-extrabold shadow-xs shrink-0 animate-pulse">
                      <Navigation className="w-2.5 h-2.5 fill-current" />
                      승차역
                    </span>
                  )}
                </div>

                {/* ─────────────────────────────────────────────────────────
                    🚆 Absolute Overlay 열차 레이어 (버스 스타일 말풍선 툴팁 + 마커)
                   ───────────────────────────────────────────────────────── */}
                {edgeTrains.map((item, tIdx) => {
                  const { train, ratio, stageText } = item;
                  const cleanNo = train.trainNo.replace(/^0+/, '');
                  const isTarget =
                    Boolean(primaryTrainNo) &&
                    (cleanNo === primaryTrainNo || train.trainNo === primaryTrainNo);

                  const statusBadge = getTrainStatusBadge(train.trainSttus);

                  // API statnTnm 기반 종착역(행선지) 동적 텍스트 산출
                  const cleanDest = train.statnTnm
                    ? train.statnTnm.replace(/역$/, '').trim()
                    : '';
                  const destBadgeText = cleanDest ? `${cleanDest}행` : '';

                  // 탑승역 도달 가능 여부 동적 계산
                  const destStationIdx = cleanDest
                    ? orderedStations.findIndex(
                        (s) => s.stationName.replace(/역$/, '').trim() === cleanDest
                      )
                    : -1;
                  const isTerminatingEarly =
                    destStationIdx !== -1 &&
                    targetStationIdx !== -1 &&
                    destStationIdx < targetStationIdx;

                  const topOffsetPx = ratio * ROW_HEIGHT_PX;

                  return (
                    <div
                      key={`overlay_train_${train.trainNo}_${stageText}_${tIdx}`}
                      style={{
                        top: `calc(50% + ${topOffsetPx}px)`,
                      }}
                      className="absolute left-0 right-0 -translate-y-1/2 flex items-center z-20 pointer-events-none"
                    >
                      {/* 1) 좌측 말풍선 카드 (네이버 지도 버스 스타일 Tooltip) */}
                      <div className="w-[98px] min-w-[98px] flex items-center justify-end pr-2 shrink-0 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => setUserSelectedTrainNo(train.trainNo)}
                          title={`열차 #${train.trainNo} (${destBadgeText || '운행'}) 선택`}
                          className={clsx(
                            'relative flex flex-col justify-center gap-0.5 px-1.5 py-1 rounded-lg text-[9px] font-bold shadow-2xs border transition-all cursor-pointer select-none text-left w-[88px]',
                            isTarget
                              ? 'bg-blue-600 border-blue-700 text-white scale-105 ring-2 ring-blue-300/80 shadow-xs'
                              : isTerminatingEarly
                              ? 'bg-amber-50/90 border-amber-300 text-amber-900 hover:bg-amber-100'
                              : stageText === 'departed'
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100'
                              : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50'
                          )}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {/* 1층: 종착역(행선지) 뱃지 + 급행 여부 */}
                          <div className="flex items-center justify-between gap-1 w-full min-w-0">
                            <span
                              className={clsx(
                                'font-extrabold truncate text-[9.5px]',
                                isTarget ? 'text-white' : isTerminatingEarly ? 'text-amber-800' : 'text-zinc-900'
                              )}
                            >
                              {destBadgeText || `#${train.trainNo}`}
                            </span>

                            {train.isExpress && (
                              <span className="px-1 py-0.2 rounded text-[7.5px] font-black bg-rose-600 text-white shrink-0">
                                급행
                              </span>
                            )}

                            {isTerminatingEarly && (
                              <span className="px-1 py-0.2 rounded text-[7.5px] font-extrabold bg-amber-200 text-amber-900 shrink-0">
                                종착
                              </span>
                            )}
                          </div>

                          {/* 2층: 열차 번호 + 운행 상태 */}
                          <div className="flex items-center justify-between gap-1 w-full min-w-0 text-[8.5px]">
                            <span
                              className={clsx(
                                'tabular-nums font-semibold truncate',
                                isTarget ? 'text-blue-100' : 'text-zinc-500'
                              )}
                            >
                              #{train.trainNo}
                            </span>

                            <span
                              className={clsx(
                                'px-1 py-0.2 rounded text-[7.5px] font-bold border shrink-0',
                                isTarget
                                  ? 'bg-white/20 text-white border-transparent'
                                  : statusBadge.color
                              )}
                            >
                              {statusBadge.text}
                            </span>
                          </div>

                          {/* 말풍선 꼬리 (중앙 간선 마커 방향) */}
                          <div
                            className={clsx(
                              'absolute -right-[5px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[4px] border-y-transparent border-l-[5px]',
                              isTarget
                                ? 'border-l-blue-600'
                                : isTerminatingEarly
                                ? 'border-l-amber-300'
                                : stageText === 'departed'
                                ? 'border-l-indigo-200'
                                : 'border-l-zinc-300'
                            )}
                          />
                        </button>
                      </div>

                      {/* 2) 중앙 간선 위 열차 아이콘 마커 */}
                      <div className="w-6 h-6 flex items-center justify-center shrink-0 pointer-events-auto">
                        <button
                          type="button"
                          onClick={() => setUserSelectedTrainNo(train.trainNo)}
                          className={clsx(
                            'rounded-full flex items-center justify-center cursor-pointer select-none shrink-0 shadow-xs border border-white',
                            isTarget
                              ? clsx(
                                  theme.badgeBg,
                                  'w-6 h-6 ring-2 ring-blue-400 z-30'
                                )
                              : stageText === 'departed'
                              ? 'w-5 h-5 bg-indigo-600 z-20'
                              : 'w-5 h-5 bg-blue-600 z-20'
                          )}
                          title={`열차 #${train.trainNo} (${destBadgeText || '운행'})`}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <Train className="text-white w-3 h-3" />
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

  // ─── 2. 시간표(Timetable) 리스트 뷰 바디 ───────────────────────────────────
  const timetableContent = (
    <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-zinc-50/50 scrollbar-thin select-none">
      {/* 1. 상단 안내 및 다음 열차 하이라이트 배너 */}
      <div className="rounded-2xl p-3.5 bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Train className="w-4 h-4 text-emerald-200" />
            <span className="text-xs font-bold text-emerald-100">다음 출발 열차</span>
          </div>
          <span className="text-[10px] font-semibold bg-emerald-800/60 px-2 py-0.5 rounded-full text-emerald-200">
            대전교통공사 공식 시간표
          </span>
        </div>

        {upcomingTimetableTrain ? (
          <div className="flex items-end justify-between pt-1">
            <div>
              <div className="text-2xl font-black tracking-tight flex items-baseline gap-2">
                <span>{upcomingTimetableTrain.depTime}</span>
                <span className="text-sm font-bold text-emerald-200">
                  {upcomingTimetableTrain.destStation}행
                </span>
              </div>
              <p className="text-[11px] text-emerald-100/90 font-medium">
                열차 #{upcomingTimetableTrain.trainNo}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white text-emerald-800 text-xs font-extrabold shadow-sm animate-pulse">
                {upcomingTimetableTrain.statusText}
              </span>
            </div>
          </div>
        ) : (
          <div className="py-2 text-center text-xs text-emerald-100">
            현재 이후 출발 예정 열차가 없습니다.
          </div>
        )}
      </div>

      {/* 2. 현재 시간 기준 이후 출발 열차 목록 리스트다운 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-extrabold text-zinc-700 flex items-center gap-1.5">
            <span>이후 출발 시간표</span>
            <span className="text-[10px] font-medium text-zinc-400">
              (현재 시각 이후 {filteredTimetable.length}대)
            </span>
          </h3>
          <span className="text-[10px] text-zinc-400">출발 시각순</span>
        </div>

        {filteredTimetable.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400 bg-white rounded-2xl border border-zinc-100 p-6">
            운행 예정인 열차가 없습니다.
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredTimetable.map((item, idx) => {
              const isFirst = idx === 0;
              return (
                <div
                  key={`tt_${item.trainNo}_${item.depTime}_${idx}`}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-xl bg-white border transition-all',
                    isFirst
                      ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-2xs'
                      : 'border-zinc-100 hover:border-zinc-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center text-[11px] font-bold text-zinc-400">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-zinc-900 font-mono">
                          {item.depTime}
                        </span>
                        <span
                          className={clsx(
                            'px-2 py-0.5 rounded-full text-[10px] font-extrabold',
                            isFirst
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-zinc-100 text-zinc-700'
                          )}
                        >
                          {item.destStation}행
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-zinc-400">
                        열차 #{item.trainNo}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex flex-col items-end gap-0.5">
                    <span
                      className={clsx(
                        'text-xs font-black',
                        isFirst ? 'text-emerald-600' : 'text-zinc-700'
                      )}
                    >
                      {item.statusText}
                    </span>
                    {isFirst && (
                      <span className="text-[9px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">
                        다음 열차
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ─── 3. 패널 풋터 (행선지 포함 요약 바) ──────────────────────────────────
  const footerContent = (
    <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/90 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
        <span className="truncate">
          {activeHighlightedTrain ? (
            <span className="font-medium text-zinc-700">
              추적 열차:{' '}
              {activeHighlightedTrain.destinationName && (
                <span className="font-bold text-zinc-900 mr-1">
                  [{activeHighlightedTrain.destinationName}]
                </span>
              )}
              <strong className={isDaejeon ? 'text-emerald-700' : 'text-blue-700'}>
                #{activeHighlightedTrain.train.trainNo}
              </strong>
              {activeHighlightedTrain.stationsAway !== undefined && (
                <span>
                  {' '}
                  (
                  {activeHighlightedTrain.stationsAway === 0
                    ? '당역'
                    : `${activeHighlightedTrain.stationsAway}역 전`}
                  )
                </span>
              )}
            </span>
          ) : upcomingTimetableTrain ? (
            <span className="font-medium text-zinc-700">
              다음 열차:{' '}
              <strong className="text-emerald-700 font-extrabold">
                {upcomingTimetableTrain.depTime} ({upcomingTimetableTrain.destStation}행)
              </strong>
            </span>
          ) : (
            <span>시간표 운행 안내</span>
          )}
        </span>
      </div>
      {activeHighlightedTrain ? (
        <span className={clsx('font-bold shrink-0 ml-2', isDaejeon ? 'text-emerald-600' : 'text-blue-600')}>
          {activeHighlightedTrain.eta.text}
        </span>
      ) : upcomingTimetableTrain ? (
        <span className="font-bold text-emerald-600 shrink-0 ml-2">
          {upcomingTimetableTrain.statusText}
        </span>
      ) : targetStatusText ? (
        <span className="font-bold text-blue-600 shrink-0 ml-2">
          {targetStatusText}
        </span>
      ) : null}
    </div>
  );

  const mainBodyContent =
    viewMode === 'timetable' && (isDaejeon || (data?.timetable && data.timetable.length > 0))
      ? timetableContent
      : listContent;

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
          {mainBodyContent}
          {footerContent}
        </div>
      </CustomBottomSheet>
    );
  }

  // 데스크톱 Web UI (좌측 독립 슬라이드 패널 - 여백 최적화)
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
        {mainBodyContent}
        {footerContent}
      </div>
    </div>
  );
};
