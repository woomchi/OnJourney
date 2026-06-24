"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from 'react';
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
import { useJourneyDirections, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { NaverMapRouteRenderer, calculateSegmentBounds, expandBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import { SEQUENCE_COLORS, getSequenceTheme } from '@/constants/colors';

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
    isAlternativeFromFocus
  } = useJourneyStore();
  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);

  // Track initial place IDs to handle dynamic sequential animation delays
  const [initialPlaceIds, setInitialPlaceIds] = useState<Set<string>>(new Set());
  const prevJourneyIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentJourneyId = activeJourney?.id || null;
    if (currentJourneyId !== prevJourneyIdRef.current) {
      if (places.length > 0) {
        setInitialPlaceIds(new Set(places.map(p => p.id)));
        prevJourneyIdRef.current = currentJourneyId;
      } else if (currentJourneyId === null) {
        setInitialPlaceIds(new Set());
        prevJourneyIdRef.current = null;
      }
    } else if (currentJourneyId && initialPlaceIds.size === 0 && places.length > 0) {
      setInitialPlaceIds(new Set(places.map(p => p.id)));
    }
  }, [activeJourney?.id, places, initialPlaceIds.size]);

  // Compute animations delays dynamically
  const delays = useMemo(() => {
    const markerDelays: Record<string, number> = {};
    const pathDelays: Record<string, number> = {}; // key is `${originId}-${destId}`

    let initialCount = 0;
    let dynamicCount = 0;

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      const isInitial = initialPlaceIds.has(place.id);

      if (isInitial) {
        markerDelays[place.id] = initialCount * 800;
        initialCount++;
      } else {
        markerDelays[place.id] = dynamicCount * 800 + 400;
        dynamicCount++;
      }
    }

    let dynamicPathCount = 0;
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
        pathDelays[key] = dynamicPathCount * 800;
        dynamicPathCount++;
      }
    }

    return { markerDelays, pathDelays };
  }, [places, initialPlaceIds]);

  const { fetchSequentialDirections } = useJourneyDirections();
  const directionsCache = useJourneyDirectionsCache(places);

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

  const isPanelOpen = !!(activeRouteOfFocusedSegment && focusedPlaces);

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
    
    // 모바일 등 창이 작을 때 여백 축소
    const rightPadding = mapWidth < 600 ? 16 : 30;
    const bottomPadding = mapWidth < 600 ? 30 : 45;
    
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
  }, [isPanelOpen, alternativePlaces, windowWidth]);

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
        map.fitBounds(bounds, { maxZoom: 16 });
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

  // activeJourney.places가 변경될 때 순차적으로 누락된 세그먼트 경로 정보를 fetch 함
  useEffect(() => {
    if (places && places.length > 1) {
      fetchSequentialDirections(places);
    }
  }, [places, fetchSequentialDirections]);

  // places 또는 map 인스턴스 또는 로드된 세그먼트 수가 변경되었을 때 전체 경유지를 한 화면에 담도록 fitBounds 설정
  useEffect(() => {
    if (!map || places.length === 0) return;

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
      map.fitBounds(bounds, { maxZoom: 16 });
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public', currentMapPadding);
    }
  }, [places, map, focusBounds, loadedSegmentsCount, activeJourney?.transport_type, currentMapPadding]);

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

    map.fitBounds(bounds, { maxZoom: 18 });

  }, [focusBounds, map, currentMapPadding]);

  // 지도 줌 레벨 및 뷰포트 바운드 변경 감지 리스너
  const animatedSegmentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!map) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    setZoomLevel(map.getZoom());
    setMapBounds(map.getBounds() as naver.maps.LatLngBounds);

    // 드래그나 줌 조작이 완전히 멈춘 유휴(idle) 상태일 때만 바운드와 줌 레벨을 갱신하여 렌더링 부하 최소화
    const idleListener = navermaps.Event.addListener(map, 'idle', () => {
      setZoomLevel(map.getZoom());
      setMapBounds(map.getBounds() as naver.maps.LatLngBounds);
    });

    return () => {
      navermaps.Event.removeListener(idleListener);
    };
  }, [map]);

  const navermaps = typeof window !== 'undefined' && window.naver?.maps;
  
  const activeSegment = focusedSegment || alternativeSegment;

  return (
    <div className="relative w-full h-full">
      <NavermapsProvider ncpKeyId={clientId}>
        <MapDiv style={{ width: '100%', height: '100%' }}>
          <NaverMap
            defaultCenter={mapCenter}
            defaultZoom={15}
            ref={setMap}
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
            {places.map((place, idx) => {
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
                  const isVisible = !(activeSegment && !isSegmentFocused) && (!hasHoveredAlternative || isHoveredRoute);

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
                        key={`polyline-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}`}
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
                    <Fragment key={`polyline-group-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}`}>
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
            {navermaps && (
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
            {navermaps && (
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
              const isVisible = !activeSegment;

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
                      filter: drop-shadow(0 3px 6px ${theme.color}59);
                    ">
                      <svg width="${markerWidth}" height="${markerHeight}" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="pinGrad-${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="${theme.gradientStart}" />
                            <stop offset="100%" stop-color="${theme.gradientEnd}" />
                          </linearGradient>
                        </defs>
                        <!-- 날씬한 물방울 모양 -->
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                              fill="url(#pinGrad-${idx})" 
                        />
                        <!-- 텍스트 숫자 배치 (y값 미세조정으로 정중앙 배치) -->
                        <text x="12" y="16" fill="white" font-size="${isSegmentMarker ? 11.5 : 10.5}" font-weight="800" font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle">${idx + 1}</text>
                      </svg>
                    </div>`}
                />
              );
            })}
          </NaverMap>
        </MapDiv>
      </NavermapsProvider>

      {/* 전체 보기 플로팅 버튼 (우측 하단) */}
      {places.length > 0 && (
        <div className="absolute bottom-8 right-6 z-[100] flex flex-col gap-2">
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
              {/* 핀 */}
              <path
                d="M21 2C17.5 2 15 5 15 8.5C15 13.5 21 19 21 19C21 19 27 13.5 27 8.5C27 5 24.5 2 21 2Z"
                className="fill-[#8A8A93] group-hover:fill-blue-500 transition-colors duration-200"
              />
              <circle cx="21" cy="8" r="2.5" fill="white" />

              {/* 경로 선 */}
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
        </div>
      )}


      {/* 상세 경로 안내 패널: 사이드바 오른쪽에 따로 띄움 */}
      {activeRouteOfFocusedSegment && focusedPlaces && !alternativePlaces && (
        <RouteGuidePanel
          route={activeRouteOfFocusedSegment}
          originPlace={focusedPlaces.originPlace}
          destPlace={focusedPlaces.destPlace}
          onClose={() => {
            setFocusedSegment(null);
            setFocusedStep(null);
            setFocusBounds(null);
          }}
          onNextSegment={nextSegmentInfo ? (jumpToStart?: boolean) => {
            const { nextOriginPlace, nextDestPlace } = nextSegmentInfo;
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
          onPrevSegment={prevSegmentInfo ? (jumpToDest?: boolean) => {
            const { prevOriginPlace, prevDestPlace } = prevSegmentInfo;
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
          nextDestPlace={nextSegmentInfo?.nextDestPlace}
        />
      )}

      {/* 대안 경로 패널 */}
      {alternativePlaces && (
        <AlternativeRoutePanel
          originPlace={alternativePlaces.originPlace}
          destPlace={alternativePlaces.destPlace}
          onClose={(isCancel?: boolean) => {
            setAlternativeSegment(null);
            
            if (isAlternativeFromFocus) {
              setFocusedSegment({ 
                originId: alternativePlaces.originPlace.id, 
                destId: alternativePlaces.destPlace.id 
              });

              if (isCancel) {
                 const cacheKey = `${alternativePlaces.originPlace.id}-${alternativePlaces.destPlace.id}`;
                 const segmentData = directionsCache[cacheKey];
                 const transportType = activeJourney?.transport_type || 'public';
                 const defaultRoute = getDefaultRoute(alternativePlaces.originPlace, alternativePlaces.destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
                 
                 if (defaultRoute) {
                   const bounds = calculateSegmentBounds(alternativePlaces.originPlace, alternativePlaces.destPlace, defaultRoute);
                   setFocusBounds(bounds);
                 }
              }
            } else {
              if (isCancel) {
                setFocusBounds(null);
              } else {
                setFocusBounds(null);
              }
            }
          }}
        />
      )}
    </div>
  );
}
