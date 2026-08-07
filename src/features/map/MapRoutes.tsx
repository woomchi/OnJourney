import React, { Fragment, memo, useCallback } from 'react';
import AnimatedPolyline from '@/components/AnimatedPolyline';
import { getDefaultRoute } from '@/lib/routeUtils';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { SEQUENCE_COLORS } from '@/constants/colors';
import type { Place, Journey } from '@/types/journey';

export interface MapRoutesProps {
  isAllInitialRoutesLoaded: boolean;
  places: Place[];
  activeJourney: Journey | null;
  directionsCache: any;
  alternativeSegment: any;
  hoveredAlternativeRoute: any;
  focusedSegment: any;
  setFocusBounds: (bounds: any) => void;
  setFocusedStep: (step: any) => void;
  setFocusedSegment: (segment: any) => void;
  delays: { pathDelays: Record<string, number>, markerDelays: Record<string, number> };
  focusedStep: any;
  isSearchMode: boolean;
  animationVersion: number;
  animatedSegmentsRef: React.MutableRefObject<Set<string>>;
}

export const MapRoutes = memo(function MapRoutes({
  isAllInitialRoutesLoaded,
  places,
  activeJourney,
  directionsCache,
  alternativeSegment,
  hoveredAlternativeRoute,
  focusedSegment,
  setFocusBounds,
  setFocusedStep,
  setFocusedSegment,
  delays,
  focusedStep,
  isSearchMode,
  animationVersion,
  animatedSegmentsRef,
}: MapRoutesProps) {
  const handlePolylineClick = useCallback((place: Place, nextPlace: Place, targetRoute: any) => {
    const bounds = calculateSegmentBounds(place, nextPlace, targetRoute);
    if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
      setFocusBounds({ ...bounds });
      setFocusedStep(null);
    } else {
      setFocusBounds(bounds);
      setFocusedSegment({ originId: place.id, destId: nextPlace.id });
      setFocusedStep(null);
    }
  }, [focusedSegment, setFocusBounds, setFocusedStep, setFocusedSegment]);

  if (!isAllInitialRoutesLoaded) return null;
  
  const activeSegment = focusedSegment || alternativeSegment;

  return (
    <>
      {places.map((place, idx) => {
        if (idx === places.length - 1) return null;
        const nextPlace = places[idx + 1];
        const transportType = activeJourney?.transport_type || 'public';
        const cacheKey = `${place.id}-${nextPlace.id}`;
        const segmentData = directionsCache[cacheKey];

        const defaultRoute = getDefaultRoute(place, nextPlace, segmentData, transportType as 'public' | 'car' | 'walk');

        if (!defaultRoute || !defaultRoute.steps) {
          return null;
        }

        const isAlternativeSegment = !!(alternativeSegment && alternativeSegment.originId === place.id && alternativeSegment.destId === nextPlace.id);
        const hasHoveredAlternative = isAlternativeSegment && !!hoveredAlternativeRoute;

        const routesToRender = [
          { route: defaultRoute, isHoveredRoute: false }
        ];

        if (hasHoveredAlternative && hoveredAlternativeRoute) {
          routesToRender.push({ route: hoveredAlternativeRoute, isHoveredRoute: true });
        }

        return routesToRender.map(({ route, isHoveredRoute }) => {
          const totalAnimDuration = isHoveredRoute ? 300 : 800;
          const totalDistance = route.steps.reduce((sum: number, s: any) => sum + (s.distance || 1), 0);

          let currentStepDelay = delays.pathDelays[`${place.id}-${nextPlace.id}`] ?? (idx * 800 + 400);
          if (isHoveredRoute) currentStepDelay = 0;

          return route.steps.map((step: any, sIdx: number) => {
            const stepPath = step.pathPoints || [];
            if (stepPath.length < 2) return null;

            const stepRatio = (step.distance || 1) / totalDistance;
            const stepDuration = Math.max(100, totalAnimDuration * stepRatio);
            const stepDelay = currentStepDelay;

            currentStepDelay += stepDuration;
            const pathPoints = stepPath;

            const hasFocusedStep = !!focusedStep;
            let isThisStepFocused = !!(
              focusedStep &&
              focusedStep.originId === place.id &&
              focusedStep.destId === nextPlace.id &&
              focusedStep.stepIndex === sIdx
            );

            if (
              focusedStep &&
              focusedStep.originId === place.id &&
              focusedStep.destId === nextPlace.id &&
              focusedStep.subType === 'dest' &&
              sIdx === route.steps.length - 1
            ) {
              isThisStepFocused = true;
            }

            const isSegmentFocused = activeSegment
              ? (activeSegment.originId === place.id && activeSegment.destId === nextPlace.id)
              : true;

            const isVisible = !(activeSegment && !isSegmentFocused) && (!hasHoveredAlternative || isHoveredRoute) && !isSearchMode;

            const baseZIndex = isThisStepFocused
              ? 15000
              : isSegmentFocused
                ? (activeSegment ? 5000 + sIdx : (100 - idx) * 10)
                : (100 - idx);

            const segmentColor = SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length];
            const strokeColor = segmentColor;

            let strokeOpacity = 0.8;
            let strokeWeight = 4.5;

            if (hasFocusedStep) {
              strokeOpacity = 0.95;
              strokeWeight = 7.0;
            } else if (activeSegment) {
              strokeOpacity = 0.95;
              strokeWeight = 6.5;
            } else {
              strokeOpacity = 0.8;
              strokeWeight = 4.5;
            }

            const keyPrefix = isHoveredRoute ? 'hovered-' : '';
            const isWalk = step.type === 'walk';

            if (isWalk) {
              let walkOpacity = 0.65;
              let walkWeight = 2.5;

              if (hasFocusedStep) {
                walkOpacity = 0.95;
                walkWeight = 5.0;
              } else if (activeSegment) {
                walkOpacity = 0.95;
                walkWeight = 4.5;
              }

              if (route.isEstimated) {
                const flatPath = (route.detailedPathPoints && route.detailedPathPoints.length >= 2)
                  ? route.detailedPathPoints
                  : pathPoints;

                const hasDetailed = !!(route.detailedPathPoints && route.detailedPathPoints.length >= 2);

                return (
                  <Fragment key={`estimated-polyline-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}`}>
                    {flatPath.length >= 2 && (
                      <AnimatedPolyline
                        path={flatPath}
                        delay={stepDelay}
                        duration={stepDuration}
                        skipAnimation={true}
                        resetKey={animationVersion}
                        strokeColor={hasDetailed ? "#3B82F6" : "#A1A1AA"}
                        strokeOpacity={hasDetailed ? 0.95 : 0.65}
                        strokeWeight={hasDetailed ? walkWeight + 1.5 : walkWeight}
                        strokeStyle={hasDetailed ? "solid" : "shortdash"}
                        strokeLineCap="round"
                        strokeLineJoin="round"
                        zIndex={baseZIndex + 3}
                        onClick={() => handlePolylineClick(place, nextPlace, route)}
                        visible={isVisible}
                      />
                    )}
                  </Fragment>
                );
              }

              return (
                <AnimatedPolyline
                  key={`polyline-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}`}
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  resetKey={animationVersion}
                  strokeColor={segmentColor}
                  strokeOpacity={walkOpacity}
                  strokeWeight={walkWeight}
                  strokeStyle="shortdash"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex}
                  onClick={() => handlePolylineClick(place, nextPlace, route)}
                  visible={isVisible}
                />
              );
            }

            return (
              <Fragment key={`polyline-group-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}`}>
                <AnimatedPolyline
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  resetKey={animationVersion}
                  strokeColor="#FFFFFF"
                  strokeOpacity={0.95}
                  strokeWeight={strokeWeight + 1.8}
                  strokeStyle="solid"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex}
                  onClick={() => handlePolylineClick(place, nextPlace, route)}
                  visible={isVisible}
                />
                <AnimatedPolyline
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  resetKey={animationVersion}
                  strokeColor={strokeColor}
                  strokeOpacity={strokeOpacity}
                  strokeWeight={strokeWeight}
                  strokeStyle="solid"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex + 1}
                  onClick={() => handlePolylineClick(place, nextPlace, route)}
                  visible={isVisible}
                />
                {sIdx === 0 && route.startWalkSection && route.startWalkSection.length >= 2 && (
                  <AnimatedPolyline
                    path={route.startWalkSection}
                    delay={stepDelay}
                    duration={300}
                    skipAnimation={true}
                    resetKey={animationVersion}
                    strokeColor={segmentColor}
                    strokeOpacity={0.8}
                    strokeWeight={3.5}
                    strokeStyle="shortdash"
                    strokeLineCap="round"
                    strokeLineJoin="round"
                    zIndex={baseZIndex + 2}
                    onClick={() => handlePolylineClick(place, nextPlace, route)}
                    visible={isVisible}
                  />
                )}
                {sIdx === route.steps.length - 1 && route.endWalkSection && route.endWalkSection.length >= 2 && (
                  <AnimatedPolyline
                    path={route.endWalkSection}
                    delay={stepDelay}
                    duration={300}
                    skipAnimation={true}
                    resetKey={animationVersion}
                    strokeColor={segmentColor}
                    strokeOpacity={0.8}
                    strokeWeight={3.5}
                    strokeStyle="shortdash"
                    strokeLineCap="round"
                    strokeLineJoin="round"
                    zIndex={baseZIndex + 2}
                    onClick={() => handlePolylineClick(place, nextPlace, route)}
                    visible={isVisible}
                  />
                )}
              </Fragment>
            );
          });
        });
      })}
    </>
  );
});
