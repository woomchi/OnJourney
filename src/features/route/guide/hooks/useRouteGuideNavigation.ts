"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';
import { calculateSegmentBounds, calculateStepBounds } from '@/lib/services/naverMapRouteService';
import type { Place, SelectedRoute, DirectionResult, DirectionStep, FocusedStep } from '@/types/journey';

export interface GuidePage {
  idx: number;
  step: DirectionStep;
  subType?: 'start' | 'end' | 'dest';
}

interface UseRouteGuideNavigationProps {
  route: SelectedRoute | DirectionResult;
  originPlace: Place;
  destPlace: Place;
  onNextSegment?: (jumpToStart?: boolean) => void;
  onPrevSegment?: (jumpToDest?: boolean) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  bottomSpacerRef: React.RefObject<HTMLDivElement | null>;
  collapse: () => void;
}

export function useRouteGuideNavigation({
  route,
  originPlace,
  destPlace,
  onNextSegment,
  onPrevSegment,
  scrollContainerRef,
  bottomSpacerRef,
  collapse,
}: UseRouteGuideNavigationProps) {
  const {
    focusedStep,
    setFocusedStep,
    setFocusBounds,
    setAlternativeSegment,
    setIsAlternativeFromFocus,
    setTargetChangePlaceId,
    openSearchMode,
  } = useJourneyStore(
    useShallow((state) => ({
      focusedStep: state.focusedStep,
      setFocusedStep: state.setFocusedStep,
      setFocusBounds: state.setFocusBounds,
      setAlternativeSegment: state.setAlternativeSegment,
      setIsAlternativeFromFocus: state.setIsAlternativeFromFocus,
      setTargetChangePlaceId: state.setTargetChangePlaceId,
      openSearchMode: state.openSearchMode,
    }))
  );

  const [unfocusedCardIndex, setUnfocusedCardIndex] = useState(0);

  const isPanelFocused = !!(
    focusedStep &&
    focusedStep.originId === originPlace.id &&
    focusedStep.destId === destPlace.id
  );

  const activeCardIndex = isPanelFocused ? focusedStep.stepIndex : unfocusedCardIndex;
  const steps = route.steps || [];

  const handleChangePlace = useCallback((placeId: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setTargetChangePlaceId(placeId);
    openSearchMode();
  }, [setTargetChangePlaceId, openSearchMode]);

  const handleOpenAlternative = useCallback(() => {
    setIsAlternativeFromFocus(true);
    setAlternativeSegment({
      originId: originPlace.id,
      destId: destPlace.id,
    });
  }, [setIsAlternativeFromFocus, setAlternativeSegment, originPlace.id, destPlace.id]);

  useEffect(() => {
    setUnfocusedCardIndex(0);
    if (focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id) {
      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: 0,
        subType: 'start',
      });
      if (route?.steps && route.steps[0] && route.steps[0].pathPoints) {
        const bounds = calculateStepBounds(route.steps[0].pathPoints);
        if (bounds) setFocusBounds(bounds);
      }
    }
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [route?.id, route, originPlace.id, destPlace.id, setFocusedStep, setFocusBounds, scrollContainerRef]);

  // 세부 이동 정보가 자동으로 스크롤 중앙에 오도록 조절
  useEffect(() => {
    if (!focusedStep || focusedStep.originId !== originPlace.id || focusedStep.destId !== destPlace.id) {
      if (bottomSpacerRef.current) {
        bottomSpacerRef.current.style.height = '112px';
      }
      return;
    }

    const elementId = `step-${originPlace.id}-${destPlace.id}-${focusedStep.stepIndex}`;

    const timer = setTimeout(() => {
      const element = document.getElementById(elementId);
      const container = scrollContainerRef.current;
      if (element && container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const containerHeight = container.clientHeight;
        const cardHeight = element.clientHeight;
        const paddingNeeded = Math.max(112, containerHeight - 5 - cardHeight);

        if (bottomSpacerRef.current) {
          bottomSpacerRef.current.style.height = `${paddingNeeded}px`;
        }

        const targetScrollTop = container.scrollTop + (elementRect.top - containerRect.top) - 5;

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth',
        });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [focusedStep, originPlace.id, destPlace.id, bottomSpacerRef, scrollContainerRef]);

  const getPages = useCallback((): GuidePage[] => {
    const rawPages: GuidePage[] = [];

    steps.forEach((step, idx) => {
      const isLastStep = idx === steps.length - 1;
      const isTransitOrVehicle =
        step.type === 'car' ||
        step.type === 'taxi' ||
        step.type === 'subway' ||
        step.type === 'bus' ||
        step.type === 'train' ||
        step.type === 'expressbus' ||
        (step.startName && step.endName);

      if (isTransitOrVehicle) {
        if (step.type === 'car' || step.type === 'taxi') {
          rawPages.push({ idx, step, subType: 'start' });
          rawPages.push({ idx, step, subType: 'dest' });
        } else {
          if (step.startName || step.startLat) rawPages.push({ idx, step, subType: 'start' });
          if (step.endName || step.endLat) rawPages.push({ idx, step, subType: 'end' });
        }
      } else {
        rawPages.push({ idx, step, subType: 'start' });
        if (isLastStep) {
          rawPages.push({ idx, step, subType: 'end' });
        }
      }
    });

    const getPagePoint = (p: GuidePage) => {
      let lat: number | undefined;
      let lng: number | undefined;
      if (p.subType === 'dest') {
        lat = destPlace.lat;
        lng = destPlace.lng;
      } else if (p.subType === 'start') {
        lat = p.idx === 0 ? originPlace.lat : p.step.startLat;
        lng = p.idx === 0 ? originPlace.lng : p.step.startLng;
      } else if (p.subType === 'end') {
        lat = p.idx === steps.length - 1 ? destPlace.lat : p.step.endLat;
        lng = p.idx === steps.length - 1 ? destPlace.lng : p.step.endLng;
      }

      if (lat === undefined || lng === undefined) {
        if (p.step && p.step.pathPoints && p.step.pathPoints.length > 0) {
          if (p.subType === 'end' || p.subType === 'dest') {
            lat = p.step.pathPoints[p.step.pathPoints.length - 1].lat;
            lng = p.step.pathPoints[p.step.pathPoints.length - 1].lng;
          } else {
            lat = p.step.pathPoints[0].lat;
            lng = p.step.pathPoints[0].lng;
          }
        }
      }
      return { lat, lng };
    };

    const getDistanceMeters = (lat1?: number, lng1?: number, lat2?: number, lng2?: number) => {
      if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) return Infinity;
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    const filteredPages: GuidePage[] = [];
    rawPages.forEach((page) => {
      if (filteredPages.length === 0) {
        filteredPages.push(page);
        return;
      }

      const lastPage = filteredPages[filteredPages.length - 1];
      const p1 = getPagePoint(lastPage);
      const p2 = getPagePoint(page);
      const dist = getDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);

      if (dist < 20) {
        if ((lastPage.subType === 'end' || lastPage.subType === 'dest') && page.subType === 'start') {
          return;
        }
        if (lastPage.subType === 'start' && page.subType === 'start') {
          filteredPages[filteredPages.length - 1] = page;
          return;
        }
      }

      filteredPages.push(page);
    });

    return filteredPages;
  }, [steps, destPlace.lat, destPlace.lng, originPlace.lat, originPlace.lng]);

  const handleStepClick = useCallback((idx: number, step: any, subType?: 'start' | 'end' | 'dest') => {
    collapse();
    const isThisStepFocused = !!(
      focusedStep &&
      focusedStep.originId === originPlace.id &&
      focusedStep.destId === destPlace.id &&
      focusedStep.stepIndex === idx &&
      focusedStep.subType === subType
    );

    if (!isThisStepFocused) {
      let lat: number | undefined;
      let lng: number | undefined;

      if (subType === 'dest') {
        lat = destPlace.lat;
        lng = destPlace.lng;
      } else if (subType === 'start') {
        lat = idx === 0 ? originPlace.lat : step.startLat;
        lng = idx === 0 ? originPlace.lng : step.startLng;
      } else if (subType === 'end') {
        lat = idx === steps.length - 1 ? destPlace.lat : step.endLat;
        lng = idx === steps.length - 1 ? destPlace.lng : step.endLng;
      } else {
        lat = step.startLat;
        lng = step.startLng;
      }

      if (lat === undefined || lng === undefined) {
        if (step && step.pathPoints && step.pathPoints.length > 0) {
          if (subType === 'end') {
            lat = step.pathPoints[step.pathPoints.length - 1].lat;
            lng = step.pathPoints[step.pathPoints.length - 1].lng;
          } else {
            lat = step.pathPoints[0].lat;
            lng = step.pathPoints[0].lng;
          }
        }
      }

      if (lat !== undefined && lng !== undefined) {
        setFocusBounds({
          sw: { lat, lng },
          ne: { lat, lng },
        });
      } else if (step && !step.isDestinationPage) {
        const bounds = calculateStepBounds(step);
        if (bounds) {
          setFocusBounds(bounds);
        }
      }

      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: idx,
        subType,
      });
    }
  }, [collapse, focusedStep, originPlace.id, originPlace.lat, originPlace.lng, destPlace.id, destPlace.lat, destPlace.lng, steps.length, setFocusBounds, setFocusedStep]);

  const handlePrevStep = useCallback(() => {
    collapse();
    const pages = getPages();
    const isCurrentPanelFocused = !!(focusedStep && focusedStep.originId === originPlace.id && focusedStep.destId === destPlace.id);

    if (!isCurrentPanelFocused) {
      if (onPrevSegment) {
        onPrevSegment(true);
      }
      return;
    }

    let currentIndex = pages.findIndex((p) => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
    if (currentIndex === -1) {
      currentIndex = pages.findIndex((p) => p.idx === focusedStep.stepIndex);
    }

    if (currentIndex > 0) {
      const prevPage = pages[currentIndex - 1];
      handleStepClick(prevPage.idx, prevPage.step, prevPage.subType);
    } else if (currentIndex === 0) {
      setFocusedStep(null);
      const bounds = calculateSegmentBounds(originPlace, destPlace, route);
      setFocusBounds(bounds);
    }
  }, [collapse, getPages, focusedStep, originPlace, destPlace, onPrevSegment, handleStepClick, setFocusedStep, setFocusBounds, route]);

  const handleNextStep = useCallback(() => {
    collapse();
    const pages = getPages();
    if (!focusedStep || focusedStep.originId !== originPlace.id || focusedStep.destId !== destPlace.id) {
      const firstPage = pages[0];
      if (firstPage) handleStepClick(firstPage.idx, firstPage.step, firstPage.subType);
      return;
    }

    let currentIndex = pages.findIndex((p) => p.idx === focusedStep.stepIndex && p.subType === focusedStep.subType);
    if (currentIndex === -1) {
      currentIndex = pages.findIndex((p) => p.idx === focusedStep.stepIndex);
    }

    if (currentIndex >= 0 && currentIndex < pages.length - 1) {
      const nextPage = pages[currentIndex + 1];
      handleStepClick(nextPage.idx, nextPage.step, nextPage.subType);
    } else if (currentIndex === pages.length - 1 && onNextSegment) {
      onNextSegment();
    }
  }, [collapse, getPages, focusedStep, originPlace.id, destPlace.id, handleStepClick, onNextSegment]);

  const handleZoomToPoint = useCallback((idx: number, step: any, type: 'start' | 'end' | 'dest', e: React.MouseEvent) => {
    e.stopPropagation();
    collapse();

    setFocusedStep({
      originId: originPlace.id,
      destId: destPlace.id,
      stepIndex: idx,
      subType: type,
    });

    let lat: number | undefined;
    let lng: number | undefined;

    if (type === 'dest') {
      lat = destPlace.lat;
      lng = destPlace.lng;
    } else {
      lat = type === 'start' ? (idx === 0 ? originPlace.lat : step.startLat) : (idx === steps.length - 1 ? destPlace.lat : step.endLat);
      lng = type === 'start' ? (idx === 0 ? originPlace.lng : step.startLng) : (idx === steps.length - 1 ? destPlace.lng : step.endLng);

      if (lat === undefined || lng === undefined) {
        if (step.pathPoints && step.pathPoints.length > 0) {
          const pt = type === 'start' ? step.pathPoints[0] : step.pathPoints[step.pathPoints.length - 1];
          lat = pt.lat;
          lng = pt.lng;
        }
      }
    }

    if (lat !== undefined && lng !== undefined) {
      setFocusBounds({
        sw: { lat, lng },
        ne: { lat, lng },
      });
    }
  }, [collapse, setFocusedStep, originPlace.id, originPlace.lat, originPlace.lng, destPlace.id, destPlace.lat, destPlace.lng, steps.length, setFocusBounds]);

  const handleIndexChange = useCallback((newIndex: number) => {
    if (!route.steps || !route.steps[newIndex]) return;
    setUnfocusedCardIndex(newIndex);
    if (isPanelFocused) {
      const step = route.steps[newIndex];
      setFocusedStep({
        originId: originPlace.id,
        destId: destPlace.id,
        stepIndex: newIndex,
        subType: 'start',
      });
      if (step.pathPoints && step.pathPoints.length > 0) {
        const bounds = calculateStepBounds(step.pathPoints);
        if (bounds) setFocusBounds(bounds);
      }
    }
  }, [route.steps, isPanelFocused, setFocusedStep, originPlace.id, destPlace.id, setFocusBounds]);

  return {
    focusedStep,
    isPanelFocused,
    activeCardIndex,
    steps,
    hasGuide: (route.guide || []).length > 0,
    getPages,
    handleStepClick,
    handlePrevStep,
    handleNextStep,
    handleZoomToPoint,
    handleIndexChange,
    handleChangePlace,
    handleOpenAlternative,
  };
}
