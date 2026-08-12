/**
 * 구간(Segment) 단위 파생 지오메트리 통합 캐싱 유틸리티
 * - 1회의 통합 순회(Single Pass)로 RDP 경로선, 방위각 화살표 앵커, 환승 마커 겹침 데이터를 통합 가공 및 캐싱
 */

import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import { getMercatorY, getInverseMercatorY, getRhumbBearing } from '@/components/map/DirectionalStripes';
import { getSequenceTheme } from '@/constants/colors';

export interface ArrowAnchor {
  key: string;
  position: { lat: number; lng: number };
  bearing: number;
  color: string;
  transportType: string;
  zIndex: number;
}

export interface TransferPoint {
  key: string;
  originId: string;
  destId: string;
  position: { lat: number; lng: number };
  busName: string;
  type: string;
  color: string;
  stationName: string;
  isFirst?: boolean;
  isStart?: boolean;
  isDest?: boolean;
  isAlighting?: boolean;
  isSegmentStart?: boolean;
  isSegmentDest?: boolean;
  stepIndex: number;
  offsetX?: number;
  isMergedGroup?: boolean;
  subPoints?: TransferPoint[];
}

export interface SegmentDerivedGeometry {
  cacheKey: string;
  arrowAnchors: ArrowAnchor[];
  transferPoints: TransferPoint[];
}

// 메모리 전역 지오메트리 캐시 맵
const geometryCache = new Map<string, SegmentDerivedGeometry>();

/**
 * 지점 변경 시 특정 구간 캐시 핀포인트 파괴 함수
 */
export function evictSegmentGeometry(originId: string, destId: string): void {
  const prefix = `${originId}-${destId}`;
  for (const key of geometryCache.keys()) {
    if (key.startsWith(prefix)) {
      geometryCache.delete(key);
    }
  }
}

/**
 * 구간(Place A ➔ Place B)에 대한 방위각 앵커 및 환승 마커 통합 지오메트리 1회 계산 및 메모이제이션
 */
