"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from 'react';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
  Polyline,
} from 'react-naver-maps';
import PlaceSearchBar from '@/components/PlaceSearchBar';
import RouteGuidePanel from '@/components/RouteGuidePanel';
import { useJourneyStore } from '@/stores/journey-store';
import { NaverMapRouteRenderer, calculateSegmentBounds, calculateStepBounds, calculateHaversineDistance, expandBounds } from '@/lib/naverMapRouteService';

const SEQUENCE_COLORS = [
  '#4F46E5', // 1번째 구간: Indigo Blue
  '#0D9488', // 2번째 구간: Teal Green
  '#D97706', // 3번째 구간: Amber Golden
  '#EC4899', // 4번째 구간: Coral Pink
  '#DC2626', // 5번째 이상: Rose Red
];

const MAP_PADDING = {
  top: 180, // 검색바 영역(높이 ~80px + 마커 핀 크기 ~40px + 안전 마진)에 경로/마커가 겹치지 않도록 조절
  right: 20,
  bottom: 20,
  left: 20,
};

interface SelectedPlace {
  lat: number;
  lng: number;
}

export default function MapArea() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const {
    activeJourney,
    directionsCache,
    directionsLoading,
    fetchSegmentDirections,
    focusBounds,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment,
    focusedStep,
    setFocusedStep
  } = useJourneyStore();
  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);

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
    return originPlace.selected_route && originPlace.selected_route.destId === destPlace.id
      ? originPlace.selected_route
      : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);
  }, [focusedSegment, activeJourney, directionsCache]);

  const focusedPlaces = useMemo(() => {
    if (!focusedSegment) return null;
    const places = activeJourney?.places ?? [];
    const originPlace = places.find(p => p.id === focusedSegment.originId);
    const destPlace = places.find(p => p.id === focusedSegment.destId);
    if (!originPlace || !destPlace) return null;
    return { originPlace, destPlace };
  }, [focusedSegment, activeJourney]);

  const handlePlaceSelect = (place: SelectedPlace) => {
    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };
    setMapCenter(coord);
    map?.panTo(coord);
  };

  const handleMarkerClick = (place: SelectedPlace & { id: string }, idx: number) => {
    // 1. 지도 중심 이동
    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };
    setMapCenter(coord);
    map?.panTo(coord);

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

    // 이미 해당 세그먼트가 선택(하이라이트)되어 있는 경우 클릭 시 해제처리
    if (focusedSegment && focusedSegment.originId === originPlace.id && focusedSegment.destId === destPlace.id) {
      setFocusedSegment(null);
      setFocusBounds(null);
      setFocusedStep(null);
    } else {
      // 신규 하이라이트 적용
      const cacheKey = `${originPlace.id}-${destPlace.id}`;
      const segmentData = directionsCache[cacheKey];
      const transportType = activeJourney?.transport_type || 'public';
      const activeRoute = originPlace.selected_route && originPlace.selected_route.destId === destPlace.id
        ? originPlace.selected_route
        : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
      setFocusBounds(bounds);
      setFocusedSegment({ originId: originPlace.id, destId: destPlace.id });
      setFocusedStep(null);
    }
  };

  const handleResetBounds = () => {
    setFocusBounds(null);
    setFocusedSegment(null);
    setFocusedStep(null);
    if (!map || places.length === 0) return;

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
      map.fitBounds(bounds, MAP_PADDING);
      if (map.getZoom() > 16) {
        map.setZoom(16);
      }
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public');
    }
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

  // activeJourney.places가 변경될 때 캐시에 누락된 세그먼트 경로 정보가 있다면 백그라운드에서 fetch 요청을 넣어 복구함
  useEffect(() => {
    if (!activeJourney || !places || places.length < 2) return;

    places.forEach((place, idx) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const cacheKey = `${place.id}-${nextPlace.id}`;
      if (!directionsCache[cacheKey] && !directionsLoading[cacheKey]) {
        fetchSegmentDirections(place, nextPlace);
      }
    });
  }, [activeJourney, places, directionsCache, directionsLoading, fetchSegmentDirections]);

  // places 또는 map 인스턴스 또는 로드된 세그먼트 수가 변경되었을 때 전체 경유지를 한 화면에 담도록 fitBounds 설정
  useEffect(() => {
    if (!map || places.length === 0) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // 만약 사용자가 이미 개별 세그먼트에 포커스(focusBounds가 활성 상태) 중이라면 자동 전체 fitBounds 무시
    if (focusBounds) return;

    if (places.length === 1) {
      const first = places[0];
      const latOffset = 0.0015;
      const lngOffset = 0.0015;
      const bounds = new navermaps.LatLngBounds(
        new navermaps.LatLng(first.lat - latOffset, first.lng - lngOffset),
        new navermaps.LatLng(first.lat + latOffset, first.lng + lngOffset)
      );
      map.fitBounds(bounds, MAP_PADDING);
      if (map.getZoom() > 16) {
        map.setZoom(16);
      }
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places, directionsCache, activeJourney?.transport_type || 'public');
    }
  }, [places, map, focusBounds, loadedSegmentsCount, activeJourney?.transport_type]);

  // focusBounds 상태 변화 감지 시 지도의 뷰포트를 해당 범위로 핏팅
  useEffect(() => {
    if (!map || !focusBounds) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    const expanded = expandBounds(focusBounds, -0.20); // 20% 축소하여 줌을 확실하게 당김
    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(expanded.sw.lat, expanded.sw.lng),
      new navermaps.LatLng(expanded.ne.lat, expanded.ne.lng)
    );

    // 검색 바 영역 아래쪽 공간을 타겟으로 MAP_PADDING 적용하여 초점 설정
    map.fitBounds(bounds, MAP_PADDING);

    // 도보 마커와 탑승 마커가 인접할 때 겹침 현상을 방지하도록 줌 레벨 제한을 18로 상향 조정
    if (map.getZoom() > 19) {
      map.setZoom(19);
    }
  }, [focusBounds, map]);

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

              const activeRoute = place.selected_route && place.selected_route.destId === nextPlace.id
                ? place.selected_route
                : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

              if (!activeRoute || !activeRoute.steps) {
                return null;
              }

              const handlePolylineClick = () => {
                if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                  setFocusedSegment(null);
                  setFocusBounds(null);
                } else {
                  const bounds = calculateSegmentBounds(place, nextPlace, activeRoute);
                  setFocusBounds(bounds);
                  setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                }
              };

              // 여정 순번(idx)에 맞게 횡방향 오프셋 값 결정
              // idx=0 -> 0(중앙), idx=1 -> 1(우측), idx=2 -> -1(좌측), idx=3 -> 2(우측 더), idx=4 -> -2(좌측 더)...
              const offsetMultiplier = idx === 0
                ? 0
                : (idx % 2 === 1 ? Math.ceil(idx / 2) : -Math.floor(idx / 2));

              return activeRoute.steps.map((step, sIdx) => {
                const stepPath = step.pathPoints || [];
                if (stepPath.length < 2) return null;

                // 횡방향 오프셋 적용
                const shiftedPath = getOffsetPath(stepPath, offsetMultiplier);

                // window.naver.maps가 존재하면 LatLng 인스턴스 배열로 매핑하여 렌더링 안정성 확보
                const pathPoints = navermaps
                  ? shiftedPath.map(pt => new navermaps.LatLng(pt.lat, pt.lng))
                  : shiftedPath;

                // 특정 스텝(세부 노선) 포커스 여부 판별
                const hasFocusedStep = !!focusedStep;
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

                // 시각적으로 보이지 않는(unfocused) 경로는 투명도를 낮추는 대신 아예 렌더링하지 않음(인터랙션 방지)
                if (hasFocusedStep) {
                  if (!isThisStepFocused) return null;
                } else if (focusedSegment) {
                  if (!isSegmentFocused) return null;
                }

                // 순서가 빠를수록(idx가 작을수록) zIndex가 높도록 겹침 노출 순서 적용 (맨 위에 노출)
                // 특정 스텝만 포커스 상태라면 최상위(15000)로 올림
                const baseZIndex = isThisStepFocused
                  ? 15000
                  : isSegmentFocused
                    ? (focusedSegment ? 5000 + sIdx : (100 - idx) * 10)
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
                } else if (focusedSegment) {
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
                  } else if (focusedSegment) {
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
                focusedSegment={focusedSegment}
                focusedStep={focusedStep}
                navermaps={navermaps}
                zoomLevel={zoomLevel}
                mapBounds={mapBounds}
              />
            )}

            {/* 환승 안내 마커 렌더링 */}
            {navermaps && (
              <TransferMarkers
                places={places}
                directionsCache={directionsCache}
                activeJourney={activeJourney}
                focusedSegment={focusedSegment}
                navermaps={navermaps}
              />
            )}

            {/* Marker는 반드시 NaverMap children 안에 있어야 함 */}
            {places.map((place, idx) => {
              const isSegmentMarker = !!(focusedSegment && (place.id === focusedSegment.originId || place.id === focusedSegment.destId));
              // 일반 경로선(최대 5002)보다 항상 위에 노출되도록 기본 zIndex를 10000 이상으로 상향 조정
              const zIndex = 10000 + (places.length - idx) + (isSegmentMarker ? 10000 : 0);
              let isVisible = !focusedSegment || isSegmentMarker;

              // 세부 노선 선택 시, 출발지 마커는 첫 번째 스텝에서만 보이고 그 외에는 가림. 도착지 마커는 마지막 스텝에서만 보이고 그 외에는 가림.
              if (focusedSegment && focusedStep && isSegmentMarker) {
                const isOrigin = place.id === focusedSegment.originId;
                const isDest = place.id === focusedSegment.destId;
                if (isOrigin) {
                  isVisible = focusedStep.stepIndex === 0;
                } else if (isDest) {
                  const stepsCount = activeRouteOfFocusedSegment?.steps?.length || 0;
                  isVisible = stepsCount > 0 && focusedStep.stepIndex === stepsCount - 1;
                }
              }

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
              flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-zinc-150 shadow-[0_8px_30px_rgb(0,0,0,0.08)]
              text-zinc-600 hover:text-blue-600 hover:scale-[1.04] hover:border-blue-100 active:scale-[0.96] transition-all duration-200
              cursor-pointer select-none
            "
            title="전체 경로 보기"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              className="w-6 h-6"
            >
              {/* Route Path (connecting line) */}
              <path
                d="M5 18L12 11L19 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="2.5 2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Pin 1 (Start) */}
              <path
                d="M5 18c-1.8-3-1.8-5 0-5s1.8 2 0 5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
              />
              <circle cx="5" cy="14.5" r="0.75" fill="white" />

              {/* Pin 2 (Middle) */}
              <path
                d="M12 11c-1.8-3-1.8-5 0-5s1.8 2 0 5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
              />
              <circle cx="12" cy="7.5" r="0.75" fill="white" />

              {/* Pin 3 (End) */}
              <path
                d="M19 15c-1.8-3-1.8-5 0-5s1.8 2 0 5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="0.5"
              />
              <circle cx="19" cy="11.5" r="0.75" fill="white" />
            </svg>
          </button>
        </div>
      )}

      {/* 검색바: 지도 위에 absolute로 올림 (MapDiv 밖) */}
      <div className="absolute top-4 left-4 w-full max-w-lg z-[100]">
        <PlaceSearchBar onPlaceSelect={handlePlaceSelect} />
      </div>

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
        />
      )}
    </div>
  );
}

