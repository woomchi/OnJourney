/**
 * @fileoverview 지리적 GPS 위경도 좌표 계산 유틸리티
 */

import type { MapBoundsRect, MapCoord } from '@/types/journey';

/**
  * 지구 반지름 (미터 단위)
  */
const EARTH_RADIUS_METERS = 6371000;

/**
 * 도(degree)를 라디안(radian)으로 변환합니다.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * 두 GPS 위경도 좌표 (lat1, lng1)과 (lat2, lng2) 사이의 실시간 지표면 거리를 하버사인(Haversine) 공식을 적용하여 미터(m) 단위로 구합니다.
 *
 * @param lat1 지점 1 위도
 * @param lng1 지점 1 경도
 * @param lat2 지점 2 위도
 * @param lng2 지점 2 경도
 * @returns 두 지점 간의 미터(m) 단위 직선 거리
 */
export function calculateHaversineDistanceMeter(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * 네이버 맵 LatLngBounds 인스턴스 또는 일반 bounds 객체로부터 표준 MapBoundsRect를 추출합니다.
 */
export function extractBoundsRect(
  bounds: naver.maps.LatLngBounds | MapBoundsRect | null | undefined
): MapBoundsRect | null {
  if (!bounds) return null;

  try {
    // 1. naver.maps.LatLngBounds 인스턴스 (getSW(), getNE() 메서드 존재)
    if (typeof (bounds as any).getSW === 'function' && typeof (bounds as any).getNE === 'function') {
      const sw = (bounds as any).getSW();
      const ne = (bounds as any).getNE();
      const swLat = typeof sw.lat === 'function' ? sw.lat() : sw.lat;
      const swLng = typeof sw.lng === 'function' ? sw.lng() : sw.lng;
      const neLat = typeof ne.lat === 'function' ? ne.lat() : ne.lat;
      const neLng = typeof ne.lng === 'function' ? ne.lng() : ne.lng;

      return {
        sw: { lat: swLat, lng: swLng },
        ne: { lat: neLat, lng: neLng },
        minLat: Math.min(swLat, neLat),
        maxLat: Math.max(swLat, neLat),
        minLng: Math.min(swLng, neLng),
        maxLng: Math.max(swLng, neLng),
      };
    }

    // 2. MapBoundsRect 또는 sw/ne 객체 구조
    if ('sw' in bounds && 'ne' in bounds && bounds.sw && bounds.ne) {
      const swLat = bounds.sw.lat;
      const swLng = bounds.sw.lng;
      const neLat = bounds.ne.lat;
      const neLng = bounds.ne.lng;

      return {
        sw: { lat: swLat, lng: swLng },
        ne: { lat: neLat, lng: neLng },
        minLat: bounds.minLat ?? Math.min(swLat, neLat),
        maxLat: bounds.maxLat ?? Math.max(swLat, neLat),
        minLng: bounds.minLng ?? Math.min(swLng, neLng),
        maxLng: bounds.maxLng ?? Math.max(swLng, neLng),
      };
    }

    // 3. min/max 형태 구조
    if ('minLat' in bounds && bounds.minLat !== undefined && bounds.maxLat !== undefined && bounds.minLng !== undefined && bounds.maxLng !== undefined) {
      return {
        sw: { lat: bounds.minLat, lng: bounds.minLng },
        ne: { lat: bounds.maxLat, lng: bounds.maxLng },
        minLat: bounds.minLat,
        maxLat: bounds.maxLat,
        minLng: bounds.minLng,
        maxLng: bounds.maxLng,
      };
    }
  } catch (err) {
    console.warn('[geoUtils] Failed to extract bounds rect:', err);
  }

  return null;
}

/**
 * 특정 위경도 좌표가 주어진 지도 경계(MapBoundsRect) 내에 위치하는지 버퍼 비율을 포함하여 검사합니다.
 *
 * @param pos 확인할 좌표 { lat, lng }
 * @param mapBounds 지도 경계 (MapBoundsRect or naver.maps.LatLngBounds)
 * @param bufferRatio 뷰포트 외곽 버퍼 영역 비율 (기본 0.1 = 10% 확장)
 */
export function isPositionInBounds(
  pos: MapCoord | null | undefined,
  mapBounds: MapBoundsRect | naver.maps.LatLngBounds | null | undefined,
  bufferRatio = 0.1
): boolean {
  if (!mapBounds || !pos) return true;

  const rect = extractBoundsRect(mapBounds);
  if (!rect) return true;

  const dLat = Math.abs(rect.maxLat - rect.minLat) * bufferRatio;
  const dLng = Math.abs(rect.maxLng - rect.minLng) * bufferRatio;

  const bufferedMinLat = rect.minLat - dLat;
  const bufferedMaxLat = rect.maxLat + dLat;
  const bufferedMinLng = rect.minLng - dLng;
  const bufferedMaxLng = rect.maxLng + dLng;

  return (
    pos.lat >= bufferedMinLat &&
    pos.lat <= bufferedMaxLat &&
    pos.lng >= bufferedMinLng &&
    pos.lng <= bufferedMaxLng
  );
}
