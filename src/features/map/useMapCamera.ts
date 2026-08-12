"use client";

import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useMapState } from './useMapState';
import { useMapUIStore } from '@/stores/map-store';
import { NaverMapRouteRenderer, calculateSegmentBounds, expandBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import { areBoundsEqual } from '@/stores/slices/mapSlice';
import type { Place, LatLngBoundsLiteral, DirectionsApiResponse } from '@/types/journey';

interface UseMapCameraProps {
  map: naver.maps.Map | null;
  currentMapPadding: { top: number; right: number; bottom: number; left: number };
  directionsCache: Record<string, DirectionsApiResponse>;
  loadedSegmentsCount: number;
  isMobile: boolean;
  windowWidth: number;
  windowHeight: number;
}

export function useMapCamera({
  map,
  currentMapPadding,
  directionsCache,
  loadedSegmentsCount,
  isMobile,
  windowWidth,
  windowHeight,
}: UseMapCameraProps) {
  const {
    activeJourney,
    focusBounds,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    focusedStep,
    setFocusedStep,
    setFocusedPlaceId,
    alternativeSegment,
    setAlternativeSegment,
    hoveredAlternativeRoute,
    recommendedPlaces,
    activeSearchPlace,
    isDrawerMaximized,
    isSearchMode,
    drawerSnapPoint,
  } = useMapState();

  const { setMapCenter } = useMapUIStore();

  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);

  const currentMapPaddingRef = useRef(currentMapPadding);
  useEffect(() => {
    currentMapPaddingRef.current = currentMapPadding;
  }, [currentMapPadding]);

  const lastFittedWidthRef = useRef<number | undefined>(undefined);
  const lastFittedHeightRef = useRef<number | undefined>(undefined);
  const lastFittedPlacesWidthRef = useRef<number | undefined>(undefined);
  const lastFittedPlacesHeightRef = useRef<number | undefined>(undefined);

  // 1. Offset을 고려하여 좌표로 이동 (panTo)
  const panToWithOffset = useCallback((naverMap: naver.maps.Map, coord: { lat: number; lng: number }) => {
    if (typeof (naverMap as any).stop === 'function') {
      (naverMap as any).stop();
    }
    const padding = currentMapPaddingRef.current;

    const projection = naverMap.getProjection();
    if (!projection) {
      naverMap.panTo(new window.naver.maps.LatLng(coord.lat, coord.lng));
      return;
    }

    const latLng = new window.naver.maps.LatLng(coord.lat, coord.lng);
    const pixelPoint = projection.fromCoordToOffset(latLng);

    const topPadding = padding.top || 0;
    const bottomPadding = padding.bottom || 0;
    const visibleHeight = windowHeight - topPadding - bottomPadding;

    if (visibleHeight > 0) {
      // 50% (중심) - 40% (목표 지점) = 10% 오프셋 (아래 방향으로 +Y 이동)
      const offsetPixels = visibleHeight * 0.1;
      const targetPixel = new window.naver.maps.Point(pixelPoint.x, pixelPoint.y + offsetPixels);
      const targetLatLng = projection.fromOffsetToCoord(targetPixel);
      naverMap.panTo(targetLatLng);
    } else {
      naverMap.panTo(latLng);
    }
  }, [windowHeight]);

  const lastFittedFocusBoundsRef = useRef<string>('');

  // Helper function to validate that bounds are reasonable and not too extreme
  const validateBounds = useCallback((bounds: LatLngBoundsLiteral): boolean => {
    if (!bounds || !bounds.sw || !bounds.ne) return false;

    const { sw, ne } = bounds;
    if (
      typeof sw.lat !== 'number' || typeof sw.lng !== 'number' ||
      typeof ne.lat !== 'number' || typeof ne.lng !== 'number'
    ) {
      return false;
    }

    if (isNaN(sw.lat) || isNaN(sw.lng) || isNaN(ne.lat) || isNaN(ne.lng)) {
      return false;
    }

    const latDiff = ne.lat - sw.lat;
    const lngDiff = ne.lng - sw.lng;

    // Check if sw is strictly greater than ne (invalid coordinate ordering)
    if (latDiff < 0 || lngDiff < 0) {
      return false;
    }

    // Check if bounds are too large (zoomed out too much)
    if (latDiff > 10 || lngDiff > 10) {
      return false;
    }

    return true;
  }, []);

  // 2. 전체 여정 카메라 핏팅 헬퍼
  const performFullJourneyFit = useCallback(() => {
    if (!map || places.length === 0) return;
    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    setFocusedSegment(null);
    setFocusedStep(null);
    setFocusedPlaceId(null);
    setAlternativeSegment(null);
    setFocusBounds(null);

    lastFittedDataStringRef.current = '';
    lastFittedFocusBoundsRef.current = '';
    lastFocusStateRef.current = false;

    const padding = currentMapPaddingRef.current;
    map.setOptions({ padding });

    if (places.length === 1) {
      const first = places[0];
      const latOffset = 0.0015;
      const lngOffset = 0.0015;
      const bounds = new navermaps.LatLngBounds(
        new navermaps.LatLng(first.lat - latOffset, first.lng - lngOffset),
        new navermaps.LatLng(first.lat + latOffset, first.lng + lngOffset)
      );
      map.fitBounds(bounds, { maxZoom: 16 });
      map.setCenter(bounds.getCenter());
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public', padding);
    }
  }, [map, places, directionsCache, activeJourney?.transport_type, setFocusedSegment, setFocusedStep, setFocusedPlaceId, setAlternativeSegment, setFocusBounds]);

  // 3. 여정 줌 초기화 및 상태 복구
  const handleResetBounds = useCallback((forceRefit: boolean = false, resetToFullJourney: boolean = false) => {
    if (forceRefit) {
      lastFittedDataStringRef.current = '';
      lastFittedFocusBoundsRef.current = '';
    }

    if (resetToFullJourney || (!focusedSegment && !alternativeSegment)) {
      performFullJourneyFit();
      return;
    }

    // 이동 상세 (focusedSegment) 가 열려있을 때 줌 리셋: 해당 이동 구간 전체 경로 줌 정렬
    if (focusedSegment) {
      const originPlace = places.find(p => p.id === focusedSegment.originId);
      const destPlace = places.find(p => p.id === focusedSegment.destId);
      if (originPlace && destPlace) {
        const cacheKey = `${originPlace.id}-${destPlace.id}`;
        const segmentData = directionsCache[cacheKey];
        const transportType = activeJourney?.transport_type || 'public';
        const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
        const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
        
        lastFittedFocusBoundsRef.current = '';
        setFocusBounds({ ...bounds });
        setFocusedStep(null);
        return;
      }
    }

    // 대안 상세 상태 (alternativeSegment) 일 때도 해당 대안 경로를 기준으로 줌 정렬
    if (alternativeSegment) {
      const originPlace = places.find(p => p.id === alternativeSegment.originId);
      const destPlace = places.find(p => p.id === alternativeSegment.destId);
      if (originPlace && destPlace) {
        const cacheKey = `${originPlace.id}-${destPlace.id}`;
        const segmentData = directionsCache[cacheKey];
        const transportType = activeJourney?.transport_type || 'public';
        const activeRoute = hoveredAlternativeRoute || getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
        const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
        
        lastFittedFocusBoundsRef.current = '';
        setFocusBounds({ ...bounds });
        setFocusedStep(null);
        return;
      }
    }

    performFullJourneyFit();
  }, [focusedSegment, alternativeSegment, performFullJourneyFit, places, directionsCache, activeJourney?.transport_type, hoveredAlternativeRoute, setFocusBounds, setFocusedStep]);

  const lastFittedDataStringRef = useRef<string>('');
  const lastFocusStateRef = useRef<boolean>(false);
  const isInitialFitRef = useRef<boolean>(true);
  const prevFocusedSegmentRef = useRef<string | null>(null);
  const fitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 3-1. 이동 상세(focusedSegment) 전환 시 또는 해당 구간 경로 데이터 로드 완료 시 이동 구간 전체 경로로 줌 정렬
  useEffect(() => {
    if (!map || !focusedSegment) {
      prevFocusedSegmentRef.current = null;
      return;
    }

    const originPlace = places.find(p => p.id === focusedSegment.originId);
    const destPlace = places.find(p => p.id === focusedSegment.destId);
    if (!originPlace || !destPlace) return;

    const segmentKey = `${focusedSegment.originId}-${focusedSegment.destId}`;
    const isSegmentChanged = prevFocusedSegmentRef.current !== segmentKey;
    prevFocusedSegmentRef.current = segmentKey;

    const segmentData = directionsCache[segmentKey];
    const transportType = activeJourney?.transport_type || 'public';
    const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
    const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);

    // 상세 패널(패딩)이 반영될 수 있도록 지연 후 핏팅 실행
    const timer = setTimeout(() => {
      if (isSegmentChanged || !areBoundsEqual(focusBounds, bounds)) {
        lastFittedFocusBoundsRef.current = '';
        setFocusBounds(bounds);
      }
    }, isSegmentChanged ? 120 : 0);

    return () => clearTimeout(timer);
  }, [map, focusedSegment, places, directionsCache, activeJourney?.transport_type, focusBounds, setFocusBounds]);

  // 3. places 또는 map 인스턴스 또는 로드된 세그먼트 수가 변경되었을 때 전체 경유지를 한 화면에 담도록 fitBounds 설정
  useEffect(() => {
    if (!map || places.length === 0) return;

    if (activeSearchPlace) return;
    if (isDrawerMaximized) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // 이전 지연 핏팅 타이머가 존재하면 취소하여 중복 실행 방지
    if (fitTimerRef.current) {
      clearTimeout(fitTimerRef.current);
      fitTimerRef.current = null;
    }

    const currentDataString = JSON.stringify({
      places: places.map(p => p.id),
      loadedSegmentsCount,
      transport_type: activeJourney?.transport_type,
      recommendedPlaces: recommendedPlaces?.map(p => p.id),
      isMobile,
      windowWidth,
      windowHeight,
      drawerSnapPoint,
      isSearchMode,
    });

    const lastWidth = lastFittedPlacesWidthRef.current;
    const lastHeight = lastFittedPlacesHeightRef.current;
    const widthChangedSignificantly = lastWidth === undefined || Math.abs(windowWidth - lastWidth) / lastWidth > 0.1;
    const heightChangedSignificantly = lastHeight === undefined || Math.abs(windowHeight - lastHeight) / lastHeight > 0.1;
    const isDimensionChange = lastWidth !== undefined && lastHeight !== undefined && (windowWidth !== lastWidth || windowHeight !== lastHeight);

    if (isDimensionChange && !widthChangedSignificantly && !heightChangedSignificantly) {
      return;
    }

    const wasFocused = lastFocusStateRef.current;
    
    if (focusBounds) {
      lastFocusStateRef.current = true;
      return;
    }

    if (!wasFocused && lastFittedDataStringRef.current === currentDataString) return;
    lastFocusStateRef.current = false;
    lastFittedFocusBoundsRef.current = '';

    const padding = currentMapPaddingRef.current;
    map.setOptions({ padding });

    const doFit = () => {
      if (places.length === 1) {
        const first = places[0];
        const latOffset = 0.0015;
        const lngOffset = 0.0015;
        const bounds = new navermaps.LatLngBounds(
          new navermaps.LatLng(first.lat - latOffset, first.lng - lngOffset),
          new navermaps.LatLng(first.lat + latOffset, first.lng + lngOffset)
        );
        
        // Validate single place bounds
        const boundsLiteral = {
          sw: { lat: first.lat - latOffset, lng: first.lng - lngOffset },
          ne: { lat: first.lat + latOffset, lng: first.lng + lngOffset }
        };
        if (!validateBounds(boundsLiteral)) {
          console.warn('[useMapCamera] Invalid single place bounds detected, using default zoom');
          map.setCenter(new navermaps.LatLng(first.lat, first.lng));
          map.setZoom(16);
        } else {
          map.fitBounds(bounds, { maxZoom: 16 });
        }
      } else {
        const renderer = new NaverMapRouteRenderer(map);
        renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public', padding);
      }
    };

    if (isInitialFitRef.current) {
      isInitialFitRef.current = false;
      fitTimerRef.current = setTimeout(() => {
        doFit();
        fitTimerRef.current = null;
      }, 100);
    } else {
      doFit();
    }

    lastFittedDataStringRef.current = currentDataString;
    lastFittedPlacesWidthRef.current = windowWidth;
    lastFittedPlacesHeightRef.current = windowHeight;

    return () => {
      if (fitTimerRef.current) {
        clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }
    };
  }, [places, map, focusBounds, loadedSegmentsCount, activeJourney?.transport_type, recommendedPlaces, isDrawerMaximized, isSearchMode, isMobile, windowWidth, windowHeight, drawerSnapPoint, directionsCache, validateBounds]);

  // 4. focusBounds 상태 변화 감지 시 지도의 뷰포트를 해당 범위로 핏팅
  useEffect(() => {
    if (!map || !focusBounds) return;
    if (isDrawerMaximized) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // Validate bounds before applying
    if (!validateBounds(focusBounds)) {
      console.warn('[useMapCamera] Invalid focusBounds detected, skipping fitBounds');
      return;
    }

    const padding = currentMapPaddingRef.current;
    
    // 미세한 브라우저 주소창 토글에 의한 높이 변화(10% 미만)는 fitBounds 재계산을 무시하여 줌 레벨이 튀는 것을 방지
    const lastWidth = lastFittedWidthRef.current;
    const lastHeight = lastFittedHeightRef.current;
    const widthChangedSignificantly = lastWidth === undefined || Math.abs(windowWidth - lastWidth) / lastWidth > 0.1;
    const heightChangedSignificantly = lastHeight === undefined || Math.abs(windowHeight - lastHeight) / lastHeight > 0.1;
    const isDimensionChange = lastWidth !== undefined && lastHeight !== undefined && (windowWidth !== lastWidth || windowHeight !== lastHeight);

    if (isDimensionChange && !widthChangedSignificantly && !heightChangedSignificantly) {
      return;
    }

    const currentFocusString = JSON.stringify(focusBounds) + `-${isMobile}-${windowWidth}-${windowHeight}-${JSON.stringify(padding)}`;
    if (lastFittedFocusBoundsRef.current === currentFocusString) return;

    map.setOptions({ padding });

    const expanded = expandBounds(focusBounds, 0.01);
    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(expanded.sw.lat, expanded.sw.lng),
      new navermaps.LatLng(expanded.ne.lat, expanded.ne.lng)
    );

    map.fitBounds(bounds, { maxZoom: 18 });

    lastFittedFocusBoundsRef.current = currentFocusString;
    lastFittedWidthRef.current = windowWidth;
    lastFittedHeightRef.current = windowHeight;
  }, [focusBounds, map, isDrawerMaximized, isMobile, windowWidth, windowHeight, validateBounds]);

  // 5. 장소 검색 카드 클릭 시 해당 장소로 줌 인
  useEffect(() => {
    if (!map || !activeSearchPlace) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    const latDiff = Math.abs(currentCenter.y - activeSearchPlace.lat);
    const lngDiff = Math.abs(currentCenter.x - activeSearchPlace.lng);

    if (latDiff < 0.0001 && lngDiff < 0.0001 && currentZoom === 15) {
      return;
    }

    const targetLatLng = new navermaps.LatLng(activeSearchPlace.lat, activeSearchPlace.lng);
    map.setCenter(targetLatLng);
    map.setZoom(15);
  }, [activeSearchPlace, map]);

  // 6. 대안 상세 상태(alternativeSegment)에서 대안 경로(hoveredAlternativeRoute)가 변경될 때 지도의 focusBounds를 자동으로 피팅
  useEffect(() => {
    if (!alternativeSegment) return;

    const originPlace = places.find(p => p.id === alternativeSegment.originId);
    const destPlace = places.find(p => p.id === alternativeSegment.destId);
    if (!originPlace || !destPlace) return;

    const cacheKey = `${originPlace.id}-${destPlace.id}`;
    const segmentData = directionsCache[cacheKey];
    const transportType = activeJourney?.transport_type || 'public';
    const activeRoute = hoveredAlternativeRoute || getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

    if (activeRoute) {
      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
      if (!areBoundsEqual(focusBounds, bounds)) {
        setFocusBounds(bounds);
      }
    }
  }, [alternativeSegment, hoveredAlternativeRoute, places, directionsCache, activeJourney?.transport_type, focusBounds, setFocusBounds]);

  return {
    panToWithOffset,
    handleResetBounds,
  };
}
