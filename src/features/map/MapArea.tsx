"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  NaverMap,
  Container as MapDiv,
} from 'react-naver-maps';
import { MapRoutes } from '@/features/map/MapRoutes';
import { MapMarkers } from '@/features/map/MapMarkers';

import DirectionalStripes from '@/components/map/DirectionalStripes';
import TransferMarkers from '@/components/map/TransferMarkers';
import { useJourneyStore } from '@/stores/journey-store';
import { useMapState } from '@/features/map/useMapState';
import { useMapUIStore } from '@/stores/map-store';
import { useJourneyDirections, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { useMapCamera } from './useMapCamera';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import { useGPSTracking } from './hooks/useGPSTracking';
import { useGeocodeOnIdle } from './hooks/useGeocodeOnIdle';
import { useMapPadding } from './hooks/useMapPadding';
import { MapOverlays } from './MapOverlays';
import { MapFloatingControls } from './MapFloatingControls';
import { useDialog } from '@/providers/DialogProvider';
import { MAX_JOURNEY_PLACES, MAX_JOURNEY_PLACES_ALERT } from '@/constants/journey';

import type { Place, PlaceResult } from '@/types/journey';

interface SelectedPlace {
  lat: number;
  lng: number;
}

const INITIAL_CENTER = { lat: 37.5665, lng: 126.9780 };

export default function MapArea() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const {
    activeJourney,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    focusedStep,
    setFocusedStep,
    focusedPlaceId,
    setFocusedPlaceId,
    alternativeSegment,
    hoveredAlternativeRoute,
    recommendedPlaces,
    activeSearchPlace,
    setMapCenterCoord,
    addPlace,
    removePlace,
    isEditMode,
    isSearchMode,
  } = useMapState();

  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);

  // Track initial place IDs to handle dynamic sequential animation delays
  const [initialPlaceIds, setInitialPlaceIds] = useState<Set<string>>(new Set());
  const prevJourneyIdRef = useRef<string | null>(null);
  const prevIsEditModeRef = useRef<boolean>(false);
  const [animationVersion, setAnimationVersion] = useState<number>(0);

  useEffect(() => {
    const currentJourneyId = activeJourney?.id || null;
    if (currentJourneyId !== prevJourneyIdRef.current) {
      prevJourneyIdRef.current = currentJourneyId;
      if (places.length > 0) {
        setInitialPlaceIds(new Set(places.map(p => p.id)));
      } else {
        setInitialPlaceIds(new Set());
      }
    } else if (currentJourneyId && initialPlaceIds.size === 0 && places.length > 0) {
      setInitialPlaceIds(new Set(places.map(p => p.id)));
    }
  }, [activeJourney?.id, places, initialPlaceIds.size]);

  useEffect(() => {
    if (prevIsEditModeRef.current && !isEditMode) {
      if (places.length > 0) {
        setInitialPlaceIds(new Set(places.map(p => p.id)));
      }
      setAnimationVersion(v => v + 1);
    }
    prevIsEditModeRef.current = isEditMode;
  }, [isEditMode, places]);

  // Compute animations delays dynamically
  const delays = useMemo(() => {
    const markerDelays: Record<string, number> = {};
    const pathDelays: Record<string, number> = {};

    let initialCount = 0;
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const isInitial = initialPlaceIds.has(place.id);

      if (isInitial) {
        markerDelays[place.id] = initialCount * 800;
        initialCount++;
      } else {
        markerDelays[place.id] = 400;
      }
    }

    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      const key = `${origin.id}-${dest.id}`;

      const isOriginInitial = initialPlaceIds.has(origin.id);
      const isDestInitial = initialPlaceIds.has(dest.id);

      if (isOriginInitial && isDestInitial) {
        const initialIdx = places.slice(0, i + 1).filter(p => initialPlaceIds.has(p.id)).length - 1;
        pathDelays[key] = initialIdx * 800 + 400;
      } else {
        pathDelays[key] = 0;
      }
    }

    return { markerDelays, pathDelays };
  }, [places, initialPlaceIds]);

  const {
    setActiveRecommendedPlace,
    setMapClickedPlace,
    userLocation,
    gpsMode,
    mapClickedPlace,
    forceLoad,
    setForceLoad,
    setMapCenter,
    zoomLevel,
    mapBounds,
  } = useMapUIStore();

  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
      if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);
    };
  }, []);

  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    if (!isSearchMode) {
      setMapClickedPlace(null);
    }
  }, [isSearchMode, setMapClickedPlace]);

  useEffect(() => {
    if (!recommendedPlaces || recommendedPlaces.length === 0) {
      setActiveRecommendedPlace(null);
    }
  }, [recommendedPlaces, setActiveRecommendedPlace]);

  const { alert } = useDialog();

  const handleAddRecommendedPlace = async (item: PlaceResult) => {
    if (!activeJourney) return;
    if ((activeJourney.places?.length ?? 0) >= MAX_JOURNEY_PLACES) {
      await alert(MAX_JOURNEY_PLACES_ALERT);
      return;
    }
    const place: Place = {
      id: item.id,
      place_name: item.place_name,
      address: item.address,
      category: item.category,
      lat: item.lat,
      lng: item.lng,
    };
    try {
      await addPlace(place);
      setActiveRecommendedPlace(null);
    } catch (err) {
      console.error('추천 장소 추가 실패:', err);
    }
  };

  const handleRemoveRecommendedPlace = async (placeId: string) => {
    try {
      await removePlace(placeId);
      setActiveRecommendedPlace(null);
    } catch (err) {
      console.error('추천 장소 제거 실패:', err);
    }
  };

  const [map, setMap] = useState<naver.maps.Map | null>(null);

  const handleMapRef = useCallback((mapInstance: naver.maps.Map | null) => {
    if (!mapInstance) return;
    setMap((prev) => {
      if (prev === mapInstance) return prev;
      return mapInstance;
    });
  }, []);

  // Use extracted hooks
  const { handleMyLocationClick } = useGPSTracking({ map });
  useGeocodeOnIdle({ map });
  const { currentMapPadding, windowWidth, windowHeight } = useMapPadding(isMobile);

  const { fetchSequentialDirections } = useJourneyDirections();
  const directionsCache = useJourneyDirectionsCache(places);

  useEffect(() => {
    setForceLoad(false);
  }, [places, setForceLoad]);

  const isAllInitialRoutesLoaded = useMemo(() => {
    if (places.length < 2) return true;

    let totalInitialSegments = 0;
    let loadedInitialSegments = 0;

    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      const isOriginInitial = initialPlaceIds.has(origin.id);
      const isDestInitial = initialPlaceIds.has(dest.id);

      if (isOriginInitial && isDestInitial) {
        totalInitialSegments++;

        const hasSelectedRoute = !!(origin.selected_route && origin.selected_route.destId === dest.id);
        const cacheKey = `${origin.id}-${dest.id}`;
        const hasCachedRoute = !!directionsCache[cacheKey];

        if (hasSelectedRoute || hasCachedRoute) {
          loadedInitialSegments++;
        }
      }
    }

    return loadedInitialSegments === totalInitialSegments;
  }, [places, initialPlaceIds, directionsCache]);

  const loadedSegmentsCount = useMemo(() => {
    if (places.length < 2) return 0;
    let count = 0;
    for (let i = 0; i < places.length - 1; i++) {
      const cacheKey = `${places[i].id}-${places[i + 1].id}`;
      if (directionsCache[cacheKey]) {
        count++;
      }
    }
    return count;
  }, [places, directionsCache]);

  const handleMapClick = useCallback((e: any) => {
    setFocusedPlaceId(null);
    if (!isSearchMode) return;
    const lat = e.coord.y;
    const lng = e.coord.x;

    const navermapsObj = typeof window !== 'undefined' ? window.naver?.maps : null;
    if (navermapsObj && navermapsObj.Service && navermapsObj.Service.reverseGeocode) {
      navermapsObj.Service.reverseGeocode(
        { coords: e.coord },
        (status: any, response: any) => {
          if (status === navermapsObj.Service.Status.OK) {
            const v2 = response.v2;
            const address = v2.address ? (v2.address.roadAddress || v2.address.jibunAddress) : '지도에서 선택한 위치';
            setMapClickedPlace({
              lat,
              lng,
              address: address || '지도에서 선택한 위치',
              place_name: '지도에서 선택한 장소',
            });
          }
        }
      );
    } else {
      setMapClickedPlace({
        lat,
        lng,
        address: '위치 정보 확인 불가',
        place_name: '지도에서 선택한 장소',
      });
    }
  }, [isSearchMode, setMapClickedPlace, setFocusedPlaceId]);

  useEffect(() => {
    if (!map) return;
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermapsObj) return;

    const dragStartListener = navermapsObj.Event.addListener(map, 'dragstart', () => {
      setFocusedPlaceId(null);
      useMapUIStore.getState().setIsMapDragging(true);
      useMapUIStore.getState().setGpsMode('none');
    });
    const dragEndListener = navermapsObj.Event.addListener(map, 'dragend', () => {
      useMapUIStore.getState().setIsMapDragging(false);
    });
    const idleListener = navermapsObj.Event.addListener(map, 'idle', () => {
      useMapUIStore.getState().setIsMapDragging(false);
    });
    const clickListener = navermapsObj.Event.addListener(map, 'click', () => {
      setFocusedPlaceId(null);
    });

    return () => {
      navermapsObj.Event.removeListener(dragStartListener);
      navermapsObj.Event.removeListener(dragEndListener);
      navermapsObj.Event.removeListener(idleListener);
      navermapsObj.Event.removeListener(clickListener);
      useMapUIStore.getState().setIsMapDragging(false);
    };
  }, [map, setFocusedPlaceId]);

  const logoControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return { position: navermapsObj ? navermapsObj.Position.BOTTOM_RIGHT : 12 };
  }, []);

  const scaleControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return { position: navermapsObj ? navermapsObj.Position.BOTTOM_RIGHT : 12 };
  }, []);

  const mapDataControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return { position: navermapsObj ? navermapsObj.Position.BOTTOM_LEFT : 10 };
  }, []);



  useEffect(() => {
    if (!map) return;
    map.setOptions({ padding: currentMapPadding });
  }, [map, currentMapPadding]);

  const { panToWithOffset, handleResetBounds } = useMapCamera({
    map,
    currentMapPadding,
    directionsCache,
    loadedSegmentsCount,
    isMobile,
    windowWidth,
    windowHeight,
  });

  const lastWindowDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResizeWithReset = () => {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      const lastDimensions = lastWindowDimensionsRef.current;

      if (lastDimensions) {
        const widthChangeRatio = Math.abs(currentWidth - lastDimensions.width) / lastDimensions.width;
        const heightChangeRatio = Math.abs(currentHeight - lastDimensions.height) / lastDimensions.height;
        
        if (widthChangeRatio > 0.1 || heightChangeRatio > 0.1) {
          if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
          resizeTimeoutRef.current = setTimeout(() => {
            handleResetBounds(true);
          }, 300);
        }
      }

      lastWindowDimensionsRef.current = { width: currentWidth, height: currentHeight };
    };

    const handleOrientationChange = () => {
      handleResizeWithReset();
    };

    window.addEventListener('resize', handleResizeWithReset);
    window.addEventListener('orientationchange', handleOrientationChange);

    lastWindowDimensionsRef.current = { width: window.innerWidth, height: window.innerHeight };

    return () => {
      window.removeEventListener('resize', handleResizeWithReset);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
    };
  }, [handleResetBounds]);

  const handleRecommendedMarkerClick = useCallback((recPlace: PlaceResult) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setActiveRecommendedPlace(recPlace);
    setMapClickedPlace(null);

    if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
    if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);

    if (map) {
      panTimeoutRef.current = setTimeout(() => {
        panToWithOffset(map, { lat: recPlace.lat, lng: recPlace.lng });
      }, 50);
    }
  }, [setActiveRecommendedPlace, setMapClickedPlace, map, panToWithOffset]);

  const handleMarkerClick = useCallback((place: SelectedPlace & { id: string }, idx: number) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setMapClickedPlace(null);

    if (focusedPlaceId === place.id) {
      setFocusedPlaceId(null);
      return;
    }

    setFocusedPlaceId(place.id);

    if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
    if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);

    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };

    if (map) {
      map.setOptions({ padding: currentMapPadding });
      setMapCenter(coord);
      panTimeoutRef.current = setTimeout(() => {
        panToWithOffset(map, coord);
      }, 50);
    }

    stateTimeoutRef.current = setTimeout(() => {
      if (places.length < 2) return;

      let originPlace: any;
      let destPlace: any;

      if (idx === places.length - 1) {
        originPlace = places[places.length - 2];
        destPlace = places[places.length - 1];
      } else {
        originPlace = places[idx];
        destPlace = places[idx + 1];
      }

      if (!originPlace || !destPlace) return;

      const cacheKey = `${originPlace.id}-${destPlace.id}`;
      const segmentData = directionsCache[cacheKey];
      const transportType = activeJourney?.transport_type || 'public';
      const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);

      if (focusedSegment && focusedSegment.originId === originPlace.id && focusedSegment.destId === destPlace.id) {
        setFocusBounds({ ...bounds });
        setFocusedStep(null);
      } else {
        setFocusBounds(bounds);
        setFocusedSegment({ originId: originPlace.id, destId: destPlace.id });
        setFocusedStep(null);
      }
    }, 80);
  }, [setMapClickedPlace, focusedPlaceId, setFocusedPlaceId, map, currentMapPadding, setMapCenter, panToWithOffset, places, directionsCache, activeJourney?.transport_type, focusedSegment, setFocusBounds, setFocusedStep, setFocusedSegment]);

  if (!clientId) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-50 text-zinc-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-16 h-16 mb-6 opacity-50 animate-pulse"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3Z" />
        </svg>
        <p className="text-xl font-medium tracking-tight">네이버 지도 API 키를 확인해주세요</p>
        <p className="mt-2 text-sm text-zinc-500">환경 변수 설정이 필요합니다.</p>
      </div>
    );
  }

  const { isCacheRestored } = useJourneyStore();

  useEffect(() => {
    if (isCacheRestored && places && places.length > 1) {
      fetchSequentialDirections(places);
    }
  }, [places, fetchSequentialDirections, isCacheRestored]);

  const animatedSegmentsRef = useRef<Set<string>>(new Set());
  const navermaps = typeof window !== 'undefined' && window.naver?.maps;
  const activeSegment = focusedSegment || alternativeSegment;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <MapDiv style={{ width: '100%', height: '100%' }}>
        <NaverMap
          defaultCenter={INITIAL_CENTER}
          defaultZoom={15}
          ref={handleMapRef}
          onClick={handleMapClick}
          logoControlOptions={logoControlOptions}
          scaleControlOptions={scaleControlOptions}
          mapDataControlOptions={mapDataControlOptions}
        >
          <MapRoutes
            isAllInitialRoutesLoaded={isAllInitialRoutesLoaded}
            places={places}
            activeJourney={activeJourney}
            directionsCache={directionsCache}
            alternativeSegment={alternativeSegment}
            hoveredAlternativeRoute={hoveredAlternativeRoute}
            focusedSegment={focusedSegment}
            setFocusBounds={setFocusBounds}
            setFocusedStep={setFocusedStep}
            setFocusedSegment={setFocusedSegment}
            delays={delays}
            focusedStep={focusedStep}
            isSearchMode={isSearchMode}
            animationVersion={animationVersion}
            animatedSegmentsRef={animatedSegmentsRef}
          />

          {navermaps && !isSearchMode && (
            <DirectionalStripes
              places={places}
              directionsCache={directionsCache}
              activeJourney={activeJourney}
              focusedSegment={activeSegment}
              focusedStep={focusedStep}
              navermaps={navermaps}
              zoomLevel={zoomLevel}
              mapBounds={mapBounds}
              hoveredAlternativeRoute={hoveredAlternativeRoute}
              alternativeSegment={alternativeSegment}
            />
          )}

          {navermaps && !isSearchMode && (
            <TransferMarkers
              places={places}
              directionsCache={directionsCache}
              activeJourney={activeJourney}
              focusedSegment={activeSegment}
              navermaps={navermaps}
              hoveredAlternativeRoute={hoveredAlternativeRoute}
              alternativeSegment={alternativeSegment}
            />
          )}

          <MapMarkers
            places={places}
            recommendedPlaces={recommendedPlaces}
            activeSearchPlace={activeSearchPlace}
            mapClickedPlace={mapClickedPlace}
            userLocation={userLocation}
            gpsMode={gpsMode}
            isSearchMode={isSearchMode}
            activeSegment={activeSegment}
            delays={delays}
            navermaps={navermaps}
            handleMarkerClick={handleMarkerClick}
            handleRecommendedMarkerClick={handleRecommendedMarkerClick}
          />
        </NaverMap>
      </MapDiv>

      <MapOverlays
        handleAddRecommendedPlace={handleAddRecommendedPlace}
        handleRemoveRecommendedPlace={handleRemoveRecommendedPlace}
      />

      <MapFloatingControls
        handleMyLocationClick={handleMyLocationClick}
        handleResetBounds={handleResetBounds}
      />
    </div>
  );
}
