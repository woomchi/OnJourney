"use client";

import { useState, useEffect, useMemo, useRef, useReducer } from 'react';
import { useMapState } from '../useMapState';

export function useMapPadding(isMobile: boolean) {
  const {
    activeJourney,
    focusedSegment,
    alternativeSegment,
    isDrawerMaximized,
    drawerSnapPoint,
    guidePanelState,
    isSearchMode,
  } = useMapState();

  const windowWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const windowHeightRef = useRef<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [paddingVersion, forceUpdatePadding] = useReducer((x) => x + 1, 0);

  const lastNonMaximizedSnapPointRef = useRef<string | number | null>('294px');

  useEffect(() => {
    if (!isDrawerMaximized && drawerSnapPoint !== 1 && drawerSnapPoint !== null) {
      lastNonMaximizedSnapPointRef.current = drawerSnapPoint;
    }
  }, [isDrawerMaximized, drawerSnapPoint]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      windowWidthRef.current = window.innerWidth;
      windowHeightRef.current = window.innerHeight;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        forceUpdatePadding();
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  const currentMapPadding = useMemo(() => {
    const windowWidth = windowWidthRef.current;
    const windowHeight = windowHeightRef.current;

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

    let topPadding = isMobile ? (isStandalone ? 48 : 40) : 24;
    if (isSearchMode) {
      topPadding = isMobile ? 64 : 56;
    }

    const rightPadding = mapWidth < 600 ? 48 : 30;
    let bottomPadding = mapWidth < 600 ? 30 : 45;

    const effectiveSnapPoint = isDrawerMaximized
      ? lastNonMaximizedSnapPointRef.current || (activeJourney ? '370px' : '360px')
      : drawerSnapPoint;

    if (isMobile) {
      if (!!focusedSegment || !!alternativeSegment) {
        if (!!alternativeSegment) {
          bottomPadding = windowHeight * 0.46 + 60;
        } else {
          if (guidePanelState === 'minimized') {
            bottomPadding = 240;
          } else {
            bottomPadding = 410;
          }
        }
      } else if (effectiveSnapPoint !== 1) {
        if (typeof effectiveSnapPoint === 'number') {
          bottomPadding = effectiveSnapPoint + 40;
        } else if (typeof effectiveSnapPoint === 'string' && effectiveSnapPoint.endsWith('px')) {
          bottomPadding = parseInt(effectiveSnapPoint, 10) + 40;
        } else {
          bottomPadding = 310;
        }
      }
    }

    let leftPadding = mapWidth < 600 ? 48 : 30;
    if (!!focusedSegment || !!alternativeSegment) {
      if (!isMobile) {
        leftPadding = Math.min(390, mapWidth * 0.45);
      }
    }

    if (isMobile) {
      const maxAllowedVerticalPadding = Math.max(0, windowHeight - 150);
      const currentTotalVerticalPadding = topPadding + bottomPadding;
      if (currentTotalVerticalPadding > maxAllowedVerticalPadding) {
        topPadding = Math.min(topPadding, maxAllowedVerticalPadding * 0.25);
        bottomPadding = maxAllowedVerticalPadding - topPadding;
      }
    }

    return {
      top: topPadding,
      right: rightPadding,
      bottom: bottomPadding,
      left: leftPadding,
    };
  }, [focusedSegment, alternativeSegment, paddingVersion, isMobile, drawerSnapPoint, isDrawerMaximized, guidePanelState, activeJourney, isSearchMode]);

  return {
    currentMapPadding,
    windowWidth: windowWidthRef.current,
    windowHeight: windowHeightRef.current,
  };
}
