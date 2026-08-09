"use client";

import { useEffect, useRef } from 'react';
import { useMapUIStore } from '@/stores/map-store';
import { useJourneyStore } from '@/stores/journey-store';

interface UseGeocodeOnIdleProps {
  map: naver.maps.Map | null;
}

export function useGeocodeOnIdle({ map }: UseGeocodeOnIdleProps) {
  const { setZoomLevel, setMapBounds } = useMapUIStore();
  const setMapCenterAddress = useJourneyStore((state) => state.setMapCenterAddress);
  const setMapCenterCoord = useJourneyStore((state) => state.setMapCenterCoord);
  const setGlobalMapBounds = useJourneyStore((state) => state.setMapBounds);

  const lastGeocodedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!map) return;

    const navermaps = typeof window !== 'undefined' && window.naver?.maps;
    if (!navermaps) return;

    const idleListener = navermaps.Event.addListener(map, 'idle', () => {
      const newZoom = map.getZoom();
      const newBounds = map.getBounds() as naver.maps.LatLngBounds;

      // 단일 setState 호출로 배치 처리하여 연속 리렌더링 차단
      const currentUIState = useMapUIStore.getState();
      const updates: Partial<ReturnType<typeof useMapUIStore.getState>> = {};

      if (currentUIState.zoomLevel !== newZoom) {
        updates.zoomLevel = newZoom;
      }

      const prevBounds = currentUIState.mapBounds;
      if (!prevBounds || !newBounds) {
        updates.mapBounds = newBounds;
      } else if (typeof prevBounds.getSW === 'function' && typeof newBounds.getSW === 'function') {
        const prevSW = prevBounds.getSW();
        const prevNE = prevBounds.getNE();
        const newSW = newBounds.getSW();
        const newNE = newBounds.getNE();
        if (
          prevSW.lat() !== newSW.lat() ||
          prevSW.lng() !== newSW.lng() ||
          prevNE.lat() !== newNE.lat() ||
          prevNE.lng() !== newNE.lng()
        ) {
          updates.mapBounds = newBounds;
        }
      }

      if (Object.keys(updates).length > 0) {
        useMapUIStore.setState(updates);
      }

      if (newBounds && typeof newBounds.getSW === 'function') {
        const sw = newBounds.getSW();
        const ne = newBounds.getNE();
        setGlobalMapBounds({
          minLat: sw.lat(),
          maxLat: ne.lat(),
          minLng: sw.lng(),
          maxLng: ne.lng(),
        });
      }

      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = setTimeout(() => {
        const center = map.getCenter() as naver.maps.LatLng;
        const lat = typeof center.lat === 'function' ? center.lat() : (center as any).y;
        const lng = typeof center.lng === 'function' ? center.lng() : (center as any).x;

        const last = lastGeocodedCoordsRef.current;
        if (last) {
          const dLat = Math.abs(lat - last.lat);
          const dLng = Math.abs(lng - last.lng);
          if (dLat < 0.01 && dLng < 0.01) return;
        }

        if (navermaps.Service && navermaps.Service.reverseGeocode) {
          navermaps.Service.reverseGeocode(
            {
              coords: center,
              orders: [
                navermaps.Service.OrderType.ADDR,
                navermaps.Service.OrderType.ROAD_ADDR,
              ].join(','),
            },
            (status: any, response: any) => {
              if (status === navermaps.Service.Status.OK) {
                const results = response.v2.results;
                const region = results[0]?.region;
                const area1 = region?.area1?.name || '';
                const area2 = region?.area2?.name || '';
                const area3 = region?.area3?.name || '';

                const zoom = map.getZoom();
                let regionParts: string[] = [];

                if (zoom >= 14) {
                  regionParts = [area1, area2, area3];
                } else if (zoom >= 11) {
                  regionParts = [area1, area2];
                } else if (zoom >= 8) {
                  regionParts = [area1];
                } else {
                  regionParts = [];
                }

                const regionName = regionParts.filter(Boolean).join(' ');
                setMapCenterAddress(regionName);
                setMapCenterCoord({ lat, lng });
                lastGeocodedCoordsRef.current = { lat, lng };
              }
            }
          );
        }
      }, 600);
    });

    return () => {
      navermaps.Event.removeListener(idleListener);
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [map, setZoomLevel, setMapBounds, setGlobalMapBounds, setMapCenterAddress, setMapCenterCoord]);
}
