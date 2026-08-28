"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { directionKeys } from '@/hooks/queries/useDirections';
import {
  fetchPublicDirectionsApi,
  fetchCarWalkDirectionsApi,
  fetchTmapDetailRouteApi,
} from '@/lib/services/directionsService';
import { getDefaultRoute } from '@/lib/utils/routeUtils';
import type {
  Place,
  DirectionResult,
  SelectedRoute,
  SnapMeta,
  TransportType,
} from '@/types/journey';

export function isRouteMatch(
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

export function getRouteEmoji(route: DirectionResult): string {
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
}

interface UseAlternativeRoutesProps {
  originPlace: Place;
  destPlace: Place;
  isOpen: boolean;
}

export function useAlternativeRoutes({
  originPlace,
  destPlace,
  isOpen,
}: UseAlternativeRoutesProps) {
  const queryClient = useQueryClient();
  const {
    activeJourney,
    selectSegmentRoute,
    setHoveredAlternativeRoute,
    departureTime,
  } = useJourneyStore(
    useShallow((state) => ({
      activeJourney: state.activeJourney,
      selectSegmentRoute: state.selectSegmentRoute,
      setHoveredAlternativeRoute: state.setHoveredAlternativeRoute,
      departureTime: state.departureTime,
    }))
  );

  const publicKey = directionKeys.segmentPublic(originPlace.id, destPlace.id, departureTime);
  const carKey = directionKeys.segmentCar(originPlace.id, destPlace.id, departureTime);

  const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(publicKey);
  const carData = queryClient.getQueryState(carKey)?.data as { car: DirectionResult[]; walk: DirectionResult[] } | undefined;

  const segmentData = useMemo(() => {
    if (!publicData && !carData) return undefined;
    return {
      public: publicData?.public || [],
      car: carData?.car || [],
      walk: carData?.walk || [],
    };
  }, [publicData, carData]);

  const publicLoading = queryClient.getQueryState(publicKey)?.status === 'pending';
  const carLoading = queryClient.getQueryState(carKey)?.status === 'pending';
  const transportType = (activeJourney?.transport_type || 'public') as TransportType;

  const activeRoute = useMemo(() => {
    return getDefaultRoute(originPlace, destPlace, segmentData, transportType);
  }, [originPlace, destPlace, segmentData, transportType]);

  const [activeTab, setActiveTab] = useState<'public' | 'car' | 'walk'>(
    activeRoute?.type === 'public' || activeRoute?.type === 'car' || activeRoute?.type === 'walk'
      ? activeRoute.type
      : (transportType as 'public' | 'car' | 'walk')
  );

  const loading = activeTab === 'public' ? publicLoading : carLoading;
  const [activeSubTab, setActiveSubTab] = useState<string>('추천');
  const [displayLimit, setDisplayLimit] = useState(3);
  const [isDetailLoading, setIsDetailLoading] = useState<Record<string, boolean>>({});
  const [hoveredPreviewRoute, setHoveredPreviewRoute] = useState<DirectionResult | SelectedRoute | null>(null);

  const routes = segmentData ? (segmentData[activeTab] || []) : [];
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
      setHoveredPreviewRoute(null);
    } else {
      setHoveredPreviewRoute(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!publicData && !publicLoading) {
      queryClient.fetchQuery({
        queryKey: publicKey,
        queryFn: () => fetchPublicDirectionsApi(originPlace, destPlace, departureTime || undefined),
      }).catch(console.error);
    }
    if (!carData && !carLoading) {
      queryClient.fetchQuery({
        queryKey: carKey,
        queryFn: () => fetchCarWalkDirectionsApi(originPlace, destPlace, departureTime || undefined),
      }).catch(console.error);
    }
  }, [publicData, publicLoading, carData, carLoading, publicKey, carKey, queryClient, originPlace, destPlace, departureTime]);

  const publicRouteGroups = useMemo(() => {
    if (activeTab !== 'public' || !routes) return {};

    const groups: Record<string, DirectionResult[]> = {};

    routes.forEach((route) => {
      const transitTypes = new Set<string>();
      route.steps?.forEach((step) => {
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
        if (route.steps?.some((s) => s.type === 'car' || s.type === 'taxi')) category = '택시/차량';
        else if (route.steps?.some((s) => s.type === 'walk')) category = '도보';
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

    const getTransfers = (r: DirectionResult) => r.steps?.filter((s) => s.type !== 'walk').length || 0;
    const getWalkTime = (r: DirectionResult) => r.steps?.filter((s) => s.type === 'walk').reduce((acc, s) => acc + s.duration, 0) || 0;

    routes.forEach((route) => {
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

    Object.entries(publicRouteGroups).forEach(([, catRoutes]) => {
      if (catRoutes.length > 0) {
        const fastestInCategory = catRoutes.reduce((prev, curr) => prev.duration < curr.duration ? prev : curr);
        recIds.add(fastestInCategory.id);
      }
    });

    return { routeTags: tags, recommendedRouteIds: recIds };
  }, [activeTab, routes, publicRouteGroups]);

  const matchedSubTab = useMemo(() => {
    if (activeTab !== 'public' || !activeRoute) return '추천';
    if (recommendedRouteIds.has(activeRoute.id)) return '추천';

    for (const [category, catRoutes] of Object.entries(publicRouteGroups)) {
      if (catRoutes.some((r) => isRouteMatch(r, activeRoute))) {
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
      filtered = routes.filter((r) => recommendedRouteIds.has(r.id)).sort((a, b) => a.duration - b.duration);
    } else if (activeSubTab === '전체') {
      filtered = [...routes].sort((a, b) => a.duration - b.duration);
    } else {
      filtered = [...(publicRouteGroups[activeSubTab] || [])].sort((a, b) => a.duration - b.duration);
    }

    return filtered;
  }, [activeTab, activeSubTab, routes, publicRouteGroups, recommendedRouteIds]);

  const handleWalkRouteClick = useCallback(async (route: DirectionResult) => {
    setHoveredPreviewRoute(route);

    if (route.isEstimated && (!route.detailedPathPoints || route.detailedPathPoints.length === 0)) {
      setIsDetailLoading((prev) => ({ ...prev, [route.id]: true }));
      try {
        const sx = route.snappedStart ? route.snappedStart.lng : originPlace.lng;
        const sy = route.snappedStart ? route.snappedStart.lat : originPlace.lat;
        const ex = route.snappedEnd ? route.snappedEnd.lng : destPlace.lng;
        const ey = route.snappedEnd ? route.snappedEnd.lat : destPlace.lat;

        const detail = await fetchTmapDetailRouteApi(sx, sy, ex, ey);

        queryClient.setQueryData<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }>(carKey, (oldData) => {
          if (!oldData) return oldData;
          const updatedWalk = oldData.walk.map((w) => {
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
                      pathPoints: mergedPath,
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
                })(),
              };
            }
            return w;
          });
          return {
            ...oldData,
            walk: updatedWalk,
          };
        });

        setHoveredPreviewRoute((prev) => {
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
              })(),
            };
          }
          return prev;
        });
      } catch (err) {
        console.warn('TMAP 상세 경로 조회 실패, 기본 경로 폴리라인으로 대체합니다:', err);
        setHoveredPreviewRoute((prev) => {
          if (prev && prev.id === route.id) {
            return {
              ...prev,
              detailedPathPoints: prev.pathPoints,
            };
          }
          return prev;
        });
      } finally {
        setIsDetailLoading((prev) => ({ ...prev, [route.id]: false }));
      }
    }
  }, [carKey, destPlace.lat, destPlace.lng, originPlace.lat, originPlace.lng, queryClient]);

  const handleApplyRoute = useCallback(() => {
    if (previewRoute) {
      const selectedRouteObj: SelectedRoute = {
        ...previewRoute,
        destId: destPlace.id,
      };
      selectSegmentRoute(originPlace.id, selectedRouteObj);
    }
    setHoveredAlternativeRoute(null);
  }, [previewRoute, destPlace.id, selectSegmentRoute, originPlace.id, setHoveredAlternativeRoute]);

  return {
    activeTab,
    setActiveTab,
    activeSubTab,
    setActiveSubTab,
    subTabs,
    publicRouteGroups,
    displayedRoutes,
    displayLimit,
    setDisplayLimit,
    loading,
    previewRoute,
    hoveredPreviewRoute,
    setHoveredPreviewRoute,
    isDetailLoading,
    handleWalkRouteClick,
    handleApplyRoute,
    routeTags,
    recommendedRouteIds,
    routes,
  };
}
