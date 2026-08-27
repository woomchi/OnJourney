"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { calculateSegmentBounds } from '@/lib/services/naverMapRouteService';
import ScrollContainer from 'react-indiana-drag-scroll';
import { CustomBottomSheet, useOptionalBottomSheet } from '@/components/common/CustomBottomSheet';
import { BOTTOM_SHEET_SNAP } from '@/constants/layout';
import { motion, AnimatePresence, useTransform, useMotionValue } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useScrollDragBridge } from '@/hooks/ui/useScrollDragBridge';
import { directionKeys } from '@/hooks/queries/useDirections';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi, fetchTmapDetailRouteApi } from '@/lib/services/directionsService';
import { getDefaultRoute } from '@/lib/utils/routeUtils';
import FittedDuration from '@/components/places/FittedDuration';
import { usePWA } from '@/components/PWAProvider';
import DepartureTimeSelector from '@/components/common/DepartureTimeSelector';
import FareBreakdownTooltip from '@/components/route/FareBreakdownTooltip';
import { formatDurationMinutes, inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import RouteTimelineGaugeBar from '@/components/route/RouteTimelineGaugeBar';
import { SegmentBusRealtimeChip } from '@/components/transit/SegmentBusRealtimeChip';
import { SegmentSubwayRealtimeChip } from '@/components/transit/SegmentSubwayRealtimeChip';
import { RefreshCw } from 'lucide-react';
import type { Place, DirectionsApiResponse, DirectionResult, SelectedRoute, SnapMeta } from '@/types/journey';

interface AlternativeRoutePanelProps {
  originPlace: Place;
  destPlace: Place;
  onClose: (isCancel?: boolean) => void;
  isOpen?: boolean;
  onExited?: () => void;
}

const parseSnapVal = (s: number | string | null | undefined): number => {
  if (!s) return 0;
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
  const opacity = useTransform(y, [-maxHeight + 160, -maxHeight + 40], [1, 0]);
  const pointerEvents = useTransform(y, (latest: number) => (latest < -maxHeight + 60 ? 'none' : 'auto'));
  
  return (
    <motion.div 
      id="mobile-map-buttons-target-route"
      className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] *:pointer-events-auto"
      style={{ opacity, pointerEvents: pointerEvents as unknown as React.CSSProperties['pointerEvents'] }}
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
  const { isInstalled } = usePWA();
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

  const [activeTooltip, setActiveTooltip] = useState<'origin' | 'dest' | null>(null);

  useEffect(() => {
    if (!activeTooltip) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.tooltip-trigger') && !target.closest('.tooltip-content')) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [activeTooltip]);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    activeJourney,
    selectSegmentRoute,
    setFocusBounds,
    setFocusedSegment,
    setFocusedStep,
    setHoveredAlternativeRoute,
    departureTime,
    setGuidePanelState,
  } = useJourneyStore(
    useShallow((state) => ({
      activeJourney: state.activeJourney,
      selectSegmentRoute: state.selectSegmentRoute,
      setFocusBounds: state.setFocusBounds,
      setFocusedSegment: state.setFocusedSegment,
      setFocusedStep: state.setFocusedStep,
      setHoveredAlternativeRoute: state.setHoveredAlternativeRoute,
      departureTime: state.departureTime,
      setGuidePanelState: state.setGuidePanelState,
    }))
  );

  const [snap, setSnap] = useState<number | string | null>(BOTTOM_SHEET_SNAP.ALTERNATIVE_DEFAULT);
  const Scroller = 'div';
  const [isDetailLoading, setIsDetailLoading] = useState<Record<string, boolean>>({});

  const handleWalkRouteClick = async (route: DirectionResult) => {
    setHoveredPreviewRoute(route);

    if (route.isEstimated && (!route.detailedPathPoints || route.detailedPathPoints.length === 0)) {
      setIsDetailLoading(prev => ({ ...prev, [route.id]: true }));
      try {
        const sx = route.snappedStart ? route.snappedStart.lng : originPlace.lng;
        const sy = route.snappedStart ? route.snappedStart.lat : originPlace.lat;
        const ex = route.snappedEnd ? route.snappedEnd.lng : destPlace.lng;
        const ey = route.snappedEnd ? route.snappedEnd.lat : destPlace.lat;

        const detail = await fetchTmapDetailRouteApi(sx, sy, ex, ey);

        // Update React Query Cache so it propagates to all components
        queryClient.setQueryData<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }>(carKey, (oldData) => {
          if (!oldData) return oldData;
          const updatedWalk = oldData.walk.map(w => {
            if (w.id === route.id) {
              return {
                ...w,
                detailedPathPoints: detail.polyline,
                guide: detail.guide,
                steps: w.steps.map((step, sIdx) => {
                  if (sIdx === 0) {
                    let mergedPath = [...w.pathPoints];
                    if (w.snappedStart) {
                      mergedPath = [...w.pathPoints.slice(0, -1), ...detail.polyline];
                    } else if (w.snappedEnd) {
                      mergedPath = [...detail.polyline, ...w.pathPoints.slice(1)];
                    }
                    return {
                      ...step,
                      pathPoints: mergedPath
                    };
                  }
                  return step;
                }),
                pathPoints: (() => {
                  if (w.snappedStart) {
                    return [...w.pathPoints.slice(0, -1), ...detail.polyline];
                  } else if (w.snappedEnd) {
                    return [...detail.polyline, ...w.pathPoints.slice(1)];
                  }
                  return detail.polyline;
                })()
              };
            }
            return w;
          });
          return {
            ...oldData,
            walk: updatedWalk
          };
        });

        // Also update local preview state
        setHoveredPreviewRoute(prev => {
          if (prev && prev.id === route.id) {
            return {
              ...prev,
              detailedPathPoints: detail.polyline,
              guide: detail.guide,
              pathPoints: (() => {
                if (prev.snappedStart) {
                  return [...prev.pathPoints.slice(0, -1), ...detail.polyline];
                } else if (prev.snappedEnd) {
                  return [...detail.polyline, ...prev.pathPoints.slice(1)];
                }
                return detail.polyline;
              })()
            };
          }
          return prev;
        });

      } catch (err) {
        console.warn('TMAP 상세 경로 조회 실패, 기본 경로 폴리라인으로대체합니다:', err);
        // Fallback: Use existing pathPoints as detailedPathPoints so UI renders safely
        setHoveredPreviewRoute(prev => {
          if (prev && prev.id === route.id) {
            return {
              ...prev,
              detailedPathPoints: prev.pathPoints,
            };
          }
          return prev;
        });
      } finally {
        setIsDetailLoading(prev => ({ ...prev, [route.id]: false }));
      }
    }
  };


  // 모바일 터치 제스처 핸들러: 리스트 스크롤과 바텀시트 드래그 제스처 분리
  const { handlePointerDown, handleTouchStart, handleTouchMove, handleTouchEnd, handleWheel } = useScrollDragBridge({
    scrollRef: scrollContainerRef,
    snap,
    setSnap,
    minSnap: (windowHeight || 812) * 0.46 + 20,
    defaultSnap: (windowHeight || 812) * 0.46 + 20,
    maxSnap: 1
  });

  const parsedSnap = parseSnapVal(snap);
  const snapPx = parsedSnap === 1
    ? windowHeight - 16
    : (typeof snap === 'string' && snap.endsWith('vh') ? windowHeight * (parseFloat(snap) / 100) + 20 : parsedSnap);

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
  
  const publicKey = directionKeys.segmentPublic(originPlace.id, destPlace.id, departureTime);
  const carKey = directionKeys.segmentCar(originPlace.id, destPlace.id, departureTime);
  
  const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(publicKey);
  const carData = queryClient.getQueryState(carKey)?.data as { car: DirectionResult[], walk: DirectionResult[] } | undefined;
  
  const segmentData = useMemo(() => {
    if (!publicData && !carData) return undefined;
    return {
      public: publicData?.public || [],
      car: carData?.car || [],
      walk: carData?.walk || []
    };
  }, [publicData, carData]);

function isRouteMatch(
  r1?: DirectionResult | SelectedRoute | null,
  r2?: DirectionResult | SelectedRoute | null
): boolean {
  if (!r1 || !r2) return false;
  if (r1.id && r2.id && r1.id === r2.id) return true;
  if (r1.type !== r2.type || r1.duration !== r2.duration) return false;
  const s1 = r1.steps || [];
  const s2 = r2.steps || [];
  if (s1.length !== s2.length) return false;
  return s1.every((step, idx) => step.type === s2[idx]?.type && step.name === s2[idx]?.name);
}

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
  const activeTabRoutes = segmentData ? (segmentData[activeTab] || []) : [];
  
  const previewRoute = useMemo(() => {
    if (hoveredPreviewRoute && hoveredPreviewRoute.type === activeTab) {
      return hoveredPreviewRoute;
    }
    if (activeRoute && activeRoute.type === activeTab) {
      return activeRoute;
    }
    return activeTabRoutes[0] || activeRoute;
  }, [hoveredPreviewRoute, activeRoute, activeTab, activeTabRoutes]);

  useEffect(() => {
    setHoveredAlternativeRoute(previewRoute);
    return () => setHoveredAlternativeRoute(null);
  }, [previewRoute, setHoveredAlternativeRoute]);

  useEffect(() => {
    if (isOpen) {
      setAnimate(true);
      setHoveredPreviewRoute(null);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnimate(false);
      setHoveredPreviewRoute(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!publicData && !publicLoading) {
      queryClient.fetchQuery({
        queryKey: publicKey,
        queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace, departureTime || undefined)
      }).catch(console.error);
    }
    if (!carData && !carLoading) {
      queryClient.fetchQuery({
        queryKey: carKey,
        queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace, departureTime || undefined)
      }).catch(console.error);
    }
  }, [publicData, publicLoading, carData, carLoading, publicKey, carKey, queryClient, originPlace, destPlace, departureTime]);

  const getEmoji = (route: DirectionResult) => {
    const type = route.type as string;
    const name = route.name || '';

    if (type === 'public') {
      const firstTransitStep = route.steps?.find(s => s.type !== 'walk');
      if (firstTransitStep) {
        if (firstTransitStep.type === 'train') return '🚄';
        if (firstTransitStep.type === 'subway') return '🚇';
        if (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus') return '🚌';
      }
      if (name.includes('기차') || name.includes('KTX') || name.includes('SRT') || name.includes('새마을') || name.includes('무궁화') || name.includes('ITX')) return '🚄';
      if (name.includes('지하철') || name.includes('선')) return '🚇';
      return '🚌';
    }
    if (type === 'subway') return '🚇';
    if (type === 'bus' || type === 'expressbus') return '🚌';
    if (type === 'train') return '🚄';
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

  // activeRoute가 속한 서브탭 자동 감지
  const matchedSubTab = useMemo(() => {
    if (activeTab !== 'public' || !activeRoute) return '추천';
    if (recommendedRouteIds.has(activeRoute.id)) return '추천';

    for (const [category, catRoutes] of Object.entries(publicRouteGroups)) {
      if (catRoutes.some(r => isRouteMatch(r, activeRoute))) {
        return category;
      }
    }
    return '추천';
  }, [activeTab, activeRoute, recommendedRouteIds, publicRouteGroups]);

  const hasAutoSelectedSubTabRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasAutoSelectedSubTabRef.current && matchedSubTab) {
      setActiveSubTab(matchedSubTab);
      hasAutoSelectedSubTabRef.current = true;
    }
    if (!isOpen) {
      hasAutoSelectedSubTabRef.current = false;
    }
  }, [isOpen, matchedSubTab]);

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

  const [isCarRefreshing, setIsCarRefreshing] = useState(false);

  const RouteRealtimeRefreshButton = useCallback(({ route, originPlace }: { route: DirectionResult; originPlace: Place }) => {
    const firstTransitStep = route.steps?.find(s => s.type !== 'walk');
    
    if (firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus')) {
      const firstBusStep = firstTransitStep;
      const busStationId =
        firstBusStep.realtimeStationId ||
        firstBusStep.startStationID ||
        firstBusStep.startID ||
        firstBusStep.nodeId;
      const busNo = firstBusStep.name;
      const busStationName = firstBusStep.startName || originPlace.place_name;
      const busRegion = firstBusStep.startRegion || inferRegionFromPlace(originPlace);
      const busLat = firstBusStep.startY || firstBusStep.startLat || originPlace.lat;
      const busLng = firstBusStep.startX || firstBusStep.startLng || originPlace.lng;
      const busCityCode = firstBusStep.startCityCode || firstBusStep.cityCode;
      const odsayBusId = firstBusStep.odsayBusId || firstBusStep.busID;
      const tagoRouteId = firstBusStep.tagoRouteId || firstBusStep.busLocalBlID;
      const busId = odsayBusId || tagoRouteId;
      const busType = firstBusStep.busType;
      const busDestination = firstBusStep.endName || firstBusStep.destination;
      const busHeadsign = firstBusStep.headsign;
      const busIntervalTime = firstBusStep.intervalTime;
      const busStartDateTime = firstBusStep.startDateTime;

      if (busStationId && busNo) {
        return (
          <div
            className="shrink-0 flex items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SegmentBusRealtimeChip
              region={busRegion}
              stationId={String(busStationId)}
              stationName={busStationName}
              busNo={busNo}
              busId={busId !== undefined ? String(busId) : undefined}
              odsayBusId={odsayBusId !== undefined ? String(odsayBusId) : undefined}
              tagoRouteId={tagoRouteId !== undefined ? String(tagoRouteId) : undefined}
              destination={busDestination}
              headsign={busHeadsign}
              intervalTime={busIntervalTime}
              startDateTime={busStartDateTime}
              busType={busType}
              busColor={firstBusStep.busLaneColor || firstBusStep.color}
              cityCode={busCityCode}
              lat={busLat ? Number(busLat) : undefined}
              lng={busLng ? Number(busLng) : undefined}
              variant="compact"
              onlyRefreshButton
            />
          </div>
        );
      }
    }

    if (firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train')) {
      const firstSubwayStep = firstTransitStep;
      const subwayStationName = firstSubwayStep.startName || originPlace.place_name;
      return (
        <div
          className="shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={firstSubwayStep.wayCode !== undefined ? String(firstSubwayStep.wayCode) : undefined}
            subwayId={firstSubwayStep.rawLineName || firstSubwayStep.name}
            destination={firstSubwayStep.endName}
            headsign={firstSubwayStep.headsign}
            variant="compact"
            onlyRefreshButton
          />
        </div>
      );
    }

    if (route.type === 'car') {
      const handleCarRefresh = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCarRefreshing(true);
        setTimeout(() => setIsCarRefreshing(false), 600);
      };

      return (
        <button
          type="button"
          onClick={handleCarRefresh}
          disabled={isCarRefreshing}
          className="inline-flex items-center justify-center w-[70px] min-w-[70px] gap-1 px-2 py-0.5 rounded-full bg-white hover:bg-zinc-50 text-zinc-700 font-semibold border border-zinc-200/90 shadow-2xs shrink-0 cursor-pointer active:scale-95 text-[10px] transition-all"
        >
          <RefreshCw className={`w-3 h-3 text-zinc-500 shrink-0 ${isCarRefreshing ? 'animate-spin-once' : ''}`} />
          <span className="tabular-nums font-semibold text-[10px] text-zinc-700 whitespace-nowrap">갱신</span>
        </button>
      );
    }

    return null;
  }, [isCarRefreshing]);

  const RouteRealtimeArrivalChip = useCallback(({ route, originPlace }: { route: DirectionResult; originPlace: Place }) => {
    const firstTransitStep = route.steps?.find(s => s.type !== 'walk');

    if (firstTransitStep && (firstTransitStep.type === 'bus' || firstTransitStep.type === 'expressbus')) {
      const firstBusStep = firstTransitStep;
      const busStationId =
        firstBusStep.realtimeStationId ||
        firstBusStep.startStationID ||
        firstBusStep.startID ||
        firstBusStep.nodeId;
      const busNo = firstBusStep.name;
      const busStationName = firstBusStep.startName || originPlace.place_name;
      const busRegion = firstBusStep.startRegion || inferRegionFromPlace(originPlace);
      const busLat = firstBusStep.startY || firstBusStep.startLat || originPlace.lat;
      const busLng = firstBusStep.startX || firstBusStep.startLng || originPlace.lng;
      const busCityCode = firstBusStep.startCityCode || firstBusStep.cityCode;
      const odsayBusId = firstBusStep.odsayBusId || firstBusStep.busID;
      const tagoRouteId = firstBusStep.tagoRouteId || firstBusStep.busLocalBlID;
      const busId = odsayBusId || tagoRouteId;
      const busType = firstBusStep.busType;
      const busDestination = firstBusStep.endName || firstBusStep.destination;
      const busHeadsign = firstBusStep.headsign;
      const busIntervalTime = firstBusStep.intervalTime;
      const busStartDateTime = firstBusStep.startDateTime;

      if (busStationId && busNo) {
        return (
          <div
            className="shrink-0 flex items-center"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SegmentBusRealtimeChip
              region={busRegion}
              stationId={String(busStationId)}
              stationName={busStationName}
              busNo={busNo}
              busId={busId !== undefined ? String(busId) : undefined}
              odsayBusId={odsayBusId !== undefined ? String(odsayBusId) : undefined}
              tagoRouteId={tagoRouteId !== undefined ? String(tagoRouteId) : undefined}
              destination={busDestination}
              headsign={busHeadsign}
              intervalTime={busIntervalTime}
              startDateTime={busStartDateTime}
              busType={busType}
              busColor={firstBusStep.busLaneColor || firstBusStep.color}
              cityCode={busCityCode}
              lat={busLat ? Number(busLat) : undefined}
              lng={busLng ? Number(busLng) : undefined}
              variant="compact"
              hideRefreshButton
            />
          </div>
        );
      }
    }

    if (firstTransitStep && (firstTransitStep.type === 'subway' || firstTransitStep.type === 'train')) {
      const firstSubwayStep = firstTransitStep;
      const subwayStationName = firstSubwayStep.startName || originPlace.place_name;
      return (
        <div
          className="shrink-0 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <SegmentSubwayRealtimeChip
            stationName={subwayStationName}
            wayCode={firstSubwayStep.wayCode !== undefined ? String(firstSubwayStep.wayCode) : undefined}
            subwayId={firstSubwayStep.rawLineName || firstSubwayStep.name}
            destination={firstSubwayStep.endName}
            headsign={firstSubwayStep.headsign}
            variant="compact"
            hideRefreshButton
          />
        </div>
      );
    }

    if (route.type === 'car') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200/90 shadow-2xs font-bold shrink-0 text-[10px] text-emerald-600">
          <span>실시간 교통 반영</span>
        </span>
      );
    }

    return null;
  }, []);

  const renderRouteButton = (route: DirectionResult) => {
    const isSelected = isRouteMatch(previewRoute, route);
    const emoji = getEmoji(route);
    const tags = routeTags ? (routeTags[route.id] || []) : [];

    // Calculate sum of steps
    const validSteps = route.steps?.filter(s => s.duration > 0) || [];

    // Calculate percentage widths using a power-curve to compress proportions (same as Web SegmentInfo.tsx)
    const COMPRESS_POWER = 0.3;
    const MIN_PCT = 12; // minimum percentage for any step
    const compressed = validSteps.map(s => Math.pow(Math.max(s.duration, 1), COMPRESS_POWER));
    const compressedTotal = compressed.reduce((a, b) => a + b, 0) || 1;
    const rawPcts = compressed.map(c => (c / compressedTotal) * 100);
    const clampedPcts = rawPcts.map(p => Math.max(p, MIN_PCT));
    const clampedSum = clampedPcts.reduce((a, b) => a + b, 0);
    const normalizedPcts = clampedPcts.map(p => (p / clampedSum) * 100);

    return (
      <div
        key={route.id}
        role="button"
        tabIndex={0}
        onClick={withClickPrevent(() => {
          if (route.type === 'walk') {
            handleWalkRouteClick(route);
          } else {
            setHoveredPreviewRoute(route);
          }
        })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (route.type === 'walk') {
              handleWalkRouteClick(route);
            } else {
              setHoveredPreviewRoute(route);
            }
          }
        }}
        className={`
          flex flex-col w-full py-3 px-3.5 rounded-xl border transition-all duration-200 text-left cursor-pointer group gap-2.5
          ${isSelected
            ? 'border-blue-400 bg-blue-50/80 shadow-[0_2px_10px_rgba(59,130,246,0.12)]'
            : 'border-zinc-100 bg-white hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-sm'
          }
        `}
      >
        {/* Top Section: Duration, Fare, Icon, Tags, Realtime */}
        <div className="flex items-center justify-between w-full min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* 좌: 이동수단 아이콘 + 시간 + 요금 및 아래 갱신 버튼 */}
            <div className={`flex flex-col min-w-0 justify-center shrink-0 pr-3 border-r ${isSelected ? 'border-blue-200' : 'border-zinc-200/80'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-base flex-shrink-0 transition-colors ${isSelected ? 'bg-white shadow-sm' : 'bg-zinc-50 group-hover:bg-white group-hover:shadow-sm'}`}>
                  {emoji}
                </div>
                <div className="flex flex-col">
                  <span className={`text-sm font-black tracking-tight leading-tight ${isSelected ? 'text-blue-600' : 'text-zinc-900'}`}>
                    {formatDurationMinutes(route.duration)}
                  </span>
                  <div className="flex items-center mt-0.5">
                    {activeTab === 'car' ? (
                      <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                        택시 {route.taxiFare?.toLocaleString()}원
                      </span>
                    ) : activeTab === 'walk' ? (
                      <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                        무료
                      </span>
                    ) : (route.isIntercity || route.steps?.some(s => s.type === 'train' || s.type === 'expressbus')) && route.fare === 0 ? (
                      <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                        예매처 확인
                      </span>
                    ) : route.fare > 0 ? (
                      <span className="text-[10px] text-zinc-500 font-semibold flex items-center gap-0.5 whitespace-nowrap">
                        <span>{route.isFareEstimated ? `약 ${route.fare.toLocaleString()}원` : `${route.fare.toLocaleString()}원`}</span>
                        <FareBreakdownTooltip fareBreakdown={route.fareBreakdown} />
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-semibold whitespace-nowrap">
                        요금 정보 없음
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 이동 수단 정보 바로 아래에 갱신 버튼 배치 */}
              <div className="mt-1 flex items-center">
                <RouteRealtimeRefreshButton route={route} originPlace={originPlace} />
              </div>
            </div>

            {/* 우: 태그 & 실시간 정보 (독립 수직 컨테이너) 영역 */}
            <div className="flex flex-col min-w-0 justify-center flex-1 pl-1">
              {/* Row 1: 태그 전용 수직 컨테이너 */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none min-w-0 w-full min-h-[20px]">
                {tags.map(tag => {
                  let colorClass = 'bg-blue-50 text-blue-600 border border-blue-100';
                  if (tag === '최단시간' || tag === '추천' || tag === '최단 시간') {
                    colorClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100';
                  } else if (tag === '최단 산길') {
                    colorClass = 'bg-amber-50 text-amber-600 border border-amber-100';
                  } else if (tag === '완만한 코스') {
                    colorClass = 'bg-zinc-100 text-zinc-600 border border-zinc-200';
                  }
                  return (
                    <span key={tag} className={`px-1.5 py-[2px] text-[9px] font-extrabold rounded whitespace-nowrap flex-shrink-0 ${colorClass}`}>
                      {tag}
                    </span>
                  );
                })}
              </div>

              {/* Row 2: 실시간 도착 정보 칩 단독 배치 (체크마크와 충돌 없음) */}
              <div className="flex items-center justify-start min-w-0 w-full min-h-[24px] mt-1">
                <RouteRealtimeArrivalChip route={route} originPlace={originPlace} />
              </div>
            </div>
          </div>

          {/* Right side check mark or arrow */}
          <div className="flex-shrink-0 ml-2">
            {isDetailLoading[route.id] ? (
              <span className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin block" />
            ) : isSelected ? (
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-150 text-zinc-400 group-hover:border-zinc-300 group-hover:text-zinc-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Gauge Timeline Bar (Auto-scroll on low visibility) */}
        <RouteTimelineGaugeBar steps={route.steps} className="mt-1.5 mb-1" />
      </div>
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
                  ...previewRoute,
                  destId: destPlace.id,
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

        {/* 2층: 중앙에 고정된 화살표와 좌우 균등 분할된 출발/도착지 텍스트 박스 (클릭 시 상세 주소 툴팁 하단 노출) */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full mt-0.5 px-1 relative z-20">
          {/* 출발지 (왼쪽 영역 중앙 정렬) */}
          <div className="flex justify-center min-w-0 pr-1 relative tooltip-trigger">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'origin' ? null : 'origin');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`max-w-full px-2 py-0.5 rounded-lg text-sm font-extrabold truncate cursor-pointer transition-all select-none border ${
                activeTooltip === 'origin'
                  ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs'
                  : 'bg-transparent text-zinc-800 border-transparent hover:bg-zinc-100/80'
              }`}
              title={originPlace.place_name}
            >
              {originPlace.place_name}
            </button>
            <AnimatePresence>
              {activeTooltip === 'origin' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] left-0 top-full mt-2 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto"
                  >
                    <p className="font-bold text-[13px] mb-1">{originPlace.place_name}</p>
                    {originPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{originPlace.address}</p>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] left-1/2 -translate-x-1/2 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-blue-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>
          
          {/* 화살표 아이콘 (정중앙 고정) */}
          <div className="flex items-center justify-center px-1 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-3.5 h-3.5 text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </div>
          
          {/* 도착지 (오른쪽 영역 중앙 정렬) */}
          <div className="flex justify-center min-w-0 pl-1 relative tooltip-trigger">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveTooltip(activeTooltip === 'dest' ? null : 'dest');
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`max-w-full px-2 py-0.5 rounded-lg text-sm font-extrabold truncate cursor-pointer transition-all select-none border ${
                activeTooltip === 'dest'
                  ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs'
                  : 'bg-transparent text-zinc-800 border-transparent hover:bg-zinc-100/80'
              }`}
              title={destPlace.place_name}
            >
              {destPlace.place_name}
            </button>
            <AnimatePresence>
              {activeTooltip === 'dest' && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1000] right-0 top-full mt-2 w-60 p-3 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 text-white text-[12px] font-medium rounded-xl shadow-xl backdrop-blur-sm tooltip-content text-left border border-white/15 pointer-events-auto"
                  >
                    <p className="font-bold text-[13px] mb-1">{destPlace.place_name}</p>
                    {destPlace.address && (
                      <p className="text-blue-50 font-normal text-[11px] leading-relaxed">{destPlace.address}</p>
                    )}
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute z-[1001] right-1/2 translate-x-1/2 top-full mt-[2px] w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-violet-500 pointer-events-none"
                  />
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 3층: 출발 시각 설정 */}
      <div className="mx-4 pb-3 flex items-center justify-between border-t border-zinc-100/50 pt-2.5 bg-zinc-50/50 -mt-3 mb-2 px-3 rounded-lg">
        <span className="text-[11px] font-bold text-zinc-500">길찾기 출발 시각</span>
        <DepartureTimeSelector />
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
            <div key={i} className="p-3.5 bg-white rounded-xl border border-zinc-150 shadow-2xs w-full flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 shrink-0" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-4 bg-zinc-200 rounded-md w-20" />
                    <div className="h-3 bg-zinc-150 rounded-md w-14" />
                  </div>
                </div>
                <div className="w-5 h-5 rounded-full bg-zinc-100 shrink-0" />
              </div>
              <div className="h-2.5 bg-zinc-100 rounded-full w-full mt-1" />
            </div>
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
    const altHeight = windowHeight * 0.46 + 20;
    let currentSnapType: 'min' | 'default' | 'max' = 'default';
    if (snap === '46vh' || snap === 0.46 || (typeof snap === 'number' && Math.abs(snap - altHeight) < 5)) currentSnapType = 'default';
    else if (snap === 1 || snap === '1') currentSnapType = 'max';

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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[46] flex bg-white/95 backdrop-blur-md p-1 rounded-full border border-blue-100/80 shadow-[0_12px_32px_rgba(0,0,0,0.12),_0_4px_12px_rgba(0,0,0,0.06)] min-w-[310px] justify-between pointer-events-auto"
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
                    relative flex items-center justify-center gap-1.5 px-4.5 py-2 text-xs font-bold rounded-full transition-colors duration-200 cursor-pointer select-none min-w-[96px]
                    ${isActive
                      ? 'text-white'
                      : 'text-zinc-500 hover:text-zinc-800 active:bg-zinc-150/40'
                    }
                  `}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeAlternativeTab"
                      className="absolute inset-0 bg-blue-600 rounded-full z-0 shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 text-[13px]">{icon}</span>
                  <span className="relative z-10">{label}</span>
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
        transition: animate 
          ? 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms ease-out'
          : 'transform 350ms cubic-bezier(0.32, 0.72, 0, 1), opacity 300ms ease-out',
      }}
      className={`absolute bg-white border-t border-zinc-200 flex flex-col overflow-hidden z-[100] md:z-auto
        bottom-0 left-0 right-0 w-full rounded-t-[20px] rounded-b-none shadow-[0_-8px_30px_rgba(0,0,0,0.15)]
        md:top-6 md:bottom-6 md:left-4 md:right-auto md:w-[360px] md:rounded-3xl md:border md:border-zinc-200 md:shadow-[0_20px_50px_rgba(0,0,0,0.12)]
        md:h-[calc(100%-48px)]
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
