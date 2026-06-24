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
  const stripePoints = useMemo(() => {
    const points: Array<{
      key: string;
      position: { lat: number; lng: number };
      bearing: number;
      color: string;
      transportType: string;
      zIndex: number;
    }> = [];

    // 줌 레벨이 5 이하일 때는 화살표를 표시하지 않음 (오버헤드 방지 및 시인성 향상)
    if (!navermaps || places.length < 2 || zoomLevel <= 5) return points;

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

      // 특정 세그먼트가 선택(focus)되었을 때, 다른 세그먼트의 스트라이프는 표시하지 않음
      if (focusedSegment && !focusedStep) {
        const isCurrentSegment =
          focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
        if (!isCurrentSegment) return;
      }

      activeRoute.steps.forEach((step: any, sIdx: number) => {
        const stepPath = step.pathPoints || [];
        if (stepPath.length < 2 || step.type === 'walk') return;

        // 특정 스텝(세부 노선) 포커스 로직 (스트라이프 숨김 제거)

        const isThisStepFocused = !!(
          focusedStep &&
          focusedStep.originId === place.id &&
          focusedStep.destId === nextPlace.id &&
          focusedStep.stepIndex === sIdx
        );

        // 포커스 세그먼트 매칭 여부 판별
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

        // 지도 줌 레벨(zoomLevel)에 비례하여 적절한 화살표 배치 누적 간격(D, 미터)을 결정
        // 줌 레벨이 클수록(상세할수록) 간격을 좁혀 촘촘히 묘사하고, 작아질수록 넓혀 과밀화를 방지함
        let D = 1000; // 기본 간격
        if (zoomLevel >= 18) D = 60;
        else if (zoomLevel === 17) D = 100;
        else if (zoomLevel === 16) D = 200;
        else if (zoomLevel === 15) D = 350;
        else if (zoomLevel === 14) D = 600;
        else if (zoomLevel === 13) D = 1200;
        else if (zoomLevel === 12) D = 2400;
        else if (zoomLevel === 11) D = 4800;
        else if (zoomLevel === 10) D = 9600;
        else if (zoomLevel === 9) D = 19200;
        else if (zoomLevel === 8) D = 38400;
        else if (zoomLevel <= 7) D = 76800;

        // 대중교통 노선은 자차보다 살짝 더 촘촘하게(0.75배) 묘사하여 가독성 증대
        if (activeRoute.type === 'public') {
          D = Math.max(20, D * 0.75);
        }

        const pointsBefore = points.length;
        let accumulatedDistance = 0;

        // 경로의 모든 포인트를 따라 누적 거리를 계산하여 D미터 간격마다 화살표 배치 (선형 보간 적용하여 간격 정밀 핏)
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

            // pPrev와 pCurr 사이를 Mercator 투영 상 선형보간하여 정확한 직선 간격에 화살표 좌표 산출
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

        // 경로 전체 길이가 간격 D보다 짧아 화살표가 1개도 생기지 않았을 때
        // 정가운데 지점에 화살표 1개 배치를 보장하여 방향 식별을 도움
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
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps, zoomLevel]);

  // 현재 보이는 지도 영역(뷰포트) 바운드에 여유 패딩(15%)을 주어 필터링함으로써 
  // 화면 밖 불필요한 수백 개의 마커 렌더링 부하를 예방하고 줌/드래그 성능 최적화
  // 렌더링 오버헤드를 완벽히 차단하기 위해 렌더링할 화살표 개수를 최대 120개로 제한
  const visiblePoints = useMemo(() => {
    if (!mapBounds || !navermaps) {
      return stripePoints.slice(0, 120);
    }
    try {
      const sw = mapBounds.getSW();
      const ne = mapBounds.getNE();
      if (!sw || !ne || typeof sw.lat !== 'function' || typeof ne.lat !== 'function') {
        return stripePoints.slice(0, 120);
      }

      const latSpan = ne.lat() - sw.lat();
      const lngSpan = ne.lng() - sw.lng();
      const paddingLat = latSpan * 0.15;
      const paddingLng = lngSpan * 0.15;

      const minLat = sw.lat() - paddingLat;
      const maxLat = ne.lat() + paddingLat;
      const minLng = sw.lng() - paddingLng;
      const maxLng = ne.lng() + paddingLng;

      const filtered = stripePoints.filter(pt => {
        const { lat, lng } = pt.position;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      return filtered.slice(0, 120);
    } catch (e) {
      console.warn('[DirectionalStripes] Failed to filter points by bounds:', e);
      return stripePoints.slice(0, 120);
    }
  }, [stripePoints, mapBounds, navermaps]);

  return (
    <>
      {visiblePoints.map((pt) => {
        const pathPoints = navermaps
          ? getChevronPath(pt.position, pt.bearing, zoomLevel).map(coord => new navermaps.LatLng(coord.lat, coord.lng))
          : getChevronPath(pt.position, pt.bearing, zoomLevel);

        return (
          <Polyline
            key={pt.key}
            path={pathPoints}
            strokeColor="#FFFFFF"
            strokeOpacity={pt.transportType === 'public' ? 0.95 : 0.55}
            strokeWeight={getChevronStrokeWeight(zoomLevel)}
            strokeStyle="solid"
            strokeLineCap="round"
            strokeLineJoin="round"
            zIndex={pt.zIndex}
          />
        );
      })}
    </>
  );
}
