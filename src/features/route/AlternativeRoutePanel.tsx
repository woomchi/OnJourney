"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import type { Place, DirectionsApiResponse, DirectionResult, SelectedRoute } from '@/types/journey';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import ScrollContainer from 'react-indiana-drag-scroll';
import { CustomBottomSheet, useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { motion, useTransform, useMotionValue } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useScrollDragBridge } from '@/hooks/ui/useScrollDragBridge';
import { directionKeys } from '@/hooks/queries/useDirections';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import { getDefaultRoute } from '@/lib/routeUtils';

interface AlternativeRoutePanelProps {
  originPlace: Place;
  destPlace: Place;
  onClose: (isCancel?: boolean) => void;
  isOpen?: boolean;
  onExited?: () => void;
}

const parseSnapVal = (s: any): number => {
  if (s === 1 || s === '1') return 1;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    if (s.endsWith('vh')) {
      if (typeof window !== 'undefined') {
        const vh = parseFloat(s) || 0;
        return window.innerHeight * (vh / 100);
      }
    }
    return parseInt(s, 10) || 0;
  }
  return 0;
};

const FloatingButtonsContainer = ({ altHeight }: { altHeight: number }) => {
  const bottomSheet = useOptionalBottomSheet();
  const fallbackY = useMotionValue(0);
  const y = bottomSheet?.y || fallbackY;
  const maxHeight = bottomSheet?.maxHeight ?? 800;
  const opacity = useTransform(y, [-altHeight, -maxHeight + 100], [1, 0]);
  // Use a transform to dynamically disable pointer events when hidden
  const pointerEvents = useTransform(y, (latest: number) => latest < -altHeight - 100 ? 'none' : 'auto');
  
  return (
    <motion.div 
      id="mobile-map-buttons-target-route"
      className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] *:pointer-events-auto"
      style={{ opacity, pointerEvents: pointerEvents as any }}
    />
  );
};

