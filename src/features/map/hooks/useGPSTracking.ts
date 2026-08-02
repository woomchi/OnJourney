"use client";

import { useRef, useEffect, useCallback } from 'react';
import { useMapUIStore } from '@/stores/map-store';
import { useDialog } from '@/providers/DialogProvider';

interface UseGPSTrackingProps {
  map: naver.maps.Map | null;
}

export function useGPSTracking({ map }: UseGPSTrackingProps) {
  const { alert } = useDialog();
  const {
    setIsLocating,
    setUserLocation,
    gpsMode,
    setGpsMode,
    setDeviceHeading,
  } = useMapUIStore();

  const lastKnownLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const gpsModeRef = useRef(gpsMode);
  useEffect(() => {
    gpsModeRef.current = gpsMode;
  }, [gpsMode]);

  const headingEmaRef = useRef<{ x: number; y: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const handleDeviceOrientation = useCallback(
    (event: any) => {
      let heading = null;
      if (event.webkitCompassHeading !== undefined) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = 360 - event.alpha;
      }

      if (heading !== null) {
        const rad = (heading * Math.PI) / 180;
        const x = Math.sin(rad);
        const y = Math.cos(rad);

        if (!headingEmaRef.current) {
          headingEmaRef.current = { x, y };
        } else {
          headingEmaRef.current.x = headingEmaRef.current.x * 0.85 + x * 0.15;
          headingEmaRef.current.y = headingEmaRef.current.y * 0.85 + y * 0.15;
        }

        let smoothedHeading =
          Math.atan2(headingEmaRef.current.x, headingEmaRef.current.y) * (180 / Math.PI);
        smoothedHeading = (smoothedHeading + 360) % 360;

        setDeviceHeading(smoothedHeading);
      }
    },
    [setDeviceHeading]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation as any, true);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [handleDeviceOrientation]);

  const handleMyLocationClick = async () => {
    if (!navigator.geolocation) {
      await alert('이 브라우저에서는 위치 정보를 지원하지 않습니다.');
      return;
    }

    if (gpsMode === 'none') {
      setGpsMode('location');
      setIsLocating(true);

      if (lastKnownLocationRef.current && map) {
        map.panTo(new window.naver.maps.LatLng(lastKnownLocationRef.current.lat, lastKnownLocationRef.current.lng));
        map.setZoom(16, false);
      }

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          lastKnownLocationRef.current = { lat, lng };
          setUserLocation({ lat, lng });

          if (gpsModeRef.current !== 'none' && map) {
            map.panTo(new window.naver.maps.LatLng(lat, lng));
          }

          setIsLocating(false);
        },
        (error) => {
          console.error('내 위치 가져오기 실패:', error);
          setIsLocating(false);
          setGpsMode('none');
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    } else if (gpsMode === 'location') {
      const win = window as any;
      if (
        typeof win.DeviceOrientationEvent !== 'undefined' &&
        typeof win.DeviceOrientationEvent.requestPermission === 'function'
      ) {
        try {
          const permissionState = await win.DeviceOrientationEvent.requestPermission();
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleDeviceOrientation, true);
            setGpsMode('compass');
          } else {
            await alert('기기 방향 접근 권한이 거부되었습니다.');
          }
        } catch (error) {
          console.error('기기 방향 권한 요청 실패:', error);
          if ('ondeviceorientationabsolute' in win) {
            win.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
          } else {
            win.addEventListener('deviceorientation', handleDeviceOrientation, true);
          }
          setGpsMode('compass');
        }
      } else {
        if ('ondeviceorientationabsolute' in win) {
          win.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
        } else {
          win.addEventListener('deviceorientation', handleDeviceOrientation, true);
        }
        setGpsMode('compass');
      }
    } else if (gpsMode === 'compass') {
      setGpsMode('none');
      window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation as any, true);
      setDeviceHeading(null);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setUserLocation(null);
    }
  };

  return {
    handleMyLocationClick,
  };
}
