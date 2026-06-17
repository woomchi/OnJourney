"use client";

import { useRef, useState, useEffect, useMemo } from 'react';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
  Polyline,
} from 'react-naver-maps';
import PlaceSearchBar from '@/components/PlaceSearchBar';
import { useJourneyStore } from '@/stores/journey-store';
import { NaverMapRouteRenderer } from '@/lib/naverMapRouteService';

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
  const [mapCenter, setMapCenter] = useState<naver.maps.CoordLiteral>({
    lat: 37.5665,
    lng: 126.9780,
  });

  const handlePlaceSelect = (place: SelectedPlace) => {
    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };
    setMapCenter(coord);
    map?.panTo(coord);
  };

  const handleMarkerClick = (lat: number, lng: number) => {
    const coord: naver.maps.CoordLiteral = { lat, lng };
    setMapCenter(coord);
    map?.panTo(coord);
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
    const transportType = activeJourney.transport_type || 'public';
    
    places.forEach((place, idx) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const cacheKey = `${place.id}-${nextPlace.id}-${transportType}`;
      if (!directionsCache[cacheKey] && !directionsLoading[cacheKey]) {
        fetchSegmentDirections(place, nextPlace, transportType);
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
  }, [focusBounds, map]);

  const navermaps = typeof window !== 'undefined' && window.naver?.maps;

  // 방향 화살표 마커 수집 (경로의 진행 방향각 bearing을 계산하여 얹음)
  interface DirectionArrowMarker {
    key: string;
    position: { lat: number; lng: number };
    bearing: number;
    color: string;
  }

  const arrowMarkers = useMemo(() => {
    const markers: DirectionArrowMarker[] = [];
    if (!navermaps) return markers;

    places.forEach((place, idx) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}-${transportType}`;
      const segmentData = directionsCache[cacheKey];

      if (!segmentData || !segmentData.primary || !segmentData.primary.steps) {
        return;
      }

      segmentData.primary.steps.forEach((step, sIdx) => {
        // 특정 세그먼트만 포커스 상태인 경우, 해당 세그먼트가 아니라면 화살표 마커 수집 제외
        if (focusedSegment) {
          const isCurrentSegment = (focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id);
          if (!isCurrentSegment) return;
        }

        const stepPath = step.pathPoints || [];
        if (stepPath.length < 2 || step.type === 'walk') return;

        const strokeColor = step.color || (transportType === 'public' ? '#3b82f6' : '#f59e0b');
        const totalLen = stepPath.length;
        let targetPoints: number[] = [];

        // 경로의 길이가 충분할 경우 고르게 25%, 50%, 75% 지점에 배치
        if (totalLen >= 18) {
          targetPoints = [
            Math.floor(totalLen * 0.25),
            Math.floor(totalLen * 0.50),
            Math.floor(totalLen * 0.75),
          ];
        } else if (totalLen >= 6) {
          targetPoints = [Math.floor(totalLen * 0.50)];
        }

        targetPoints.forEach((ptIdx, pIdx) => {
          const p1 = stepPath[ptIdx];
          const p2 = stepPath[ptIdx + 1] || stepPath[ptIdx - 1];
          if (!p1 || !p2) return;

          const bearing = getBearing(p1.lat, p1.lng, p2.lat, p2.lng);
          markers.push({
            key: `arrow-${place.id}-${nextPlace.id}-${sIdx}-${pIdx}`,
            position: { lat: p1.lat, lng: p1.lng },
            bearing,
            color: strokeColor,
          });
        });
      });
    });

    return markers;
  }, [places, directionsCache, activeJourney, navermaps, focusedSegment]);

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
              const cacheKey = `${place.id}-${nextPlace.id}-${transportType}`;
              const segmentData = directionsCache[cacheKey];

              if (!segmentData || !segmentData.primary || !segmentData.primary.steps) {
                return null;
              }

              const handlePolylineClick = () => {
                if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
                  setFocusedSegment(null);
                  setFocusBounds(null);
                } else {
                  const sw = {
                    lat: Math.min(place.lat, nextPlace.lat),
                    lng: Math.min(place.lng, nextPlace.lng),
                  };
                  const ne = {
                    lat: Math.max(place.lat, nextPlace.lat),
                    lng: Math.max(place.lng, nextPlace.lng),
                  };
                  setFocusBounds({ sw, ne });
                  setFocusedSegment({ originId: place.id, destId: nextPlace.id });
                }
              };

              return segmentData.primary.steps.map((step, sIdx) => {
                const stepPath = step.pathPoints || [];
                if (stepPath.length < 2) return null;

                // window.naver.maps가 존재하면 LatLng 인스턴스 배열로 매핑하여 렌더링 안정성 확보
                const pathPoints = navermaps
                  ? stepPath.map(pt => new navermaps.LatLng(pt.lat, pt.lng))
                  : stepPath;

                // 포커스 세그먼트 매칭 여부 판별
                const isSegmentFocused = focusedSegment
                  ? (focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id)
                  : true;

                const strokeColor = isSegmentFocused
                  ? (step.color || (transportType === 'public' ? '#3b82f6' : '#f59e0b'))
                  : '#D4D4D8'; // 포커스 해제된 선은 연한 회색으로 처리

                const strokeOpacity = isSegmentFocused ? 0.8 : 0.25;
                const strokeWeight = isSegmentFocused ? 6.5 : 4.5;
                const isWalk = step.type === 'walk';

                if (isWalk) {
                  // 도보 구간: 얇은 회색 점선으로 표시 (방향 화살표 제외하여 깔끔하게 처리)
                  return (
                    <Polyline
                      key={`polyline-${place.id}-${nextPlace.id}-${sIdx}`}
                      path={pathPoints}
                      strokeColor={isSegmentFocused ? '#A1A1AA' : '#E4E4E7'}
                      strokeOpacity={isSegmentFocused ? 0.65 : 0.2}
                      strokeWeight={isSegmentFocused ? 3.5 : 2.5}
                      strokeStyle="shortdash"
                      strokeLineCap="round"
                      strokeLineJoin="round"
                      onClick={handlePolylineClick}
                    />
                  );
                }

                // 대중교통/차량 구간: 하나의 온전한 단일 Polyline으로 매끄럽고 세련되게 렌더링
                return (
                  <Polyline
                    key={`polyline-${place.id}-${nextPlace.id}-${sIdx}`}
                    path={pathPoints}
                    strokeColor={strokeColor}
                    strokeOpacity={strokeOpacity}
                    strokeWeight={strokeWeight}
                    strokeStyle="solid"
                    strokeLineCap="round"
                    strokeLineJoin="round"
                    onClick={handlePolylineClick}
                  />
                );
              });
            })}

            {/* 방향 화살표 마커 렌더링 (경로선 위에 세련되게 얹음) */}
            {navermaps && arrowMarkers.map((marker) => (
              <Marker
                key={marker.key}
                position={marker.position}
                icon={{
                  content: `<div style="
                    display: flex; align-items: center; justify-content: center;
                    width: 18px; height: 18px;
                    background-color: white;
                    border: 2px solid ${marker.color};
                    border-radius: 50%;
                    transform: rotate(${marker.bearing}deg);
                    box-shadow: 0 1.5px 5px rgba(0,0,0,0.22);
                    pointer-events: none;
                  ">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="display: block; pointer-events: none;">
                      <path d="M5 1L9 5H6V9H4V5H1L5 1Z" fill="${marker.color}"/>
                    </svg>
                  </div>`,
                  anchor: new navermaps.Point(9, 9),
                }}
              />
            ))}

            {/* Marker는 반드시 NaverMap children 안에 있어야 함 */}
            {places.map((place, idx) => {
              const isSegmentMarker = !!(focusedSegment && (place.id === focusedSegment.originId || place.id === focusedSegment.destId));
              const zIndex = (places.length - idx) + (isSegmentMarker ? 1000 : 0);
              const isVisible = !focusedSegment || isSegmentMarker;

              return (
                <Marker
                  key={place.id}
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.place_name}
                  onClick={() => handleMarkerClick(place.lat, place.lng)}
                  zIndex={zIndex}
                  visible={isVisible}
                  icon={{
                    content: `<div style="
                      display:flex;align-items:center;justify-content:center;
                      width:32px;height:32px;
                      background:linear-gradient(135deg,#3b82f6,#6366f1);
                      border-radius:50% 50% 50% 0;
                      transform:rotate(-45deg);
                      box-shadow:0 4px 12px rgba(59,130,246,0.4);
                      border:2px solid white;
                      cursor:pointer;
                    "><span style="
                      transform:rotate(45deg);
                      color:white;font-weight:800;font-size:12px;font-family:sans-serif;
                    ">${idx + 1}</span></div>`,
                    anchor: new window.naver.maps.Point(16, 32),
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