export default function AlternativeRoutePanel({
  originPlace,
  destPlace,
  onClose,
  isOpen = false,
  onExited,
}: AlternativeRoutePanelProps) {
  const [animate, setAnimate] = useState(false);
  const [windowHeight, setWindowHeight] = useState(
    () => typeof window !== 'undefined' ? window.innerHeight : 812
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindowHeight(window.innerHeight);
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    activeJourney,
    selectSegmentRoute,
    setFocusBounds,
    setFocusedSegment,
    setFocusedStep,
    setHoveredAlternativeRoute,
  } = useJourneyStore();

  const [snap, setSnap] = useState<number | string | null>('46vh');
  const Scroller = 'div';

  const setGuidePanelState = useJourneyStore((state) => state.setGuidePanelState);


  // 모바일 터치 제스처 핸들러: 리스트 스크롤과 바텀시트 드래그 제스처 분리
  const { handlePointerDown, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel } = useScrollDragBridge({
    scrollRef: scrollContainerRef,
    snap,
    setSnap,
    minSnap: (windowHeight || 812) * 0.46,
    defaultSnap: (windowHeight || 812) * 0.46,
    maxSnap: 1
  });

  const parsedSnap = parseSnapVal(snap);
  const snapPx = parsedSnap === 1
    ? windowHeight - 16
    : (typeof snap === 'string' && snap.endsWith('vh') ? windowHeight * (parseFloat(snap) / 100) : parsedSnap);

  const contentMaxHeight = isMobile && snapPx > 0
    ? `${snapPx - 120}px`
    : '100%';



  useEffect(() => {
    if (isOpen) {
      if (snap === 1 || snap === '1') {
        setGuidePanelState('expanded');
      } else {
        setGuidePanelState('default');
      }
    } else {
      setGuidePanelState('default');
    }
  }, [isOpen, snap, setGuidePanelState]);

  const queryClient = useQueryClient();
  
  const publicKey = directionKeys.segmentPublic(originPlace.id, destPlace.id);
  const carKey = directionKeys.segmentCar(originPlace.id, destPlace.id);
  
  const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(publicKey);
  const carData = queryClient.getQueryData<{ car: DirectionResult[], walk: DirectionResult[] }>(carKey);
  
  const segmentData = useMemo(() => {
    if (!publicData && !carData) return undefined;
    return {
      public: publicData?.public || [],
      car: carData?.car || [],
      walk: carData?.walk || []
    };
  }, [publicData, carData]);

  const publicLoading = queryClient.getQueryState(publicKey)?.status === 'pending';
  const carLoading = queryClient.getQueryState(carKey)?.status === 'pending';
  const transportType = activeJourney?.transport_type || 'public';

  const activeRoute = useMemo(() => {
    return getDefaultRoute(originPlace, destPlace, segmentData, transportType);
  }, [originPlace, destPlace, segmentData, transportType]);

  const [activeTab, setActiveTab] = useState<'public' | 'car' | 'walk'>(
    activeRoute?.type === 'public' || activeRoute?.type === 'car' || activeRoute?.type === 'walk'
      ? activeRoute.type
      : transportType
  );

  const loading = activeTab === 'public' ? publicLoading : carLoading;

  const [activeSubTab, setActiveSubTab] = useState<string>('추천');
  const [displayLimit, setDisplayLimit] = useState(3);

  const isDraggedRef = useRef(false);
  const withClickPrevent = useCallback((fn: () => void) => {
    return () => {
      if (isDraggedRef.current) return;
      fn();
    };
  }, []);

  const [hoveredPreviewRoute, setHoveredPreviewRoute] = useState<DirectionResult | SelectedRoute | null>(null);
  const previewRoute = hoveredPreviewRoute || activeRoute;

  useEffect(() => {
    setHoveredAlternativeRoute(previewRoute as any);
    return () => setHoveredAlternativeRoute(null);
  }, [previewRoute, setHoveredAlternativeRoute]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(timer);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimate(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!publicData && !publicLoading) {
      queryClient.fetchQuery({
        queryKey: publicKey,
        queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace)
      }).catch(console.error);
    }
    if (!carData && !carLoading) {
      queryClient.fetchQuery({
        queryKey: carKey,
        queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace)
      }).catch(console.error);
    }
  }, [publicData, publicLoading, carData, carLoading, publicKey, carKey, queryClient, originPlace, destPlace]);

  const getEmoji = (type: string, name: string) => {
    if (type === 'public') {
      if (name.includes('기차') || name.includes('KTX') || name.includes('SRT') || name.includes('새마을') || name.includes('무궁화') || name.includes('ITX')) return '🚄';
      if (name.includes('지하철') || name.includes('선')) return '🚇';
      return '🚌';
    }
    if (type === 'taxi') return '🚕';
    if (type === 'car') return '🚗';
    if (type === 'walk') return '🚶';
    if (type === 'bicycle') return '🚴';
    if (type === 'kickboard') return '🛴';
    return '🚶';
  };

  const routes = segmentData ? (segmentData[activeTab] || []) : [];
  const selectedRoute = originPlace.selected_route && originPlace.selected_route.destId === destPlace.id ? originPlace.selected_route : null;

  const publicRouteGroups = useMemo(() => {
    if (activeTab !== 'public' || !routes) return {};

    const groups: Record<string, DirectionResult[]> = {};

    routes.forEach(route => {
      const transitTypes = new Set<string>();
      route.steps?.forEach(step => {
        if (step.type === 'train') transitTypes.add('기차');
        else if (step.type === 'expressbus') transitTypes.add('시외/고속');
        else if (step.type === 'subway') transitTypes.add('지하철');
        else if (step.type === 'bus') transitTypes.add('버스');
      });

      let category = '기타';
      if (transitTypes.size > 0) {
        const order = ['기차', '시외/고속', '지하철', '버스'];
        const sortedTypes = Array.from(transitTypes).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        category = sortedTypes.join(' + ');
      } else {
        if (route.steps?.some(s => s.type === 'car' || s.type === 'taxi')) category = '택시/차량';
        else if (route.steps?.some(s => s.type === 'walk')) category = '도보';
      }

      if (!groups[category]) groups[category] = [];
      groups[category].push(route);
    });

    return groups;
  }, [activeTab, routes]);

  const subTabs = useMemo(() => {
    if (activeTab !== 'public') return [];

    const order = ['기차', '시외/고속', '지하철', '버스', '기타'];
    const activeCategories = Object.keys(publicRouteGroups);

    const sortedCategories = activeCategories.sort((a, b) => {
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      const valA = indexA === -1 ? 999 : indexA;
      const valB = indexB === -1 ? 999 : indexB;
      return valA - valB;
    });

    return ['전체', '추천', ...sortedCategories];
  }, [activeTab, publicRouteGroups]);

  const { routeTags, recommendedRouteIds } = useMemo(() => {
    if (activeTab !== 'public' || !routes || routes.length === 0) {
      return { routeTags: {} as Record<string, string[]>, recommendedRouteIds: new Set<string>() };
    }

    const tags: Record<string, string[]> = {};
    const recIds = new Set<string>();

    let minDurationRoute = routes[0];
    let minTransfersRoute = routes[0];
    let minWalkRoute = routes[0];

    const getTransfers = (r: DirectionResult) => r.steps?.filter(s => s.type !== 'walk').length || 0;
    const getWalkTime = (r: DirectionResult) => r.steps?.filter(s => s.type === 'walk').reduce((acc, s) => acc + s.duration, 0) || 0;

    routes.forEach(route => {
      if (route.duration < minDurationRoute.duration) minDurationRoute = route;
      if (getTransfers(route) < getTransfers(minTransfersRoute)) minTransfersRoute = route;
      if (getWalkTime(route) < getWalkTime(minWalkRoute)) minWalkRoute = route;
    });

    const addTag = (id: string, tag: string) => {
      if (!tags[id]) tags[id] = [];
      if (!tags[id].includes(tag)) tags[id].push(tag);
    };

    addTag(minDurationRoute.id, '최단 시간');
    recIds.add(minDurationRoute.id);

    addTag(minTransfersRoute.id, '최소 환승');
    recIds.add(minTransfersRoute.id);

    addTag(minWalkRoute.id, '최소 도보');
    recIds.add(minWalkRoute.id);

    Object.entries(publicRouteGroups).forEach(([category, catRoutes]) => {
      if (catRoutes.length > 0) {
        const fastestInCategory = catRoutes.reduce((prev, curr) => prev.duration < curr.duration ? prev : curr);
        recIds.add(fastestInCategory.id);
      }
    });

    return { routeTags: tags, recommendedRouteIds: recIds };
  }, [activeTab, routes, publicRouteGroups]);

  const displayedRoutes = useMemo(() => {
    if (activeTab !== 'public') return routes;

    let filtered = [];
    if (activeSubTab === '추천') {
      filtered = routes.filter(r => recommendedRouteIds.has(r.id)).sort((a, b) => a.duration - b.duration);
    } else if (activeSubTab === '전체') {
      filtered = [...routes].sort((a, b) => a.duration - b.duration);
    } else {
      filtered = [...(publicRouteGroups[activeSubTab] || [])].sort((a, b) => a.duration - b.duration);
    }

    return filtered;
  }, [activeTab, activeSubTab, routes, publicRouteGroups, recommendedRouteIds]);

  const renderRouteButton = (route: DirectionResult) => {
    const isSelected = previewRoute ? previewRoute.id === route.id : false;
    const emoji = getEmoji(route.type, route.name);
    const tags = routeTags ? (routeTags[route.id] || []) : [];

    return (
      <button
        key={route.id}
        type="button"
        onClick={withClickPrevent(() => {
          setHoveredPreviewRoute(route);
        })}
        className={`
          flex items-center justify-between w-full py-2 px-3 min-h-[48px] rounded-xl border transition-all duration-200 text-left cursor-pointer group
          ${isSelected
            ? 'border-blue-400 bg-blue-50/80 shadow-[0_2px_10px_rgba(59,130,246,0.12)]'
            : 'border-zinc-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm'
          }
        `}
      >
        {/* Left: Icon and Name/Fare */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors ${isSelected ? 'bg-white shadow-sm' : 'bg-zinc-50 group-hover:bg-white group-hover:shadow-sm'}`}>
              {emoji}
            </div>
            {isSelected && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm border-2 border-blue-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-white">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0 justify-center flex-1 pr-2">
            <span className={`text-xs font-bold truncate leading-tight ${isSelected ? 'text-blue-700' : 'text-zinc-800 group-hover:text-blue-600'}`}>
              {route.name.replace(/\s*\+\s*/g, ' → ')}
            </span>
            {activeTab === 'car' ? (
              <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                택시 {route.taxiFare?.toLocaleString()}원 {route.fare > 0 ? `(통행료 ${route.fare.toLocaleString()}원)` : '(통행료 무료)'}
              </span>
            ) : activeTab === 'walk' ? (
              <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                무료
              </span>
            ) : (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? (
              <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                예매처 확인
              </span>
            ) : route.fare > 0 ? (
              <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                {route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500 font-semibold mt-0.5">
                요금 정보 없음
              </span>
            )}
          </div>
        </div>

        {/* Right: Tags & Duration */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {/* Tags Grid */}
          {tags.length > 0 && (
            <div className="grid grid-cols-2 gap-1 flex-shrink-0">
              {tags.map(tag => (
                <span key={tag} className="px-1.5 py-[3px] text-[9px] font-extrabold rounded bg-blue-50 text-blue-600 whitespace-nowrap text-center">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col items-end min-w-[32px]">
            <span className={`text-[13px] font-black tracking-tight ${isSelected ? 'text-blue-600' : 'text-zinc-900'}`}>
              {route.duration}분
            </span>
          </div>
        </div>
      </button>
    );
  };

  const headerContent = (
    <>
      <div className="px-4 pt-1.5 pb-3 border-b border-zinc-100 flex flex-col gap-2.5">
        {/* 1층: 취소 / 변경 버튼을 양쪽 끝 엣지 영역에 가깝게 배치 */}
        <div className="flex items-center justify-between w-full px-1">
          <button
            type="button"
            onClick={() => {
              setHoveredAlternativeRoute(null);
              onClose(true);
            }}
            className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            취소
          </button>

          <button
            type="button"
            onClick={() => {
              if (previewRoute) {
                const selectedRouteObj = {
                  destId: destPlace.id,
                  id: previewRoute.id,
                  type: previewRoute.type,
                  name: previewRoute.name,
                  duration: previewRoute.duration,
                  fare: previewRoute.fare,
                  taxiFare: previewRoute.taxiFare,
                  distance: previewRoute.distance,
                  isIntercity: previewRoute.isIntercity,
                  isFareEstimated: previewRoute.isFareEstimated,
                  steps: previewRoute.steps,
                  pathPoints: previewRoute.pathPoints,
                  guide: previewRoute.guide,
                };
                selectSegmentRoute(originPlace.id, selectedRouteObj);
              }
              setHoveredAlternativeRoute(null);
              onClose();
            }}
            className="px-2.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            변경
          </button>
        </div>

        {/* 2층: 중앙에 고정된 화살표와 좌우 균등 분할된 출발/도착지 텍스트 박스 */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full mt-0.5 px-1">
          {/* 출발지 (왼쪽 영역 중앙 정렬) */}
          <div className="flex justify-center min-w-0 pr-1">
            <span className="text-sm font-extrabold text-zinc-800 truncate" title={originPlace.place_name}>
              {originPlace.place_name}
            </span>
          </div>
          
          {/* 화살표 아이콘 (정중앙 고정) */}
          <div className="flex items-center justify-center px-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5 text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </div>
          
          {/* 도착지 (오른쪽 영역 중앙 정렬) */}
          <div className="flex justify-center min-w-0 pl-1">
            <span className="text-sm font-extrabold text-zinc-800 truncate" title={destPlace.place_name}>
              {destPlace.place_name}
            </span>
          </div>
        </div>
      </div>

      <div className={`px-5 ${isMobile ? 'pt-1.5 pb-1' : 'pt-4 pb-2'} flex-shrink-0 flex flex-col gap-1.5`}>
        {!isMobile && (
          <div className="flex bg-zinc-50 p-1 rounded-xl border border-zinc-100">
            {(['public', 'car', 'walk'] as const).map((tab) => {
              const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setActiveSubTab('추천');
                    setDisplayLimit(3);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`
                    flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer
                    ${isActive
                      ? 'bg-white text-blue-600 shadow-sm border border-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50 border border-transparent'
                    }
                  `}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'public' && subTabs.length > 1 && (
          <div onPointerDown={(e) => e.stopPropagation()}>
            <ScrollContainer
              className="flex items-center gap-1.5 pb-1 pt-0 cursor-grab"
              horizontal
              vertical={false}
              hideScrollbars
              onStartScroll={() => { isDraggedRef.current = false; }}
              onScroll={() => { isDraggedRef.current = true; }}
              onEndScroll={() => { setTimeout(() => { isDraggedRef.current = false; }, 50); }}
            >
              {subTabs.map((subTab) => {
                const count = subTab === '추천' ? recommendedRouteIds.size : subTab === '전체' ? routes.length : (publicRouteGroups[subTab]?.length || 0);
                return (
                  <button
                    key={subTab}
                    type="button"
                    onClick={withClickPrevent(() => {
                      setActiveSubTab(subTab);
                      setDisplayLimit(3);
                    })}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={`
                      flex-shrink-0 px-2.5 py-1 text-[10.5px] font-bold rounded-full transition-all duration-200 border cursor-pointer flex items-center gap-1
                      ${activeSubTab === subTab
                        ? 'bg-zinc-800 text-white border-zinc-800 shadow-sm'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }
                    `}
                  >
                    <span>{subTab}</span>
                    <span className={`text-[10px] ${activeSubTab === subTab ? 'text-zinc-400' : 'text-zinc-400'}`}>{count}</span>
                  </button>
                );
              })}
            </ScrollContainer>
          </div>
        )}
      </div>
    </>
  );

  const listProps = {};

  const listContent = (
    <Scroller 
      {...listProps}
      ref={scrollContainerRef}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-none scrollbar-sidebar relative bg-white px-5 pt-1"
      style={{ paddingBottom: isMobile ? '7.5rem' : '2.5rem', maxHeight: contentMaxHeight }}
      onPointerDown={isMobile ? handlePointerDown : undefined}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onWheel={isMobile ? handleWheel : undefined}
    >
      {previewRoute?.isEstimated && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 text-xs font-semibold">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>네트워크 지연으로 인한 예상 경로입니다.</span>
        </div>
      )}
      {loading ? (
        <div className="animate-pulse flex flex-col gap-3 mt-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[60px] bg-zinc-100 rounded-xl w-full border border-zinc-50"></div>
          ))}
        </div>
      ) : displayedRoutes.length === 0 ? (
        <div className="text-center py-12 text-sm font-medium text-zinc-400">
          선택 가능한 경로가 없습니다.
        </div>
      ) : (
        <>
          {(activeSubTab === '추천' ? displayedRoutes : displayedRoutes.slice(0, displayLimit)).map((route) => renderRouteButton(route))}
          {activeSubTab !== '추천' && displayedRoutes.length > displayLimit && (
            <button
              type="button"
              onClick={() => setDisplayLimit(prev => prev + 5)}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full py-2.5 mt-1 text-[13px] font-bold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-150 flex items-center justify-center gap-1.5 shadow-sm"
            >
              대안 더보기 (남은 대안: {displayedRoutes.length - displayLimit}개)
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </>
      )}
    </Scroller>
  );

  if (isMobile) {
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (snap === '46vh' || snap === 0.46) currentSnapType = 'default';
    else if (snap === 1 || snap === '1') currentSnapType = 'max';

    const altHeight = windowHeight * 0.46;

    return (
      <>
        <CustomBottomSheet
          isOpen={isOpen}
          minHeight={altHeight}
          defaultHeight={altHeight}
          maxHeight={windowHeight - 16}
          initialSnap={currentSnapType}
          zIndex={45}
          onSnap={(snapName) => {
            if (snapName === 'min' || snapName === 'default') setSnap('46vh');
            else if (snapName === 'max') setSnap(1);
          }}
          onClose={() => {
            onClose();
          }}
          onExited={onExited}
        >
          <FloatingButtonsContainer altHeight={altHeight} />
          <div className="flex flex-col relative w-full h-full min-h-0 pb-[60px] bg-white">
            {headerContent}
            {listContent}
          </div>
        </CustomBottomSheet>

        {/* 바텀 시트 위에 독립적으로 떠 있는 플로팅 탭 바 */}
        {isOpen && (
          <div 
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[46] flex bg-white/95 backdrop-blur-md p-1.5 rounded-full border border-zinc-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.15)] min-w-[300px] justify-between pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(['public', 'car', 'walk'] as const).map((tab) => {
              const label = tab === 'public' ? '대중교통' : tab === 'car' ? '차량' : '도보';
              const icon = tab === 'public' ? '🚌' : tab === 'car' ? '🚗' : '🚶';
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setActiveSubTab('추천');
                    setDisplayLimit(3);
                  }}
                  className={`
                    flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-full transition-all duration-200 cursor-pointer
                    ${isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-150/40'
                    }
                  `}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !isOpen && onExited) {
          onExited();
        }
      }}
      style={{
        zIndex: animate ? 45 : 40,
        transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms',
      }}
      className={`absolute bg-white border-t border-zinc-200 flex flex-col overflow-hidden z-[100] md:z-auto
        bottom-0 left-0 right-0 w-full rounded-t-[20px] rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
        md:top-6 md:bottom-6 md:left-4 md:right-auto md:w-[360px] md:rounded-3xl md:border md:border-zinc-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.12)]
        md:h-auto
        ${animate
          ? 'md:translate-x-0 md:translate-y-0 opacity-100'
          : 'md:translate-y-0 md:-translate-x-[calc(100%+24px)] opacity-0'
        }
      `}
    >
      <div className="flex flex-col h-full bg-white relative">
        {headerContent}
        {listContent}
      </div>
    </div>
  );
}