export function getSegmentGeometry(
  place: any,
  nextPlace: any,
  activeRoute: any,
  transportType: string,
  placeIdx: number,
  totalPlacesCount: number,
  focusedSegment: any,
  focusedStep: any
): SegmentDerivedGeometry {
  if (!place || !nextPlace || !activeRoute || !activeRoute.steps) {
    return { cacheKey: '', arrowAnchors: [], transferPoints: [] };
  }

  const routeId = activeRoute.id || activeRoute.type || 'default';
  const cacheKey = `${place.id}-${nextPlace.id}-${routeId}-${activeRoute.steps.length}`;

  if (geometryCache.has(cacheKey)) {
    return geometryCache.get(cacheKey)!;
  }

  const arrowAnchors: ArrowAnchor[] = [];
  const rawTransferPoints: TransferPoint[] = [];

  const isCurrentSegment = focusedSegment
    ? focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id
    : true;

  const startColor = getSequenceTheme(placeIdx, totalPlacesCount).color;

  // 1. 출발지 마커 추가
  if (place.lat !== undefined && place.lng !== undefined && !isNaN(place.lat) && !isNaN(place.lng)) {
    rawTransferPoints.push({
      key: `start-${place.id}-${nextPlace.id}`,
      originId: place.id,
      destId: nextPlace.id,
      position: { lat: Number(place.lat), lng: Number(place.lng) },
      busName: place.place_name,
      type: 'start',
      color: startColor,
      stationName: '출발지',
      isStart: true,
      isSegmentStart: true,
      stepIndex: -1,
    });
  }

  const transitSteps = activeRoute.steps.filter((s: any) =>
    ['bus', 'subway', 'train', 'expressbus'].includes(s.type)
  );

  const getShiftedStepPoint = (step: any, isStart: boolean) => {
    if (step.pathPoints && step.pathPoints.length >= 2) {
      const pt = isStart ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
      return { lat: pt.lat, lng: pt.lng };
    }
    if (isStart) {
      return {
        lat: step.startLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lat : undefined),
        lng: step.startLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lng : undefined),
      };
    } else {
      return {
        lat: step.endLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lat : undefined),
        lng: step.endLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lng : undefined),
      };
    }
  };

  // 2. 단일 순회(Single Pass)로 Step별 방위각 화살표 앵커 및 환승 마커 계산
  activeRoute.steps.forEach((step: any, sIdx: number) => {
    const stepPath = step.pathPoints || [];
    const stepLen = stepPath.length;

    // ── A. 도보 출발 마커 수집 ──
    if (step.type === 'walk') {
      const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(step, true);
      if (firstLat !== undefined && firstLng !== undefined) {
        rawTransferPoints.push({
          key: `walk-${place.id}-${nextPlace.id}-${sIdx}`,
          originId: place.id,
          destId: nextPlace.id,
          position: { lat: firstLat, lng: firstLng },
          busName: '도보',
          type: 'walk',
          color: '#71717A',
          stationName: '도보 출발지',
          isFirst: true,
          stepIndex: sIdx,
        });
      }
      return; // 도보는 화살표 앵커 생성 생략
    }

    // ── B. 방위각 화살표 앵커 계산 ──
    const isThisStepFocused = !!(
      focusedStep &&
      focusedStep.originId === place.id &&
      focusedStep.destId === nextPlace.id &&
      focusedStep.stepIndex === sIdx
    );

    const baseZIndex = isThisStepFocused
      ? 15000
      : isCurrentSegment
        ? (focusedSegment ? 5000 + sIdx : (100 - placeIdx) * 10)
        : (100 - placeIdx);

    const arrowZIndex = baseZIndex + 10;
    const strokeColor = step.color || (activeRoute.type === 'public' ? '#3b82f6' : '#f59e0b');
    const D = activeRoute.type === 'public' ? 250 : 350;

    let accumulatedDistance = 0;
    const pointsBefore = arrowAnchors.length;

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

        arrowAnchors.push({
          key: `stripe-${place.id}-${nextPlace.id}-${sIdx}-${i}-${arrowAnchors.length}`,
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

    if (arrowAnchors.length === pointsBefore && stepLen >= 2) {
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
        arrowAnchors.push({
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

  // ── C. 대중교통 탑승/환승 마커 추가 ──
  if (transitSteps.length > 0) {
    const firstStep = transitSteps[0];
    const firstStepIndex = activeRoute.steps.indexOf(firstStep);
    const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(firstStep, true);

    if (firstLat !== undefined && firstLng !== undefined) {
      rawTransferPoints.push({
        key: `transfer-${place.id}-${nextPlace.id}-0`,
        originId: place.id,
        destId: nextPlace.id,
        position: { lat: firstLat, lng: firstLng },
        busName: firstStep.name,
        type: firstStep.type,
        color: firstStep.color || '#4F46E5',
        stationName: firstStep.startName || '탑승 정류장',
        isFirst: true,
        stepIndex: firstStepIndex,
      });
    }
  }

  for (let i = 1; i < transitSteps.length; i++) {
    const prevStep = transitSteps[i - 1];
    const currStep = transitSteps[i];
    const currStepIndex = activeRoute.steps.indexOf(currStep);

    const { lat: prevEndLat, lng: prevEndLng } = getShiftedStepPoint(prevStep, false);
    const { lat: currStartLat, lng: currStartLng } = getShiftedStepPoint(currStep, true);

    const hasCoordinates = prevEndLat !== undefined && prevEndLng !== undefined &&
      currStartLat !== undefined && currStartLng !== undefined;

    const isSameName = !!(prevStep.endName && currStep.startName &&
      prevStep.endName.trim() === currStep.startName.trim());

    const isClose = hasCoordinates &&
      calculateHaversineDistance(prevEndLat, prevEndLng, currStartLat, currStartLng) < 300;

    if (isSameName || isClose) {
      const lat = currStartLat;
      const lng = currStartLng;

      if (lat && lng) {
        rawTransferPoints.push({
          key: `transfer-${place.id}-${nextPlace.id}-${i}`,
          originId: place.id,
          destId: nextPlace.id,
          position: { lat, lng },
          busName: currStep.name,
          type: currStep.type,
          color: currStep.color || '#4F46E5',
          stationName: currStep.startName || '환승 정류장',
          stepIndex: currStepIndex,
        });
      }
    }
  }

  // 3. 도착지 마커 추가
  rawTransferPoints.push({
    key: `destination-${place.id}-${nextPlace.id}`,
    originId: place.id,
    destId: nextPlace.id,
    position: { lat: nextPlace.lat, lng: nextPlace.lng },
    busName: nextPlace.place_name,
    type: 'destination',
    color: getSequenceTheme(placeIdx + 1, totalPlacesCount).color,
    stationName: '도착지',
    isDest: true,
    isSegmentDest: true,
    stepIndex: activeRoute.steps.length,
  });

  // 4. 동일 좌표 중복 마커 병합(Grouping)
  const groups: Record<string, TransferPoint[]> = {};
  rawTransferPoints.forEach((pt) => {
    const key = `${pt.position.lat.toFixed(5)},${pt.position.lng.toFixed(5)}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(pt);
  });

  const finalTransferPoints: TransferPoint[] = [];

  Object.values(groups).forEach((group) => {
    if (group.length === 1) {
      const pt = group[0];
      pt.offsetX = 0;
      finalTransferPoints.push(pt);
    } else {
      group.sort((a, b) => {
        const scoreA = a.isSegmentStart ? 1 : (a.isSegmentDest ? 3 : 2);
        const scoreB = b.isSegmentStart ? 1 : (b.isSegmentDest ? 3 : 2);
        return scoreA - scoreB;
      });

      const primaryPt = group[0];
      const mergedKey = group.map((p) => p.key).join('--');

      finalTransferPoints.push({
        ...primaryPt,
        key: `merged-${mergedKey}`,
        isMergedGroup: true,
        subPoints: group,
        offsetX: 0,
      });
    }
  });

  const result: SegmentDerivedGeometry = {
    cacheKey,
    arrowAnchors,
    transferPoints: finalTransferPoints,
  };

  geometryCache.set(cacheKey, result);
  return result;
}
