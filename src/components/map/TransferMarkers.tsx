"use client";

import { useMemo } from 'react';
import { Marker } from 'react-naver-maps';
import { useJourneyStore } from '@/stores/journey-store';
import { getDefaultRoute } from '@/lib/routeUtils';
import { getSequenceTheme } from '@/constants/colors';
import { calculateHaversineDistance, calculateSegmentBounds } from '@/lib/naverMapRouteService';

interface TransferMarkersProps {
  places: any[];
  directionsCache: any;
  activeJourney: any;
  focusedSegment: any;
  navermaps: any;
  hoveredAlternativeRoute?: any;
  alternativeSegment?: any;
}

export default function TransferMarkers({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  navermaps,
  hoveredAlternativeRoute,
  alternativeSegment,
}: TransferMarkersProps) {
  const { focusedStep, setFocusedStep, setFocusBounds, setFocusedSegment } = useJourneyStore();

  const transferPoints = useMemo(() => {
    const points: Array<{
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

      // 전체 여정 뷰(focusedSegment가 없을 때)에서는 마커를 노출하지 않음
      if (!focusedSegment) return;

      const isCurrentSegment =
        focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
      if (!isCurrentSegment) return;

      const transitSteps = activeRoute.steps.filter((s: any) => ['bus', 'subway', 'train', 'expressbus'].includes(s.type));
      
      const startColor = getSequenceTheme(idx, places.length).color;
      const mergedFirstTransit = false;

      const getShiftedStepPoint = (step: any, isStart: boolean) => {
        if (step.pathPoints && step.pathPoints.length >= 2) {
          const pt = isStart ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
          return { lat: pt.lat, lng: pt.lng };
        }
        if (isStart) {
          return {
            lat: step.startLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lat : undefined),
            lng: step.startLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[0].lng : undefined)
          };
        } else {
          return {
            lat: step.endLat ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lat : undefined),
            lng: step.endLng ?? (step.pathPoints && step.pathPoints.length > 0 ? step.pathPoints[step.pathPoints.length - 1].lng : undefined)
          };
        }
      };

      // 1. 출발지 전용 마커 추가 (무조건 추가)
      points.push({
        key: `start-${place.id}-${nextPlace.id}`,
        originId: place.id,
        destId: nextPlace.id,
        position: { lat: place.lat, lng: place.lng },
        busName: place.place_name,
        type: 'start',
        color: startColor,
        stationName: '출발지',
        isStart: true,
        isSegmentStart: true,
        stepIndex: -1,
      });

      // 모든 도보 스텝에 대해 도보 출발 마커 추가
      activeRoute.steps.forEach((step: any, sIdx: number) => {
        if (step && step.type === 'walk') {
          const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(step, true);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
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
        }
      });

      // 현재 포커스된 스텝이 이 구간의 마지막 스텝인 경우, 다음 구간의 첫 번째 이동 수단 마커 추가
      const isLastStepFocused = !!(
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        (focusedStep.stepIndex === activeRoute.steps.length - 1 || focusedStep.subType === 'dest')
      );

      if (isLastStepFocused && idx + 2 < places.length) {
        const nextSegmentOrigin = nextPlace;
        const nextSegmentDest = places[idx + 2];
        const nextCacheKey = `${nextSegmentOrigin.id}-${nextSegmentDest.id}`;
        const nextSegmentData = directionsCache[nextCacheKey];
        const nextActiveRoute = getDefaultRoute(nextSegmentOrigin, nextSegmentDest, nextSegmentData, transportType as 'public' | 'car' | 'walk');

        if (nextActiveRoute && nextActiveRoute.steps && nextActiveRoute.steps.length > 0) {
          const nextFirstStep = nextActiveRoute.steps[0];
          const { lat: nextFirstLat, lng: nextFirstLng } = getShiftedStepPoint(nextFirstStep, true);

          if (nextFirstLat !== undefined && nextFirstLng !== undefined) {
            points.push({
              key: `next-first-${nextSegmentOrigin.id}-${nextSegmentDest.id}-0`,
              originId: nextSegmentOrigin.id,
              destId: nextSegmentDest.id,
              position: { lat: nextFirstLat, lng: nextFirstLng },
              busName: nextFirstStep.name,
              type: nextFirstStep.type,
              color: nextFirstStep.color || (nextFirstStep.type === 'walk' ? '#71717A' : '#4F46E5'),
              stationName: nextFirstStep.startName || (nextFirstStep.type === 'walk' ? '도보 출발지' : '탑승 정류장'),
              isFirst: true,
              stepIndex: 0,
            });
          }
        }
      }

      if (transitSteps.length > 0) {
        const firstStep = transitSteps[0];
        const firstStepIndex = activeRoute.steps.indexOf(firstStep);
        const shouldShowFirstStep = true;
        // 첫 대중교통 탑승지가 출발지와 병합되었다면, 중복 렌더링 방지를 위해 첫 탑승 마커는 생략
        if (shouldShowFirstStep && !mergedFirstTransit) {
          const { lat: firstLat, lng: firstLng } = getShiftedStepPoint(firstStep, true);

          if (firstLat !== undefined && firstLng !== undefined) {
            points.push({
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
      }

      for (let i = 1; i < transitSteps.length; i++) {
        const prevStep = transitSteps[i - 1];
        const currStep = transitSteps[i];
        const currStepIndex = activeRoute.steps.indexOf(currStep);
        const shouldShowCurrStep = true;

        if (shouldShowCurrStep) {
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
              points.push({
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
      }

      // 세그먼트의 도착지 마커 추가 (무조건 추가)
      points.push({
        key: `destination-${place.id}-${nextPlace.id}`,
        originId: place.id,
        destId: nextPlace.id,
        position: { lat: nextPlace.lat, lng: nextPlace.lng },
        busName: nextPlace.place_name,
        type: 'destination',
        color: getSequenceTheme(idx + 1, places.length).color,
        stationName: '도착지',
        isDest: true,
        isSegmentDest: true,
        stepIndex: activeRoute.steps.length,
      });

      // 하차 마커 추가 (focusedStep.subType === 'end' 인 경우에만 노출)
      if (
        focusedStep &&
        focusedStep.originId === place.id &&
        focusedStep.destId === nextPlace.id &&
        focusedStep.subType === 'end'
      ) {
        const step = activeRoute.steps[focusedStep.stepIndex];
        if (step) {
          const { lat: endLat, lng: endLng } = getShiftedStepPoint(step, false);
          if (endLat !== undefined && endLng !== undefined) {
            points.push({
              key: `alighting-${place.id}-${nextPlace.id}-${focusedStep.stepIndex}`,
              originId: place.id,
              destId: nextPlace.id,
              position: { lat: endLat, lng: endLng },
              busName: step.endName || step.name || '하차지',
              type: step.type,
              color: '#F43F5E', // 하차는 Rose Red
              stationName: step.endName || '하차 정류장',
              isAlighting: true,
              stepIndex: focusedStep.stepIndex,
            });
          }
        }
      }
    });

    if (focusedSegment) {
      const thisSegmentPoints = points.filter(p => p.originId === focusedSegment.originId && p.destId === focusedSegment.destId && !p.key.startsWith('next-first-'));
      if (thisSegmentPoints.length > 0) {
        thisSegmentPoints.sort((a: any, b: any) => {
          if (a.stepIndex !== b.stepIndex) return a.stepIndex - b.stepIndex;
          if (a.isStart !== b.isStart) return a.isStart ? -1 : 1;
          if (a.isDest !== b.isDest) return a.isDest ? 1 : -1;
          if (a.isAlighting !== b.isAlighting) return a.isAlighting ? 1 : -1;
          return 0;
        });
      }
    }

    // 중복 마커 분리를 위한 오프셋(offsetX) 할당 로직
    const groups: { [key: string]: typeof points } = {};
    points.forEach((pt) => {
      const key = `${pt.position.lat.toFixed(5)},${pt.position.lng.toFixed(5)}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(pt);
    });

    Object.values(groups).forEach((group) => {
      if (group.length > 1) {
        group.sort((a, b) => {
          const scoreA = a.isSegmentStart ? 1 : (a.isSegmentDest ? 3 : 2);
          const scoreB = b.isSegmentStart ? 1 : (b.isSegmentDest ? 3 : 2);
          return scoreA - scoreB;
        });

        const N = group.length;
        const spacing = 80; // 좌우 마커 간의 중심 간격 (픽셀)
        group.forEach((pt, i) => {
          pt.offsetX = (i - (N - 1) / 2) * spacing;
        });
      }
    });

    return points;
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps]);

  const handleTransferMarkerClick = (pt: any) => {
    const originPlace = places.find(p => p.id === pt.originId);
    const destPlace = places.find(p => p.id === pt.destId);
    if (!originPlace || !destPlace) return;

    const cacheKey = `${pt.originId}-${pt.destId}`;
    const segmentData = directionsCache[cacheKey];
    const transportType = activeJourney?.transport_type || 'public';
    const activeRoute = getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

    if (!activeRoute) return;

    // 만약 클릭한 마커가 현재 포커스된 세그먼트와 다른 세그먼트에 속해 있다면 세그먼트 포커스도 함께 전환
    if (!focusedSegment || focusedSegment.originId !== pt.originId || focusedSegment.destId !== pt.destId) {
      setFocusedSegment({ originId: pt.originId, destId: pt.destId });
    }

    if (
      focusedStep &&
      focusedStep.originId === pt.originId &&
      focusedStep.destId === pt.destId &&
      focusedStep.stepIndex === pt.stepIndex
    ) {
      // Toggle off step focus, go back to segment focus
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, activeRoute);
      setFocusBounds(bounds);
    } else {
      // Toggle on step focus
      const step = activeRoute.steps[pt.stepIndex];
      if (step) {
        // 탑승/시작 지점으로 줌인 (마커 좌표)
        const lat = pt.position.lat;
        const lng = pt.position.lng;
        setFocusBounds({
          sw: { lat, lng },
          ne: { lat, lng }
        });

        setFocusedStep({
          originId: pt.originId,
          destId: pt.destId,
          stepIndex: pt.stepIndex,
        });
      }
    }
  };

  return (
    <>
      {transferPoints.map((pt: any) => {
        const displayBusName = pt.isAlighting
          ? pt.busName
          : ((pt.isSegmentDest || pt.isSegmentStart) ? pt.busName : (pt.type === 'walk' ? '도보 이동' : pt.busName.replace(' 버스', '')));
        const labelText = pt.isSegmentStart 
          ? '출발' 
          : (pt.isSegmentDest 
              ? '도착' 
              : (pt.isAlighting ? '하차' : (pt.type === 'walk' ? '도보' : (pt.isFirst ? '탑승' : '환승'))));
        
        const siteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 10px; height: 10px; color: white;" class="start-icon-svg-${pt.key}"><path d="M12 4L4 18h16Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
        const iconEmoji = pt.isSegmentDest 
          ? '🚩' 
          : (pt.isSegmentStart ? siteIconSvg : (pt.type === 'walk' ? '🚶' : (pt.type === 'subway' ? '🚇' : (pt.type === 'train' ? '🚄' : '🚌'))));
        
        // 출발 마커가 항상 탑승 마커(최대 15000) 위에 나타나도록 zIndex를 23000으로 조정
        const zIndex = pt.isSegmentStart ? 23000 : ((pt.isSegmentDest || pt.isAlighting) ? 22000 : (pt.type === 'walk' ? 12000 : (pt.isFirst ? 14000 : 15000)));

        const isThisStepFocused = (() => {
          if (!focusedStep) return false;
          if (focusedStep.originId !== pt.originId || focusedStep.destId !== pt.destId) return false;

          // 도착 페이지 포커스 시
          if (focusedStep.subType === 'dest') {
            return !!(pt.isSegmentDest || pt.stepIndex === focusedStep.stepIndex - 1);
          }

          // 승차(탑승/환승) 페이지 포커스 시
          if (focusedStep.subType === 'start') {
            return pt.stepIndex === focusedStep.stepIndex && !pt.isAlighting && !pt.isSegmentDest;
          }

          // 하차 페이지 포커스 시
          if (focusedStep.subType === 'end') {
            return pt.stepIndex === focusedStep.stepIndex && !!pt.isAlighting;
          }

          // 도보 등 기타 페이지 포커스 시
          return pt.stepIndex === focusedStep.stepIndex;
        })();

        const offsetX = pt.offsetX || 0;

        return (
          <Marker
            key={pt.key}
            position={pt.position}
            zIndex={isThisStepFocused ? 25000 : zIndex}
            onClick={() => handleTransferMarkerClick(pt)}
            icon={{
              content: `
                <style>
                  .start-icon-svg-${pt.key} {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    transform-origin: center;
                    transform: rotate(${isThisStepFocused ? '90deg' : '0deg'});
                  }
                  .transfer-marker-${pt.key}:hover .start-icon-svg-${pt.key} {
                    transform: rotate(${isThisStepFocused ? '0deg' : '90deg'});
                  }
                  .transfer-marker-${pt.key} {
                    display: flex;
                    align-items: center;
                    background: #ffffff;
                    border: 2px solid ${pt.color};
                    border-radius: 9999px;
                    padding: 3.5px 8px 3.5px 4px;
                    box-shadow: ${isThisStepFocused ? `0 0 0 4px ${pt.color}40, 0 6px 20px ${pt.color}50` : '0 4px 14px rgba(0, 0, 0, 0.16)'};
                    font-family: Pretendard, -apple-system, sans-serif;
                    white-space: nowrap;
                    position: relative;
                    cursor: pointer;
                    transform: translate(calc(-50% + ${offsetX}px), -100%) ${isThisStepFocused ? 'scale(1.1)' : ''};
                    margin-top: -8px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                  }
                  .transfer-marker-${pt.key}:hover {
                    transform: translate(calc(-50% + ${offsetX}px), -105%) scale(${isThisStepFocused ? '1.15' : '1.05'});
                    box-shadow: ${isThisStepFocused ? `0 0 0 4px ${pt.color}40, 0 8px 24px ${pt.color}60` : '0 6px 20px rgba(0, 0, 0, 0.22)'};
                    z-index: 20000;
                  }
                </style>
                <div class="transfer-marker-${pt.key}">
                  <!-- 아이콘 원형 -->
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: ${pt.color};
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    font-size: 10px;
                    margin-right: 5px;
                    box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.25);
                  ">
                    ${iconEmoji}
                  </div>
                  <!-- 정보 텍스트 -->
                  <div style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                  ">
                    <span style="font-size: 8px; color: #71717a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1;">${labelText}</span>
                    <span style="font-size: 10.5px; font-weight: 800; color: #18181b; line-height: 1.1; margin-top: 1px;">${displayBusName}</span>
                  </div>
                  <!-- 아래쪽 꼭지점 화살표 -->
                  <div style="
                    position: absolute;
                    bottom: -6px;
                    left: calc(50% - ${offsetX}px);
                    transform: translateX(-50%);
                    width: 0;
                    height: 0;
                    border-left: 5px solid transparent;
                    border-right: 5px solid transparent;
                    border-top: 6px solid ${pt.color};
                  "></div>
                </div>
              `,
              anchor: new navermaps.Point(0, 0),
            }}
          />
        );
      })}
    </>
  );
}
