"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { useQueryClient } from '@tanstack/react-query';
import { directionKeys, useJourneyDirectionsCache } from '@/hooks/queries/useDirections';
import { getDefaultRoute } from '@/lib/utils/routeUtils';
import { calculateSegmentBounds } from '@/lib/services/naverMapRouteService';
import type { Journey, Place, DirectionResult, SelectedRoute, BaseRouteData } from '@/types/journey';
import { Plus } from 'lucide-react';
import { MAX_JOURNEY_PLACES, MAX_JOURNEY_PLACES_ALERT } from '@/constants/journey';
import { useDialog } from '@/providers/DialogProvider';
import { motion, useDragControls, useMotionValue, animate, type PanInfo } from 'framer-motion';

import SegmentRealtimeArrivalHero from '@/components/transit/SegmentRealtimeArrivalHero';
import HorizontalTransitRouteStepLine from '@/components/route/HorizontalTransitRouteStepLine';

// 서브 컴포넌트
import { TimelineHeader } from './timeline/TimelineHeader';
import { FocusedTimelineHeader } from './timeline/FocusedTimelineHeader';
import { TimelineSummaryBar } from './timeline/TimelineSummaryBar';
import { HorizontalTimelinePlaceNode } from './timeline/HorizontalTimelinePlaceNode';
import { HorizontalTimelineSegmentBadge } from './timeline/HorizontalTimelineSegmentBadge';
import { FocusedStepControlBar } from './timeline/FocusedStepControlBar';

interface FixedJourneyTimelineSheetProps {
  activeJourney: Journey;
  setIsEditModalOpen: (isOpen: boolean) => void;
}

