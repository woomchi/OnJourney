"use client";

import { useMemo, useRef } from 'react';
import { Polyline } from 'react-naver-maps';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';

// 두 위경도 좌표 간 방위각(Bearing)을 0~360도 각도로 구하는 함수 (Great Circle)
export function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(radLat2);
  const x = Math.cos(radLat1) * Math.sin(radLat2) - Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(dLng);

  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

// 위도를 Web Mercator Y 좌표로 변환
export function getMercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

// Web Mercator Y 좌표를 위도로 변환
export function getInverseMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * (180 / Math.PI);
}

// 두 좌표 간 평면(Mercator) 방위각(Rhumb Bearing) 계산
export function getRhumbBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const dY = getMercatorY(lat2) - getMercatorY(lat1);
  const brng = Math.atan2(dLng, dY);
  return ((brng * 180) / Math.PI + 360) % 360;
}

interface Point {
  lat: number;
  lng: number;
}

// 화살표 방향 및 줌 레벨에 맞는 V자형(Chevron) 경로 좌표를 생성하는 함수
// 줌 레벨로부터 1픽셀이 몇 도(degree)인지 역산하여 항상 일정한 픽셀 크기의 셰브론을 생성함
export function getChevronPath(center: Point, bearing: number, zoomLevel: number): Point[] {
  // 위도에 따른 경도 보정 계수 계산
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  // Web Mercator 투영 기준 해당 줌 레벨에서 1px이 차지하는 미터 수
  const metersPerPixel = (156543.03392 * cosLat) / Math.pow(2, zoomLevel);
  // 각 날개를 ~4px 크기로 고정
  const legPixels = 4.0;
  const legMeters = legPixels * metersPerPixel;
  // 미터를 위도 도(degree) 단위로 환산 (1도 ≈ 111,111m)
  const lenDeg = legMeters / 111111.0;

  // bearing(0=북, 90=동 시계방향)을 수학 각도(반시계, 동쪽 기준)로 변환
  const theta = ((90 - bearing) * Math.PI) / 180;
  // 전진 방향으로부터 좌/우 135°에 날개 끝을 배치하여 90° 개각의 V자 형성
  const angle1 = theta + (135 * Math.PI) / 180;
  const angle2 = theta - (135 * Math.PI) / 180;

  const pt1 = {
    lat: center.lat + lenDeg * Math.sin(angle1),
    lng: center.lng + (lenDeg * Math.cos(angle1)) / cosLat,
  };
  const pt2 = {
    lat: center.lat + lenDeg * Math.sin(angle2),
    lng: center.lng + (lenDeg * Math.cos(angle2)) / cosLat,
  };

  return [pt1, center, pt2];
}

// 줌 레벨에 따른 화살표 두께 반환 (원래 SVG 마커의 약 1.5px 실효 두께에 맞춤)
export function getChevronStrokeWeight(zoom: number): number {
  if (zoom >= 17) return 2.0;
  if (zoom >= 14) return 1.8;
  return 1.5;
}

import type {
  Place,
  Journey,
  FocusedSegment,
  FocusedStep,
  DirectionResult,
  DirectionsCacheRecord,
  AlternativeSegment,
} from '@/types/journey';
import { useMapUIStore } from '@/stores/map-store';
import { getSegmentGeometry, ArrowAnchor } from '@/lib/segmentGeometryCache';

interface DirectionalStripesProps {
  places: Place[];
  directionsCache: DirectionsCacheRecord;
  activeJourney: Journey | null;
  focusedSegment: FocusedSegment | null;
  focusedStep: FocusedStep | null;
  navermaps: any;
  zoomLevel: number;
  mapBounds: naver.maps.LatLngBounds | null;
  hoveredAlternativeRoute?: DirectionResult | null;
  alternativeSegment?: AlternativeSegment | null;
}

