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
import { useJourneyStore } from '@/stores/journey-store';
import { NaverMapRouteRenderer, calculateSegmentBounds, calculateHaversineDistance } from '@/lib/naverMapRouteService';

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
    directionsCache,
    directionsLoading,
    fetchSegmentDirections,
    focusBounds,
    setFocusBounds,
    focusedSegment,
    setFocusedSegment
  } = useJourneyStore();
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [mapBounds, setMapBounds] = useState<naver.maps.LatLngBounds | null>(null);
  const [mapCenter, setMapCenter] = useState<naver.maps.CoordLiteral>({
    lat: 37.5665,
    lng: 126.9780,
  });

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
    } else {
      // 신규 하이라이트 적용
      const cacheKey = `${originPlace.id}-${destPlace.id}`;
      const segmentData = directionsCache[cacheKey];
      const transportType = activeJourney?.transport_type || 'public';
      const activeRoute = originPlace.selected_route && originPlace.selected_route.destId === destPlace.id
        ? originPlace.selected_route
        : (segmentData ? (transportType === 'car' ? (segmentData.car?.[1] || segmentData.car?.[0]) : segmentData.public?.[0]) : undefined);

      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
      setFocusBounds(bounds);
      setFocusedSegment({ originId: originPlace.id, destId: destPlace.id });
    }
  };

  const handleResetBounds = () => {
    setFocusBounds(null);
    setFocusedSegment(null);
    if (!map || places.length === 0) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    if (places.length === 1) {
      const first = places[0];
      map.setCenter(new navermaps.LatLng(first.lat, first.lng));
      map.setZoom(15);
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places);
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

  const places = activeJourney?.places ?? [];

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

  // places 또는 map 인스턴스가 로드/변경되었을 때 전체 경유지를 한 화면에 담도록 fitBounds 설정
  useEffect(() => {
    if (!map || places.length === 0) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    // 만약 사용자가 이미 개별 세그먼트에 포커스(focusBounds가 활성 상태) 중이라면 자동 전체 fitBounds 무시
    if (focusBounds) return;

    if (places.length === 1) {
      const first = places[0];
      map.setCenter(new navermaps.LatLng(first.lat, first.lng));
      map.setZoom(15);
    } else {
      const renderer = new NaverMapRouteRenderer(map);
      renderer.fitMapBounds(places);
    }
  }, [places, map, focusBounds]);

  // focusBounds 상태 변화 감지 시 지도의 뷰포트를 해당 범위로 핏팅
  useEffect(() => {
    if (!map || !focusBounds) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(focusBounds.sw.lat, focusBounds.sw.lng),
      new navermaps.LatLng(focusBounds.ne.lat, focusBounds.ne.lng)
    );

    map.fitBounds(bounds, {
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
    });

    if (map.getZoom() > 15) {
      map.setZoom(15);
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
            defaultZoom={14}
            ref={setMap}
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
                : (segmentData ? (transportType === 'car' ? (segmentData.car?.[1] || segmentData.car?.[0]) : segmentData.public?.[0]) : undefined);

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

                // 포커스 세그먼트 매칭 여부 판별
                const isSegmentFocused = focusedSegment
                  ? (focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id)
                  : true;

                // 순서가 빠를수록(idx가 작을수록) zIndex가 높도록 겹침 노출 순서 적용 (맨 위에 노출)
                // 특정 세그먼트만 포커스 상태라면 해당 세그먼트를 500 zIndex로 최상단으로 올림
                const baseZIndex = isSegmentFocused
                  ? (focusedSegment ? 500 : (100 - idx))
                  : 10;

                // 교통수단 색상 대신 순서(idx) 기반 색상으로 매핑
                const segmentColor = SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length];
                const strokeColor = isSegmentFocused
                  ? segmentColor
                  : '#D4D4D8'; // 포커스 해제된 선은 연한 회색으로 처리

                const isThisSegmentSelected = !!(focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id);

                const strokeOpacity = isThisSegmentSelected
                  ? 0.95
                  : (isSegmentFocused ? 0.8 : 0.15); // 선택되지 않은 다른 구간은 투명도를 더 낮춤

                const strokeWeight = isThisSegmentSelected
                  ? 6.5
                  : (isSegmentFocused ? 4.5 : 3.0);

                const isWalk = step.type === 'walk';

                if (isWalk) {
                  // 도보 구간: 얇은 회색 점선으로 표시 (방향 화살표 제외하여 깔끔하게 처리)
                  return (
                    <Polyline
                      key={`polyline-${place.id}-${nextPlace.id}-${sIdx}`}
                      path={pathPoints}
                      strokeColor={isSegmentFocused ? '#A1A1AA' : '#E4E4E7'}
                      strokeOpacity={isThisSegmentSelected ? 0.95 : (isSegmentFocused ? 0.65 : 0.15)}
                      strokeWeight={isThisSegmentSelected ? 4.5 : (isSegmentFocused ? 2.5 : 1.5)}
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
                      strokeOpacity={isSegmentFocused ? 0.95 : 0.3}
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
                navermaps={navermaps}
                zoomLevel={zoomLevel}
                mapBounds={mapBounds}
              />
            )}

            {/* Marker는 반드시 NaverMap children 안에 있어야 함 */}
            {places.map((place, idx) => {
              const isSegmentMarker = !!(focusedSegment && (place.id === focusedSegment.originId || place.id === focusedSegment.destId));
              const zIndex = (places.length - idx) + (isSegmentMarker ? 1000 : 0);
              const isVisible = !focusedSegment || isSegmentMarker;

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

      {/* 전체 보기 플로팅 버튼 (우측 상단) */}
      {places.length > 0 && (
        <div className="absolute top-8 right-6 z-[100] flex flex-col gap-2">
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
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-full max-w-lg z-[100] px-4">
        <PlaceSearchBar onPlaceSelect={handlePlaceSelect} />
      </div>
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

interface DirectionalStripesProps {
  places: any[];
  directionsCache: any;
  activeJourney: any;
  focusedSegment: any;
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
        : (segmentData ? (transportType === 'car' ? (segmentData.car?.[1] || segmentData.car?.[0]) : segmentData.public?.[0]) : undefined);

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      // 특정 세그먼트가 선택(focus)되었을 때, 다른 세그먼트의 스트라이프는 표시하지 않음
      if (focusedSegment) {
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
            });
          }
        }
      });
    });

    return points;
  }, [places, directionsCache, activeJourney, focusedSegment, navermaps, zoomLevel]);

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
      {visiblePoints.map((pt) => (
        <Marker
          key={pt.key}
          position={pt.position}
          icon={{
            // 둥근 핀 배경과 그림자를 전부 걷어내고, 오직 선명한 셰브론 기호만 폴리라인 위에 노출시킴
            // 서브픽셀 정렬 오차로 인한 미세한 어긋남을 방지하기 위해 단일 SVG 컨테이너로 구조를 간소화
            // 폴리라인 본선(두께 6.5px) 내부에 쏙 핏되도록 14x14 캔버스 중앙에 7x7 셰브론을 정확히 배치
            // 대중교통(public)은 선명한 흰색(0.95), 자차(driving 등)는 반투명한 부드러운 흰색(0.55)으로 셰브론을 적용
            content: `<svg width="14" height="14" viewBox="0 0 48 48" fill="none" style="display: block; transform: rotate(${pt.bearing}deg); transform-origin: center; pointer-events: none;">
              <path d="M16 28L24 20L32 28" stroke="${pt.transportType === 'public' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.55)'}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            anchor: new navermaps.Point(7, 7),
          }}
        />
      ))}
    </>
  );
}
