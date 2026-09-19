"use client";

import { useState, useEffect, useMemo } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';

export function useMapPadding(isMobile: boolean) {
  const {
    activeJourney,
    focusedSegment,
    alternativeSegment,
    isDrawerMaximized,
    drawerSnapPoint,
    guidePanelState,
    isSearchMode,
  } = useJourneyStore(
    useShallow((state) => ({
      activeJourney: state.activeJourney,
      focusedSegment: state.focusedSegment,
      alternativeSegment: state.alternativeSegment,
      isDrawerMaximized: state.isDrawerMaximized,
      drawerSnapPoint: state.drawerSnapPoint,
      guidePanelState: state.guidePanelState,
      isSearchMode: state.isSearchMode,
    }))
  );

  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  const [lastNonMaximizedSnapPoint, setLastNonMaximizedSnapPoint] = useState<string | number>('294px');
  const [prevSnapPoint, setPrevSnapPoint] = useState<string | number | null>(drawerSnapPoint);

  // Sync last non-maximized snap point during render without useEffect
  if (drawerSnapPoint !== prevSnapPoint) {
    setPrevSnapPoint(drawerSnapPoint);
    if (!isDrawerMaximized && drawerSnapPoint !== 1 && drawerSnapPoint !== null) {
      setLastNonMaximizedSnapPoint(drawerSnapPoint);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setWindowDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  const currentMapPadding = useMemo(() => {
    const windowWidth = windowDimensions.width;
    const windowHeight = windowDimensions.height;

    const sidebarWidth = Math.max(380, Math.min(480, windowWidth * 0.35));
    const mapWidth = windowWidth - sidebarWidth;

    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.search.includes('pwa=true')
    );

    let topPadding = isMobile ? (isStandalone ? 48 : 40) : 32;
    if (isSearchMode) {
      topPadding = isMobile ? 64 : 56;
    }

    const rightPadding = mapWidth < 600 ? 48 : 30;
    let bottomPadding = isMobile ? (mapWidth < 600 ? 30 : 45) : 32;

    const effectiveSnapPoint = isDrawerMaximized
      ? lastNonMaximizedSnapPoint || (activeJourney ? '370px' : '360px')
      : drawerSnapPoint;

    if (isMobile) {
      if (isSearchMode) {
        bottomPadding = Math.round(windowHeight * 0.5) + 20;
      } else if (!!focusedSegment || !!alternativeSegment) {
        if (!!alternativeSegment) {
          bottomPadding = Math.min(340, Math.round(windowHeight * 0.46) + 40);
        } else {
          if (guidePanelState === 'minimized') {
            bottomPadding = 200;
          } else {
            bottomPadding = 320;
          }
        }
      } else if (effectiveSnapPoint !== 1) {
        let snapPx = activeJourney ? 370 : 360;
        if (typeof effectiveSnapPoint === 'number') {
          snapPx = effectiveSnapPoint;
        } else if (typeof effectiveSnapPoint === 'string' && effectiveSnapPoint.endsWith('px')) {
          snapPx = parseInt(effectiveSnapPoint, 10);
        }
        bottomPadding = snapPx + 20;
      }
    }

    let leftPadding = mapWidth < 600 ? 48 : 30;
    if (!!focusedSegment || !!alternativeSegment) {
      if (!isMobile) {
        leftPadding = Math.min(390, mapWidth * 0.45);
      }
    }

    if (isMobile) {
      const maxAllowedVerticalPadding = Math.max(0, windowHeight - 120);
      const currentTotalVerticalPadding = topPadding + bottomPadding;
      if (currentTotalVerticalPadding > maxAllowedVerticalPadding) {
        bottomPadding = Math.max(100, maxAllowedVerticalPadding - topPadding);
      }
    }

    return {
      top: topPadding,
      right: rightPadding,
      bottom: bottomPadding,
      left: leftPadding,
    };
  }, [focusedSegment, alternativeSegment, isMobile, drawerSnapPoint, isDrawerMaximized, guidePanelState, activeJourney, isSearchMode, windowDimensions, lastNonMaximizedSnapPoint]);

  return {
    currentMapPadding,
    windowWidth: windowDimensions.width,
    windowHeight: windowDimensions.height,
  };
}
