"use client";

import { useRef, useState, useEffect } from 'react';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
  Polyline,
} from 'react-naver-maps';
import PlaceSearchBar from '@/components/PlaceSearchBar';
import { useJourneyStore } from '@/stores/journey-store';

interface SelectedPlace {
  lat: number;
  lng: number;
}

export default function MapArea() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const { activeJourney, directionsCache, focusBounds, setFocusBounds } = useJourneyStore();
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
    if (!map || places.length === 0) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    if (places.length === 1) {
      const first = places[0];
      map.setCenter(new navermaps.LatLng(first.lat, first.lng));
      map.setZoom(15);
    } else {
      const bounds = new navermaps.LatLngBounds(
        new navermaps.LatLng(places[0].lat, places[0].lng),
        new navermaps.LatLng(places[0].lat, places[0].lng)
      );

      places.forEach((place) => {
        bounds.extend(new navermaps.LatLng(place.lat, place.lng));
      });

      map.fitBounds(bounds, {
        top: 80,
        right: 80,
        bottom: 80,
        left: 80,
      });
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
      const bounds = new navermaps.LatLngBounds(
        new navermaps.LatLng(places[0].lat, places[0].lng),
        new navermaps.LatLng(places[0].lat, places[0].lng)
      );

      places.forEach((place) => {
        bounds.extend(new navermaps.LatLng(place.lat, place.lng));
      });

      map.fitBounds(bounds, {
        top: 80,
        right: 80,
        bottom: 80,
        left: 80,
      });
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

              if (!segmentData || !segmentData.primary || !segmentData.primary.pathPoints) {
                return null;
              }

              const strokeColor = transportType === 'public' ? '#3b82f6' : '#f59e0b';
              
              // window.naver.maps가 존재하면 LatLng 인스턴스 배열로 매핑하여 렌더링 안정성 확보
              const pathPoints = (typeof window !== 'undefined' && window.naver?.maps)
                ? segmentData.primary.pathPoints.map(pt => new window.naver.maps.LatLng(pt.lat, pt.lng))
                : segmentData.primary.pathPoints;

              return (
                <Polyline
                  key={`polyline-${place.id}-${nextPlace.id}`}
                  path={pathPoints}
                  strokeColor={strokeColor}
                  strokeOpacity={0.8}
                  strokeWeight={5}
                />
              );
            })}

            {/* Marker는 반드시 NaverMap children 안에 있어야 함 */}
            {places.map((place, idx) => (
              <Marker
                key={place.id}
                position={{ lat: place.lat, lng: place.lng }}
                title={place.place_name}
                onClick={() => handleMarkerClick(place.lat, place.lng)}
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
            ))}
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
              flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)]
              text-zinc-600 hover:text-blue-600 hover:scale-[1.04] hover:border-blue-100 active:scale-[0.96] transition-all duration-200
              cursor-pointer
            "
            title="전체 경로 보기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
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
