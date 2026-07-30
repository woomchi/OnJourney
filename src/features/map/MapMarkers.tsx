import React, { memo, useEffect } from 'react';
import AnimatedMarker from '@/components/AnimatedMarker';
import { getSequenceTheme } from '@/constants/colors';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { useMapUIStore } from '@/stores/map-store';
import type { Place, PlaceResult } from '@/types/journey';

export interface MapMarkersProps {
  places: Place[];
  recommendedPlaces: PlaceResult[] | null;
  activeSearchPlace: PlaceResult | null;
  mapClickedPlace: any;
  userLocation: { lat: number; lng: number } | null;
  gpsMode: 'none' | 'location' | 'compass';
  isSearchMode: boolean;
  activeSegment: any;
  delays: { pathDelays: Record<string, number>, markerDelays: Record<string, number> };
  navermaps: any;
  handleMarkerClick: (place: Place, idx: number) => void;
  handleRecommendedMarkerClick: (place: PlaceResult) => void;
}

const categoryEmojis: Record<string, string> = {
  cafe: '☕',
  restaurant: '🍽️',
  hotel: '🏨',
  activity: '🎡',
  transit: '🚉',
  etc: '📍'
};

export const MapMarkers = memo(function MapMarkers({
  places,
  recommendedPlaces,
  activeSearchPlace,
  mapClickedPlace,
  userLocation,
  gpsMode,
  isSearchMode,
  activeSegment,
  delays,
  navermaps,
  handleMarkerClick,
  handleRecommendedMarkerClick,
}: MapMarkersProps) {
  const deviceHeading = useMapUIStore((state) => state.deviceHeading);

  // 회전값 변경 시 DOM을 직접 업데이트하여 마커 애니메이션 리셋 방지
  useEffect(() => {
    const el = document.getElementById('user-compass-cone');
    if (el) {
      el.style.transform = `rotate(${deviceHeading || 0}deg)`;
    }
  }, [deviceHeading]);
  return (
    <>
      {places.map((place, idx) => {
        const isSegmentMarker = !!(activeSegment && (place.id === activeSegment.originId || place.id === activeSegment.destId));
        const zIndex = 10000 + (places.length - idx) + (isSegmentMarker ? 10000 : 0);
        const isVisible = !activeSegment || isSegmentMarker;

        if (!isVisible) return null;

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
            iconAnchor={navermaps ? new navermaps.Point(anchorX, anchorY) : undefined}
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
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z" 
                        fill="url(#pinGrad-${idx})" 
                  />
                  <circle cx="12" cy="12" r="7.5" fill="url(#glassShine-${idx})" />
                  <text x="12" y="16.5" fill="white" font-size="${isSegmentMarker ? 11.5 : 10.5}" font-weight="900" font-family="Pretendard, -apple-system, sans-serif" text-anchor="middle" style="text-shadow: 0 1px 2px rgba(0,0,0,0.35);">${idx + 1}</text>
                </svg>
              </div>`}
          />
        );
      })}

      {isSearchMode && recommendedPlaces && recommendedPlaces
        .filter((recPlace) => !places.some((p) => p.id === recPlace.id))
        .map((recPlace) => {
          const isActive = activeSearchPlace?.id === recPlace.id;
          const theme = getCategoryTheme(recPlace.category);
          const emoji = categoryEmojis[theme.type] || categoryEmojis.etc;
          const zIndex = isActive ? 9999 : 9000;

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
              iconAnchor={navermaps ? new navermaps.Point(14, 34) : undefined}
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

      {mapClickedPlace && (
        <AnimatedMarker
          key={`clicked-${mapClickedPlace.lat}-${mapClickedPlace.lng}`}
          delay={0}
          position={{ lat: mapClickedPlace.lat, lng: mapClickedPlace.lng }}
          title={mapClickedPlace.place_name}
          zIndex={9500}
          iconAnchor={navermaps ? new navermaps.Point(14, 34) : undefined}
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
      
      {userLocation && (
        <AnimatedMarker
          key="user-location-gps"
          delay={0}
          position={userLocation}
          title="내 위치"
          zIndex={9600}
          iconAnchor={navermaps ? new navermaps.Point(50, 50) : undefined}
          iconContent={`<div class="relative w-[100px] h-[100px] flex items-center justify-center">
            <div id="user-compass-cone" class="absolute inset-0" style="display: ${gpsMode === 'compass' ? 'block' : 'none'};">
              <svg viewBox="0 0 100 100" class="w-full h-full">
                <defs>
                  <radialGradient id="coneGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
                  </radialGradient>
                </defs>
                <path d="M 50 50 L 15 15 A 50 50 0 0 1 85 15 Z" fill="url(#coneGrad)" />
              </svg>
            </div>
            <div class="absolute w-6 h-6 bg-blue-500 rounded-full animate-gps-pulse"></div>
            <div class="absolute w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-sm"></div>
          </div>`}
        />
      )}
    </>
  );
});
