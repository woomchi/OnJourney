import React, { useMemo, Fragment } from 'react';
import { motion } from 'framer-motion';
import { CustomOverlayView } from '@/components/map/CustomOverlayView';
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

import { isPositionInBounds } from '@/features/map/MapMarkers';
import { useMapUIStore } from '@/stores/map-store';

import { getSegmentGeometry, TransferPoint } from '@/lib/segmentGeometryCache';

export default function TransferMarkers({
  places,
  directionsCache,
  activeJourney,
  focusedSegment,
  navermaps,
  hoveredAlternativeRoute,
  alternativeSegment,
}: TransferMarkersProps) {
  const isMapDragging = useMapUIStore((state) => state.isMapDragging);
  const mapBounds = useMapUIStore((state) => state.mapBounds);
  const { focusedStep, setFocusedStep, setFocusBounds, setFocusedSegment } = useJourneyStore();

  const transferPoints = useMemo(() => {
    const points: TransferPoint[] = [];

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

      if (!activeRoute || !activeRoute.steps) return;

      if (!focusedSegment) return;

      const isCurrentSegment = focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id;
      if (!isCurrentSegment) return;

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

      points.push(...geometry.transferPoints);
    });

    let filteredPoints = points;
    if (focusedSegment) {
      filteredPoints = points.filter((pt) => {
        if (pt.isSegmentStart || pt.isSegmentDest) return true;
        if (!focusedStep) return false;
        if (focusedStep.originId !== pt.originId || focusedStep.destId !== pt.destId) return false;

        if (focusedStep.subType === 'dest') {
          return !!(pt.isSegmentDest || pt.stepIndex === focusedStep.stepIndex - 1);
        }
        if (focusedStep.subType === 'start') {
          return pt.stepIndex === focusedStep.stepIndex && !pt.isAlighting && !pt.isSegmentDest;
        }
        if (focusedStep.subType === 'end') {
          return pt.stepIndex === focusedStep.stepIndex && !!pt.isAlighting;
        }

        return pt.stepIndex === focusedStep.stepIndex;
      });
    }

    if (!mapBounds) return filteredPoints;

    return filteredPoints.filter((pt) => isPositionInBounds(pt.position, mapBounds, 0.15));
  }, [places, directionsCache, activeJourney, focusedSegment, focusedStep, navermaps, mapBounds, alternativeSegment, hoveredAlternativeRoute]);

  const handleTransferMarkerClick = (targetPt: any) => {
    const pt = targetPt.isMergedGroup
      ? (targetPt.subPoints.find((p: any) => !p.isSegmentStart && !p.isSegmentDest) || targetPt.subPoints[0])
      : targetPt;
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
        const isMergedGroup = !!pt.isMergedGroup;
        const subPoints: any[] = isMergedGroup ? pt.subPoints : [pt];
        const primaryColor = (subPoints.find((p: any) => p.isSegmentStart || p.isSegmentDest) || subPoints[0]).color;

        const checkIsStepFocused = (point: any) => {
          if (!focusedStep) return false;
          if (focusedStep.originId !== point.originId || focusedStep.destId !== point.destId) return false;

          if (focusedStep.subType === 'dest') {
            return !!(point.isSegmentDest || point.stepIndex === focusedStep.stepIndex - 1);
          }
          if (focusedStep.subType === 'start') {
            return point.stepIndex === focusedStep.stepIndex && !point.isAlighting && !point.isSegmentDest;
          }
          if (focusedStep.subType === 'end') {
            return point.stepIndex === focusedStep.stepIndex && !!point.isAlighting;
          }

          return point.stepIndex === focusedStep.stepIndex;
        };

        const isThisStepFocused = subPoints.some(checkIsStepFocused);

        const zIndex = isMergedGroup
          ? Math.max(...subPoints.map((p: any) => p.isSegmentStart ? 23000 : ((p.isSegmentDest || p.isAlighting) ? 22000 : (p.type === 'walk' ? 12000 : (p.isFirst ? 14000 : 15000)))))
          : (pt.isSegmentStart ? 23000 : ((pt.isSegmentDest || pt.isAlighting) ? 22000 : (pt.type === 'walk' ? 12000 : (pt.isFirst ? 14000 : 15000))));

        return (
          <CustomOverlayView
            key={pt.key}
            position={pt.position}
            zIndex={isThisStepFocused ? 25000 : zIndex}
            onClick={() => handleTransferMarkerClick(pt)}
            anchorX={0.5}
            anchorY={1}
            offsetX={0}
            offsetY={-8}
          >
            <motion.div
              initial={{ scale: 0, opacity: 0, y: 10 }}
              animate={{
                scale: isThisStepFocused ? 1.1 : 1,
                opacity: 1,
                y: 0,
              }}
              transition={
                isMapDragging
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 400, damping: 25 }
              }
              className="relative flex items-center bg-white border-2 rounded-full px-2.5 py-1 shadow-md font-sans whitespace-nowrap cursor-pointer select-none gap-2"
              style={{
                borderColor: primaryColor,
                boxShadow: isThisStepFocused
                  ? `0 0 0 4px ${primaryColor}40, 0 6px 20px ${primaryColor}50`
                  : '0 4px 14px rgba(0, 0, 0, 0.16)',
              }}
            >
              {subPoints.map((subPt: any, idx: number) => {
                const displayBusName = subPt.isAlighting
                  ? subPt.busName
                  : ((subPt.isSegmentDest || subPt.isSegmentStart) ? subPt.busName : (subPt.type === 'walk' ? '도보 이동' : subPt.busName.replace(' 버스', '')));
                const labelText = subPt.isSegmentStart 
                  ? '출발' 
                  : (subPt.isSegmentDest 
                      ? '도착' 
                      : (subPt.isAlighting ? '하차' : (subPt.type === 'walk' ? '도보' : (subPt.isFirst ? '탑승' : '환승'))));

                return (
                  <Fragment key={subPt.key || idx}>
                    {idx > 0 && <div className="w-[1px] h-3.5 bg-zinc-200 shrink-0 my-auto mx-0.5" />}
                    <div className="flex items-center">
                      {/* 아이콘 원형 */}
                      <div
                        className="flex items-center justify-center text-white rounded-full w-[18px] h-[18px] text-[10px] mr-1.5 shadow-inner shrink-0"
                        style={{ backgroundColor: subPt.color }}
                      >
                        {subPt.isSegmentDest ? (
                          '🚩'
                        ) : subPt.isSegmentStart ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-2.5 h-2.5 text-white"
                          >
                            <path
                              d="M8 5v14l11-7z"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : subPt.type === 'walk' ? (
                          '🚶'
                        ) : subPt.type === 'subway' ? (
                          '🚇'
                        ) : subPt.type === 'train' ? (
                          '🚄'
                        ) : (
                          '🚌'
                        )}
                      </div>

                      {/* 정보 텍스트 */}
                      <div className="flex flex-col justify-center max-w-[130px]">
                        {subPt.isSegmentStart || subPt.isSegmentDest ? (
                          <span className="text-[10.5px] font-black text-zinc-900 leading-tight">
                            {labelText}
                          </span>
                        ) : (
                          <>
                            <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider leading-none">
                              {labelText}
                            </span>
                            <span className="text-[10.5px] font-black text-zinc-900 leading-tight mt-0.5 truncate block">
                              {displayBusName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </Fragment>
                );
              })}

              {/* 아래쪽 꼭지점 화살표 */}
              <div
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent"
                style={{ borderTopColor: primaryColor }}
              />
            </motion.div>
          </CustomOverlayView>
        );
      })}
    </>
  );
}

