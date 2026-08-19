'use client';

import React, { useMemo, useState, useEffect } from 'react';
import RouteGuidePanel from '@/features/route/RouteGuidePanel';
import AlternativeRoutePanel from '@/features/route/AlternativeRoutePanel';
import { SubwayLineMapPanel } from '@/features/route/SubwayLineMapPanel';
import { BusLineMapPanel } from '@/features/route/BusLineMapPanel';
import { useJourneyStore } from '@/stores/journey-store';
import { useMapState } from '@/features/map/useMapState';
import { useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { calculateSegmentBounds } from '@/lib/naverMapRouteService';
import { getDefaultRoute } from '@/lib/routeUtils';
import type { Place, SelectedRoute, DirectionResult } from '@/types/journey';

export function RoutePanels() {
  const {
    focusedSegment,
    setFocusedSegment,
    focusedStep,
    setFocusedStep,
    setFocusedPlaceId,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setFocusBounds,
    subwayLineMapTarget,
    setSubwayLineMapTarget,
    busLineMapTarget,
    setBusLineMapTarget,
    isSearchMode,
    isDrawerMaximized,
  } = useMapState();

  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney]);
  const directionsCache = useJourneyDirectionsCache(places);

  const activeRouteOfFocusedSegment = useMemo(() => {
    if (!focusedSegment) return null;
    const originPlace = places.find(p => String(p.id) === String(focusedSegment.originId));
    const destPlace = places.find(p => String(p.id) === String(focusedSegment.destId));
    if (!originPlace || !destPlace) return null;

    const cacheKey = `${focusedSegment.originId}-${focusedSegment.destId}`;
    const segmentData = directionsCache[cacheKey];
    const transportType = activeJourney?.transport_type || 'public';
    return getDefaultRoute(originPlace, destPlace, segmentData, transportType as 'public' | 'car' | 'walk');
  }, [focusedSegment, places, directionsCache, activeJourney]);

  const focusedPlaces = useMemo(() => {
    if (!focusedSegment) return null;
    const originPlace = places.find(p => String(p.id) === String(focusedSegment.originId));
    const destPlace = places.find(p => String(p.id) === String(focusedSegment.destId));
    if (!originPlace || !destPlace) return null;
    return { originPlace, destPlace };
  }, [focusedSegment, places]);

  const alternativePlaces = useMemo(() => {
    if (!alternativeSegment) return null;
    const originPlace = places.find(p => String(p.id) === String(alternativeSegment.originId));
    const destPlace = places.find(p => String(p.id) === String(alternativeSegment.destId));
    if (!originPlace || !destPlace) return null;
    return { originPlace, destPlace };
  }, [alternativeSegment, places]);

  const nextSegmentInfo = useMemo(() => {
    if (!focusedSegment || !activeJourney) return null;
    const destIndex = places.findIndex(p => String(p.id) === String(focusedSegment.destId));
    if (destIndex < 0 || destIndex >= places.length - 1) return null;
    const nextOriginPlace = places[destIndex];
    const nextDestPlace = places[destIndex + 1];
    return { nextOriginPlace, nextDestPlace };
  }, [focusedSegment, activeJourney, places]);

  const prevSegmentInfo = useMemo(() => {
    if (!focusedSegment || !activeJourney) return null;
    const originIndex = places.findIndex(p => String(p.id) === String(focusedSegment.originId));
    if (originIndex <= 0) return null;
    const prevOriginPlace = places[originIndex - 1];
    const prevDestPlace = places[originIndex];
    return { prevOriginPlace, prevDestPlace };
  }, [focusedSegment, activeJourney, places]);

  const [cachedRouteGuide, setCachedRouteGuide] = useState<{
    route: SelectedRoute | DirectionResult;
    originPlace: Place;
    destPlace: Place;
    nextDestPlace?: Place;
    nextSegmentInfo: typeof nextSegmentInfo;
    prevSegmentInfo: typeof prevSegmentInfo;
  } | null>(null);

  const [cachedAlternative, setCachedAlternative] = useState<{
    originPlace: Place;
    destPlace: Place;
  } | null>(null);

  const showRouteGuide = !!(activeRouteOfFocusedSegment && focusedPlaces && !alternativePlaces);
  const showAlternative = !!alternativePlaces;

  // Sync cachedAlternative immediately during render if alternativePlaces exists
  if (showAlternative && alternativePlaces && (!cachedAlternative || cachedAlternative.originPlace.id !== alternativePlaces.originPlace.id || cachedAlternative.destPlace.id !== alternativePlaces.destPlace.id)) {
    setCachedAlternative({
      originPlace: alternativePlaces.originPlace,
      destPlace: alternativePlaces.destPlace,
    });
  }

  useEffect(() => {
    if (showRouteGuide && activeRouteOfFocusedSegment && focusedPlaces) {
      setCachedRouteGuide({
        route: activeRouteOfFocusedSegment,
        originPlace: focusedPlaces.originPlace,
        destPlace: focusedPlaces.destPlace,
        nextDestPlace: nextSegmentInfo?.nextDestPlace || undefined,
        nextSegmentInfo,
        prevSegmentInfo,
      });
    }
  }, [showRouteGuide, activeRouteOfFocusedSegment, focusedPlaces, nextSegmentInfo, prevSegmentInfo]);

  useEffect(() => {
    if (showAlternative && alternativePlaces) {
      setCachedAlternative({
        originPlace: alternativePlaces.originPlace,
        destPlace: alternativePlaces.destPlace,
      });
    }
  }, [showAlternative, alternativePlaces]);

  const [cachedSubwayTarget, setCachedSubwayTarget] = useState<typeof subwayLineMapTarget>(null);
  const showSubwayLineMap = !!subwayLineMapTarget;

  useEffect(() => {
    if (showSubwayLineMap && subwayLineMapTarget) {
      setCachedSubwayTarget(subwayLineMapTarget);
    }
  }, [showSubwayLineMap, subwayLineMapTarget]);

  const [cachedBusTarget, setCachedBusTarget] = useState<typeof busLineMapTarget>(null);
  const showBusLineMap = !!busLineMapTarget;

  useEffect(() => {
    if (showBusLineMap && busLineMapTarget) {
      setCachedBusTarget(busLineMapTarget);
    }
  }, [showBusLineMap, busLineMapTarget]);

  return (
    <>
      {/* 지하철 실시간 노선도 패널 */}
      {(subwayLineMapTarget || cachedSubwayTarget) && (
        <SubwayLineMapPanel
          isOpen={showSubwayLineMap && !isSearchMode}
          target={(subwayLineMapTarget || cachedSubwayTarget)!}
          onClose={() => setSubwayLineMapTarget(null)}
          onExited={() => {
            if (!showSubwayLineMap) {
              setCachedSubwayTarget(null);
            }
          }}
        />
      )}

      {/* 버스 실시간 노선도 패널 */}
      {(busLineMapTarget || cachedBusTarget) && (
        <BusLineMapPanel
          isOpen={showBusLineMap && !isSearchMode}
          target={(busLineMapTarget || cachedBusTarget)!}
          onClose={() => setBusLineMapTarget(null)}
          onExited={() => {
            if (!showBusLineMap) {
              setCachedBusTarget(null);
            }
          }}
        />
      )}

      {/* 길안내 패널 */}
      {cachedRouteGuide && (
        <RouteGuidePanel
          isOpen={showRouteGuide && !isSearchMode && !isDrawerMaximized && !showSubwayLineMap && !showBusLineMap}
          originPlace={cachedRouteGuide.originPlace}
          destPlace={cachedRouteGuide.destPlace}
          route={cachedRouteGuide.route}
          onClose={() => {
            setFocusedSegment(null);
            setFocusBounds(null);
            setFocusedStep(null);
            setFocusedPlaceId(null);
            setAlternativeSegment(null);
          }}
          onNextSegment={cachedRouteGuide.nextSegmentInfo ? (jumpToDest?: boolean) => {
            const { nextOriginPlace, nextDestPlace } = cachedRouteGuide.nextSegmentInfo!;
            const cacheKey = `${nextOriginPlace.id}-${nextDestPlace.id}`;
            const segmentData = directionsCache[cacheKey];
            const transportType = activeJourney?.transport_type || 'public';
            const nextRoute = getDefaultRoute(nextOriginPlace, nextDestPlace, segmentData, transportType as 'public' | 'car' | 'walk');
            setFocusedSegment({ originId: nextOriginPlace.id, destId: nextDestPlace.id });

            if (jumpToDest && nextRoute && nextRoute.steps) {
              const lastIdx = nextRoute.steps.length - 1;
              const lastStep = nextRoute.steps[lastIdx];
              let subType: 'start' | 'end' | 'dest' | undefined = undefined;
              if (lastStep.type !== 'walk' && lastStep.endName) {
                subType = 'end';
              }

              setFocusedStep({
                originId: nextOriginPlace.id,
                destId: nextDestPlace.id,
                stepIndex: lastIdx,
                subType
              });
              setFocusBounds({
                sw: { lat: nextDestPlace.lat, lng: nextDestPlace.lng },
                ne: { lat: nextDestPlace.lat, lng: nextDestPlace.lng }
              });
            } else {
              setFocusedStep(null);
              const bounds = calculateSegmentBounds(nextOriginPlace, nextDestPlace, nextRoute);
              setFocusBounds(bounds);
            }
          } : undefined}
          onPrevSegment={cachedRouteGuide.prevSegmentInfo ? (jumpToDest?: boolean) => {
            const { prevOriginPlace, prevDestPlace } = cachedRouteGuide.prevSegmentInfo!;
            const cacheKey = `${prevOriginPlace.id}-${prevDestPlace.id}`;
            const segmentData = directionsCache[cacheKey];
            const transportType = activeJourney?.transport_type || 'public';
            const prevRoute = getDefaultRoute(prevOriginPlace, prevDestPlace, segmentData, transportType as 'public' | 'car' | 'walk');
            setFocusedSegment({ originId: prevOriginPlace.id, destId: prevDestPlace.id });

            if (jumpToDest && prevRoute && prevRoute.steps) {
              const lastIdx = prevRoute.steps.length - 1;
              const lastStep = prevRoute.steps[lastIdx];
              let subType: 'start' | 'end' | 'dest' | undefined = undefined;
              if (lastStep.type === 'car' || lastStep.type === 'taxi') {
                subType = 'dest';
              } else if (lastStep.type === 'walk' || (!lastStep.startName && !lastStep.endName)) {
                subType = 'end';
              } else if (lastStep.endName) {
                subType = 'end';
              } else if (lastStep.startName) {
                subType = 'start';
              }

              setFocusedStep({
                originId: prevOriginPlace.id,
                destId: prevDestPlace.id,
                stepIndex: lastIdx,
                subType
              });
              setFocusBounds({
                sw: { lat: prevDestPlace.lat, lng: prevDestPlace.lng },
                ne: { lat: prevDestPlace.lat, lng: prevDestPlace.lng }
              });
            } else {
              setFocusedStep(null);
              const bounds = calculateSegmentBounds(prevOriginPlace, prevDestPlace, prevRoute);
              setFocusBounds(bounds);
            }
          } : undefined}
          nextDestPlace={cachedRouteGuide.nextDestPlace}
          onExited={() => {
            if (!showRouteGuide) {
              setCachedRouteGuide(null);
            }
          }}
        />
      )}

      {/* 대안 경로 패널 */}
      {(alternativePlaces || cachedAlternative) && (
        <AlternativeRoutePanel
          isOpen={showAlternative && !isSearchMode && !showSubwayLineMap && !showBusLineMap}
          originPlace={(alternativePlaces || cachedAlternative)!.originPlace}
          destPlace={(alternativePlaces || cachedAlternative)!.destPlace}
          onClose={(isCancel?: boolean) => {
            const currentAlt = alternativePlaces || cachedAlternative;
            setAlternativeSegment(null);

            if (isAlternativeFromFocus && currentAlt) {
              setFocusedSegment({
                originId: currentAlt.originPlace.id,
                destId: currentAlt.destPlace.id
              });

              if (isCancel) {
                const cacheKey = `${currentAlt.originPlace.id}-${currentAlt.destPlace.id}`;
                const segmentData = directionsCache[cacheKey];
                const transportType = activeJourney?.transport_type || 'public';
                const defaultRoute = getDefaultRoute(currentAlt.originPlace, currentAlt.destPlace, segmentData, transportType as 'public' | 'car' | 'walk');

                if (defaultRoute) {
                  const bounds = calculateSegmentBounds(currentAlt.originPlace, currentAlt.destPlace, defaultRoute);
                  setFocusBounds(bounds);
                }
              }
            } else {
              setFocusBounds(null);
            }
          }}
          onExited={() => {
            if (!showAlternative) {
              setCachedAlternative(null);
            }
          }}
        />
      )}
    </>
  );
}
