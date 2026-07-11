import React, { Fragment, memo } from 'react';
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

        const handlePolylineClick = (targetRoute: any) => {
          const bounds = calculateSegmentBounds(place, nextPlace, targetRoute);
          if (focusedSegment && focusedSegment.originId === place.id && focusedSegment.destId === nextPlace.id) {
            setFocusBounds({ ...bounds });
            setFocusedStep(null);
          } else {
            setFocusBounds(bounds);
            setFocusedSegment({ originId: place.id, destId: nextPlace.id });
            setFocusedStep(null);
          }
        };

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

              return (
                <AnimatedPolyline
                  key={`polyline-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}-v${animationVersion}`}
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  strokeColor={segmentColor}
                  strokeOpacity={walkOpacity}
                  strokeWeight={walkWeight}
                  strokeStyle="shortdash"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex}
                  onClick={() => handlePolylineClick(route)}
                  visible={isVisible}
                />
              );
            }

            return (
              <Fragment key={`polyline-group-${keyPrefix}${place.id}-${nextPlace.id}-${sIdx}-v${animationVersion}`}>
                <AnimatedPolyline
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  strokeColor="#FFFFFF"
                  strokeOpacity={0.95}
                  strokeWeight={strokeWeight + 1.8}
                  strokeStyle="solid"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex}
                  onClick={() => handlePolylineClick(route)}
                  visible={isVisible}
                />
                <AnimatedPolyline
                  path={pathPoints}
                  delay={stepDelay}
                  duration={stepDuration}
                  skipAnimation={isHoveredRoute || animatedSegmentsRef.current.has(cacheKey)}
                  strokeColor={strokeColor}
                  strokeOpacity={strokeOpacity}
                  strokeWeight={strokeWeight}
                  strokeStyle="solid"
                  strokeLineCap="round"
                  strokeLineJoin="round"
                  zIndex={baseZIndex + 1}
                  onClick={() => handlePolylineClick(route)}
                  visible={isVisible}
                />
              </Fragment>
            );
          });
        });
      })}
    </>
  );
});
