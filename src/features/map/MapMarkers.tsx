"use client";

import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { CustomOverlayView } from '@/components/map/CustomOverlayView';
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
  const deviceHeading = useMapUIStore((state) => state.deviceHeading);

  return (
    <>
      {/* ── 1. 여정 장소 핀 마커 ── */}
      {places.map((place, idx) => {
        const isSegmentMarker = !!(
          activeSegment &&
          (place.id === activeSegment.originId || place.id === activeSegment.destId)
        );
        const zIndex = 10000 + (places.length - idx) + (isSegmentMarker ? 10000 : 0);
        const isVisible = !activeSegment || isSegmentMarker;

        if (!isVisible) return null;

        const markerWidth = isSegmentMarker ? 30 : 24;
        const markerHeight = isSegmentMarker ? 40 : 32;
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
              initial={{ scale: 0, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 24,
                delay: delayMs,
              }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              className="cursor-pointer select-none"
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
                  y="16.5"
                  fill="white"
                  fontSize={isSegmentMarker ? 11.5 : 10.5}
                  fontWeight="900"
                  fontFamily="Pretendard, -apple-system, sans-serif"
                  textAnchor="middle"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                >
                  {idx + 1}
                </text>
              </svg>
            </motion.div>
          </CustomOverlayView>
        );
      })}

      {/* ── 2. 추천 장소 마커 ── */}
      {isSearchMode &&
        recommendedPlaces &&
        recommendedPlaces
          .filter((recPlace) => !places.some((p) => p.id === recPlace.id))
          .map((recPlace) => {
            const isActive = activeSearchPlace?.id === recPlace.id;
            const theme = getCategoryTheme(recPlace.category);
            const emoji = categoryEmojis[theme.type] || categoryEmojis.etc;
            const zIndex = isActive ? 9999 : 9000;

            const dropShadow = isActive
              ? `drop-shadow(0 0 10px ${theme.color}) drop-shadow(0 6px 14px rgba(0,0,0,0.35))`
              : 'drop-shadow(0 4px 10px rgba(0,0,0,0.18))';

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
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: isActive ? 1.25 : 1, opacity: 1 }}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="cursor-pointer select-none"
                  style={{ filter: dropShadow }}
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
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
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
