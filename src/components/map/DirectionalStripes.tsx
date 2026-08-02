"use client";

import { useMemo } from 'react';
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

interface DirectionalStripesProps {
  places: any[];
  directionsCache: any;
  activeJourney: any;
  focusedSegment: any;
  focusedStep: any;
  navermaps: any;
  zoomLevel: number;
  mapBounds: naver.maps.LatLngBounds | null;
  hoveredAlternativeRoute?: any;
  alternativeSegment?: any;
}

// 폴리라인 내부에 화살표 스트라이프 패턴을 렌더링하는 정적 마커 컴포넌트
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
  // 1. Calculate anchor points along path (independent of zoomLevel)
  const arrowAnchors = useMemo(() => {
    const points: Array<{
      key: string;
      position: { lat: number; lng: number };
      bearing: number;
      color: string;
      transportType: string;
      zIndex: number;
    }> = [];

    if (!navermaps || places.length < 2) return points;

    places.forEach((place: any, idx: number) => {
      if (idx === places.length - 1) return;
      const nextPlace = places[idx + 1];
      const transportType = activeJourney?.transport_type || 'public';
      const cacheKey = `${place.id}-${nextPlace.id}`;
      const segmentData = directionsCache[cacheKey];

      const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');

      const isAlternativeSegment = alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id;
      const activeRoute = (isAlternativeSegment && hoveredAlternativeRoute) ? hoveredAlternativeRoute : defaultRoute;

      if (!activeRoute || !activeRoute.steps) {
        return;
      }

      if (focusedSegment && !focusedStep) {
        const isCurrentSegment =
          focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
        if (!isCurrentSegment) return;
      }

      activeRoute.steps.forEach((step: any, sIdx: number) => {
        const stepPath = step.pathPoints || [];
        if (stepPath.length < 2 || step.type === 'walk') return;

        const isThisStepFocused = !!(
          focusedStep &&
          focusedStep.originId === place.id &&
          focusedStep.destId === nextPlace.id &&
          focusedStep.stepIndex === sIdx
        );

        const isSegmentFocused = focusedSegment
          ? (focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id)
          : true;

        const baseZIndex = isThisStepFocused
          ? 15000
          : isSegmentFocused
            ? (focusedSegment ? 5000 + sIdx : (100 - idx) * 10)
            : (100 - idx);

        const arrowZIndex = baseZIndex + 2;
        const strokeColor = step.color || (activeRoute.type === 'public' ? '#3b82f6' : '#f59e0b');
        const stepLen = stepPath.length;

        // Base distance spacing in meters for anchor calculation
        let D = activeRoute.type === 'public' ? 250 : 350;

        const pointsBefore = points.length;
        let accumulatedDistance = 0;

        for (let i = 1; i < stepLen; i++) {
          const pPrev = stepPath[i - 1];
          const pCurr = stepPath[i];

          const segmentDist = calculateHaversineDistance(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);
          if (segmentDist === 0) continue;

          let remainingSegmentDist = segmentDist;
          let currentSegmentPosition = 0;

          while (accumulatedDistance + remainingSegmentDist >= D) {
            const distanceToNextArrow = D - accumulatedDistance;
            const nextArrowPositionOnSegment = currentSegmentPosition + distanceToNextArrow;
            const t = nextArrowPositionOnSegment / segmentDist;

            const lng = pPrev.lng + (pCurr.lng - pPrev.lng) * t;
            const yPrev = getMercatorY(pPrev.lat);
            const yCurr = getMercatorY(pCurr.lat);
            const y = yPrev + (yCurr - yPrev) * t;
            const lat = getInverseMercatorY(y);
            const bearing = getRhumbBearing(pPrev.lat, pPrev.lng, pCurr.lat, pCurr.lng);

            points.push({
              key: `stripe-${place.id}-${nextPlace.id}-${sIdx}-${i}-${points.length}`,
              position: { lat, lng },
              bearing,
              color: strokeColor,
              transportType,
              zIndex: arrowZIndex,
            });

            remainingSegmentDist -= distanceToNextArrow;
            currentSegmentPosition = nextArrowPositionOnSegment;
            accumulatedDistance = 0;
          }

          accumulatedDistance += remainingSegmentDist;
        }

        if (points.length === pointsBefore && stepLen >= 2) {
          const midIdx = Math.floor(stepLen / 2);
          const p1 = stepPath[midIdx];
          let p2 = stepPath[midIdx + 1];
          let isReverseBearing = false;
          if (!p2 && stepPath[midIdx - 1]) {
            p2 = stepPath[midIdx - 1];
            isReverseBearing = true;
          }
          if (p1 && p2) {
            const bearing = isReverseBearing
              ? getRhumbBearing(p2.lat, p2.lng, p1.lat, p1.lng)
              : getRhumbBearing(p1.lat, p1.lng, p2.lat, p2.lng);
            points.push({
              key: `stripe-${place.id}-${nextPlace.id}-${sIdx}-mid`,
              position: { lat: p1.lat, lng: p1.lng },
              bearing,
              color: strokeColor,
              transportType,
              zIndex: arrowZIndex,
            });
          }
        }
      });
    });

    return points;
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps, hoveredAlternativeRoute, alternativeSegment]);

  // 2. Filter points by viewport bounds & apply zoom-based stride sampling
  const visiblePoints = useMemo(() => {
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
      return sampledAnchors.slice(0, 80);
    }
    try {
      const sw = mapBounds.getSW();
      const ne = mapBounds.getNE();
      if (!sw || !ne || typeof sw.lat !== 'function' || typeof ne.lat !== 'function') {
        return sampledAnchors.slice(0, 80);
      }

      const latSpan = ne.lat() - sw.lat();
      const lngSpan = ne.lng() - sw.lng();
      const paddingLat = latSpan * 0.15;
      const paddingLng = lngSpan * 0.15;

      const minLat = sw.lat() - paddingLat;
      const maxLat = ne.lat() + paddingLat;
      const minLng = sw.lng() - paddingLng;
      const maxLng = ne.lng() + paddingLng;

      const filtered = sampledAnchors.filter(pt => {
        const { lat, lng } = pt.position;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      return filtered.slice(0, 80);
    } catch (e) {
      console.warn('[DirectionalStripes] Failed to filter points by bounds:', e);
      return sampledAnchors.slice(0, 80);
    }
  }, [arrowAnchors, mapBounds, navermaps, zoomLevel]);

  // 3. Compute chevron geometries using current zoomLevel
  const chevronPaths = useMemo(() => {
    if (zoomLevel <= 7) return [];
    return visiblePoints.map((pt) => {
      const pathPoints = navermaps
        ? getChevronPath(pt.position, pt.bearing, zoomLevel).map(coord => new navermaps.LatLng(coord.lat, coord.lng))
        : getChevronPath(pt.position, pt.bearing, zoomLevel);
      return {
        key: pt.key,
        path: pathPoints,
        transportType: pt.transportType,
        zIndex: pt.zIndex,
      };
    });
  }, [visiblePoints, zoomLevel, navermaps]);

  return (
    <>
      {chevronPaths.map((pt) => (
        <Polyline
          key={pt.key}
          path={pt.path}
          strokeColor="#FFFFFF"
          strokeOpacity={pt.transportType === 'public' ? 0.95 : 0.55}
          strokeWeight={getChevronStrokeWeight(zoomLevel)}
          strokeStyle="solid"
          strokeLineCap="round"
          strokeLineJoin="round"
          zIndex={pt.zIndex}
        />
      ))}
    </>
  );
}