export default function FixedJourneyTimelineSheet({
  activeJourney,
  setIsEditModalOpen,
}: FixedJourneyTimelineSheetProps) {
  const { alert } = useDialog();
  const queryClient = useQueryClient();
  const {
    journeys,
    clearJourney,
    focusedStep,
    setFocusedStep,
    focusedSegment,
    setFocusedSegment,
    focusedPlaceId,
    setFocusedPlaceId,
    setFocusBounds,
    isSyncing,
    alternativeSegment,
    setAlternativeSegment,
    isAlternativeFromFocus,
    setIsAlternativeFromFocus,
    setActiveJourney,
    isEditMode,
    setEditMode,
    setDrawerSnapPoint,
    openSearchMode,
    isCacheRestored,
    setTargetChangePlaceId,
    departureTime,
    subwayLineMapTarget,
    busLineMapTarget,
  } = useJourneyStore(
    useShallow((state) => ({
      journeys: state.journeys,
      clearJourney: state.clearJourney,
      focusedStep: state.focusedStep,
      setFocusedStep: state.setFocusedStep,
      focusedSegment: state.focusedSegment,
      setFocusedSegment: state.setFocusedSegment,
      focusedPlaceId: state.focusedPlaceId,
      setFocusedPlaceId: state.setFocusedPlaceId,
      setFocusBounds: state.setFocusBounds,
      isSyncing: state.isSyncing,
      alternativeSegment: state.alternativeSegment,
      setAlternativeSegment: state.setAlternativeSegment,
      isAlternativeFromFocus: state.isAlternativeFromFocus,
      setIsAlternativeFromFocus: state.setIsAlternativeFromFocus,
      setActiveJourney: state.setActiveJourney,
      isEditMode: state.isEditMode,
      setEditMode: state.setEditMode,
      setDrawerSnapPoint: state.setDrawerSnapPoint,
      openSearchMode: state.openSearchMode,
      isCacheRestored: state.isCacheRestored,
      setTargetChangePlaceId: state.setTargetChangePlaceId,
      departureTime: state.departureTime,
      subwayLineMapTarget: state.subwayLineMapTarget,
      busLineMapTarget: state.busLineMapTarget,
    }))
  );

  const isLineMapOpen = Boolean(subwayLineMapTarget || busLineMapTarget);

  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const addPlaceRef = useRef<HTMLDivElement>(null);

  const [fullHeight, setFullHeight] = useState(0);
  const [addButtonHeight, setAddButtonHeight] = useState(86);

  useEffect(() => {
    const container = containerRef.current;
    const addPlace = addPlaceRef.current;
    if (!container || !addPlace) return;

    const observer = new ResizeObserver(() => {
      setFullHeight(container.offsetHeight);
      setAddButtonHeight(addPlace.offsetHeight);
    });

    observer.observe(container);
    observer.observe(addPlace);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const isHidden = !!alternativeSegment || isLineMapOpen;
    const targetY = isHidden
      ? (fullHeight > 0 ? fullHeight + 50 : 500)
      : 0;

    const controls = animate(y, targetY, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
    return () => controls.stop();
  }, [addButtonHeight, y, alternativeSegment, isLineMapOpen, fullHeight]);

  useEffect(() => {
    if (fullHeight > 0) {
      setDrawerSnapPoint(fullHeight);
    }
  }, [fullHeight, setDrawerSnapPoint]);

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleBindCardRef = (key: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  };

  const scrollToElement = (key: string) => {
    requestAnimationFrame(() => {
      const container = timelineContainerRef.current;
      const targetEl = cardRefs.current.get(key);
      if (container && targetEl) {
        const itemWrapper = (targetEl.closest('.shrink-0') as HTMLElement) || targetEl;
        const containerLeft = container.getBoundingClientRect().left;
        const itemLeft = itemWrapper.getBoundingClientRect().left;
        const relativeLeft = itemLeft - containerLeft;
        const newScrollLeft = container.scrollLeft + relativeLeft - 20;
        container.scrollTo({
          left: Math.max(0, newScrollLeft),
          behavior: 'smooth',
        });
      }
    });
  };

  useEffect(() => {
    if (!focusedSegment && !focusedStep) {
      setIsGlobalPlaying(false);
    }
  }, [focusedSegment, focusedStep]);

  useEffect(() => {
    if (focusedSegment) {
      const key = `segment-${focusedSegment.originId}-${focusedSegment.destId}`;
      scrollToElement(key);
    }
  }, [focusedSegment]);

  const places = activeJourney?.places || [];
  const directionsCache = useJourneyDirectionsCache(places);
  const transportType = activeJourney.transport_type || 'public';

  const isPlaying = isGlobalPlaying && (!!focusedSegment || !!focusedStep);
  const activeIndex = journeys.findIndex(j => j.id === activeJourney.id);
  const prevJourney = activeIndex > 0 ? journeys[activeIndex - 1] : null;
  const nextJourney = activeIndex >= 0 && activeIndex < journeys.length - 1 ? journeys[activeIndex + 1] : null;

  // 세그먼트 포커스 상태 및 네비게이션 계산
  const isFocusedMode = !!(focusedSegment && !alternativeSegment);

  const focusedOrigin = useMemo(() => {
    if (!focusedSegment) return null;
    return places.find(p => String(p.id) === String(focusedSegment.originId)) || null;
  }, [focusedSegment, places]);

  const focusedDest = useMemo(() => {
    if (!focusedSegment) return null;
    return places.find(p => String(p.id) === String(focusedSegment.destId)) || null;
  }, [focusedSegment, places]);

  const focusedIndex = useMemo(() => {
    if (!focusedOrigin || !focusedDest) return -1;
    return places.findIndex(p => String(p.id) === String(focusedOrigin.id));
  }, [focusedOrigin, focusedDest, places]);

  const hasPrevSegment = focusedIndex > 0;
  const hasNextSegment = focusedIndex >= 0 && focusedIndex < places.length - 2;

  const handlePrevSegment = () => {
    if (!hasPrevSegment) return;
    const prevOrigin = places[focusedIndex - 1];
    const prevDest = places[focusedIndex];
    if (!prevOrigin || !prevDest) return;
    const cacheKey = `${prevOrigin.id}-${prevDest.id}`;
    const segmentData = directionsCache[cacheKey];
    const route = getDefaultRoute(prevOrigin, prevDest, segmentData, transportType as 'public' | 'car' | 'walk');
    setFocusedSegment({ originId: prevOrigin.id, destId: prevDest.id });
    setFocusedStep(null);
    setFocusedPlaceId(null);
    if (route) {
      const bounds = calculateSegmentBounds(prevOrigin, prevDest, route);
      setFocusBounds(bounds);
    }
  };

  const handleNextSegment = () => {
    if (!hasNextSegment) return;
    const nextOrigin = places[focusedIndex + 1];
    const nextDest = places[focusedIndex + 2];
    if (!nextOrigin || !nextDest) return;
    const cacheKey = `${nextOrigin.id}-${nextDest.id}`;
    const segmentData = directionsCache[cacheKey];
    const route = getDefaultRoute(nextOrigin, nextDest, segmentData, transportType as 'public' | 'car' | 'walk');
    setFocusedSegment({ originId: nextOrigin.id, destId: nextDest.id });
    setFocusedStep(null);
    setFocusedPlaceId(null);
    if (route) {
      const bounds = calculateSegmentBounds(nextOrigin, nextDest, route);
      setFocusBounds(bounds);
    }
  };

  const handleExitFocus = () => {
    setFocusedSegment(null);
    setFocusedStep(null);
    setFocusedPlaceId(null);
    setFocusBounds(null);
    setAlternativeSegment(null);
  };

  const activeFocusedRoute = useMemo(() => {
    if (!focusedOrigin || !focusedDest) return null;
    let r: SelectedRoute | DirectionResult | null = focusedOrigin.selected_route && focusedOrigin.selected_route.destId === focusedDest.id ? focusedOrigin.selected_route : null;
    if (!r) {
      const cacheKey = `${focusedOrigin.id}-${focusedDest.id}`;
      const segmentData = directionsCache[cacheKey];
      r = getDefaultRoute(focusedOrigin, focusedDest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
    }
    return r;
  }, [focusedOrigin, focusedDest, directionsCache, transportType]);

  // 세그먼트 내 스텝 목록 및 재생 제어
  const segmentSteps = useMemo(() => {
    return activeFocusedRoute?.steps || [];
  }, [activeFocusedRoute]);

  const currentStepIdx = useMemo(() => {
    if (!focusedStep || !focusedOrigin || !focusedDest) return -1;
    if (focusedStep.originId !== focusedOrigin.id || focusedStep.destId !== focusedDest.id) return -1;
    return typeof focusedStep.stepIndex === 'number' ? focusedStep.stepIndex : -1;
  }, [focusedStep, focusedOrigin, focusedDest]);

  const totalStepsCount = segmentSteps.length;
  const isStepPlaying = currentStepIdx >= 0;
  const isAtStepEnd = currentStepIdx >= totalStepsCount - 1;
  const showStepPlayIcon = !isStepPlaying || isAtStepEnd;
  const stepProgressPercent = totalStepsCount > 0 && currentStepIdx >= 0 ? ((currentStepIdx + 1) / totalStepsCount) * 100 : 0;

  const handlePrevStep = () => {
    if (segmentSteps.length === 0 || !focusedOrigin || !focusedDest) return;
    if (currentStepIdx > 0) {
      const prevIdx = currentStepIdx - 1;
      const step = segmentSteps[prevIdx];
      setFocusedStep({
        originId: focusedOrigin.id,
        destId: focusedDest.id,
        stepIndex: prevIdx,
      });
      if (step?.startLat && step?.startLng) {
        setFocusBounds({
          sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
          ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
        });
      }
    } else if (currentStepIdx === 0 && hasPrevSegment) {
      handlePrevSegment();
    }
  };

  const handleNextStep = () => {
    if (segmentSteps.length === 0 || !focusedOrigin || !focusedDest) return;
    if (currentStepIdx === -1) {
      const step = segmentSteps[0];
      setFocusedStep({
        originId: focusedOrigin.id,
        destId: focusedDest.id,
        stepIndex: 0,
      });
      if (step?.startLat && step?.startLng) {
        setFocusBounds({
          sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
          ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
        });
      }
    } else if (currentStepIdx < totalStepsCount - 1) {
      const nextIdx = currentStepIdx + 1;
      const step = segmentSteps[nextIdx];
      setFocusedStep({
        originId: focusedOrigin.id,
        destId: focusedDest.id,
        stepIndex: nextIdx,
      });
      if (step?.startLat && step?.startLng) {
        setFocusBounds({
          sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
          ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
        });
      }
    } else if (currentStepIdx === totalStepsCount - 1 && hasNextSegment) {
      handleNextSegment();
    }
  };

  const handlePlayStepToggle = () => {
    if (segmentSteps.length === 0 || !focusedOrigin || !focusedDest) return;
    if (isStepPlaying && !isAtStepEnd) {
      setFocusedStep(null);
      if (activeFocusedRoute) {
        const bounds = calculateSegmentBounds(focusedOrigin, focusedDest, activeFocusedRoute);
        setFocusBounds(bounds);
      }
    } else {
      const targetIdx = currentStepIdx >= 0 && !isAtStepEnd ? currentStepIdx : 0;
      const step = segmentSteps[targetIdx];
      setFocusedStep({
        originId: focusedOrigin.id,
        destId: focusedDest.id,
        stepIndex: targetIdx,
      });
      if (step?.startLat && step?.startLng) {
        setFocusBounds({
          sw: { lat: step.startLat - 0.002, lng: step.startLng - 0.002 },
          ne: { lat: step.startLat + 0.002, lng: step.startLng + 0.002 },
        });
      }
    }
  };

  // 총 소요 시간, 총 이동 거리, 총 비용 계산
  let totalDistanceKm = 0;
  let totalDurationMin = 0;
  let totalFareSum = 0;
  let hasFare = false;
  let isAnySegmentLoading = false;

  if (places && places.length > 1) {
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      if (!origin || !dest) continue;

      let route: SelectedRoute | DirectionResult | null = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
      if (!route) {
        const cacheKey = `${origin.id}-${dest.id}`;
        const cachedData = directionsCache[cacheKey];

        const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
        const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id, departureTime));
        const publicData = cachedData ? { public: cachedData.public } : queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
        const carData = cachedData ? { car: cachedData.car, walk: cachedData.walk } : queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[] }>(directionKeys.segmentCar(origin.id, dest.id, departureTime));

        const hasData = (cachedData && (cachedData.public.length > 0 || cachedData.car.length > 0 || cachedData.walk.length > 0)) || !!publicData || !!carData;

        const isSegLoading = !isCacheRestored || (
          !hasData &&
          (!publicQueryState || publicQueryState.status === 'pending' ||
            !carQueryState || carQueryState.status === 'pending')
        );

        if (isSegLoading) {
          isAnySegmentLoading = true;
        }

        const segmentData = cachedData || {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || []
        };
        route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
      }

      if (route) {
        if (typeof route.distance === 'number') totalDistanceKm += route.distance;
        if (typeof route.duration === 'number') totalDurationMin += route.duration;
        const fareVal = route.fare || route.taxiFare;
        if (fareVal) {
          totalFareSum += fareVal;
          hasFare = true;
        }
      }
    }
  }

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsGlobalPlaying(false);
      setFocusedStep(null);
      setFocusedSegment(null);
      setFocusedPlaceId(null);
      setAlternativeSegment(null);
      setFocusBounds(null);
    } else {
      setIsGlobalPlaying(true);
      if (!focusedSegment && !focusedStep && places.length >= 2) {
        const firstPlace = places[0];
        const secondPlace = places[1];

        const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(firstPlace.id, secondPlace.id, departureTime));
        const carData = queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[] }>(directionKeys.segmentCar(firstPlace.id, secondPlace.id, departureTime));
        const segmentData = {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || []
        };
        const activeRoute = getDefaultRoute(firstPlace, secondPlace, segmentData, transportType as 'public' | 'car' | 'walk');

        if (activeRoute) {
          setFocusedSegment({ originId: firstPlace.id, destId: secondPlace.id });
          setFocusedStep(null);
          setFocusedPlaceId(null);
          const bounds = calculateSegmentBounds(firstPlace, secondPlace, activeRoute);
          setFocusBounds(bounds);
        }
      }
    }
  };

  const handleAddPlaceClick = async () => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setFocusedPlaceId(null);
    setAlternativeSegment(null);
    setFocusBounds(null);

    if (places.length >= MAX_JOURNEY_PLACES) {
      await alert(MAX_JOURNEY_PLACES_ALERT);
      return;
    }

    openSearchMode();
  };

  const handlePlaceClick = (place: Place) => {
    setFocusedStep(null);
    setFocusedSegment(null);
    setAlternativeSegment(null);

    if (focusedPlaceId === place.id) {
      setFocusedPlaceId(null);
      setFocusBounds(null);
    } else {
      setFocusedPlaceId(place.id);
      setFocusBounds({
        sw: { lat: place.lat - 0.003, lng: place.lng - 0.003 },
        ne: { lat: place.lat + 0.003, lng: place.lng + 0.003 },
      });
      scrollToElement(`place-${place.id}`);
    }
  };

  const handleSegmentClick = (origin: Place, dest: Place, route: BaseRouteData | null) => {
    setFocusedStep(null);
    setFocusedSegment({ originId: origin.id, destId: dest.id });
    setFocusedPlaceId(null);
    setAlternativeSegment(null);
    if (route) {
      const bounds = calculateSegmentBounds(origin, dest, route);
      setFocusBounds(bounds);
    }
    scrollToElement(`segment-${origin.id}-${dest.id}`);
  };

  const handleToggleAlternative = (origin: Place, dest: Place, route: BaseRouteData | null) => {
    const isCurrentlyOpen = alternativeSegment?.originId === origin.id && alternativeSegment?.destId === dest.id;

    if (!isCurrentlyOpen) {
      const wasFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;
      setIsAlternativeFromFocus(wasFocused);
      setAlternativeSegment({ originId: origin.id, destId: dest.id });
      if (route) {
        const bounds = calculateSegmentBounds(origin, dest, route);
        setFocusBounds(bounds);
      }
    } else {
      setAlternativeSegment(null);
      if (isAlternativeFromFocus) {
        setFocusedSegment({ originId: origin.id, destId: dest.id });
        if (route) {
          const bounds = calculateSegmentBounds(origin, dest, route);
          setFocusBounds(bounds);
        }
      } else {
        setFocusBounds(null);
      }
    }
  };

  const getSegmentInfo = (origin?: Place, dest?: Place) => {
    if (!origin || !dest) return { type: transportType, isFocused: false };
    let route: SelectedRoute | DirectionResult | null = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
    if (!route) {
      const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carData = queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[] }>(directionKeys.segmentCar(origin.id, dest.id, departureTime));
      const segmentData = {
        public: publicData?.public || [],
        car: carData?.car || [],
        walk: carData?.walk || []
      };
      route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
    }
    const type = route?.type || transportType;
    const isFocused = focusedSegment?.originId === origin.id && focusedSegment?.destId === dest.id;
    return { type, isFocused };
  };

  const getSegmentRoute = (origin: Place, dest: Place) => {
    let route: SelectedRoute | DirectionResult | null = origin.selected_route && origin.selected_route.destId === dest.id ? origin.selected_route : null;
    let isSegLoading = false;

    if (!route) {
      const cacheKey = `${origin.id}-${dest.id}`;
      const cachedData = directionsCache[cacheKey];

      const publicQueryState = queryClient.getQueryState(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carQueryState = queryClient.getQueryState(directionKeys.segmentCar(origin.id, dest.id, departureTime));
      const publicData = cachedData ? { public: cachedData.public } : queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(origin.id, dest.id, departureTime));
      const carData = cachedData ? { car: cachedData.car, walk: cachedData.walk } : queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[] }>(directionKeys.segmentCar(origin.id, dest.id, departureTime));

      const hasData = (cachedData && (cachedData.public.length > 0 || cachedData.car.length > 0 || cachedData.walk.length > 0)) || !!publicData || !!carData;

      isSegLoading = !isCacheRestored || (
        !hasData &&
        (!publicQueryState || publicQueryState.status === 'pending' ||
          !carQueryState || carQueryState.status === 'pending')
      );

      const segmentData = cachedData || {
        public: publicData?.public || [],
        car: carData?.car || [],
        walk: carData?.walk || []
      };
      route = getDefaultRoute(origin, dest, segmentData, transportType as 'public' | 'car' | 'walk') || null;
    }

    return { route, isSegLoading };
  };

  return (
    <motion.div
      ref={containerRef}
      drag={false}
      dragControls={dragControls}
      dragListener={false}
      dragElastic={0}
      dragConstraints={{
        top: 0,
        bottom: addButtonHeight
      }}
      style={{
        y,
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        borderTopLeftRadius: '24px',
        borderTopRightRadius: '24px',
        pointerEvents: (alternativeSegment || isLineMapOpen) ? 'none' : 'auto',
      }}
      className="md:hidden pointer-events-auto bg-white/95 text-zinc-900 backdrop-blur-xl border-t border-zinc-200/90 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] flex flex-col"
    >
      {/* 플로팅 버튼 타겟 (바텀시트 상단 바로 위에 위치) */}
      <div
        id="mobile-map-buttons-target"
        className="absolute bottom-[100%] right-4 mb-4 flex flex-col gap-3 z-[2000] pointer-events-none *:pointer-events-auto"
      />

      {/* 1. 슬림 상단 컨트롤 헤더 */}
      {isFocusedMode && focusedOrigin && focusedDest ? (
        <FocusedTimelineHeader
          focusedOrigin={focusedOrigin}
          focusedDest={focusedDest}
          hasPrevSegment={hasPrevSegment}
          hasNextSegment={hasNextSegment}
          onExitFocus={handleExitFocus}
          onPrevSegment={handlePrevSegment}
          onNextSegment={handleNextSegment}
        />
      ) : (
        <TimelineHeader
          activeJourney={activeJourney}
          isEditMode={isEditMode}
          isSyncing={isSyncing}
          onBackOrCancel={() => {
            if (isEditMode) {
              setEditMode(false);
            } else {
              clearJourney();
            }
          }}
          onOpenEditModal={() => setIsEditModalOpen(true)}
          onToggleEditMode={() => {
            setEditMode(!isEditMode);
            if (!isEditMode) setDrawerSnapPoint(1);
          }}
        />
      )}

      {/* 2. 헤더 바 (재생 플레이어 & 요약 정보 / 실시간 영웅 카드) */}
      {isFocusedMode ? (
        <SegmentRealtimeArrivalHero
          route={activeFocusedRoute}
          originPlace={focusedOrigin}
          destPlace={focusedDest}
        />
      ) : (
        <TimelineSummaryBar
          placesCount={places.length}
          totalDurationMin={totalDurationMin}
          totalFareSum={totalFareSum}
          hasFare={hasFare}
          isAnySegmentLoading={isAnySegmentLoading}
          isEditMode={isEditMode}
          isPlaying={isPlaying}
          prevJourney={prevJourney}
          nextJourney={nextJourney}
          onPlayToggle={handlePlayToggle}
          onSelectPrevJourney={() => {
            if (prevJourney) {
              setFocusedStep(null);
              setFocusedSegment(null);
              setAlternativeSegment(null);
              setFocusBounds(null);
              setActiveJourney(prevJourney);
            }
          }}
          onSelectNextJourney={() => {
            if (nextJourney) {
              setFocusedStep(null);
              setFocusedSegment(null);
              setAlternativeSegment(null);
              setFocusBounds(null);
              setActiveJourney(nextJourney);
            }
          }}
        />
      )}

      {/* 3. 중단 노선 타임라인 바 */}
      {isFocusedMode && focusedOrigin && focusedDest ? (
        <HorizontalTransitRouteStepLine
          route={activeFocusedRoute}
          originPlace={focusedOrigin}
          destPlace={focusedDest}
        />
      ) : (
        <div
          ref={timelineContainerRef}
          className="w-full px-5 py-2 flex items-center overflow-x-auto scrollbar-none shrink-0"
        >
          {places.map((place, idx) => {
            const prevInfo = idx > 0 ? getSegmentInfo(places[idx - 1], place) : undefined;
            const nextInfo = idx < places.length - 1 ? getSegmentInfo(place, places[idx + 1]) : undefined;
            const isSegmentAlternativeOpen = idx < places.length - 1 && alternativeSegment?.originId === place.id && alternativeSegment?.destId === places[idx + 1].id;
            const isSegmentFocused = idx < places.length - 1 && focusedSegment?.originId === place.id && focusedSegment?.destId === places[idx + 1].id;
            const segData = idx < places.length - 1 ? getSegmentRoute(place, places[idx + 1]) : null;

            return (
              <div key={place.id} className="flex items-center shrink-0">
                <HorizontalTimelinePlaceNode
                  place={place}
                  index={idx}
                  totalPlaces={places.length}
                  focusedPlaceId={focusedPlaceId}
                  prevSegmentType={prevInfo?.type}
                  prevSegmentIsFocused={prevInfo?.isFocused}
                  nextSegmentType={nextInfo?.type}
                  nextSegmentIsFocused={nextInfo?.isFocused}
                  onPlaceClick={handlePlaceClick}
                  onChangePlaceClick={(placeId) => {
                    setTargetChangePlaceId(placeId);
                    openSearchMode();
                  }}
                  onBindRef={handleBindCardRef}
                />

                {idx < places.length - 1 && segData && (
                  <HorizontalTimelineSegmentBadge
                    origin={place}
                    dest={places[idx + 1]}
                    segmentIndex={idx}
                    route={segData.route}
                    isLoading={segData.isSegLoading}
                    transportType={transportType}
                    isFocused={isSegmentFocused}
                    isAlternativeOpen={Boolean(isSegmentAlternativeOpen)}
                    onSegmentClick={handleSegmentClick}
                    onToggleAlternative={handleToggleAlternative}
                    onBindRef={handleBindCardRef}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. 최하단 액션 영역 (isFocusedMode: 재생 컨트롤 바 / 일반 모드: 장소 추가 버튼) */}
      <div
        ref={addPlaceRef}
        className="w-full px-4 pt-1.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shrink-0"
      >
        {isFocusedMode ? (
          <FocusedStepControlBar
            focusedOrigin={focusedOrigin}
            focusedDest={focusedDest}
            currentStepIdx={currentStepIdx}
            totalStepsCount={totalStepsCount}
            hasPrevSegment={hasPrevSegment}
            hasNextSegment={hasNextSegment}
            showStepPlayIcon={showStepPlayIcon}
            stepProgressPercent={stepProgressPercent}
            onPrevStep={handlePrevStep}
            onNextStep={handleNextStep}
            onPlayStepToggle={handlePlayStepToggle}
          />
        ) : (
          <button
            type="button"
            onClick={handleAddPlaceClick}
            className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-900 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex justify-center items-center gap-2 border border-white/10"
          >
            <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
            <span className="tracking-wide">장소 추가</span>
          </button>
        )}
      </div>

      {/* 바텀 시트 위쪽 탄성 동작 시 하단의 빈 공간이 노출되는 현상을 방지하는 절대 위치 가림막 (Skirt) */}
      <div
        style={{
          position: 'absolute',
          top: '99%',
          left: 0,
          right: 0,
          height: '200px',
          backgroundColor: 'inherit',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}
