"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
} from 'react-naver-maps';
import AnimatedMarker from '@/components/AnimatedMarker';
import AnimatedPolyline from '@/components/AnimatedPolyline';
import RouteGuidePanel from '@/components/RouteGuidePanel';
import AlternativeRoutePanel from '@/components/AlternativeRoutePanel';
import DirectionalStripes from '@/components/map/DirectionalStripes';
import TransferMarkers from '@/components/map/TransferMarkers';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { useJourneyDirections, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { NaverMapRouteRenderer, calculateSegmentBounds, expandBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import { SEQUENCE_COLORS, getSequenceTheme } from '@/constants/colors';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { Place, SelectedRoute, DirectionResult, PlaceResult } from '@/types/journey';



interface SelectedPlace {
  lat: number;
  lng: number;
}

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
  } = useJourneyStore(useShallow((state) => ({
    activeJourney: state.activeJourney,
    focusBounds: state.focusBounds,
    setFocusBounds: state.setFocusBounds,
    focusedSegment: state.focusedSegment,
    setFocusedSegment: state.setFocusedSegment,
    focusedStep: state.focusedStep,
    setFocusedStep: state.setFocusedStep,
    alternativeSegment: state.alternativeSegment,
    setAlternativeSegment: state.setAlternativeSegment,
    hoveredAlternativeRoute: state.hoveredAlternativeRoute,
    isAlternativeFromFocus: state.isAlternativeFromFocus,
    recommendedPlaces: state.recommendedPlaces,
    activeSearchPlace: state.activeSearchPlace,
    setMapCenterAddress: state.setMapCenterAddress,
    setMapCenterCoord: state.setMapCenterCoord,
    setMapBounds: state.setMapBounds,
    addPlace: state.addPlace,
    removePlace: state.removePlace,
    isEditMode: state.isEditMode,
    isSearchMode: state.isSearchMode,
    isSearchLoading: state.isSearchLoading,
    triggerSearch: state.triggerSearch,
    hasSearchQuery: state.searchQuery.trim().length > 0,
    isDrawerMaximized: state.isDrawerMaximized,
    drawerSnapPoint: state.drawerSnapPoint,
  })));
  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);

  // Track initial place IDs to handle dynamic sequential animation delays
  const [initialPlaceIds, setInitialPlaceIds] = useState<Set<string>>(new Set());
  const prevJourneyIdRef = useRef<string | null>(null);
  const prevIsEditModeRef = useRef<boolean>(false);
  const [animationVersion, setAnimationVersion] = useState<number>(0);

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



  const [activeRecommendedPlace, setActiveRecommendedPlace] = useState<PlaceResult | null>(null);

  const [mapClickedPlace, setMapClickedPlace] = useState<{ lat: number; lng: number; address: string; place_name: string } | null>(null);

  const [isLocating, setIsLocating] = useState<boolean>(false);
  const lastKnownLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState('');
  const [showLocationCard, setShowLocationCard] = useState(false);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (isMobile) {
      const target = document.getElementById('mobile-map-buttons-target');
      if (target) setPortalTarget(target);

      const observer = new MutationObserver(() => {
        const el = document.getElementById('mobile-map-buttons-target');
        if (el) {
          setPortalTarget(el);
          // Once found, we can disconnect if we want, but keeping it is fine 
          // in case the drawer re-renders.
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    } else {
      setPortalTarget(null);
    }
  }, [isMobile]);

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

  const handleRecommendedMarkerClick = (recPlace: PlaceResult) => {
    setActiveRecommendedPlace(recPlace);
    if (map) {
      map.panTo(new window.naver.maps.LatLng(recPlace.lat, recPlace.lng));
    }
  };

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

  const handleMyLocationClick = () => {
    if (!navigator.geolocation) {
      alert("이 브라우저에서는 위치 정보를 지원하지 않습니다.");
      return;
    }

    // 1. 캐시된 위치가 있다면 즉시 지도의 중심으로 설정하여 0ms 반응 제공
    if (lastKnownLocationRef.current && map) {
      const { lat, lng } = lastKnownLocationRef.current;
      map.setCenter(new window.naver.maps.LatLng(lat, lng));
      map.setZoom(16, false);
      setUserLocation({ lat, lng });
    }

    // 2. 로딩 상태 활성화 (로딩 스피너 작동 및 클릭 비활성화)
    setIsLocating(true);

    // 3. 최신 위치 정보 백그라운드 조회
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        lastKnownLocationRef.current = { lat, lng };
        setUserLocation({ lat, lng });

        if (map) {
          // 최신 정보로 지도의 위치를 부드럽게 재조정
          const location = new window.naver.maps.LatLng(lat, lng);
          map.panTo(location);
          map.setZoom(16, false);

          // 역방향 지오코딩으로 주소 가져오기
          if (window.naver.maps.Service) {
            window.naver.maps.Service.reverseGeocode(
              { coords: location },
              (status: any, response: any) => {
                if (status === window.naver.maps.Service.Status.OK && response.v2.address) {
                  const addr = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                  if (addr) {
                    setCurrentAddress(addr);
                    setShowLocationCard(true);
                  }
                }
              }
            );
          }
        }
        setIsLocating(false);
      },
      (error) => {
        console.error("내 위치 가져오기 실패:", error);
        setIsLocating(false);
        // 캐시 정보로 이미 지도를 이동한 상황이라면 에러 얼럿은 노출하지 않고 에러 로깅만 유지
        if (!lastKnownLocationRef.current) {
          alert("위치 권한이 차단되었거나 정보를 가져올 수 없습니다. 브라우저 설정에서 위치 권한을 허용해주세요.");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000, // 1분 이내의 캐시된 위치는 적극 재사용하여 응답 속도 극대화
        timeout: 8000      // GPS 위성 신호 대기 시간 고려
      }
    );
  };

  const { fetchSequentialDirections } = useJourneyDirections();
  const directionsCache = useJourneyDirectionsCache(places);

  const [forceLoad, setForceLoad] = useState(false);

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
  const [zoomLevel, setZoomLevel] = useState<number>(15);
  const [mapBounds, setMapBounds] = useState<naver.maps.LatLngBounds | null>(null);
  const [mapCenter, setMapCenter] = useState<naver.maps.CoordLiteral>({
    lat: 37.5665,
    lng: 126.9780,
  });

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

  const activeRouteOfFocusedSegment = useMemo(() => {
    if (!focusedSegment) return null;
    const places = activeJourney?.places ?? [];
    const originPlace = places.find(p => p.id === focusedSegment.originId);
    const destPlace = places.find(p => p.id === focusedSegment.destId);
    if (!originPlace || !destPlace) return null;

    const cacheKey = `${focusedSegment.originId}-${focusedSegment.destId}`;
    const segmentData = directionsCache[cacheKey];
    const transportType = activeJourney?.transport_type || 'public';
    return getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
  }, [focusedSegment, activeJourney, directionsCache]);

  const focusedPlaces = useMemo(() => {
    if (!focusedSegment) return null;
    const places = activeJourney?.places ?? [];
    const originPlace = places.find(p => p.id === focusedSegment.originId);
    const destPlace = places.find(p => p.id === focusedSegment.destId);
    if (!originPlace || !destPlace) return null;
    return { originPlace, destPlace };
  }, [focusedSegment, activeJourney]);

  const alternativePlaces = useMemo(() => {
    if (!alternativeSegment) return null;
    const places = activeJourney?.places ?? [];
    const originPlace = places.find(p => p.id === alternativeSegment.originId);
    const destPlace = places.find(p => p.id === alternativeSegment.destId);
    if (!originPlace || !destPlace) return null;
    return { originPlace, destPlace };
  }, [alternativeSegment, activeJourney]);

  // 현재 선택된 세그먼트 이후의 다음 세그먼트 정보 계산
  const nextSegmentInfo = useMemo(() => {
    if (!focusedSegment || !activeJourney) return null;
    const places = activeJourney.places ?? [];
    const destIndex = places.findIndex(p => p.id === focusedSegment.destId);
    if (destIndex < 0 || destIndex >= places.length - 1) return null;
    const nextOriginPlace = places[destIndex];
    const nextDestPlace = places[destIndex + 1];
    return { nextOriginPlace, nextDestPlace };
  }, [focusedSegment, activeJourney]);

  // 현재 선택된 세그먼트 이전의 세그먼트 정보 계산
  const prevSegmentInfo = useMemo(() => {
    if (!focusedSegment || !activeJourney) return null;
    const places = activeJourney.places ?? [];
    const originIndex = places.findIndex(p => p.id === focusedSegment.originId);
    if (originIndex <= 0) return null;
    const prevOriginPlace = places[originIndex - 1];
    const prevDestPlace = places[originIndex];
    return { prevOriginPlace, prevDestPlace };
  }, [focusedSegment, activeJourney]);

  // 패널 트랜지션 애니메이션 구현을 위한 상태 캐싱 로직 추가
  const [cachedRouteGuide, setCachedRouteGuide] = useState<{
    route: SelectedRoute | DirectionResult;
    originPlace: Place;
    destPlace: Place;
    nextDestPlace?: Place;
    nextSegmentInfo: typeof nextSegmentInfo;
    prevSegmentInfo: typeof prevSegmentInfo;
  } | null>(null);

  const [cachedAlternative, setCachedAlternative] = useState<{
    originPlace: Place;
    destPlace: Place;
  } | null>(null);

  const showRouteGuide = !!(activeRouteOfFocusedSegment && focusedPlaces && !alternativePlaces);
  const showAlternative = !!alternativePlaces;

  useEffect(() => {
    if (showRouteGuide && activeRouteOfFocusedSegment && focusedPlaces) {
      setCachedRouteGuide({
        route: activeRouteOfFocusedSegment,
        originPlace: focusedPlaces.originPlace,
        destPlace: focusedPlaces.destPlace,
        nextDestPlace: nextSegmentInfo?.nextDestPlace || undefined,
        nextSegmentInfo,
        prevSegmentInfo,
      });
    }
  }, [showRouteGuide, activeRouteOfFocusedSegment, focusedPlaces, nextSegmentInfo, prevSegmentInfo]);

  useEffect(() => {
    if (showAlternative && alternativePlaces) {
      setCachedAlternative({
        originPlace: alternativePlaces.originPlace,
        destPlace: alternativePlaces.destPlace,
      });
    }
  }, [showAlternative, alternativePlaces]);

  const isPanelOpen = showRouteGuide;

  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentMapPadding = useMemo(() => {
    // 맵 컨테이너의 예상 너비 계산 (사이드바 너비 고려)
    const sidebarWidth = Math.max(380, Math.min(480, windowWidth * 0.35));
    const mapWidth = windowWidth - sidebarWidth;

    // 상단 검색바 제거에 따른 상단 패딩 축소 (최적의 핏을 위해 여백 최소화)
    const topPadding = 40;

    // 모바일 환경일 경우 바텀 시트 높이를 고려하여 지도가 잘리지 않도록 하단 패딩 동적 추가
    const rightPadding = mapWidth < 600 ? 16 : 30;
    let bottomPadding = mapWidth < 600 ? 30 : 45;
    if (isMobile && drawerSnapPoint !== 1) {
      if (typeof drawerSnapPoint === 'string' && drawerSnapPoint.endsWith('px')) {
        bottomPadding = parseInt(drawerSnapPoint, 10) + 20; // 스냅 포인트 높이 + 20px 여백
      } else {
        bottomPadding = 300;
      }
    }

    // 경로 안내 패널이나 대안 경로 패널이 열려 있을 때 좌측 패딩
    // 패널 너비를 고려하되, 맵 너비가 너무 작으면 지도가 찌그러지는 것을 방지하기 위해 최대값 제한
    let leftPadding = mapWidth < 600 ? 16 : 30;
    if (isPanelOpen || alternativePlaces) {
      leftPadding = Math.min(390, mapWidth * 0.45);
    }

    return {
      top: topPadding,
      right: rightPadding,
      bottom: bottomPadding,
      left: leftPadding,
    };
  }, [isPanelOpen, alternativePlaces, windowWidth, isMobile]);

  // 지도 패딩을 동적으로 동기화하여 panTo, fitBounds 등이 항상 정확한 오프셋 영역 중심을 기준으로 동작하도록 보장
  useEffect(() => {
    if (!map) return;
    map.setOptions({ padding: currentMapPadding });
  }, [map, currentMapPadding]);


  const handleMarkerClick = (place: SelectedPlace & { id: string }, idx: number) => {
    // 1. 지도 중심 이동
    if (map) {
      map.setOptions({ padding: currentMapPadding });
      const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };
      setMapCenter(coord);
      map.panTo(coord);
    }

    // 2. 이동 경로 하이라이트 인터랙션 적용
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
  };



  const handleResetBounds = () => {
    // 만약 이미 전체 화면 상태라면, 패딩 재적용 및 수동 핏팅 수행 (사용자 조작 복구용)
    if (!focusBounds) {
      if (!map || places.length === 0) return;
      map.setOptions({ padding: currentMapPadding });

      const navermaps = typeof window !== 'undefined' && window.naver?.maps;
      if (!navermaps) return;

      if (places.length === 1) {
        const first = places[0];
        const latOffset = 0.0015;
        const lngOffset = 0.0015;
        const bounds = new navermaps.LatLngBounds(
          new navermaps.LatLng(first.lat - latOffset, first.lng - lngOffset),
          new navermaps.LatLng(first.lat + latOffset, first.lng + lngOffset)
        );
        map.fitBounds(bounds, { maxZoom: 16, margin: currentMapPadding } as any);
      } else {
        const renderer = new NaverMapRouteRenderer(map);
        renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public', currentMapPadding);
      }
      return;
    }

    // 포커스 상태를 클리어하면 useEffect에 의해 자동으로 최적의 unpadded 뷰포트로 핏팅됨
    setFocusBounds(null);
    setFocusedSegment(null);
    setFocusedStep(null);
    setAlternativeSegment(null);
  };

  // 바텀 시트 높이가 변경될 때(최대화 제외), 기존 줌 레벨을 유지하면서 변경된 지도 영역에 맞춰 시각적 중앙만 다시 정렬합니다.
  useEffect(() => {
    if (!map || isDrawerMaximized) return;

    // 현재 시각적 중심 좌표를 저장
    const currentCenter = map.getCenter();

    // 패딩 업데이트
    map.setOptions({ padding: currentMapPadding });

    // 줌 레벨 변경 없이 중앙 좌표만 새로운 패딩 영역의 중심으로 부드럽게 이동
    map.panTo(currentCenter);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerSnapPoint, isDrawerMaximized]);

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

  // places 또는 map 인스턴스 또는 로드된 세그먼트 수가 변경되었을 때 전체 경유지를 한 화면에 담도록 fitBounds 설정
  // 검색 결과가 지워진 경우에도 원래 전체 경로로 줌을 되돌리도록 recommendedPlaces 상태를 연동합니다.
  useEffect(() => {
    if (!map || places.length === 0) return;

    // 검색 모드 중이라면 이 효과를 스킵합니다 (사용자의 줌/팬 조작을 방해하지 않음)
    if (isSearchMode) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // 만약 사용자가 이미 개별 세그먼트에 포커스(focusBounds가 활성 상태) 중이라면 자동 전체 fitBounds 무시
    if (focusBounds) return;

    map.setOptions({ padding: currentMapPadding });

    if (places.length === 1) {
      const first = places[0];
      const latOffset = 0.0015;
      const lngOffset = 0.0015;
      const bounds = new navermaps.LatLngBounds(
        new navermaps.LatLng(first.lat - latOffset, first.lng - lngOffset),
        new navermaps.LatLng(first.lat + latOffset, first.lng + lngOffset)
      );
      map.fitBounds(bounds, { maxZoom: 16, margin: currentMapPadding } as any);
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public', currentMapPadding);
    }
  }, [places, map, focusBounds, loadedSegmentsCount, activeJourney?.transport_type, currentMapPadding, recommendedPlaces]);

  // focusBounds 상태 변화 감지 시 지도의 뷰포트를 해당 범위로 핏팅
  useEffect(() => {
    if (!map || !focusBounds) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    map.setOptions({ padding: currentMapPadding });

    const expanded = expandBounds(focusBounds, 0.03); // 3% 확장하여 더욱 조밀하고 가득 차게 핏팅
    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(expanded.sw.lat, expanded.sw.lng),
      new navermaps.LatLng(expanded.ne.lat, expanded.ne.lng)
    );

    map.fitBounds(bounds, { maxZoom: 18, margin: currentMapPadding } as any);

  }, [focusBounds, map, currentMapPadding]);



  // 장소 검색 카드 클릭 시 해당 장소로 줌 인
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

  // 지도 줌 레벨 및 뷰포트 바운드 변경 감지 리스너
  const animatedSegmentsRef = useRef<Set<string>>(new Set());

  // 마지막으로 reverseGeocode를 호출했던 좌표를 기억
  const lastGeocodedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    setZoomLevel(map.getZoom());
    const initialBounds = map.getBounds() as naver.maps.LatLngBounds;
    setMapBounds(initialBounds);
    if (initialBounds) {
      const sw = initialBounds.getSW();
      const ne = initialBounds.getNE();
      setGlobalMapBounds({
        minLat: sw.lat(),
        maxLat: ne.lat(),
        minLng: sw.lng(),
        maxLng: ne.lng()
      });
    }

    // 드래그나 줌 조작이 완전히 멈춘 유휴(idle) 상태일 때만 바운드와 줌 레벨을 갱신하여 렌더링 부하 최소화
    const idleListener = navermaps.Event.addListener(map, 'idle', () => {
      const newZoom = map.getZoom();
      setZoomLevel(prev => prev === newZoom ? prev : newZoom);

      const newBounds = map.getBounds() as naver.maps.LatLngBounds;
      setMapBounds(prev => {
        if (!prev || !newBounds) return newBounds;
        const prevSW = prev.getSW();
        const prevNE = prev.getNE();
        const newSW = newBounds.getSW();
        const newNE = newBounds.getNE();
        if (
          prevSW.lat() === newSW.lat() &&
          prevSW.lng() === newSW.lng() &&
          prevNE.lat() === newNE.lat() &&
          prevNE.lng() === newNE.lng()
        ) {
          return prev;
        }
        return newBounds;
      });

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

      <NavermapsProvider ncpKeyId={clientId} submodules={['geocoder']}>
        <MapDiv style={{ width: '100%', height: '100%' }}>
          <NaverMap
            defaultCenter={mapCenter}
            defaultZoom={15}
            ref={setMap}
            onClick={(e: any) => {
              if (!isSearchMode) return;
              const lat = e.coord.y;
              const lng = e.coord.x;

              const navermaps = typeof window !== 'undefined' ? window.naver?.maps : null;
              if (navermaps && navermaps.Service && navermaps.Service.reverseGeocode) {
                navermaps.Service.reverseGeocode(
                  {
                    coords: e.coord,
                  },
                  (status: any, response: any) => {
                    if (status === navermaps.Service.Status.OK) {
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
            }}
            logoControlOptions={{
              position: navermaps ? navermaps.Position.BOTTOM_RIGHT : 12,
            }}
            scaleControlOptions={{
              position: navermaps ? navermaps.Position.BOTTOM_RIGHT : 12,
            }}
            mapDataControlOptions={{
              position: navermaps ? navermaps.Position.BOTTOM_LEFT : 10,
            }}
          >
            {/* 구간별 이동경로 Polyline 렌더링 */}
            {isAllInitialRoutesLoaded && places.map((place, idx) => {
              if (idx === places.length - 1) return null;
              const nextPlace = places[idx + 1];
              const transportType = activeJourney?.transport_type || 'public';
              const cacheKey = `${place.id}-${nextPlace.id}`;
              const segmentData = directionsCache[cacheKey];

              const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');

              if (!defaultRoute || !defaultRoute.steps) {
                return null;
              }

              const isAlternativeSegment = !!(alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id);
              const hasHoveredAlternative = isAlternativeSegment && !!hoveredAlternativeRoute;

              // 렌더링할 경로 목록 구성 (기본 경로는 항상 마운트 유지)
              const routesToRender = [
                { route: defaultRoute, isHoveredRoute: false }
              ];

              if (hasHoveredAlternative && hoveredAlternativeRoute) {
                routesToRender.push({ route: hoveredAlternativeRoute, isHoveredRoute: true });
              }

              const handlePolylineClick = (targetRoute: any) => {
                const bounds = calculateSegmentBounds(place, nextPlace, targetRoute);
                if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                  // 이미 포커스된 상태에서 다시 클릭하면, 전체 구간 보기로 돌아가도록(zoom-out to segment) bounds 재적용
                  setFocusBounds({ ...bounds });
                  setFocusedStep(null);
                } else {
                  setFocusBounds(bounds);
                  setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                  setFocusedStep(null);
                }
              };

              return routesToRender.map(({ route, isHoveredRoute }) => {
                const totalAnimDuration = isHoveredRoute ? 300 : 800;

                // 각 스텝별로 거리에 비례하여 애니메이션 시간을 분배 (거리가 없으면 균등 분배)
                const totalDistance = route.steps.reduce((sum: number, s: any) => sum + (s.distance || 1), 0);

                let currentStepDelay = delays.pathDelays[`${place.id}-${nextPlace.id}`] ?? (idx * 800 + 400);
                if (isHoveredRoute) currentStepDelay = 0;

                return route.steps.map((step: any, sIdx: number) => {
                  const stepPath = step.pathPoints || [];
                  if (stepPath.length < 2) return null;

                  const stepRatio = (step.distance || 1) / totalDistance;
                  const stepDuration = Math.max(100, totalAnimDuration * stepRatio); // 최소 100ms 보장
                  const stepDelay = currentStepDelay;

                  // 다음 스텝의 시작 시간을 현재 스텝 애니메이션 종료 후로 설정
                  currentStepDelay += stepDuration;

                  // AnimatedPolyline 내부에서 LatLng 처리를 수행하므로, 원본 배열을 그대로 전달하여 참조를 유지합니다.
                  const pathPoints = stepPath;

                  // 특정 스텝(세부 노선) 포커스 여부 판별
                  const hasFocusedStep = !!focusedStep;
                  let isThisStepFocused = !!(
                    focusedStep &&
                    focusedStep.originId === place.id &&
                    focusedStep.destId === nextPlace.id &&
                    focusedStep.stepIndex === sIdx
                  );

                  if (
                    focusedStep &&
                    focusedStep.originId === place.id &&
                    focusedStep.destId === nextPlace.id &&
                    focusedStep.subType === 'dest' &&
                    sIdx === route.steps.length - 1
                  ) {
                    isThisStepFocused = true;
                  }

                  // 포커스 세그먼트 매칭 여부 판별
                  const isSegmentFocused = activeSegment
                    ? (activeSegment.originId === place.id && activeSegment.destId === nextPlace.id)
                    : true;

                  // 포커스된 세그먼트가 아닌 경우(다른 구간) 렌더링을 완전히 제거하지 않고 visible로 숨겨 재마운트 애니메이션 방지
                  // 대안 경로 미리보기가 활성화된 경우, 기본 경로는 숨기고 미리보기 경로만 표시
                  // 장소 추가 모드(isSearchMode === true)일 때는 모든 기존 경로를 숨김
                  const isVisible = !(activeSegment && !isSegmentFocused) && (!hasHoveredAlternative || isHoveredRoute) && !isSearchMode;

                  // 순서가 빠를수록(idx가 작을수록) zIndex가 높도록 겹침 노출 순서 적용 (맨 위에 노출)
                  // 특정 스텝만 포커스 상태라면 최상위(15000)로 올림
                  const baseZIndex = isThisStepFocused
                    ? 15000
                    : isSegmentFocused
                      ? (activeSegment ? 5000 + sIdx : (100 - idx) * 10)
                      : (100 - idx);

                  // 교통수단 색상 대신 순서(idx) 기반 색상으로 매핑
                  const segmentColor = SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length];
                  const strokeColor = segmentColor;

                  let strokeOpacity = 0.8;
                  let strokeWeight = 4.5;

                  if (hasFocusedStep) {
                    strokeOpacity = 0.95;
                    strokeWeight = 7.0;
                  } else if (activeSegment) {
                    strokeOpacity = 0.95;
                    strokeWeight = 6.5;
                  } else {
                    strokeOpacity = 0.8;
                    strokeWeight = 4.5;
                  }

                  const keyPrefix = isHoveredRoute ? 'hovered-' : '';
                  const isWalk = step.type === 'walk';

                  if (isWalk) {
                    // 도보 구간: 구간 고유 색상의 점선으로 표시 (방향 화살표 제외하여 깔끔하게 처리)
                    let walkOpacity = 0.65;
                    let walkWeight = 2.5;

                    if (hasFocusedStep) {
                      walkOpacity = 0.95;
                      walkWeight = 5.0;
                    } else if (activeSegment) {
                      walkOpacity = 0.95;
                      walkWeight = 4.5;
                    }

                    return (
                      <AnimatedPolyline
                        key={`polyline-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}-v${animationVersion}`}
                        path={pathPoints}
                        delay={stepDelay}
                        duration={stepDuration}
                        skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                        strokeColor={segmentColor}
                        strokeOpacity={walkOpacity}
                        strokeWeight={walkWeight}
                        strokeStyle="shortdash"
                        strokeLineCap="round"
                        strokeLineJoin="round"
                        zIndex={baseZIndex}
                        onClick={() => handlePolylineClick(route)}
                        visible={isVisible}
                      />
                    );
                  }

                  // 대중교통/차량 구간: 테두리선(백그라운드) + 본선(포그라운드) 이중 Polyline 렌더링으로 겹침 가독성 개선
                  return (
                    <Fragment key={`polyline-group-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}-v${animationVersion}`}>
                      {/* 1. 배경 외곽선 (흰색 테두리) */}
                      <AnimatedPolyline
                        path={pathPoints}
                        delay={stepDelay}
                        duration={stepDuration}
                        skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                        strokeColor="#FFFFFF"
                        strokeOpacity={0.95}
                        strokeWeight={strokeWeight + 1.8}
                        strokeStyle="solid"
                        strokeLineCap="round"
                        strokeLineJoin="round"
                        zIndex={baseZIndex}
                        onClick={() => handlePolylineClick(route)}
                        visible={isVisible}
                      />
                      {/* 2. 본래 색상의 실제 경로선 */}
                      <AnimatedPolyline
                        path={pathPoints}
                        delay={stepDelay}
                        duration={stepDuration}
                        skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                        strokeColor={strokeColor}
                        strokeOpacity={strokeOpacity}
                        strokeWeight={strokeWeight}
                        strokeStyle="solid"
                        strokeLineCap="round"
                        strokeLineJoin="round"
                        zIndex={baseZIndex + 1}
                        onClick={() => handlePolylineClick(route)}
                        visible={isVisible}
                      />
                    </Fragment>
                  );
                });
              });
            })}

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

            {/* Marker는 반드시 NaverMap children 안에 있어야 함 */}
            {places.map((place, idx) => {
              const isSegmentMarker = !!(activeSegment && (place.id === activeSegment.originId || place.id === activeSegment.destId));
              // 일반 경로선(최대 5002)보다 항상 위에 노출되도록 기본 zIndex를 10000 이상으로 상향 조정
              const zIndex = 10000 + (places.length - idx) + (isSegmentMarker ? 10000 : 0);
              // 세부 구간 조회 시에는 일반 숫자 장소 마커를 가려 지도를 정돈하고, 대신 탑승/출발/도착 전용 마커로 가독성을 높임
              // 장소 추가 모드(isSearchMode === true)일 때는 모든 기존 숫자 마커를 숨김
              const isVisible = !activeSegment && !isSearchMode;

              const markerWidth = isSegmentMarker ? 30 : 24;
              const markerHeight = isSegmentMarker ? 40 : 32;
              const anchorX = isSegmentMarker ? 15 : 12;
              const anchorY = isSegmentMarker ? 38 : 30;

              const theme = getSequenceTheme(idx, places.length);

              return (
                <AnimatedMarker
                  key={place.id}
                  delay={delays.markerDelays[place.id] ?? (idx * 800)}
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.place_name}
                  onClick={() => handleMarkerClick(place, idx)}
                  zIndex={zIndex}
                  visible={isVisible}
                  iconAnchor={new window.naver.maps.Point(anchorX, anchorY)}
                  iconContent={`<div style="
                      cursor: pointer;
                      filter: drop-shadow(0 3px 8px ${theme.color}70) drop-shadow(0 2px 4px rgba(0,0,0,0.15));
                      transition: transform 0.2s ease;
                    ">
                      <svg width="${markerWidth}" height="${markerHeight}" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="pinGrad-${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="${theme.gradientStart}" />
                            <stop offset="100%" stop-color="${theme.gradientEnd}" />
                          </linearGradient>
                          <radialGradient id="glassShine-${idx}" cx="35%" cy="35%" r="50%">
                            <stop offset="0%" stop-color="white" stop-opacity="0.6"/>
                            <stop offset="100%" stop-color="white" stop-opacity="0"/>
                          </radialGradient>
                        </defs>
                        <!-- 3D 핀 본체 (물방울 형태) -->
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                              fill="url(#pinGrad-${idx})" 
                        />
                        <!-- 글래스 광택 효과 레이어 -->
                        <circle cx="12" cy="12" r="7.5" fill="url(#glassShine-${idx})" />
                        
                        <!-- 텍스트 숫자 배치 (y값 미세조정으로 정중앙 배치) -->
                        <text x="12" y="16.5" fill="white" font-size="${isSegmentMarker ? 11.5 : 10.5}" font-weight="900" font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle" style="text-shadow: 0 1px 2px rgba(0,0,0,0.35);">${idx + 1}</text>
                      </svg>
                    </div>`}
                />
              );
            })}

            {/* 추천 장소 마커 렌더링 (모든 장소 표시) */}
            {isSearchMode && recommendedPlaces && recommendedPlaces
              .filter((recPlace) => !places.some((p) => p.id === recPlace.id))
              .map((recPlace) => {
                const isActive = activeSearchPlace?.id === recPlace.id;
                const theme = getCategoryTheme(recPlace.category);
                const emoji = categoryEmojis[theme.type] || categoryEmojis.etc;
                const zIndex = isActive ? 9999 : 9000;

                // 활성화된 마커는 크기를 키우고 특별한 그림자 이펙트를 줌
                const markerScale = isActive ? 'scale(1.25)' : 'scale(1)';
                const dropShadow = isActive
                  ? `drop-shadow(0 0 10px ${theme.color}) drop-shadow(0 6px 14px rgba(0,0,0,0.35))`
                  : 'drop-shadow(0 4px 10px rgba(0,0,0,0.18))';

                return (
                  <AnimatedMarker
                    key={`rec-${recPlace.id}`}
                    delay={0}
                    position={{ lat: recPlace.lat, lng: recPlace.lng }}
                    title={recPlace.place_name}
                    onClick={() => handleRecommendedMarkerClick(recPlace)}
                    zIndex={zIndex}
                    iconAnchor={new window.naver.maps.Point(14, 34)}
                    iconContent={`<div style="
                        cursor: pointer;
                        filter: ${dropShadow};
                        transform: ${markerScale};
                        transform-origin: bottom center;
                        transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                      "
                      class="hover:scale-110 active:scale-95"
                      >
                        <svg width="28" height="36" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                                fill="${theme.color}" 
                          />
                          <text x="12" y="17" fill="white" font-size="11" font-family="Pretendard, sans-serif" text-anchor="middle">${emoji}</text>
                        </svg>
                      </div>`}
                  />
                );
              })}

            {/* 직접 클릭한 장소 마커 */}
            {mapClickedPlace && (
              <AnimatedMarker
                key={`clicked-${mapClickedPlace.lat}-${mapClickedPlace.lng}`}
                delay={0}
                position={{ lat: mapClickedPlace.lat, lng: mapClickedPlace.lng }}
                title={mapClickedPlace.place_name}
                zIndex={9500}
                iconAnchor={new window.naver.maps.Point(14, 34)}
                iconContent={`<div style="
                    cursor: pointer;
                    filter: drop-shadow(0 4px 10px rgba(0,0,0,0.25));
                    transition: transform 0.15s ease-out;
                  "
                  class="animate-bounce"
                  >
                    <svg width="28" height="36" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                            fill="#E11D48" 
                      />
                      <circle cx="12" cy="12" r="4" fill="white" />
                    </svg>
                  </div>`}
              />
            )}
            
            {/* 사용자 GPS 마커 */}
            {userLocation && (
              <AnimatedMarker
                key="user-location-gps"
                delay={0}
                position={userLocation}
                title="내 위치"
                zIndex={9600}
                iconAnchor={new window.naver.maps.Point(12, 12)}
                iconContent={`<div class="relative w-6 h-6">
                  <div class="absolute inset-0 bg-blue-500 rounded-full animate-gps-pulse"></div>
                  <div class="absolute inset-1/4 bg-blue-600 rounded-full border-2 border-white shadow-sm"></div>
                </div>`}
              />
            )}
          </NaverMap>
        </MapDiv>
      </NavermapsProvider>

      {/* ── 추천 장소 상세 오버레이 카드 (Quick Add 지원) ── */}
      {activeRecommendedPlace && (
        <div className="absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4">
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
                className="relative group w-full py-3 bg-zinc-950 hover:bg-zinc-900 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
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
        <div className="absolute bottom-24 left-6 z-[120] w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4">
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
            className="relative group w-full py-3 bg-zinc-950 hover:bg-zinc-900 active:scale-95 text-white text-xs font-bold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-orange-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5 relative z-10">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="relative z-10">장소 추가</span>
          </button>
        </div>
      )}

      {/* ── 내 위치 오버레이 카드 ── */}
      {showLocationCard && userLocation && (
        <div className="absolute bottom-[160px] md:bottom-24 left-4 md:left-6 z-[120] w-[calc(100%-32px)] md:w-[320px] bg-white/90 backdrop-blur-xl border border-zinc-100/80 p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-5 duration-300 flex flex-col gap-4">
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
            {places.length > 0 && !isSearchMode && (
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
                title="전체 경로 보기"
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
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-[22px] h-[22px] transition-transform group-hover:scale-110 duration-200">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              )}
            </button>
          </>
        );

        if (isMobile && portalTarget) {
          return createPortal(buttons, portalTarget);
        }

        return (
          <div className="absolute bottom-[160px] md:bottom-8 right-4 md:right-6 z-[2000] flex flex-col gap-3">
            {buttons}
          </div>
        );
      })()}


      {/* 상세 경로 안내 패널: 사이드바 오른쪽에 따로 띄움 */}
      {cachedRouteGuide && (() => {
        const nextInfo = cachedRouteGuide.nextSegmentInfo;
        const prevInfo = cachedRouteGuide.prevSegmentInfo;
        return (
          <RouteGuidePanel
            isOpen={showRouteGuide && !isSearchMode}
            route={cachedRouteGuide.route}
            originPlace={cachedRouteGuide.originPlace}
            destPlace={cachedRouteGuide.destPlace}
            onClose={() => {
              setFocusedSegment(null);
              setFocusedStep(null);
              setFocusBounds(null);
            }}
            onNextSegment={nextInfo ? (jumpToStart?: boolean) => {
              const { nextOriginPlace, nextDestPlace } = nextInfo;
              const cacheKey = `${nextOriginPlace.id}-${nextDestPlace.id}`;
              const segmentData = directionsCache[cacheKey];
              const transportType = activeJourney?.transport_type || 'public';
              const nextRoute = getDefaultRoute(nextOriginPlace, nextDestPlace, segmentData, transportType as 'public' | 'car' | 'walk');
              setFocusedSegment({ originId: nextOriginPlace.id, destId: nextDestPlace.id });

              if (jumpToStart && nextRoute && nextRoute.steps) {
                const firstStep = nextRoute.steps[0];
                let subType: 'start' | 'end' | 'dest' | undefined = undefined;
                if (firstStep.type !== 'walk' && firstStep.startName) {
                  subType = 'start';
                }

                setFocusedStep({
                  originId: nextOriginPlace.id,
                  destId: nextDestPlace.id,
                  stepIndex: 0,
                  subType
                });
                setFocusBounds({
                  sw: { lat: nextOriginPlace.lat, lng: nextOriginPlace.lng },
                  ne: { lat: nextOriginPlace.lat, lng: nextOriginPlace.lng }
                });
              } else {
                setFocusedStep(null);
                const bounds = calculateSegmentBounds(nextOriginPlace, nextDestPlace, nextRoute);
                setFocusBounds(bounds);
              }
            } : undefined}
            onPrevSegment={prevInfo ? (jumpToDest?: boolean) => {
              const { prevOriginPlace, prevDestPlace } = prevInfo;
              const cacheKey = `${prevOriginPlace.id}-${prevDestPlace.id}`;
              const segmentData = directionsCache[cacheKey];
              const transportType = activeJourney?.transport_type || 'public';
              const prevRoute = getDefaultRoute(prevOriginPlace, prevDestPlace, segmentData, transportType as 'public' | 'car' | 'walk');
              setFocusedSegment({ originId: prevOriginPlace.id, destId: prevDestPlace.id });

              if (jumpToDest && prevRoute && prevRoute.steps) {
                const lastIdx = prevRoute.steps.length - 1;
                const lastStep = prevRoute.steps[lastIdx];
                let subType: 'start' | 'end' | 'dest' | undefined = undefined;
                if (lastStep.type !== 'walk' && lastStep.endName) {
                  subType = 'end';
                }

                setFocusedStep({
                  originId: prevOriginPlace.id,
                  destId: prevDestPlace.id,
                  stepIndex: lastIdx,
                  subType
                });
                setFocusBounds({
                  sw: { lat: prevDestPlace.lat, lng: prevDestPlace.lng },
                  ne: { lat: prevDestPlace.lat, lng: prevDestPlace.lng }
                });
              } else {
                setFocusedStep(null);
                const bounds = calculateSegmentBounds(prevOriginPlace, prevDestPlace, prevRoute);
                setFocusBounds(bounds);
              }
            } : undefined}
            nextDestPlace={cachedRouteGuide.nextDestPlace}
            onExited={() => {
              if (!showRouteGuide) {
                setCachedRouteGuide(null);
              }
            }}
          />
        );
      })()}

      {/* 대안 경로 패널 */}
      {cachedAlternative && (
        <AlternativeRoutePanel
          isOpen={showAlternative && !isSearchMode}
          originPlace={cachedAlternative.originPlace}
          destPlace={cachedAlternative.destPlace}
          onClose={(isCancel?: boolean) => {
            setAlternativeSegment(null);

            if (isAlternativeFromFocus) {
              setFocusedSegment({
                originId: cachedAlternative.originPlace.id,
                destId: cachedAlternative.destPlace.id
              });

              if (isCancel) {
                const cacheKey = `${cachedAlternative.originPlace.id}-${cachedAlternative.destPlace.id}`;
                const segmentData = directionsCache[cacheKey];
                const transportType = activeJourney?.transport_type || 'public';
                const defaultRoute = getDefaultRoute(cachedAlternative.originPlace, cachedAlternative.destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                if (defaultRoute) {
                  const bounds = calculateSegmentBounds(cachedAlternative.originPlace, cachedAlternative.destPlace, defaultRoute);
                  setFocusBounds(bounds);
                }
              }
            } else {
              setFocusBounds(null);
            }
          }}
          onExited={() => {
            if (!showAlternative) {
              setCachedAlternative(null);
            }
          }}
        />
      )}
    </div>
  );
}
