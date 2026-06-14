"use client";

import { useRef, useState } from 'react';
import {
  NavermapsProvider,
  NaverMap,
  Container as MapDiv,
  Marker,
} from 'react-naver-maps';
import PlaceSearchBar from '@/components/PlaceSearchBar';
import { useJourneyStore } from '@/stores/journey-store';

interface SelectedPlace {
  lat: number;
  lng: number;
}

export default function MapArea() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const { activeJourney } = useJourneyStore();
  const mapRef = useRef<naver.maps.Map | null>(null);
  const [mapCenter, setMapCenter] = useState<naver.maps.CoordLiteral>({
    lat: 37.5665,
    lng: 126.9780,
  });

  const handlePlaceSelect = (place: SelectedPlace) => {
    const coord: naver.maps.CoordLiteral = { lat: place.lat, lng: place.lng };
    setMapCenter(coord);
    mapRef.current?.panTo(coord);
  };

  const handleMarkerClick = (lat: number, lng: number) => {
    const coord: naver.maps.CoordLiteral = { lat, lng };
    setMapCenter(coord);
    mapRef.current?.panTo(coord);
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

  return (
    <div className="relative w-full h-full">
      <NavermapsProvider ncpKeyId={clientId}>
        <MapDiv style={{ width: '100%', height: '100%' }}>
          <NaverMap
            defaultCenter={mapCenter}
            defaultZoom={14}
            ref={mapRef}
          >
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

      {/* 검색바: 지도 위에 absolute로 올림 (MapDiv 밖) */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-full max-w-lg z-[100] px-4">
        <PlaceSearchBar onPlaceSelect={handlePlaceSelect} />
      </div>
    </div>
  );
}
