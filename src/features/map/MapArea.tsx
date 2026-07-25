"use client";

import { useRef, useState, useEffect, useMemo, Fragment, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  NaverMap,
  Container as MapDiv,
  Marker,
} from 'react-naver-maps';
import AnimatedMarker from '@/components/AnimatedMarker';
import AnimatedPolyline from '@/components/AnimatedPolyline';
import { MapRoutes } from '@/features/map/MapRoutes';
import { MapMarkers } from '@/features/map/MapMarkers';

import DirectionalStripes from '@/components/map/DirectionalStripes';
import TransferMarkers from '@/components/map/TransferMarkers';
import { useJourneyStore } from '@/stores/journey-store';
import { useMapState } from '@/features/map/useMapState';
import { useMapUIStore } from '@/stores/map-store';
import { useJourneyDirections, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { useMapCamera } from './useMapCamera';
import { NaverMapRouteRenderer, calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import { SEQUENCE_COLORS, getSequenceTheme } from '@/constants/colors';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useDialog } from '@/providers/DialogProvider';
import type { Place, SelectedRoute, DirectionResult, PlaceResult } from '@/types/journey';



interface SelectedPlace {
  lat: number;
  lng: number;
}

const NAVER_MAP_SUBMODULES = ['geocoder'];
const INITIAL_CENTER = { lat: 37.5665, lng: 126.9780 };

export default function MapArea() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const {
    activeJourney,
    focusBounds,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    focusedStep,
    setFocusedStep,
    alternativeSegment,
    setAlternativeSegment,
    hoveredAlternativeRoute,
    isAlternativeFromFocus,
    recommendedPlaces,
    activeSearchPlace,
    setMapCenterAddress,
    setMapCenterCoord,
    setMapBounds: setGlobalMapBounds,
    addPlace,
    removePlace,
    isEditMode,
    isSearchMode,
    isSearchLoading,
    triggerSearch,
    hasSearchQuery,
    isDrawerMaximized,
    drawerSnapPoint,
    guidePanelState,
  } = useMapState();
  const { alert } = useDialog();
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

  // Handle transition when exiting edit mode
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
    const pathDelays: Record<string, number> = {}; // key is `${originId}-${destId}`

    let initialCount = 0;
    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const isInitial = initialPlaceIds.has(place.id);

      if (isInitial) {
        markerDelays[place.id] = initialCount * 800;
        initialCount++;
      } else {
        // 사용자가 실시간으로 추가한 장소는 누적 딜레이 없이 즉시 애니메이션 되도록 400ms 고정값 부여
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
        // 실시간 추가된 경로 Polyline은 즉시 렌더링을 시작하도록 딜레이를 0으로 설정
        pathDelays[key] = 0;
      }
    }

    return { markerDelays, pathDelays };
  }, [places, initialPlaceIds]);



  const {
    activeRecommendedPlace, setActiveRecommendedPlace,
    mapClickedPlace, setMapClickedPlace,
    isLocating, setIsLocating,
    userLocation, setUserLocation,
    currentAddress, setCurrentAddress,
    showLocationCard, setShowLocationCard,
    gpsMode, setGpsMode,
    deviceHeading, setDeviceHeading,
    forceLoad, setForceLoad,
    mapCenter, setMapCenter,
    zoomLevel, setZoomLevel,
    mapBounds, setMapBounds,
    bottomSheetY
  } = useMapUIStore();
  const lastKnownLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const gpsModeRef = useRef(gpsMode);
  useEffect(() => { gpsModeRef.current = gpsMode; }, [gpsMode]);
  
  const headingEmaRef = useRef<{ x: number, y: number } | null>(null);
  
  // 회전값 변경 시 DOM을 직접 업데이트하여 마커 애니메이션 리셋 방지
  useEffect(() => {
    const el = document.getElementById('user-compass-cone');
    if (el) {
      el.style.transform = `rotate(${deviceHeading || 0}deg)`;
    }
  }, [deviceHeading]);

  const watchIdRef = useRef<number | null>(null);

  const panTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 마운트 해제 시 활성화된 타이머들 제거하여 메모리 누수 및 오동작 방지
  useEffect(() => {
    return () => {
      if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
      if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);
    };
  }, []);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const lastNonMaximizedSnapPointRef = useRef<string | number | null>('294px');

  // 최대화되지 않았을 때의 마지막 바텀시트 스냅 포인트 기록
  useEffect(() => {
    if (!isDrawerMaximized && drawerSnapPoint !== 1 && drawerSnapPoint !== null) {
      lastNonMaximizedSnapPointRef.current = drawerSnapPoint;
    }
  }, [isDrawerMaximized, drawerSnapPoint]);

  useEffect(() => {
    if (isMobile) {
      const getTarget = () => {
        if (focusedSegment || alternativeSegment) {
          const routeTarget = document.getElementById('mobile-map-buttons-target-route');
          if (routeTarget) return routeTarget;
        }
        return document.getElementById('mobile-map-buttons-target');
      };

      const target = getTarget();
      if (target) {
        setPortalTarget(prev => prev !== target ? target : prev);
      }

      const observer = new MutationObserver(() => {
        const el = getTarget();
        if (el) {
          setPortalTarget(prev => prev !== el ? el : prev);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    } else {
      setPortalTarget(prev => prev !== null ? null : prev);
    }
  }, [isMobile, focusedSegment, alternativeSegment]);

  useEffect(() => {
    if (!isSearchMode) {
      setMapClickedPlace(null);
    }
  }, [isSearchMode]);

  // recommendedPlaces가 비워지면 activeRecommendedPlace도 비워지도록 함
  useEffect(() => {
    if (!recommendedPlaces || recommendedPlaces.length === 0) {
      setActiveRecommendedPlace(null);
    }
  }, [recommendedPlaces]);

  const categoryEmojis = useMemo<Record<string, string>>(() => ({
    cafe: '☕',
    restaurant: '🍽️',
    hotel: '🏨',
    activity: '🎡',
    transit: '🚉',
    etc: '📍'
  }), []);



  const handleAddRecommendedPlace = async (item: PlaceResult) => {
    if (!activeJourney) return;
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

  const handleDeviceOrientation = useCallback((event: any) => {
    let heading = null;
    if (event.webkitCompassHeading !== undefined) {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      heading = 360 - event.alpha;
    }

    if (heading !== null) {
      const rad = heading * Math.PI / 180;
      const x = Math.sin(rad);
      const y = Math.cos(rad);
      
      if (!headingEmaRef.current) {
        headingEmaRef.current = { x, y };
      } else {
        // EMA 필터링 (0.15: 부드러움 강조)
        headingEmaRef.current.x = headingEmaRef.current.x * 0.85 + x * 0.15;
        headingEmaRef.current.y = headingEmaRef.current.y * 0.85 + y * 0.15;
      }
      
      let smoothedHeading = Math.atan2(headingEmaRef.current.x, headingEmaRef.current.y) * (180 / Math.PI);
      smoothedHeading = (smoothedHeading + 360) % 360;
      
      setDeviceHeading(smoothedHeading);
    }
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation as any, true);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [handleDeviceOrientation]);

  const handleMyLocationClick = async () => {
    if (!navigator.geolocation) {
      await alert("이 브라우저에서는 위치 정보를 지원하지 않습니다.");
      return;
    }

    if (gpsMode === 'none') {
      setGpsMode('location');
      setIsLocating(true);
      
      if (lastKnownLocationRef.current && map) {
        map.panTo(new window.naver.maps.LatLng(lastKnownLocationRef.current.lat, lastKnownLocationRef.current.lng));
        map.setZoom(16, false);
      }

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          lastKnownLocationRef.current = { lat, lng };
          setUserLocation({ lat, lng });


          // side effect (map.panTo) MUST be outside of the setState callback in React 18+
          if (gpsModeRef.current !== 'none' && map) {
            map.panTo(new window.naver.maps.LatLng(lat, lng));
          }
          
          setIsLocating(false);
        },
        (error) => {
          console.error("내 위치 가져오기 실패:", error);
          setIsLocating(false);
          setGpsMode('none');
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    } else if (gpsMode === 'location') {
      const win = window as any;
      if (typeof win.DeviceOrientationEvent !== 'undefined' && typeof win.DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permissionState = await win.DeviceOrientationEvent.requestPermission();
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
            setGpsMode('compass');
          } else {
            await alert('기기 방향 접근 권한이 거부되었습니다.');
          }
        } catch (error) {
          console.error('기기 방향 권한 요청 실패:', error);
          if ('ondeviceorientationabsolute' in win) {
            win.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
          } else {
            win.addEventListener('deviceorientation', handleDeviceOrientation, true);
          }
          setGpsMode('compass');
        }
      } else {
        if ('ondeviceorientationabsolute' in win) {
          win.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        } else {
          win.addEventListener('deviceorientation', handleDeviceOrientation, true);
        }
        setGpsMode('compass');
      }
    } else if (gpsMode === 'compass') {
      setGpsMode('none');
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation as any, true);
      setDeviceHeading(null);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setUserLocation(null);
    }
  };

  const { fetchSequentialDirections } = useJourneyDirections();
  const directionsCache = useJourneyDirectionsCache(places);



  useEffect(() => {
    if (places.length < 2) return;
    setForceLoad(false);
    const timer = setTimeout(() => {
      setForceLoad(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [places]);

  // Check if all routes (segments) of the initial journey are loaded in directionsCache or manually selected
  const isAllInitialRoutesLoaded = useMemo(() => {
    if (forceLoad) return true;
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

        // Check if there is a manually selected route for this segment
        const hasSelectedRoute = !!(origin.selected_route && origin.selected_route.destId === dest.id);

        const cacheKey = `${origin.id}-${dest.id}`;
        const hasCachedRoute = !!directionsCache[cacheKey];

        if (hasSelectedRoute || hasCachedRoute) {
          loadedInitialSegments++;
        }
      }
    }

    return loadedInitialSegments === totalInitialSegments;
  }, [places, initialPlaceIds, directionsCache, forceLoad]);

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

  const [map, setMap] = useState<naver.maps.Map | null>(null);

  const handleMapRef = useCallback((mapInstance: naver.maps.Map | null) => {
    if (!mapInstance) return;
    setMap((prev) => {
      if (prev === mapInstance) return prev;
      return mapInstance;
    });
  }, []);

  const handleMapClick = useCallback((e: any) => {
    if (!isSearchMode) return;
    const lat = e.coord.y;
    const lng = e.coord.x;

    const navermapsObj = typeof window !== 'undefined' ? window.naver?.maps : null;
    if (navermapsObj && navermapsObj.Service && navermapsObj.Service.reverseGeocode) {
      navermapsObj.Service.reverseGeocode(
        {
          coords: e.coord,
        },
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
  }, [isSearchMode, setMapClickedPlace]);

  const logoControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return {
      position: navermapsObj ? navermapsObj.Position.BOTTOM_RIGHT : 12,
    };
  }, []);

  const scaleControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return {
      position: navermapsObj ? navermapsObj.Position.BOTTOM_RIGHT : 12,
    };
  }, []);

  const mapDataControlOptions = useMemo(() => {
    const navermapsObj = typeof window !== 'undefined' && window.naver?.maps;
    return {
      position: navermapsObj ? navermapsObj.Position.BOTTOM_LEFT : 10,
    };
  }, []);

  // 여정에 등록된 장소가 없을 경우 사용자의 실시간 GPS 위치를 지도의 기본 중심지로 설정
  useEffect(() => {
    if (places.length === 0 && typeof window !== 'undefined' && navigator.geolocation) {
      // 초기 로드 시에는 신속한 지도 로드를 위해 캐시 적극 사용 (대략적인 위치 우선)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCenter = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          lastKnownLocationRef.current = newCenter; // 초기 로드한 위치를 캐시에 저장
          setMapCenter(newCenter);
          setMapCenterCoord(newCenter); // 스토어에도 중심 좌표 기록
          if (map && window.naver?.maps) {
            map.setCenter(new window.naver.maps.LatLng(newCenter.lat, newCenter.lng));
          }
        },
        (error) => {
          console.warn('[MapArea] Geolocation failed or denied. Defaulting to Seoul City Hall.', error);
          setMapCenterCoord({ lat: 37.5665, lng: 126.9780 }); // 기본 서울 시청으로 스토어 설정
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 } // 캐시 적극 허용 (5분)
      );
    }
  }, [places.length, map]);


  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [windowHeight, setWindowHeight] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentMapPadding = useMemo(() => {
    // 맵 컨테이너의 예상 너비 계산 (사이드바 너비 고려)
    const sidebarWidth = Math.max(380, Math.min(480, windowWidth * 0.35));
    const mapWidth = windowWidth - sidebarWidth;

    // 모바일 환경에서는 상단에 검색바가 존재하므로, 폴리라인 등이 가려지지 않도록 여백을 확보합니다.
    let topPadding = isMobile ? 120 : 80;

    // 모바일 환경일 경우 바텀 시트 높이를 고려하여 지도가 잘리지 않도록 하단 패딩 동적 추가
    // 마커 아이콘이 잘리지 않도록 모바일에서 좌우 패딩을 충분히(최소 48px) 확보합니다.
    const rightPadding = mapWidth < 600 ? 48 : 30;
    let bottomPadding = mapWidth < 600 ? 30 : 45;
    
    // 바텀시트가 최대화되었을 때는 지도가 가려지므로 이전 높이(최소 또는 기본) 기준으로 패딩을 고정하여 지도가 튀는 현상(Shift)을 방지
    const effectiveSnapPoint = isDrawerMaximized 
      ? (lastNonMaximizedSnapPointRef.current || (activeJourney ? '370px' : '360px')) 
      : drawerSnapPoint;

    if (isMobile) {
      if (!!focusedSegment || !!alternativeSegment) {
        // 상세 안내 패널 상태에 따른 바텀 패딩 조절
        if (!!alternativeSegment) {
          if (guidePanelState === 'expanded') {
            bottomPadding = windowHeight * 0.4 + 20; // 최대화 시 어차피 가려지므로 기존 40vh 유지하여 튀는 현상 방지
          } else {
            bottomPadding = windowHeight * 0.4 + 20; // 대안 경로 패널 기본 높이 (40vh)
          }
        } else {
          if (guidePanelState === 'minimized') {
            bottomPadding = 240; // 이동 상세 패널 최소화 시 180px + 60px 여백 (마커 라벨 등 고려)
          } else {
            bottomPadding = 410; // 이동 상세 패널 기본 높이 (350px + 60px 여백)
          }
        }
      } else if (effectiveSnapPoint !== 1) {
        if (typeof effectiveSnapPoint === 'number') {
          bottomPadding = effectiveSnapPoint + 40;
        } else if (typeof effectiveSnapPoint === 'string' && effectiveSnapPoint.endsWith('px')) {
          bottomPadding = parseInt(effectiveSnapPoint, 10) + 40; // 스냅 포인트 높이 + 마커 여백 고려
        } else {
          bottomPadding = 310;
        }
      }
    }

    // 경로 안내 패널이나 대안 경로 패널이 열려 있을 때 패딩 조정
    let leftPadding = mapWidth < 600 ? 48 : 30;
    if (!!focusedSegment || !!alternativeSegment) {
      if (!isMobile) {
        // 데스크톱에서는 좌측 패널이므로 좌측 패딩 증가
        leftPadding = Math.min(390, mapWidth * 0.45);
      }
    }

    // 안전장치: 모바일 브라우저 툴바 등에 의해 화면 높이가 매우 작아진 경우
    // 상하 패딩의 합이 화면 높이를 초과하거나 너무 꽉 차면 fitBounds가 오작동(비정상 확대)하므로 안전 마진 확보
    if (isMobile) {
      const maxAllowedVerticalPadding = Math.max(0, windowHeight - 150); // 최소 150px의 지도 표시 영역 보장
      const currentTotalVerticalPadding = topPadding + bottomPadding;
      if (currentTotalVerticalPadding > maxAllowedVerticalPadding) {
        // 공간이 부족할 경우, 검색바(topPadding) 공간을 우선 확보하고 나머지를 바텀 패딩에 할당
        // 단, topPadding 자체도 과도하게 크지 않게 조정
        topPadding = Math.min(topPadding, maxAllowedVerticalPadding * 0.3);
        bottomPadding = maxAllowedVerticalPadding - topPadding;
      }
    }

    return {
      top: topPadding,
      right: rightPadding,
      bottom: bottomPadding,
      left: leftPadding,
    };
  }, [focusedSegment, alternativeSegment, windowWidth, windowHeight, isMobile, drawerSnapPoint, isDrawerMaximized, guidePanelState]);

  const currentMapPaddingRef = useRef(currentMapPadding);
  useEffect(() => {
    currentMapPaddingRef.current = currentMapPadding;
  }, [currentMapPadding]);

  // 지도 패딩을 동적으로 동기화하여 panTo, fitBounds 등이 항상 정확한 오프셋 영역 중심을 기준으로 동작하도록 보장
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
    windowHeight,
  });

  const handleRecommendedMarkerClick = (recPlace: PlaceResult) => {
    // 0ms: 즉시 햅틱 피드백 및 선택 마커 강조
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setActiveRecommendedPlace(recPlace);

    // 광클 방지: 이전의 예약된 패닝 및 상태 지연 취소
    if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
    if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);

    // 50ms: 지도 카메라 패닝 시작
    if (map) {
      panTimeoutRef.current = setTimeout(() => {
        panToWithOffset(map, { lat: recPlace.lat, lng: recPlace.lng });
      }, 50);
    }
  };

  const handleMarkerClick = (place: SelectedPlace & { id: string }, idx: number) => {
    // 0ms: 즉시 햅틱 피드백 실행
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    // 광클 방지: 이전 예약 지연 지우기
    if (panTimeoutRef.current) clearTimeout(panTimeoutRef.current);
    if (stateTimeoutRef.current) clearTimeout(stateTimeoutRef.current);

    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };

    // 50ms: 지도 카메라 패닝 시작
    if (map) {
      map.setOptions({ padding: currentMapPadding });
      setMapCenter(coord);
      panTimeoutRef.current = setTimeout(() => {
        panToWithOffset(map, coord);
      }, 50);
    }

    // 80ms: 하이라이트 경로 로드 및 바텀시트 마운트 실행
    stateTimeoutRef.current = setTimeout(() => {
      if (places.length < 2) return;

      let originPlace: any;
      let destPlace: any;

      if (idx === places.length - 1) {
        // 맨 마지막 마커 클릭 시: 마지막 이전 장소에서 마지막 장소로의 경로 하이라이트 (places[N-2] -> places[N-1])
        originPlace = places[places.length - 2];
        destPlace = places[places.length - 1];
      } else {
        // 일반적인 K번 마커 클릭 시: K번 장소에서 K+1번 장소로의 경로 하이라이트 (places[idx] -> places[idx+1])
        originPlace = places[idx];
        destPlace = places[idx + 1];
      }

      if (!originPlace || !destPlace) return;

      // 세그먼트 데이터 및 경로 가져오기
      const cacheKey = `${originPlace.id}-${destPlace.id}`;
      const segmentData = directionsCache[cacheKey];
      const transportType = activeJourney?.transport_type || 'public';
      const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);

      // 이미 해당 세그먼트가 선택(하이라이트)되어 있는 경우 클릭 시 전체 여정으로 돌아가지 않고, 해당 구간을 다시 핏팅 (세부 스텝 포커스 해제)
      if (focusedSegment && focusedSegment.originId === originPlace.id && focusedSegment.destId === destPlace.id) {
        setFocusBounds({ ...bounds });
        setFocusedStep(null);
      } else {
        // 신규 하이라이트 적용
        setFocusBounds(bounds);
        setFocusedSegment({ originId: originPlace.id, destId: destPlace.id });
        setFocusedStep(null);
      }
    }, 80);
  };







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

  // activeJourney.places가 변경될 때 순차적으로 누락된 세그먼트 경로 정보를 fetch 함
  useEffect(() => {
    if (isCacheRestored && places && places.length > 1) {
      fetchSequentialDirections(places);
    }
  }, [places, fetchSequentialDirections, isCacheRestored]);



  // 지도 줌 레벨 및 뷰포트 바운드 변경 감지 리스너
  const animatedSegmentsRef = useRef<Set<string>>(new Set());

  // 마지막으로 reverseGeocode를 호출했던 좌표를 기억
  const lastGeocodedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // 드래그나 줌 조작이 완전히 멈춘 유휴(idle) 상태일 때만 바운드와 줌 레벨을 갱신하여 렌더링 부하 최소화
    const idleListener = navermaps.Event.addListener(map, 'idle', () => {
      const newZoom = map.getZoom();
      const prevZoom = useMapUIStore.getState().zoomLevel;
      setZoomLevel(prevZoom === newZoom ? prevZoom : newZoom);

      const newBounds = map.getBounds() as naver.maps.LatLngBounds;
      const prevBounds = useMapUIStore.getState().mapBounds;
      if (!prevBounds || !newBounds) {
        setMapBounds(newBounds);
      } else {
        const prevSW = prevBounds.getSW();
        const prevNE = prevBounds.getNE();
        const newSW = newBounds.getSW();
        const newNE = newBounds.getNE();
        if (
          prevSW.lat() !== newSW.lat() ||
          prevSW.lng() !== newSW.lng() ||
          prevNE.lat() !== newNE.lat() ||
          prevNE.lng() !== newNE.lng()
        ) {
          setMapBounds(newBounds);
        }
      }

      // 전역 스토어에 영역(Bounds) 정보 갱신
      if (newBounds) {
        const sw = newBounds.getSW();
        const ne = newBounds.getNE();
        setGlobalMapBounds({
          minLat: sw.lat(),
          maxLat: ne.lat(),
          minLng: sw.lng(),
          maxLng: ne.lng()
        });
      }

      // reverseGeocode 호출 최적화:
      // 1) debounce 600ms — 연속 조작 시 마지막 idle만 처리
      // 2) 거리 임계값 — 마지막 geocode 위치에서 ~300m 이내면 재호출 생략
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = setTimeout(() => {
        const center = map.getCenter();
        const lat = center.y;
        const lng = center.x;

        // 마지막 geocode 위치와의 거리 계산 (단순 위경도 차이 → 약 300m 이내면 skip)
        const last = lastGeocodedCoordsRef.current;
        if (last) {
          const dLat = Math.abs(lat - last.lat);
          const dLng = Math.abs(lng - last.lng);
          // 위경도 0.003° ≈ 약 300m
          if (dLat < 0.003 && dLng < 0.003) return;
        }

        if (navermaps.Service && navermaps.Service.reverseGeocode) {
          navermaps.Service.reverseGeocode(
            {
              coords: center,
              orders: [
                navermaps.Service.OrderType.ADDR,
                navermaps.Service.OrderType.ROAD_ADDR
              ].join(',')
            },
            (status: any, response: any) => {
              if (status === navermaps.Service.Status.OK) {
                const results = response.v2.results;
                const region = results[0]?.region;
                const area1 = region?.area1?.name || '';
                const area2 = region?.area2?.name || '';
                const area3 = region?.area3?.name || '';

                const zoom = map.getZoom();
                let regionParts: string[] = [];

                if (zoom >= 14) {
                  // 1. 상세 확대 뷰: 동(area3)까지 포함
                  regionParts = [area1, area2, area3];
                } else if (zoom >= 11) {
                  // 2. 중간 뷰: 시/구(area2)까지만 포함하여 검색 범위 확장
                  regionParts = [area1, area2];
                } else if (zoom >= 8) {
                  // 3. 광역 뷰: 시/도(area1)까지만 포함
                  regionParts = [area1];
                } else {
                  // 4. 전국 뷰: 주소 접두사 없이 전국 검색 허용
                  regionParts = [];
                }

                const regionName = regionParts.filter(Boolean).join(' ');
                setMapCenterAddress(regionName);
                setMapCenterCoord({ lat, lng }); // 스토어에도 중심 좌표 기록
                lastGeocodedCoordsRef.current = { lat, lng };
              }
            }
          );
        }
      }, 600);
    });

    return () => {
      navermaps.Event.removeListener(idleListener);
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [map]);

  const navermaps = typeof window !== 'undefined' && window.naver?.maps;

  const activeSegment = focusedSegment || alternativeSegment;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── 현 지도에서 재검색 버튼 ── */}
      {isSearchMode && hasSearchQuery && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-[2000] pointer-events-auto transition-opacity duration-300 ${isDrawerMaximized ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <button
            type="button"
            onClick={triggerSearch}
            disabled={isSearchLoading}
            className={`
              flex items-center gap-2 px-5 py-3 rounded-full font-bold text-[14px]
              shadow-[0_4px_16px_rgba(0,0,0,0.1),0_1px_3px_rgba(0,0,0,0.06)]
              backdrop-blur-md transition-all duration-300 ease-out border
              ${isSearchLoading
                ? 'bg-blue-500/90 text-white border-blue-400/50 scale-95 cursor-not-allowed'
                : 'bg-white/90 text-blue-600 border-zinc-200/80 hover:bg-white hover:scale-105 hover:shadow-[0_8px_24px_rgba(59,130,246,0.15)] active:scale-95 cursor-pointer'
              }
            `}
          >
            {isSearchLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="tracking-wide flex gap-0.5">
                  검색 중
                  <span className="animate-[bounce_1s_infinite_0ms]">.</span>
                  <span className="animate-[bounce_1s_infinite_200ms]">.</span>
                  <span className="animate-[bounce_1s_infinite_400ms]">.</span>
                </span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span className="tracking-wide">현재 화면에서 검색</span>
              </>
            )}
          </button>
        </div>
      )}

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

          {/* 정적 방향 스트라이프 패턴 마커 렌더링 */}
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

          {/* 환승 안내 마커 렌더링 */}
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
            deviceHeading={deviceHeading}
          />
        </NaverMap>
      </MapDiv>

      {/* ── 추천 장소 상세 오버레이 카드 (Quick Add 지원) ── */}
      {activeRecommendedPlace && (
        <div className={`absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4 transition-all ${
          isDrawerMaximized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
        }`}>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1">
                {activeRecommendedPlace.category.split('>').pop()?.trim() || activeRecommendedPlace.category}
              </span>
              <h4 className="text-[15px] font-black text-zinc-900 truncate leading-tight">
                {activeRecommendedPlace.place_name}
              </h4>
              <p className="text-xs text-zinc-400 mt-1 leading-normal truncate">
                {activeRecommendedPlace.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveRecommendedPlace(null)}
              className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all flex-shrink-0 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {(() => {
            const isAlreadyAdded = places.some(p => p.id === activeRecommendedPlace.id);
            return isAlreadyAdded ? (
              <button
                type="button"
                onClick={() => handleRemoveRecommendedPlace(activeRecommendedPlace.id)}
                className="w-full py-3 bg-red-50 hover:bg-red-500 active:scale-95 text-red-600 hover:text-white text-xs font-bold rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-red-100 hover:border-red-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                <span>여정에서 제거하기</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAddRecommendedPlace(activeRecommendedPlace)}
                className="relative w-full py-3 bg-zinc-950 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-blue-600 before:to-indigo-600 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 relative z-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="relative z-10">장소 추가</span>
              </button>
            );
          })()}
        </div>
      )}

      {/* ── 지도에서 직접 클릭한 장소 오버레이 카드 ── */}
      {mapClickedPlace && (
        <div className={`absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4 transition-all ${
          isDrawerMaximized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
        }`}>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full mb-1">
                직접 선택
              </span>
              <input
                type="text"
                value={mapClickedPlace.place_name}
                onChange={(e) => setMapClickedPlace({ ...mapClickedPlace, place_name: e.target.value })}
                className="w-full text-[15px] font-black text-zinc-900 leading-tight bg-transparent border-b border-zinc-200 focus:border-blue-500 outline-none pb-1"
                placeholder="장소 이름을 입력하세요"
                autoFocus
              />
              <p className="text-xs text-zinc-400 mt-2 leading-normal truncate">
                {mapClickedPlace.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMapClickedPlace(null)}
              className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all flex-shrink-0 cursor-pointer mt-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!activeJourney) return;
              const newId = 'custom_' + Date.now();
              const place: Place = {
                id: newId,
                place_name: mapClickedPlace.place_name || '지도에서 선택한 장소',
                address: mapClickedPlace.address,
                category: '사용자 추가',
                lat: mapClickedPlace.lat,
                lng: mapClickedPlace.lng,
              };
              try {
                await addPlace(place);

                // localStorage에 최근 검색어(장소 이름) 저장
                const queriesStr = localStorage.getItem('onjourney_recent_queries');
                let recentQueries = [];
                if (queriesStr) recentQueries = JSON.parse(queriesStr);
                const trimmed = place.place_name.trim();
                if (trimmed) {
                  const next = [trimmed, ...recentQueries.filter((q: string) => q !== trimmed)].slice(0, 10);
                  localStorage.setItem('onjourney_recent_queries', JSON.stringify(next));
                }

                setMapClickedPlace(null);
              } catch (err) {
                console.error('장소 추가 실패:', err);
              }
            }}
            className="relative w-full py-3 bg-zinc-950 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-rose-600 before:to-orange-500 before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 relative z-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="relative z-10">장소 추가</span>
          </button>
        </div>
      )}

      {/* ── 내 위치 오버레이 카드 ── */}
      {showLocationCard && userLocation && (
        <div className={`absolute bottom-[224px] md:bottom-24 left-4 md:left-6 z-[120] w-[calc(100%-32px)] md:w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4 transition-all ${
          isDrawerMaximized ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'
        }`}>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1">
                내 위치
              </span>
              <h4 className="text-[15px] font-black text-zinc-900 leading-tight truncate">
                현재 위치
              </h4>
              <p className="text-xs text-zinc-400 mt-2 leading-normal truncate">
                {currentAddress || '위치 정보를 불러오고 있습니다...'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLocationCard(false)}
              className="w-7 h-7 rounded-full bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all flex-shrink-0 cursor-pointer mt-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={async () => {
              const place: Place = {
                id: `gps-${Date.now()}`,
                place_name: currentAddress ? '현재 위치 (' + currentAddress.split(' ').slice(0, 2).join(' ') + ')' : '현재 위치',
                address: currentAddress,
                category: '현재 위치',
                lat: userLocation.lat,
                lng: userLocation.lng,
              };
              try {
                await addPlace(place);
                setShowLocationCard(false);
              } catch (err) {
                console.error('위치 추가 실패:', err);
              }
            }}
            className="relative group w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden"
          >
            <span className="relative z-10">여정에 추가</span>
          </button>
        </div>
      )}

      {/* 전체 보기 및 내 위치 플로팅 버튼 (우측 하단) */}
      {(() => {
        const buttons = (
          <>
            {(!!activeJourney || places.length > 0) && !isSearchMode && (
              <button
                type="button"
                onClick={handleResetBounds}
                className="
                  group flex items-center justify-center w-12 h-12 rounded-2xl
                  bg-white border border-zinc-200/80
                  shadow-[0_4px_16px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.06)]
                  hover:shadow-[0_8px_28px_rgba(59,130,246,0.18),0_2px_6px_rgba(59,130,246,0.1)]
                  hover:border-blue-200 hover:bg-blue-50
                  active:scale-[0.94] hover:scale-[1.06]
                  transition-all duration-200 ease-out
                  cursor-pointer select-none
                "
                title={focusedSegment ? "해당 이동 구간 보기" : "전체 여정 보기"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 32 32"
                  fill="none"
                  className="w-8 h-8 transition-transform group-hover:scale-110 duration-200"
                >
                  <path
                    d="M21 2C17.5 2 15 5 15 8.5C15 13.5 21 19 21 19C21 19 27 13.5 27 8.5C27 5 24.5 2 21 2Z"
                    className="fill-[#8A8A93] group-hover:fill-blue-500 transition-colors duration-200"
                  />
                  <circle cx="21" cy="8" r="2.5" fill="white" />
                  <path
                    d="M 6 29 Q 13.8 27.7, 21.0 25.8 Q 24.5 24.8, 20.5 23.8 Q 16.5 22.8, 12.5 21.8 Q 8.5 20.8, 13.0 19.8 Q 17.5 19.0, 21 19"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-[#64748B] group-hover:stroke-blue-500 transition-colors duration-200"
                    fill="none"
                  />
                </svg>
              </button>
            )}

            <button
              onClick={handleMyLocationClick}
              disabled={isLocating}
              className={`
                group flex items-center justify-center w-12 h-12 rounded-2xl
                bg-white border border-zinc-200/80
                shadow-[0_4px_16px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.06)]
                transition-all duration-200 ease-out
                select-none
                ${isLocating
                  ? 'cursor-not-allowed bg-blue-50/50 border-blue-100 text-blue-500'
                  : 'cursor-pointer hover:shadow-[0_8px_28px_rgba(59,130,246,0.18),0_2px_6px_rgba(59,130,246,0.1)] hover:border-blue-200 hover:bg-blue-50 active:scale-[0.94] hover:scale-[1.06] text-[#8A8A93] hover:text-blue-500'
                }
              `}
              title="내 위치로 이동"
            >
              {isLocating ? (
                <svg className="w-[22px] h-[22px] animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : gpsMode === 'none' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-[22px] h-[22px] transition-transform group-hover:scale-110 duration-200">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              ) : gpsMode === 'location' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[22px] h-[22px] text-blue-500 transition-transform group-hover:scale-110 duration-200">
                  <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-[22px] h-[22px] text-blue-600 transition-transform group-hover:scale-110 duration-200">
                  <path d="M12 2.25L10.5 5h3L12 2.25z" />
                  <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </>
        );

        if (isMobile && portalTarget) {
          return createPortal(buttons, portalTarget);
        }

        return (
          <div className="absolute bottom-[224px] md:bottom-8 right-4 md:right-6 z-[2000] flex flex-col gap-3">
            {buttons}
          </div>
        );
      })()}


    </div>
  );
}
