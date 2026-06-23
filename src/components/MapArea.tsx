"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from 'react';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
  Polyline,
} from 'react-naver-maps';
import RouteGuidePanel from '@/components/RouteGuidePanel';
import AlternativeRoutePanel from '@/components/AlternativeRoutePanel';
import { useJourneyStore } from '@/stores/journey-store';
import { useJourneyDirections, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { NaverMapRouteRenderer, calculateSegmentBounds, calculateStepBounds, calculateHaversineDistance, expandBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';

const SEQUENCE_COLORS = [
  '#4F46E5', // 1번째 구간: Indigo Blue
  '#0D9488', // 2번째 구간: Teal Green
  '#D97706', // 3번째 구간: Amber Golden
  '#EC4899', // 4번째 구간: Coral Pink
  '#DC2626', // 5번째 이상: Rose Red
];



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

              const isAlternativeSegment = alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id;
              const activeRoute = (isAlternativeSegment && hoveredAlternativeRoute) ? hoveredAlternativeRoute : defaultRoute;

              if (!activeRoute || !activeRoute.steps) {
                return null;
              }

              const handlePolylineClick = () => {
                const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
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

              return activeRoute.steps.map((step, sIdx) => {
                const stepPath = step.pathPoints || [];
                if (stepPath.length < 2) return null;

                // window.naver.maps가 존재하면 LatLng 인스턴스 배열로 매핑하여 렌더링 안정성 확보
                const pathPoints = navermaps
                  ? stepPath.map(pt => new navermaps.LatLng(pt.lat, pt.lng))
                  : stepPath;

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
                  sIdx === activeRoute.steps.length - 1
                ) {
                  isThisStepFocused = true;
                }

                // 포커스 세그먼트 매칭 여부 판별
                const isSegmentFocused = activeSegment
                  ? (activeSegment.originId === place.id && activeSegment.destId === nextPlace.id)
                  : true;

                // 포커스된 세그먼트가 아닌 경우(다른 구간)만 렌더링하지 않음
                if (activeSegment && !isSegmentFocused) {
                  return null;
                }

                // 순서가 빠를수록(idx가 작을수록) zIndex가 높도록 겹침 노출 순서 적용 (맨 위에 노출)
                // 특정 스텝만 포커스 상태라면 최상위(15000)로 올림
                const baseZIndex = isThisStepFocused
                  ? 15000
                  : isSegmentFocused
                    ? (activeSegment ? 5000 + sIdx : (100 - idx) * 10)
                    : (100 - idx);

                // 교통수단 색상 대신 순서(idx) 기반 색상으로 매핑
                const segmentColor = SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length];
                const stepColor = step.color || segmentColor;

                const strokeColor = stepColor;

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

                const isWalk = step.type === 'walk';

                if (isWalk) {
                  // 도보 구간: 얇은 회색 점선으로 표시 (방향 화살표 제외하여 깔끔하게 처리)
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
                    <Polyline
                      key={`polyline-${place.id}-${nextPlace.id}-${sIdx}`}
                      path={pathPoints}
                      strokeColor="#A1A1AA"
                      strokeOpacity={walkOpacity}
                      strokeWeight={walkWeight}
                      strokeStyle="shortdash"
                      strokeLineCap="round"
                      strokeLineJoin="round"
                      zIndex={baseZIndex}
                      onClick={handlePolylineClick}
                    />
                  );
                }

                // 대중교통/차량 구간: 테두리선(백그라운드) + 본선(포그라운드) 이중 Polyline 렌더링으로 겹침 가독성 개선
                return (
                  <Fragment key={`polyline-group-${place.id}-${nextPlace.id}-${sIdx}`}>
                    {/* 1. 배경 외곽선 (흰색 테두리) */}
                    <Polyline
                      path={pathPoints}
                      strokeColor="#FFFFFF"
                      strokeOpacity={0.95}
                      strokeWeight={strokeWeight + 1.8}
                      strokeStyle="solid"
                      strokeLineCap="round"
                      strokeLineJoin="round"
                      zIndex={baseZIndex}
                      onClick={handlePolylineClick}
                    />
                    {/* 2. 본래 색상의 실제 경로선 */}
                    <Polyline
                      path={pathPoints}
                      strokeColor={strokeColor}
                      strokeOpacity={strokeOpacity}
                      strokeWeight={strokeWeight}
                      strokeStyle="solid"
                      strokeLineCap="round"
                      strokeLineJoin="round"
                      zIndex={baseZIndex + 1}
                      onClick={handlePolylineClick}
                    />
                  </Fragment>
                );
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

              return (
                <Marker
                  key={place.id}
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.place_name}
                  onClick={() => handleMarkerClick(place, idx)}
                  zIndex={zIndex}
                  visible={isVisible}
                  icon={{
                    content: `<div style="
                      cursor: pointer;
                      filter: drop-shadow(0 3px 6px rgba(59, 130, 246, 0.35));
                    ">
                      <svg width="${markerWidth}" height="${markerHeight}" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="pinGrad-${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#3b82f6" />
                            <stop offset="100%" stop-color="#6366f1" />
                          </linearGradient>
                        </defs>
                        <!-- 날씬한 물방울 모양 ( stroke 잘림 방지를 위해 1px 패딩 적용 ) -->
                        <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                              fill="url(#pinGrad-${idx})" 
                              stroke="white" 
                              stroke-width="1.2" 
                              stroke-linejoin="round"
                        />
                        <!-- 텍스트 숫자 배치 (y값 미세조정으로 정중앙 배치) -->
                        <text x="12" y="16" fill="white" font-size="${isSegmentMarker ? 11.5 : 10.5}" font-weight="800" font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle">${idx + 1}</text>
                      </svg>
                    </div>`,
                    anchor: new window.naver.maps.Point(anchorX, anchorY),
                  }}
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
      {activeRouteOfFocusedSegment && focusedPlaces && (
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

// 두 위경도 좌표 간 방위각(Bearing)을 0~360도 각도로 구하는 함수 (Great Circle)
function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(radLat2);
  const x = Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLng);

  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

// 위도를 Web Mercator Y 좌표로 변환
function getMercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

// Web Mercator Y 좌표를 위도로 변환
function getInverseMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
}

// 두 좌표 간 평면(Mercator) 방위각(Rhumb Bearing) 계산
function getRhumbBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const dY = getMercatorY(lat2) - getMercatorY(lat1);
  const brng = Math.atan2(dLng, dY);
  return ((brng * 180) / Math.PI + 360) % 360;
}

interface Point {
  lat: number;
  lng: number;
}



// 화살표 방향 및 줌 레벨에 맞는 V자형(Chevron) 경로 좌표를 생성하는 함수
// 줌 레벨로부터 1픽셀이 몇 도(degree)인지 역산하여 항상 일정한 픽셀 크기의 셰브론을 생성함
function getChevronPath(center: Point, bearing: number, zoomLevel: number): Point[] {
  // 위도에 따른 경도 보정 계수 계산
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  // Web Mercator 투영 기준 해당 줌 레벨에서 1px이 차지하는 미터 수
  const metersPerPixel = (156543.03392 * cosLat) / Math.pow(2, zoomLevel);
  // 각 날개를 ~4px 크기로 고정
  const legPixels = 4.0;
  const legMeters = legPixels * metersPerPixel;
  // 미터를 위도 도(degree) 단위로 환산 (1도 ≈ 111,111m)
  const lenDeg = legMeters / 111111.0;

  // bearing(0=북, 90=동 시계방향)을 수학 각도(반시계, 동쪽 기준)로 변환
  const theta = ((90 - bearing) * Math.PI) / 180;
  // 전진 방향으로부터 좌/우 135°에 날개 끝을 배치하여 90° 개각의 V자 형성
  const angle1 = theta + (135 * Math.PI) / 180;
  const angle2 = theta - (135 * Math.PI) / 180;

  const pt1 = {
    lat: center.lat + lenDeg * Math.sin(angle1),
    lng: center.lng + (lenDeg * Math.cos(angle1)) / cosLat,
  };
  const pt2 = {
    lat: center.lat + lenDeg * Math.sin(angle2),
    lng: center.lng + (lenDeg * Math.cos(angle2)) / cosLat,
  };

  return [pt1, center, pt2];
}

// 줌 레벨에 따른 화살표 두께 반환 (원래 SVG 마커의 약 1.5px 실효 두께에 맞춤)
function getChevronStrokeWeight(zoom: number): number {
  if (zoom >= 17) return 2.0;
  if (zoom >= 14) return 1.8;
  return 1.5;
}

interface DirectionalStripesProps {
  places: any[];
  directionsCache: any;
  activeJourney: any;
  focusedSegment: any;
  focusedStep: any;
  navermaps: any;
  zoomLevel: number;
  mapBounds: naver.maps.LatLngBounds | null;
  hoveredAlternativeRoute?: any;
  alternativeSegment?: any;
}

// 폴리라인 내부에 화살표 스트라이프 패턴을 렌더링하는 정적 마커 컴포넌트
function DirectionalStripes({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  focusedStep,
  navermaps,
  zoomLevel,
  mapBounds,
  hoveredAlternativeRoute,
  alternativeSegment,
}: DirectionalStripesProps) {
  const stripePoints = useMemo(() => {
    const points: Array<{
      key: string;
      position: { lat: number; lng: number };
      bearing: number;
      color: string;
      transportType: string;
      zIndex: number;
    }> = [];

    // 줌 레벨이 5 이하일 때는 화살표를 표시하지 않음 (오버헤드 방지 및 시인성 향상)
    if (!navermaps || places.length < 2 || zoomLevel <= 5) return points;

    places.forEach((place: any, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');

      const isAlternativeSegment = alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id;
      const activeRoute = (isAlternativeSegment && hoveredAlternativeRoute) ? hoveredAlternativeRoute : defaultRoute;

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      // 특정 세그먼트가 선택(focus)되었을 때, 다른 세그먼트의 스트라이프는 표시하지 않음
      if (focusedSegment && !focusedStep) {
        const isCurrentSegment =
          focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
        if (!isCurrentSegment) return;
      }

      activeRoute.steps.forEach((step: any, sIdx: number) => {
        const stepPath = step.pathPoints || [];
        if (stepPath.length < 2 || step.type === 'walk') return;

        // 특정 스텝(세부 노선) 포커스 로직 (스트라이프 숨김 제거)

        const isThisStepFocused = !!(
          focusedStep &&
          focusedStep.originId === place.id &&
          focusedStep.destId === nextPlace.id &&
          focusedStep.stepIndex === sIdx
        );

        // 포커스 세그먼트 매칭 여부 판별
        const isSegmentFocused = focusedSegment
          ? (focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id)
          : true;

        const baseZIndex = isThisStepFocused
          ? 15000
          : isSegmentFocused
            ? (focusedSegment ? 5000 + sIdx : (100 - idx) * 10)
            : (100 - idx);

        const arrowZIndex = baseZIndex + 2;

        const strokeColor = step.color || (activeRoute.type === 'public' ? '#3b82f6' : '#f59e0b');
        const stepLen = stepPath.length;

        // 지도 줌 레벨(zoomLevel)에 비례하여 적절한 화살표 배치 누적 간격(D, 미터)을 결정
        // 줌 레벨이 클수록(상세할수록) 간격을 좁혀 촘촘히 묘사하고, 작아질수록 넓혀 과밀화를 방지함
        let D = 1000; // 기본 간격
        if (zoomLevel >= 18) D = 60;
        else if (zoomLevel === 17) D = 100;
        else if (zoomLevel === 16) D = 200;
        else if (zoomLevel === 15) D = 350;
        else if (zoomLevel === 14) D = 600;
        else if (zoomLevel === 13) D = 1200;
        else if (zoomLevel === 12) D = 2400;
        else if (zoomLevel === 11) D = 4800;
        else if (zoomLevel === 10) D = 9600;
        else if (zoomLevel === 9) D = 19200;
        else if (zoomLevel === 8) D = 38400;
        else if (zoomLevel <= 7) D = 76800;

        // 대중교통 노선은 자차보다 살짝 더 촘촘하게(0.75배) 묘사하여 가독성 증대
        if (activeRoute.type === 'public') {
          D = Math.max(20, D * 0.75);
        }

        const pointsBefore = points.length;
        let accumulatedDistance = 0;

        // 경로의 모든 포인트를 따라 누적 거리를 계산하여 D미터 간격마다 화살표 배치 (선형 보간 적용하여 간격 정밀 핏)
        for (let i = 1; i < stepLen; i++) {
          const pPrev = stepPath[i - 1];
          const pCurr = stepPath[i];

          const segmentDist = calculateHaversineDistance(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);
          if (segmentDist === 0) continue;

          let remainingSegmentDist = segmentDist;
          let currentSegmentPosition = 0;

          while (accumulatedDistance + remainingSegmentDist >= D) {
            const distanceToNextArrow = D - accumulatedDistance;
            const nextArrowPositionOnSegment = currentSegmentPosition + distanceToNextArrow;
            const t = nextArrowPositionOnSegment / segmentDist;

            // pPrev와 pCurr 사이를 Mercator 투영 상 선형보간하여 정확한 직선 간격에 화살표 좌표 산출
            const lng = pPrev.lng + (pCurr.lng - pPrev.lng) * t;
            const yPrev = getMercatorY(pPrev.lat);
            const yCurr = getMercatorY(pCurr.lat);
            const y = yPrev + (yCurr - yPrev) * t;
            const lat = getInverseMercatorY(y);
            const bearing = getRhumbBearing(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);

            points.push({
              key: `stripe-${place.id}-${nextPlace.id}-${sIdx}-${i}-${points.length}`,
              position: { lat, lng },
              bearing,
              color: strokeColor,
              transportType,
              zIndex: arrowZIndex,
            });

            remainingSegmentDist -= distanceToNextArrow;
            currentSegmentPosition = nextArrowPositionOnSegment;
            accumulatedDistance = 0;
          }

          accumulatedDistance += remainingSegmentDist;
        }

        // 경로 전체 길이가 간격 D보다 짧아 화살표가 1개도 생기지 않았을 때
        // 정가운데 지점에 화살표 1개 배치를 보장하여 방향 식별을 도움
        if (points.length === pointsBefore && stepLen >= 2) {
          const midIdx = Math.floor(stepLen / 2);
          const p1 = stepPath[midIdx];
          let p2 = stepPath[midIdx + 1];
          let isReverseBearing = false;
          if (!p2 && stepPath[midIdx - 1]) {
            p2 = stepPath[midIdx - 1];
            isReverseBearing = true;
          }
          if (p1 && p2) {
            const bearing = isReverseBearing
              ? getRhumbBearing(p2.lat, p2.lng, p1.lat, p1.lng)
              : getRhumbBearing(p1.lat, p1.lng, p2.lat, p2.lng);
            points.push({
              key: `stripe-${place.id}-${nextPlace.id}-${sIdx}-mid`,
              position: { lat: p1.lat, lng: p1.lng },
              bearing,
              color: strokeColor,
              transportType,
              zIndex: arrowZIndex,
            });
          }
        }
      });
    });

    return points;
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps, zoomLevel]);

  // 현재 보이는 지도 영역(뷰포트) 바운드에 여유 패딩(15%)을 주어 필터링함으로써 
  // 화면 밖 불필요한 수백 개의 마커 렌더링 부하를 예방하고 줌/드래그 성능 최적화
  // 렌더링 오버헤드를 완벽히 차단하기 위해 렌더링할 화살표 개수를 최대 120개로 제한
  const visiblePoints = useMemo(() => {
    if (!mapBounds || !navermaps) {
      return stripePoints.slice(0, 120);
    }
    try {
      const sw = mapBounds.getSW();
      const ne = mapBounds.getNE();
      if (!sw || !ne || typeof sw.lat !== 'function' || typeof ne.lat !== 'function') {
        return stripePoints.slice(0, 120);
      }

      const latSpan = ne.lat() - sw.lat();
      const lngSpan = ne.lng() - sw.lng();
      const paddingLat = latSpan * 0.15;
      const paddingLng = lngSpan * 0.15;

      const minLat = sw.lat() - paddingLat;
      const maxLat = ne.lat() + paddingLat;
      const minLng = sw.lng() - paddingLng;
      const maxLng = ne.lng() + paddingLng;

      const filtered = stripePoints.filter(pt => {
        const { lat, lng } = pt.position;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      return filtered.slice(0, 120);
    } catch (e) {
      console.warn('[DirectionalStripes] Failed to filter points by bounds:', e);
      return stripePoints.slice(0, 120);
    }
  }, [stripePoints, mapBounds, navermaps]);

  return (
    <>
      {visiblePoints.map((pt) => {
        const pathPoints = navermaps
          ? getChevronPath(pt.position, pt.bearing, zoomLevel).map(coord => new navermaps.LatLng(coord.lat, coord.lng))
          : getChevronPath(pt.position, pt.bearing, zoomLevel);

        return (
          <Polyline
            key={pt.key}
            path={pathPoints}
            strokeColor="#FFFFFF"
            strokeOpacity={pt.transportType === 'public' ? 0.95 : 0.55}
            strokeWeight={getChevronStrokeWeight(zoomLevel)}
            strokeStyle="solid"
            strokeLineCap="round"
            strokeLineJoin="round"
            zIndex={pt.zIndex}
          />
        );
      })}
    </>
  );
}

interface TransferMarkersProps {
  places: any[];
  directionsCache: any;
  activeJourney: any;
  focusedSegment: any;
  navermaps: any;
  hoveredAlternativeRoute?: any;
  alternativeSegment?: any;
}

function TransferMarkers({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  navermaps,
  hoveredAlternativeRoute,
  alternativeSegment,
}: TransferMarkersProps) {
  const { focusedStep, setFocusedStep, setFocusBounds, setFocusedSegment } = useJourneyStore();

  const transferPoints = useMemo(() => {
    const points: Array<{
      key: string;
      originId: string;
      destId: string;
      position: { lat: number; lng: number };
      busName: string;
      type: string;
      color: string;
      stationName: string;
      isFirst?: boolean;
      isStart?: boolean;
      isDest?: boolean;
      isAlighting?: boolean;
      stepIndex: number;
    }> = [];

    if (!navermaps || places.length < 2) return points;

    places.forEach((place: any, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');

      const isAlternativeSegment = alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id;
      const activeRoute = (isAlternativeSegment && hoveredAlternativeRoute) ? hoveredAlternativeRoute : defaultRoute;

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      // 전체 여정 뷰(focusedSegment가 없을 때)에서는 마커를 노출하지 않음
      if (!focusedSegment) return;

      const isCurrentSegment =
        focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
      if (!isCurrentSegment) return;

      const transitSteps = activeRoute.steps.filter((s: any) => s.type === 'bus' || s.type === 'subway');
      
      const startColor = '#3B82F6'; // 출발지 기본색: 서비스 테마 블루
      const startType: 'bus' | 'subway' | 'walk' = 'walk';
      const mergedFirstTransit = false;

      const getShiftedStepPoint = (step: any, isStart: boolean) => {
        if (step.pathPoints && step.pathPoints.length >= 2) {
          const pt = isStart ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
          return { lat: pt.lat, lng: pt.lng };
        }
        if (isStart) {
          return {
            lat: step.startLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lat : undefined),
            lng: step.startLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lng : undefined)
          };
        } else {
          return {
            lat: step.endLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lat : undefined),
            lng: step.endLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lng : undefined)
          };
        }
      };

      // 1. 출발지 전용 마커 추가 (첫 스텝이 도보일 경우에만 진짜 출발지 표시)
      const isFirstStepWalk = activeRoute.steps.length > 0 && activeRoute.steps[0].type === 'walk';
      const shouldShowStart = isFirstStepWalk;
      if (shouldShowStart) {
        points.push({
          key: `start-${place.id}-${nextPlace.id}`,
          originId: place.id,
          destId: nextPlace.id,
          position: { lat: place.lat, lng: place.lng },
          busName: place.place_name,
          type: startType,
          color: startColor,
          stationName: '출발지',
          isStart: true,
          stepIndex: 0,
        });
      }

      // 모든 도보 스텝에 대해 도보 출발 마커 추가
      activeRoute.steps.forEach((step: any, sIdx: number) => {
        if (step && step.type === 'walk') {
          const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(step, true);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
              key: `walk-${place.id}-${nextPlace.id}-${sIdx}`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: firstLat, lng: firstLng },
              busName: '도보',
              type: 'walk',
              color: '#71717A',
              stationName: '도보 출발지',
              isFirst: true,
              stepIndex: sIdx,
            });
          }
        }
      });

      // 현재 포커스된 스텝이 이 구간의 마지막 스텝인 경우, 다음 구간의 첫 번째 이동 수단 마커 추가
      const isLastStepFocused = !!(
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        (focusedStep.stepIndex === activeRoute.steps.length - 1 || focusedStep.subType === 'dest')
      );

      if (isLastStepFocused && idx + 2 < places.length) {
        const nextSegmentOrigin = nextPlace;
        const nextSegmentDest = places[idx + 2];
        const nextCacheKey = `${nextSegmentOrigin.id}-${nextSegmentDest.id}`;
        const nextSegmentData = directionsCache[nextCacheKey];
        const nextActiveRoute = getDefaultRoute(nextSegmentOrigin, nextSegmentDest, nextSegmentData, transportType as 'public' | 'car' | 'walk');

        if (nextActiveRoute && nextActiveRoute.steps && nextActiveRoute.steps.length > 0) {
          const nextFirstStep = nextActiveRoute.steps[0];
          const { lat: nextFirstLat, lng: nextFirstLng } = getShiftedStepPoint(nextFirstStep, true);

          if (nextFirstLat !== undefined && nextFirstLng !== undefined) {
            points.push({
              key: `next-first-${nextSegmentOrigin.id}-${nextSegmentDest.id}-0`,
              originId: nextSegmentOrigin.id,
              destId: nextSegmentDest.id,
              position: { lat: nextFirstLat, lng: nextFirstLng },
              busName: nextFirstStep.name,
              type: nextFirstStep.type,
              color: nextFirstStep.color || (nextFirstStep.type === 'walk' ? '#71717A' : '#4F46E5'),
              stationName: nextFirstStep.startName || (nextFirstStep.type === 'walk' ? '도보 출발지' : '탑승 정류장'),
              isFirst: true,
              stepIndex: 0,
            });
          }
        }
      }

      if (transitSteps.length > 0) {
        const firstStep = transitSteps[0];
        const firstStepIndex = activeRoute.steps.indexOf(firstStep);
        const shouldShowFirstStep = true;
        // 첫 대중교통 탑승지가 출발지와 병합되었다면, 중복 렌더링 방지를 위해 첫 탑승 마커는 생략
        if (shouldShowFirstStep && !mergedFirstTransit) {
          const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(firstStep, true);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
              key: `transfer-${place.id}-${nextPlace.id}-0`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: firstLat, lng: firstLng },
              busName: firstStep.name,
              type: firstStep.type,
              color: firstStep.color || '#4F46E5',
              stationName: firstStep.startName || '탑승 정류장',
              isFirst: true,
              stepIndex: firstStepIndex,
            });
          }
        }
      } else if (activeRoute.steps.length > 0 && !focusedStep) {
        // 대중교통이 없고 단순 도보 등만 있는 경우, 구간 전체 표시 상태일 때 첫 도보 마커 표시
        // 이미 출발 마커(도보타입)가 추가되므로 중복 렌더링을 방지하기 위해 생략
      }

      for (let i = 1; i < transitSteps.length; i++) {
        const prevStep = transitSteps[i - 1];
        const currStep = transitSteps[i];
        const currStepIndex = activeRoute.steps.indexOf(currStep);
        const shouldShowCurrStep = true;

        if (shouldShowCurrStep) {
          const { lat: prevEndLat, lng: prevEndLng } = getShiftedStepPoint(prevStep, false);
          const { lat: currStartLat, lng: currStartLng } = getShiftedStepPoint(currStep, true);

          const hasCoordinates = prevEndLat !== undefined && prevEndLng !== undefined &&
            currStartLat !== undefined && currStartLng !== undefined;

          const isSameName = !!(prevStep.endName && currStep.startName &&
            prevStep.endName.trim() === currStep.startName.trim());

          const isClose = hasCoordinates &&
            calculateHaversineDistance(prevEndLat, prevEndLng, currStartLat, currStartLng) < 300;

          if (isSameName || isClose) {
            const lat = currStartLat;
            const lng = currStartLng;

            if (lat && lng) {
              points.push({
                key: `transfer-${place.id}-${nextPlace.id}-${i}`,
                originId: place.id,
                destId: nextPlace.id,
                position: { lat, lng },
                busName: currStep.name,
                type: currStep.type,
                color: currStep.color || '#4F46E5',
                stationName: currStep.startName || '환승 정류장',
                stepIndex: currStepIndex,
              });
            }
          }
        }
      }

      // 세그먼트의 도착지 마커 추가 (마지막 스텝이 도보일 경우에만 진짜 도착지 표시)
      const isAlightingOnLastStep = !!(
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        focusedStep.subType === 'end' &&
        focusedStep.stepIndex === activeRoute.steps.length - 1
      );

      const isLastStepWalk = activeRoute.steps.length > 0 && activeRoute.steps[activeRoute.steps.length - 1].type === 'walk';
      const shouldShowDest = isLastStepWalk;

      if (shouldShowDest) {
        points.push({
          key: `destination-${place.id}-${nextPlace.id}`,
          originId: place.id,
          destId: nextPlace.id,
          position: { lat: nextPlace.lat, lng: nextPlace.lng },
          busName: nextPlace.place_name,
          type: 'destination',
          color: '#EF4444', // 도착지는 Rose Red 계열
          stationName: '도착지',
          isDest: true,
          stepIndex: activeRoute.steps.length - 1,
        });
      }

      // 하차 마커 추가 (focusedStep.subType === 'end' 인 경우에만 노출)
      if (
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        focusedStep.subType === 'end'
      ) {
        const step = activeRoute.steps[focusedStep.stepIndex];
        if (step) {
          const { lat: endLat, lng: endLng } = getShiftedStepPoint(step, false);
          if (endLat !== undefined && endLng !== undefined) {
            points.push({
              key: `alighting-${place.id}-${nextPlace.id}-${focusedStep.stepIndex}`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: endLat, lng: endLng },
              busName: step.endName || step.name || '하차지',
              type: step.type,
              color: '#F43F5E', // 하차는 Rose Red
              stationName: step.endName || '하차 정류장',
              isAlighting: true,
              stepIndex: focusedStep.stepIndex,
            });
          }
        }
      }
    });

    if (focusedSegment) {
      const thisSegmentPoints = points.filter(p => p.originId === focusedSegment.originId && p.destId === focusedSegment.destId && !p.key.startsWith('next-first-'));
      if (thisSegmentPoints.length > 0) {
        thisSegmentPoints.sort((a: any, b: any) => {
          if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
          if (a.isStart !== b.isStart) return a.isStart ? -1 : 1;
          if (a.isDest !== b.isDest) return a.isDest ? 1 : -1;
          if (a.isAlighting !== b.isAlighting) return a.isAlighting ? 1 : -1;
          return 0;
        });
        (thisSegmentPoints[0] as any).isSegmentStart = true;
        (thisSegmentPoints[thisSegmentPoints.length - 1] as any).isSegmentDest = true;
      }
    }

    // 중복 마커 분리를 위한 오프셋(offsetX) 할당 로직
    const groups: { [key: string]: typeof points } = {};
    points.forEach((pt) => {
      const key = `${pt.position.lat.toFixed(5)},${pt.position.lng.toFixed(5)}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(pt);
    });

    Object.values(groups).forEach((group) => {
      if (group.length > 1) {
        group.sort((a, b) => {
          const scoreA = (a as any).isSegmentStart ? 1 : ((a as any).isSegmentDest ? 3 : 2);
          const scoreB = (b as any).isSegmentStart ? 1 : ((b as any).isSegmentDest ? 3 : 2);
          return scoreA - scoreB;
        });

        const N = group.length;
        const spacing = 80; // 좌우 마커 간의 중심 간격 (픽셀)
        group.forEach((pt, i) => {
          (pt as any).offsetX = (i - (N - 1) / 2) * spacing;
        });
      }
    });

    return points;
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps]);

  const handleTransferMarkerClick = (pt: any) => {
    const originPlace = places.find(p => p.id === pt.originId);
    const destPlace = places.find(p => p.id === pt.destId);
    if (!originPlace || !destPlace) return;

    const cacheKey = `${pt.originId}-${pt.destId}`;
    const segmentData = directionsCache[cacheKey];
    const transportType = activeJourney?.transport_type || 'public';
    const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

    if (!activeRoute) return;

    // 만약 클릭한 마커가 현재 포커스된 세그먼트와 다른 세그먼트에 속해 있다면 세그먼트 포커스도 함께 전환
    if (!focusedSegment || focusedSegment.originId !== pt.originId || focusedSegment.destId !== pt.destId) {
      setFocusedSegment({ originId: pt.originId, destId: pt.destId });
    }

    if (
      focusedStep &&
      focusedStep.originId === pt.originId &&
      focusedStep.destId === pt.destId &&
      focusedStep.stepIndex === pt.stepIndex
    ) {
      // Toggle off step focus, go back to segment focus
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
      setFocusBounds(bounds);
    } else {
      // Toggle on step focus
      const step = activeRoute.steps[pt.stepIndex];
      if (step) {
        // 탑승/시작 지점으로 줌인 (마커 좌표)
        const lat = pt.position.lat;
        const lng = pt.position.lng;
        setFocusBounds({
          sw: { lat, lng },
          ne: { lat, lng }
        });

        setFocusedStep({
          originId: pt.originId,
          destId: pt.destId,
          stepIndex: pt.stepIndex,
        });
      }
    }
  };

  return (
    <>
      {transferPoints.map((pt: any) => {
        const displayBusName = pt.isAlighting
          ? pt.busName
          : ((pt.isSegmentDest || pt.isSegmentStart) ? pt.busName : (pt.type === 'walk' ? '도보 이동' : pt.busName.replace(' 버스', '')));
        const labelText = pt.isSegmentStart 
          ? '출발' 
          : (pt.isSegmentDest 
              ? '도착' 
              : (pt.isAlighting ? '하차' : (pt.type === 'walk' ? '도보' : (pt.isFirst ? '탑승' : '환승'))));
        
        const siteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 10px; height: 10px; color: white;" class="start-icon-svg-${pt.key}"><path d="M12 4L4 18h16Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
        const iconEmoji = pt.isSegmentDest 
          ? '🚩' 
          : (pt.isSegmentStart && pt.type === 'walk' ? siteIconSvg : (pt.type === 'walk' ? '🚶' : (pt.type === 'subway' ? '🚇' : '🚌')));
        
        // 출발 마커가 항상 탑승 마커(최대 15000) 위에 나타나도록 zIndex를 23000으로 조정
        const zIndex = pt.isSegmentStart ? 23000 : ((pt.isSegmentDest || pt.isAlighting) ? 22000 : (pt.type === 'walk' ? 12000 : (pt.isFirst ? 14000 : 15000)));

        const isThisStepFocused = (() => {
          if (!focusedStep) return false;
          if (focusedStep.originId !== pt.originId || focusedStep.destId !== pt.destId) return false;

          // 도착 페이지 포커스 시
          if (focusedStep.subType === 'dest') {
            return !!(pt.isSegmentDest || pt.stepIndex === focusedStep.stepIndex - 1);
          }

          // 승차(탑승/환승) 페이지 포커스 시
          if (focusedStep.subType === 'start') {
            return pt.stepIndex === focusedStep.stepIndex && !pt.isAlighting && !pt.isSegmentDest;
          }

          // 하차 페이지 포커스 시
          if (focusedStep.subType === 'end') {
            return pt.stepIndex === focusedStep.stepIndex && !!pt.isAlighting;
          }

          // 도보 등 기타 페이지 포커스 시
          return pt.stepIndex === focusedStep.stepIndex;
        })();

        const offsetX = (pt as any).offsetX || 0;

        return (
          <Marker
            key={pt.key}
            position={pt.position}
            zIndex={isThisStepFocused ? 25000 : zIndex}
            onClick={() => handleTransferMarkerClick(pt)}
            icon={{
              content: `
                <style>
                  .start-icon-svg-${pt.key} {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: center;
                    transform: rotate(${isThisStepFocused ? '90deg' : '0deg'});
                  }
                  .transfer-marker-${pt.key}:hover .start-icon-svg-${pt.key} {
                    transform: rotate(${isThisStepFocused ? '0deg' : '90deg'});
                  }
                  .transfer-marker-${pt.key} {
                    display: flex;
                    align-items: center;
                    background: #ffffff;
                    border: 2px solid ${pt.color};
                    border-radius: 9999px;
                    padding: 3.5px 8px 3.5px 4px;
                    box-shadow: ${isThisStepFocused ? `0 0 0 4px ${pt.color}40, 0 6px 20px ${pt.color}50` : '0 4px 14px rgba(0, 0, 0, 0.16)'};
                    font-family: Pretendard, -apple-system, sans-serif;
                    white-space: nowrap;
                    position: relative;
                    cursor: pointer;
                    transform: translate(calc(-50% + ${offsetX}px), -100%) ${isThisStepFocused ? 'scale(1.1)' : ''};
                    margin-top: -8px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  }
                  .transfer-marker-${pt.key}:hover {
                    transform: translate(calc(-50% + ${offsetX}px), -105%) scale(${isThisStepFocused ? '1.15' : '1.05'});
                    box-shadow: ${isThisStepFocused ? `0 0 0 4px ${pt.color}40, 0 8px 24px ${pt.color}60` : '0 6px 20px rgba(0, 0, 0, 0.22)'};
                    z-index: 20000;
                  }
                </style>
                <div class="transfer-marker-${pt.key}">
                  <!-- 아이콘 원형 -->
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: ${pt.color};
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    font-size: 10px;
                    margin-right: 5px;
                    box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.25);
                  ">
                    ${iconEmoji}
                  </div>
                  <!-- 정보 텍스트 -->
                  <div style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                  ">
                    <span style="font-size: 8px; color: #71717a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1;">${labelText}</span>
                    <span style="font-size: 10.5px; font-weight: 800; color: #18181b; line-height: 1.1; margin-top: 1px;">${displayBusName}</span>
                  </div>
                  <!-- 아래쪽 꼭지점 화살표 -->
                  <div style="
                    position: absolute;
                    bottom: -6px;
                    left: calc(50% - ${offsetX}px);
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 5px solid transparent;
                    border-right: 5px solid transparent;
                    border-top: 6px solid ${pt.color};
                  "></div>
                </div>
              `,
              anchor: new navermaps.Point(0, 0),
            }}
          />
        );
      })}
    </>
  );
}