// 두 위경도 좌표 간 방위각(Bearing)을 0~360도 각도로 구하는 함수
function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(radLat2);
  const x = Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLng);

  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

interface Point {
  lat: number;
  lng: number;
}

// 경로 좌표 배열을 횡방향(수직 방향)으로 offsetMultiplier만큼 오프셋(평행이동) 시키는 함수
function getOffsetPath(path: Point[], offsetMultiplier: number): Point[] {
  if (offsetMultiplier === 0 || path.length < 2) return path;

  // 대략 한국 위도(37도) 기준, 경도 1도와 위도 1도의 거리 스케일 보정인자 (1 / 0.82)
  const ASPECT_RATIO = 0.8;
  // 오프셋 1도당 이동거리 (약 0.000032도 = 약 3.5m)
  const offsetDegree = 0.00003;
  const totalOffset = offsetMultiplier * offsetDegree;

  const offsetPath: Point[] = [];

  for (let i = 0; i < path.length; i++) {
    let p1: Point;
    let p2: Point;

    if (i === 0) {
      p1 = path[i];
      p2 = path[i + 1];
    } else if (i === path.length - 1) {
      p1 = path[i - 1];
      p2 = path[i];
    } else {
      p1 = path[i - 1];
      p2 = path[i + 1];
    }

    const dy = p2.lat - p1.lat;
    const dx = (p2.lng - p1.lng) * ASPECT_RATIO;
    const len = Math.sqrt(dy * dy + dx * dx);

    if (len === 0) {
      offsetPath.push({ ...path[i] });
      continue;
    }

    // 선의 방향 단위 벡터
    const uy = dy / len;
    const ux = dx / len;

    // 수직 법선 벡터 (오른쪽 횡방향)
    const ny = -ux;
    const nx = uy;

    // 지리학 좌표로 역변환 및 오프셋 적용
    const offsetLat = ny * totalOffset;
    const offsetLng = (nx * totalOffset) / ASPECT_RATIO;

    offsetPath.push({
      lat: path[i].lat + offsetLat,
      lng: path[i].lng + offsetLng,
    });
  }

  return offsetPath;
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

    // 줌 레벨이 11 이하일 때는 화살표를 표시하지 않음 (오버헤드 방지 및 시인성 향상)
    if (!navermaps || places.length < 2 || zoomLevel <= 10) return points;

    places.forEach((place: any, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const activeRoute = place.selected_route && place.selected_route.destId === nextPlace.id
        ? place.selected_route
        : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      // 특정 세그먼트가 선택(focus)되었을 때, 다른 세그먼트의 스트라이프는 표시하지 않음
      if (focusedSegment && !focusedStep) {
        const isCurrentSegment =
          focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
        if (!isCurrentSegment) return;
      }

      // 동일한 오프셋 수치를 적용하여 화살표 마커의 수평 평행이동 동기화
      const offsetMultiplier = idx === 0
        ? 0
        : (idx % 2 === 1 ? Math.ceil(idx / 2) : -Math.floor(idx / 2));

      activeRoute.steps.forEach((step: any, sIdx: number) => {
        const stepPath = step.pathPoints || [];
        if (stepPath.length < 2 || step.type === 'walk') return;

        // 특정 스텝(세부 노선)이 선택되었을 때, 다른 스텝의 스트라이프는 표시하지 않음
        if (focusedStep) {
          const isCurrentStep =
            focusedStep.originId === place.id &&
            focusedStep.destId === nextPlace.id &&
            focusedStep.stepIndex === sIdx;
          if (!isCurrentStep) return;
        }

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

        // 동일한 횡방향 오프셋 계산 적용
        const shiftedPath = getOffsetPath(stepPath, offsetMultiplier);

        const strokeColor = step.color || (activeRoute.type === 'public' ? '#3b82f6' : '#f59e0b');
        const stepLen = shiftedPath.length;

        // 지도 줌 레벨(zoomLevel)에 비례하여 적절한 화살표 배치 누적 간격(D, 미터)을 결정
        // 줌 레벨이 클수록(상세할수록) 간격을 좁혀 촘촘히 묘사하고, 작아질수록 넓혀 과밀화를 방지함
        // 줌 11 이하에서는 화살표를 그리지 않으므로 처리 제외
        let D = 1000; // 기본 간격
        if (zoomLevel >= 18) D = 60;
        else if (zoomLevel === 17) D = 100;
        else if (zoomLevel === 16) D = 200;
        else if (zoomLevel === 15) D = 350;
        else if (zoomLevel === 14) D = 600;
        else if (zoomLevel === 13) D = 1200;
        else if (zoomLevel === 12) D = 2400;

        // 대중교통 노선은 자차보다 살짝 더 촘촘하게(0.75배) 묘사하여 가독성 증대
        if (activeRoute.type === 'public') {
          D = Math.max(20, D * 0.75);
        }

        const pointsBefore = points.length;
        let accumulatedDistance = 0;

        // 경로의 모든 포인트를 따라 누적 거리를 계산하여 D미터 간격마다 화살표 배치 (선형 보간 적용하여 간격 정밀 핏)
        for (let i = 1; i < stepLen; i++) {
          const pPrev = shiftedPath[i - 1];
          const pCurr = shiftedPath[i];

          const segmentDist = calculateHaversineDistance(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);
          if (segmentDist === 0) continue;

          let remainingSegmentDist = segmentDist;
          let currentSegmentPosition = 0;

          while (accumulatedDistance + remainingSegmentDist >= D) {
            const distanceToNextArrow = D - accumulatedDistance;
            const nextArrowPositionOnSegment = currentSegmentPosition + distanceToNextArrow;
            const t = nextArrowPositionOnSegment / segmentDist;

            // pPrev와 pCurr 사이를 선형보간하여 정확한 간격에 화살표 좌표 산출
            const lat = pPrev.lat + (pCurr.lat - pPrev.lat) * t;
            const lng = pPrev.lng + (pCurr.lng - pPrev.lng) * t;
            const bearing = getBearing(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);

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
          const p1 = shiftedPath[midIdx];
          let p2 = shiftedPath[midIdx + 1];
          let isReverseBearing = false;
          if (!p2 && shiftedPath[midIdx - 1]) {
            p2 = shiftedPath[midIdx - 1];
            isReverseBearing = true;
          }
          if (p1 && p2) {
            const bearing = isReverseBearing
              ? getBearing(p2.lat, p2.lng, p1.lat, p1.lng)
              : getBearing(p1.lat, p1.lng, p2.lat, p2.lng);
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
}

function TransferMarkers({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  navermaps,
}: TransferMarkersProps) {
  const { focusedStep, setFocusedStep, setFocusBounds, setFocusedSegment } = useJourneyStore();

  const transferPoints = useMemo(() => {
    const points: Array<{
      key: string;
      originId: string;
      destId: string;
      position: { lat: number; lng: number };
      busName: string;
      type: 'bus' | 'subway' | 'walk';
      color: string;
      stationName: string;
      isFirst?: boolean;
      stepIndex: number;
    }> = [];

    if (!navermaps || places.length < 2) return points;

    places.forEach((place: any, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const activeRoute = place.selected_route && place.selected_route.destId === nextPlace.id
        ? place.selected_route
        : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      // 전체 여정 뷰(focusedSegment가 없을 때)에서는 마커를 노출하지 않음
      if (!focusedSegment) return;

      const isCurrentSegment =
        focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
      if (!isCurrentSegment) return;

      // 만약 현재 스텝이 도보 스텝이고 focusedStep인 경우, 도보 출발 마커 추가
      if (focusedStep && focusedStep.originId === place.id && focusedStep.destId === nextPlace.id) {
        const step = activeRoute.steps[focusedStep.stepIndex];
        if (step && step.type === 'walk') {
          const firstLat = step.startLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lat : undefined);
          const firstLng = step.startLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lng : undefined);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
              key: `walk-${place.id}-${nextPlace.id}-${focusedStep.stepIndex}`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: firstLat, lng: firstLng },
              busName: '도보',
              type: 'walk',
              color: '#71717A',
              stationName: '도보 출발지',
              isFirst: true,
              stepIndex: focusedStep.stepIndex,
            });
          }
        }

        // 현재 포커스된 스텝의 다음 스텝이 도보인 경우, 그 도보 스텝의 시작지점에 도보 마커 추가
        const nextStepIndex = focusedStep.stepIndex + 1;
        if (nextStepIndex < activeRoute.steps.length) {
          const nextStep = activeRoute.steps[nextStepIndex];
          if (nextStep && nextStep.type === 'walk') {
            const nextLat = nextStep.startLat ?? (nextStep.pathPoints && nextStep.pathPoints.length > 0 ? nextStep.pathPoints[0].lat : undefined);
            const nextLng = nextStep.startLng ?? (nextStep.pathPoints && nextStep.pathPoints.length > 0 ? nextStep.pathPoints[0].lng : undefined);

            if (nextLat !== undefined && nextLng !== undefined) {
              points.push({
                key: `walk-next-${place.id}-${nextPlace.id}-${nextStepIndex}`,
                originId: place.id,
                destId: nextPlace.id,
                position: { lat: nextLat, lng: nextLng },
                busName: '도보',
                type: 'walk',
                color: '#71717A',
                stationName: '도보 출발지',
                isFirst: false,
                stepIndex: nextStepIndex,
              });
            }
          }
        }
      }

      // 현재 포커스된 스텝이 이 구간의 마지막 스텝인 경우, 다음 구간의 첫 번째 이동 수단 마커 추가
      const isLastStepFocused = !!(
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        focusedStep.stepIndex === activeRoute.steps.length - 1
      );

      if (isLastStepFocused && idx + 2 < places.length) {
        const nextSegmentOrigin = nextPlace;
        const nextSegmentDest = places[idx + 2];
        const nextCacheKey = `${nextSegmentOrigin.id}-${nextSegmentDest.id}`;
        const nextSegmentData = directionsCache[nextCacheKey];
        const nextActiveRoute = nextSegmentOrigin.selected_route && nextSegmentOrigin.selected_route.destId === nextSegmentDest.id
          ? nextSegmentOrigin.selected_route
          : (nextSegmentData ? (transportType === 'car' ? (nextSegmentData.car?.[0]) : transportType === 'walk' ? (nextSegmentData.walk?.[0]) : nextSegmentData.public?.[0]) : undefined);

        if (nextActiveRoute && nextActiveRoute.steps && nextActiveRoute.steps.length > 0) {
          const nextFirstStep = nextActiveRoute.steps[0];
          const nextFirstLat = nextFirstStep.startLat ?? (nextFirstStep.pathPoints && nextFirstStep.pathPoints.length > 0 ? nextFirstStep.pathPoints[0].lat : undefined);
          const nextFirstLng = nextFirstStep.startLng ?? (nextFirstStep.pathPoints && nextFirstStep.pathPoints.length > 0 ? nextFirstStep.pathPoints[0].lng : undefined);

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

      const transitSteps = activeRoute.steps.filter((s: any) => s.type === 'bus' || s.type === 'subway');

      if (transitSteps.length > 0) {
        const firstStep = transitSteps[0];
        const firstStepIndex = activeRoute.steps.indexOf(firstStep);
        const shouldShowFirstStep = !focusedStep ||
          focusedStep.stepIndex === firstStepIndex ||
          (focusedStep.originId === place.id &&
            focusedStep.destId === nextPlace.id &&
            focusedStep.stepIndex + 1 === firstStepIndex);

        if (shouldShowFirstStep) {
          const firstLat = firstStep.startLat ?? (firstStep.pathPoints && firstStep.pathPoints.length > 0 ? firstStep.pathPoints[0].lat : undefined);
          const firstLng = firstStep.startLng ?? (firstStep.pathPoints && firstStep.pathPoints.length > 0 ? firstStep.pathPoints[0].lng : undefined);

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
        const firstStep = activeRoute.steps[0];
        if (firstStep.type === 'walk') {
          const firstLat = firstStep.startLat ?? (firstStep.pathPoints && firstStep.pathPoints.length > 0 ? firstStep.pathPoints[0].lat : undefined);
          const firstLng = firstStep.startLng ?? (firstStep.pathPoints && firstStep.pathPoints.length > 0 ? firstStep.pathPoints[0].lng : undefined);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
              key: `walk-only-${place.id}-${nextPlace.id}-0`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: firstLat, lng: firstLng },
              busName: '도보',
              type: 'walk',
              color: '#71717A',
              stationName: '도보 출발지',
              isFirst: true,
              stepIndex: 0,
            });
          }
        }
      }

      for (let i = 1; i < transitSteps.length; i++) {
        const prevStep = transitSteps[i - 1];
        const currStep = transitSteps[i];
        const currStepIndex = activeRoute.steps.indexOf(currStep);
        const shouldShowCurrStep = !focusedStep ||
          focusedStep.stepIndex === currStepIndex ||
          (focusedStep.originId === place.id &&
            focusedStep.destId === nextPlace.id &&
            focusedStep.stepIndex + 1 === currStepIndex);

        if (shouldShowCurrStep) {
          const prevEndLat = prevStep.endLat ?? (prevStep.pathPoints && prevStep.pathPoints.length > 0 ? prevStep.pathPoints[prevStep.pathPoints.length - 1].lat : undefined);
          const prevEndLng = prevStep.endLng ?? (prevStep.pathPoints && prevStep.pathPoints.length > 0 ? prevStep.pathPoints[prevStep.pathPoints.length - 1].lng : undefined);
          const currStartLat = currStep.startLat ?? (currStep.pathPoints && currStep.pathPoints.length > 0 ? currStep.pathPoints[0].lat : undefined);
          const currStartLng = currStep.startLng ?? (currStep.pathPoints && currStep.pathPoints.length > 0 ? currStep.pathPoints[0].lng : undefined);

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
    const activeRoute = originPlace.selected_route && originPlace.selected_route.destId === pt.destId
      ? originPlace.selected_route
      : (segmentData ? (transportType === 'car' ? (segmentData.car?.[0]) : transportType === 'walk' ? (segmentData.walk?.[0]) : segmentData.public?.[0]) : undefined);

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
        const bounds = calculateStepBounds(step);
        if (bounds) {
          setFocusBounds(bounds);
        }
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
      {transferPoints.map((pt) => {
        const displayBusName = pt.type === 'walk' ? '도보 이동' : pt.busName.replace(' 버스', '');
        const labelText = pt.type === 'walk' ? '도보' : (pt.isFirst ? '탑승' : '환승');
        const iconEmoji = pt.type === 'walk' ? '🚶' : (pt.type === 'subway' ? '🚇' : '🚌');
        const zIndex = pt.type === 'walk' ? 12000 : (pt.isFirst ? 9000 : 15000);

        const isThisStepFocused = !!(
          focusedStep &&
          focusedStep.originId === pt.originId &&
          focusedStep.destId === pt.destId &&
          focusedStep.stepIndex === pt.stepIndex
        );

        return (
          <Marker
            key={pt.key}
            position={pt.position}
            zIndex={isThisStepFocused ? 25000 : zIndex}
            onClick={() => handleTransferMarkerClick(pt)}
            icon={{
              content: `
                <style>
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
                    transform: translate(-50%, -100%) ${isThisStepFocused ? 'scale(1.1)' : ''};
                    margin-top: -8px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  }
                  .transfer-marker-${pt.key}:hover {
                    transform: translate(-50%, -105%) scale(${isThisStepFocused ? '1.15' : '1.05'});
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
                    <span style="font-size: 7.5px; color: #71717a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1;">${labelText}</span>
                    <span style="font-size: 11px; font-weight: 800; color: #18181b; line-height: 1.1; margin-top: 1px;">${displayBusName}</span>
                  </div>
                  <!-- 아래쪽 꼭지점 화살표 -->
                  <div style="
                    position: absolute;
                    bottom: -6px;
                    left: 50%;
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
