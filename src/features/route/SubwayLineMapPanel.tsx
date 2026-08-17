'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ArrowLeft, X, RefreshCw, Train, ArrowDown, ArrowUp, Navigation } from 'lucide-react';
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

  if (clean === '1001' || clean === '1' || clean.includes('1호선')) {
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

  useEffect(() => {
    if (isOpen) {
      setSelectedDirection(wayCode === '2' ? '1' : '0');
      setUserSelectedTrainNo(null);
    }
  }, [isOpen, wayCode]);

  const lineTarget = subwayNm || subwayId || '2호선';
  const theme = useMemo(() => getSubwayLineTheme(lineTarget), [lineTarget]);

  const { data, isLoading, isFetching, refetch } = useSubwayLinePositions({
    subwayId,
    subwayNm,
    branchId: selectedBranchId,
    stationName: cleanTargetStation,
    enabled: isOpen,
    refetchInterval: 60000,
  });

  // 서버에서 기본 추천된 branchId가 오면 동기화 (초기 1회)
  useEffect(() => {
    if (data?.selectedBranchId && !selectedBranchId) {
      setSelectedBranchId(data.selectedBranchId);
    }
  }, [data?.selectedBranchId, selectedBranchId]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const targetStationNodeRef = useRef<HTMLDivElement>(null);

  // 방향별 라벨 산출 (2호선은 내선/외선, 기타는 상행/하행)
  const isLine2 = lineTarget === '1002' || lineTarget === '2' || lineTarget.includes('2호선');
  const upLabel = isLine2 ? '내선 순환' : '상행';
  const downLabel = isLine2 ? '외선 순환' : '하행';

  // 정차역 목록 (방향에 맞춰 순서 반전)
  const orderedStations = useMemo(() => {
    if (!data?.stations || data.stations.length === 0) return [];
    const stationsCopy = [...data.stations];

    if (selectedDirection === '1' && !isLine2) {
      return stationsCopy.reverse();
    }
    return stationsCopy;
  }, [data?.stations, selectedDirection, isLine2]);

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

  // 탑승역으로 접근 중인 열차 분석 (역순 정렬: 당역/1역전/2역전...)
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
    const approachingList: Array<{ trainNo: string; stationsAway: number; train: SubwayPosition }> = [];

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
        approachingList.push({ trainNo: cleanNo, stationsAway, train: t });
      }
    }

    // stationsAway 오름차순 정렬 (0: 당역, 1: 1역전, ...)
    approachingList.sort((a, b) => a.stationsAway - b.stationsAway);

    // 하이라이트할 최우선 열차 번호 결정:
    // 1) 사용자가 수동으로 선택한 열차가 있으면 우선 반영
    // 2) 칩에서 전달된 targetTrainNo가 접근 목록에 있고 3역 이내면 유지
    // 3) 그렇지 않고 접근 중인 열차가 존재하면 가장 가까운 1순위 열차로 자동 선정
    let primaryTrainNo = '';
    if (userSelectedTrainNo) {
      primaryTrainNo = userSelectedTrainNo.replace(/^0+/, '');
    } else {
      const matchedTarget = approachingList.find(
        (item) => item.trainNo === cleanTargetTrainNo
      );

      if (matchedTarget && matchedTarget.stationsAway <= 3) {
        primaryTrainNo = matchedTarget.trainNo;
      } else if (approachingList.length > 0) {
        primaryTrainNo = approachingList[0].trainNo;
      } else {
        primaryTrainNo = cleanTargetTrainNo;
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
    return {
      train: trainObj,
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
  const activeBranch = branches.find((b) => b.id === (selectedBranchId || data?.selectedBranchId));

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
    const walk = (x - startXRef.current) * 1.5; // 드래그 감도
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

  // ─── 패널 헤더 (여백 최적화 & 운행 계통 탭 바) ───────────────────────────
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

      {/* 2층: 네이버 지도 스타일 운행 구간(계통) 가로 스와이프 탭 바 (2개 이상 계통 시 표출) */}
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
                  // 드래그 중인 경우 클릭 전환 방지 (5px 이상 이동 시)
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

      {/* 3층: 콤팩트 방향 전환 탭 (대안 패널 탭 스타일) */}
      <div className="flex px-3 pb-2.5 gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedDirection('0')}
          className={clsx(
            'flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer select-none',
            selectedDirection === '0'
              ? 'bg-blue-600 text-white shadow-xs'
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
              ? 'bg-blue-600 text-white shadow-xs'
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

  // ─── 타임라인 바디 (엣지-노드 완벽 중앙 정렬 & 호버 하이라이트 제거) ─────
  const listContent = (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-3 py-2 space-y-0 relative bg-white scrollbar-thin select-none"
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
          {/* 정차역 목록 */}
          {orderedStations.map((station: SubwayLineStation, idx: number) => {
            const isFirst = idx === 0;
            const isLast = idx === orderedStations.length - 1;
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
                  'relative flex items-center justify-between py-1.5 px-0 transition-none',
                  isTargetStation && 'my-0'
                )}
              >
                {/* 탑승역 강조 배경 (간선 라인과 충돌/끊김 없이 은은하게 강조) */}
                {isTargetStation && (
                  <div className="absolute inset-0 bg-blue-50/70 rounded-xl -z-10 pointer-events-none" />
                )}

                {/* 각 역 단위 수직 간선 (첫 역의 위쪽, 마지막 역의 아래쪽 선 제거 & 끊김 없는 연속성) */}
                {orderedStations.length > 1 && (
                  <div
                    className={clsx(
                      'absolute left-[11px] w-[2px] pointer-events-none opacity-60 z-0',
                      theme.line,
                      isFirst && 'top-1/2 bottom-0',
                      isLast && 'top-0 bottom-1/2',
                      !isFirst && !isLast && 'top-0 bottom-0'
                    )}
                  />
                )}

                {/* 왼쪽: [고정 24px 노드 컬럼 (중앙 정렬)] + 역명 */}
                <div className="flex items-center gap-1.5 relative z-10 min-w-0">
                  {/* 정차역 점(Dot) 컨테이너 (x축 24px 내에서 정확히 중앙 정렬) */}
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    <div
                      className={clsx(
                        'rounded-full transition-all shrink-0',
                        isTargetStation
                          ? 'w-3 h-3 bg-blue-600 ring-2 ring-blue-400/40 shadow-xs'
                          : clsx('w-2 h-2', theme.badgeBg)
                      )}
                    />
                  </div>

                  {/* 역명 & 탑승역 뱃지 */}
                  <div className="flex items-center gap-1 min-w-0 truncate">
                    <span
                      className={clsx(
                        'text-xs truncate',
                        isTargetStation
                          ? 'font-black text-blue-700 text-[13px]'
                          : 'font-semibold text-zinc-800'
                      )}
                    >
                      {station.stationName}
                    </span>

                    {isTargetStation && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[9px] font-bold shadow-2xs shrink-0 animate-pulse">
                        <Navigation className="w-2 h-2 fill-current" />
                        탑승역
                      </span>
                    )}
                  </div>
                </div>

                {/* 오른쪽: 정차역에 위치한 열차 뱃지 */}
                <div className="flex flex-col items-end gap-1 z-10 shrink-0 pr-1">
                  {trainsAtStation.map((train, trainIdx) => {
                    const cleanNo = train.trainNo.replace(/^0+/, '');
                    const isTargetTrain =
                      Boolean(primaryTrainNo) && (cleanNo === primaryTrainNo || train.trainNo === primaryTrainNo);
                    const stationsAway = trainAwayMap.get(cleanNo);
                    const statusBadge = getTrainStatusBadge(train.trainSttus);
                    const trainEta = calculateDynamicETA(stationsAway, train.trainSttus, targetMinutesLeft);

                    return (
                      <button
                        type="button"
                        key={`${train.trainNo}-${trainIdx}`}
                        onClick={() => setUserSelectedTrainNo(train.trainNo)}
                        title={`열차 #${train.trainNo} 선택`}
                        className={clsx(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] shadow-2xs border transition-all cursor-pointer select-none text-left',
                          isTargetTrain
                            ? 'bg-blue-600 text-white border-blue-700 font-bold scale-105 ring-2 ring-blue-300 shadow-xs'
                            : train.isExpress
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50'
                        )}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <Train className="w-3 h-3 shrink-0" />
                        <span className="tabular-nums font-bold text-[10px]">
                          #{train.trainNo}
                        </span>

                        {train.isExpress && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-rose-600 text-white">
                            급행
                          </span>
                        )}

                        <span
                          className={clsx(
                            'px-1 py-0.2 rounded text-[8px] font-bold border',
                            isTargetTrain ? 'bg-white text-blue-700 border-white' : statusBadge.color
                          )}
                        >
                          {statusBadge.text}
                        </span>

                        {/* 도달 역 수 뱃지 (N역 전) */}
                        {stationsAway !== undefined && (
                          <span
                            className={clsx(
                              'px-1 py-0.2 rounded text-[8px] font-bold',
                              isTargetTrain
                                ? 'bg-blue-700 text-white'
                                : 'bg-zinc-100 text-zinc-600'
                            )}
                          >
                            {stationsAway === 0 ? '당역' : `${stationsAway}역 전`}
                          </span>
                        )}

                        {/* 실시간 위치 기반 보정된 잔여 시간 */}
                        {isTargetTrain && (
                          <span className="text-[9px] font-black ml-0.5">
                            {trainEta.text}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── 패널 풋터 (산뜻한 화이트/그레이 요약 바) ─────────────────────────────
  const footerContent = (
    <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/90 flex items-center justify-between text-[10px] text-zinc-500 shrink-0 select-none">
      <div className="flex items-center gap-1.5 min-w-0 truncate">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
        <span className="truncate">
          {activeHighlightedTrain ? (
            <span className="font-medium text-zinc-700">
              추적 열차: <strong className="text-blue-700">#{activeHighlightedTrain.train.trainNo}</strong>
              {activeHighlightedTrain.stationsAway !== undefined && (
                <span> ({activeHighlightedTrain.stationsAway === 0 ? '당역' : `${activeHighlightedTrain.stationsAway}역 전`})</span>
              )}
            </span>
          ) : (
            <span>실시간 운행 (1분 자동 갱신)</span>
          )}
        </span>
      </div>
      {activeHighlightedTrain ? (
        <span className="font-bold text-blue-600 shrink-0 ml-2">
          {activeHighlightedTrain.eta.text}
        </span>
      ) : targetStatusText ? (
        <span className="font-bold text-blue-600 shrink-0 ml-2">
          {targetStatusText}
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

  // 데스크톱 Web UI (좌측 독립 슬라이드 패널 - 여백 최적화)
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
