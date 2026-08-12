"use client";

import React, { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CustomOverlayView } from '@/components/map/CustomOverlayView';
import { getSequenceTheme } from '@/constants/colors';
import { getCategoryTheme } from '@/lib/categoryUtils';
import { useMapUIStore } from '@/stores/map-store';
import { useJourneyStore } from '@/stores/journey-store';
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
  delays: { pathDelays: Record<string, number>; markerDelays: Record<string, number> };
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
  etc: '📍',
};

export function isPositionInBounds(
  pos: { lat: number; lng: number },
  mapBounds: any,
  bufferRatio = 0.1
): boolean {
  if (!mapBounds || !pos) return true;

  try {
    let swLat: number, swLng: number, neLat: number, neLng: number;

    if (typeof mapBounds.getSW === 'function' && typeof mapBounds.getNE === 'function') {
      const sw = mapBounds.getSW();
      const ne = mapBounds.getNE();
      swLat = typeof sw.lat === 'function' ? sw.lat() : sw.lat;
      swLng = typeof sw.lng === 'function' ? sw.lng() : sw.lng;
      neLat = typeof ne.lat === 'function' ? ne.lat() : ne.lat;
      neLng = typeof ne.lng === 'function' ? ne.lng() : ne.lng;
    } else if (mapBounds.sw && mapBounds.ne) {
      swLat = mapBounds.sw.lat;
      swLng = mapBounds.sw.lng;
      neLat = mapBounds.ne.lat;
      neLng = mapBounds.ne.lng;
    } else if (mapBounds.minLat !== undefined) {
      swLat = mapBounds.minLat;
      neLat = mapBounds.maxLat;
      swLng = mapBounds.minLng;
      neLng = mapBounds.maxLng;
    } else {
      return true;
    }

    const dLat = Math.abs(neLat - swLat) * bufferRatio;
    const dLng = Math.abs(neLng - swLng) * bufferRatio;

    const minLat = Math.min(swLat, neLat) - dLat;
    const maxLat = Math.max(swLat, neLat) + dLat;
    const minLng = Math.min(swLng, neLng) - dLng;
    const maxLng = Math.max(swLng, neLng) + dLng;

    return pos.lat >= minLat && pos.lat <= maxLat && pos.lng >= minLng && pos.lng <= maxLng;
  } catch (e) {
    return true;
  }
}

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
  handleMarkerClick,
  handleRecommendedMarkerClick,
}: MapMarkersProps) {
  const mapBounds = useMapUIStore((state) => state.mapBounds);
  const deviceHeading = useMapUIStore((state) => state.deviceHeading);
  const isMapDragging = useMapUIStore((state) => state.isMapDragging);
  const focusedPlaceId = useJourneyStore((state) => state.focusedPlaceId);

  const unaddedRecommendedPlaces = useMemo(() => {
    if (!isSearchMode || !recommendedPlaces || recommendedPlaces.length === 0) return [];
    const placeIdSet = new Set(places.map((p) => p.id));
    const filtered = recommendedPlaces.filter((rec) => !placeIdSet.has(rec.id));

    if (!mapBounds) return filtered;

    return filtered.filter((rec) => {
      // Active search place is always visible
      if (activeSearchPlace?.id === rec.id) return true;
      return isPositionInBounds({ lat: rec.lat, lng: rec.lng }, mapBounds, 0.15);
    });
  }, [isSearchMode, recommendedPlaces, places, mapBounds, activeSearchPlace]);

  return (
    <>
      {/* ── 1. 여정 장소 핀 마커 ── */}
      {places.map((place, idx) => {
        const isPlaceFocused = focusedPlaceId === place.id;
        const isSegmentMarker = !!(
          activeSegment &&
          (place.id === activeSegment.originId || place.id === activeSegment.destId)
        );
        const zIndex = 10000 + (places.length - idx) + (isSegmentMarker ? 10000 : 0) + (isPlaceFocused ? 20000 : 0);
        // 이동 상세(activeSegment 활성) 상태에서는 번호 핀을 모두 숨김.
        // TransferMarkers에서 출발/도착 마커를 대신 표시하므로 겹침 방지.
        const isVisible = !activeSegment;

        if (!isVisible) return null;

        const markerWidth = isSegmentMarker || isPlaceFocused ? 32 : 28;
        const markerHeight = isSegmentMarker || isPlaceFocused ? 42 : 36;
        const theme = getSequenceTheme(idx, places.length);
        const delayMs = (delays.markerDelays[place.id] ?? idx * 800) / 1000;

        return (
          <CustomOverlayView
            key={place.id}
            position={{ lat: place.lat, lng: place.lng }}
            zIndex={zIndex}
            onClick={() => handleMarkerClick(place, idx)}
            anchorX={0.5}
            anchorY={1}
          >
            <motion.div
              initial={false}
              animate={{ scale: isPlaceFocused ? 1.15 : 1, opacity: 1, y: 0 }}
              transition={
                isMapDragging
                  ? { duration: 0 }
                  : {
                      type: 'spring',
                      stiffness: 400,
                      damping: 24,
                    }
              }
              whileHover={isMapDragging ? undefined : { scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              className="cursor-pointer select-none relative flex flex-col items-center"
              style={{
                filter: `drop-shadow(0 3px 8px ${theme.color}70) drop-shadow(0 2px 4px rgba(0,0,0,0.15))`,
              }}
            >
              <svg
                width={markerWidth}
                height={markerHeight}
                viewBox="0 0 24 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id={`pinGrad-${idx}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={theme.gradientStart} />
                    <stop offset="100%" stopColor={theme.gradientEnd} />
                  </linearGradient>
                  <radialGradient id={`glassShine-${idx}`} cx="35%" cy="35%" r="50%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <path
                  d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z"
                  fill={`url(#pinGrad-${idx})`}
                />
                <circle cx="12" cy="12" r="7.5" fill={`url(#glassShine-${idx})`} />
                <text
                  x="12"
                  y="16.2"
                  fill="white"
                  fontSize={isSegmentMarker || isPlaceFocused ? 10 : 9}
                  fontWeight="900"
                  fontFamily="Pretendard, -apple-system, sans-serif"
                  textAnchor="middle"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                >
                  {idx + 1}
                </text>
              </svg>

              {/* ── 하이라이트 시 마커 밑 장소 풀네임 및 상세 주소 UI (로고 그라데이션 적용) ── */}
              {isPlaceFocused && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="absolute top-[100%] left-1/2 -translate-x-1/2 mt-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white border border-white/20 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col items-center justify-center gap-0.5 pointer-events-none z-50 min-w-[120px] max-w-[240px] text-center"
                >
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/90 shrink-0 animate-pulse" />
                    <span className="text-xs font-black tracking-tight">{place.place_name}</span>
                  </div>
                  {place.address && (
                    <span className="text-[10.5px] font-medium text-white/85 truncate max-w-full leading-tight">
                      {place.address}
                    </span>
                  )}
                </motion.div>
              )}
            </motion.div>
          </CustomOverlayView>
        );
      })}

      {/* ── 2. 추천 장소 마커 ── */}
      {unaddedRecommendedPlaces.map((recPlace) => {
        const isActive = activeSearchPlace?.id === recPlace.id;
        const theme = getCategoryTheme(recPlace.category);
        const emoji = categoryEmojis[theme.type] || categoryEmojis.etc;
        const zIndex = isActive ? 9999 : 9000;

        const dropShadow = isActive
          ? `drop-shadow(0 0 8px ${theme.color}) drop-shadow(0 4px 10px rgba(0,0,0,0.3))`
          : undefined;

        return (
          <CustomOverlayView
            key={`rec-${recPlace.id}`}
            position={{ lat: recPlace.lat, lng: recPlace.lng }}
            zIndex={zIndex}
            onClick={() => handleRecommendedMarkerClick(recPlace)}
            anchorX={0.5}
            anchorY={1}
          >
            <motion.div
              initial={false}
              animate={{ scale: isActive ? 1.2 : 1, opacity: 1 }}
              whileHover={isMapDragging ? undefined : { scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className="cursor-pointer select-none"
              style={dropShadow ? { filter: dropShadow } : undefined}
            >
              <svg
                width="28"
                height="36"
                viewBox="0 0 24 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z"
                  fill={theme.color}
                />
                <text
                  x="12"
                  y="17"
                  fill="white"
                  fontSize="11"
                  fontFamily="Pretendard, sans-serif"
                  textAnchor="middle"
                >
                  {emoji}
                </text>
              </svg>
            </motion.div>
          </CustomOverlayView>
        );
      })}

      {/* ── 3. 지도 직접 클릭 마커 ── */}
      {mapClickedPlace && (
        <CustomOverlayView
          key={`clicked-${mapClickedPlace.lat}-${mapClickedPlace.lng}`}
          position={{ lat: mapClickedPlace.lat, lng: mapClickedPlace.lng }}
          zIndex={9500}
          anchorX={0.5}
          anchorY={1}
        >
          <motion.div
            animate={isMapDragging ? { y: 0 } : { y: [0, -10, 0] }}
            transition={isMapDragging ? { duration: 0 } : { repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="cursor-pointer select-none"
            style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.25))' }}
          >
            <svg
              width="28"
              height="36"
              viewBox="0 0 24 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 19 12 30 12 30C12 30 22 19 22 12C22 6.48 17.52 2 12 2Z"
                fill="#E11D48"
              />
              <circle cx="12" cy="12" r="4" fill="white" />
            </svg>
          </motion.div>
        </CustomOverlayView>
      )}

      {/* ── 4. 내 위치 (GPS & 나침반) 마커 ── */}
      {userLocation && (
        <CustomOverlayView
          key="user-location-gps"
          position={userLocation}
          zIndex={9600}
          anchorX={0.5}
          anchorY={0.5}
        >
          <div className="relative w-[100px] h-[100px] flex items-center justify-center pointer-events-none">
            {/* 나침반 모드 방위각 회전 콘 (Framer Motion 보간) */}
            {gpsMode === 'compass' && (
              <motion.div
                animate={{ rotate: deviceHeading || 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="absolute inset-0"
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    <radialGradient id="coneGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <path d="M 50 50 L 15 15 A 50 50 0 0 1 85 15 Z" fill="url(#coneGrad)" />
                </svg>
              </motion.div>
            )}
            <div className="absolute w-6 h-6 bg-blue-500 rounded-full animate-gps-pulse" />
            <div className="absolute w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-sm" />
          </div>
        </CustomOverlayView>
      )}
    </>
  );
});