export default function DirectionalStripes({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  focusedStep,
  navermaps,
  zoomLevel,
  mapBounds,
  hoveredAlternativeRoute,
  alternativeSegment,
}: DirectionalStripesProps) {
  const isMapDragging = useMapUIStore((state) => state.isMapDragging);
  const transportType = activeJourney?.transport_type || 'public';

  // 1. Fetch cached anchor points using segment geometry cache module (zero math re-calculations)
  const arrowAnchors = useMemo(() => {
    const points: ArrowAnchor[] = [];

    if (!navermaps || places.length < 2) return points;

    places.forEach((place: Place, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');
      const isAlternativeSegment = alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id;
      const activeRoute = (isAlternativeSegment && hoveredAlternativeRoute) ? hoveredAlternativeRoute : defaultRoute;

      if (!activeRoute || !activeRoute.steps) return;

      if (focusedSegment && !focusedStep) {
        const isCurrentSegment = focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
        if (!isCurrentSegment) return;
      }

      const geometry = getSegmentGeometry(
        place,
        nextPlace,
        activeRoute,
        transportType,
        idx,
        places.length,
        focusedSegment,
        focusedStep
      );

      points.push(...geometry.arrowAnchors);
    });

    return points;
  }, [places, directionsCache, transportType, focusedSegment, focusedStep, navermaps, hoveredAlternativeRoute, alternativeSegment]);

  const lastVisiblePointsRef = useRef<ArrowAnchor[]>([]);

  // 2. Filter points by viewport bounds & apply zoom-based stride sampling
  const visiblePoints = useMemo(() => {
    if (isMapDragging && lastVisiblePointsRef.current.length > 0) {
      return lastVisiblePointsRef.current;
    }
    if (zoomLevel <= 7) return [];

    let stride = 1;
    if (zoomLevel >= 16) stride = 1;
    else if (zoomLevel === 15) stride = 2;
    else if (zoomLevel === 14) stride = 3;
    else if (zoomLevel === 13) stride = 5;
    else if (zoomLevel === 12) stride = 8;
    else stride = 12;

    const sampledAnchors = arrowAnchors.filter((_, idx) => idx % stride === 0);

    if (!mapBounds || !navermaps) {
      const res = sampledAnchors.slice(0, 80);
      lastVisiblePointsRef.current = res;
      return res;
    }
    try {
      const filtered = sampledAnchors.filter(pt => {
        const targetCoord = new navermaps.LatLng(pt.position.lat, pt.position.lng);
        if (typeof (mapBounds as any).hasLatLng === 'function') {
          return (mapBounds as any).hasLatLng(targetCoord);
        }
        if (typeof (mapBounds as any).contains === 'function') {
          return (mapBounds as any).contains(targetCoord);
        }
        const sw = mapBounds.getSW();
        const ne = mapBounds.getNE();
        return pt.position.lat >= sw.lat() && pt.position.lat <= ne.lat() &&
               pt.position.lng >= sw.lng() && pt.position.lng <= ne.lng();
      });

      const res = filtered.slice(0, 50);
      lastVisiblePointsRef.current = res;
      return res;
    } catch (e) {
      console.warn('[DirectionalStripes] Failed to filter points by bounds:', e);
      const res = sampledAnchors.slice(0, 50);
      lastVisiblePointsRef.current = res;
      return res;
    }
  }, [arrowAnchors, mapBounds, navermaps, zoomLevel, isMapDragging]);

  // 3. Batch chevron geometries by transportType & zIndex to reduce Polyline React nodes from 80+ to 1~3
  const batchedChevrons = useMemo(() => {
    if (zoomLevel <= 7 || visiblePoints.length === 0) return [];

    const groups: Record<string, { key: string; paths: { lat: number; lng: number }[][]; transportType: string; zIndex: number }> = {};

    visiblePoints.forEach((pt) => {
      const pathPoints = getChevronPath(pt.position, pt.bearing, zoomLevel);

      const groupKey = `${pt.transportType}-${pt.zIndex}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          key: `chevron-batch-${groupKey}`,
          paths: [],
          transportType: pt.transportType,
          zIndex: pt.zIndex,
        };
      }
      groups[groupKey].paths.push(pathPoints);
    });

    return Object.values(groups);
  }, [visiblePoints, zoomLevel]);

  return (
    <>
      {batchedChevrons.map((batch) => (
        <Polyline
          key={batch.key}
          path={batch.paths as any}
          strokeColor="#FFFFFF"
          strokeOpacity={batch.transportType === 'public' ? 0.95 : 0.55}
          strokeWeight={getChevronStrokeWeight(zoomLevel)}
          strokeStyle="solid"
          strokeLineCap="round"
          strokeLineJoin="round"
          zIndex={batch.zIndex}
        />
      ))}
    </>
  );
}
