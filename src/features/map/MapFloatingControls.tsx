"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMapUIStore } from '@/stores/map-store';
import { useJourneyStore } from '@/stores/journey-store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Locate, LocateFixed, Compass, Loader2, Route } from 'lucide-react';

interface MapFloatingControlsProps {
  handleMyLocationClick: () => void;
  handleResetBounds: (forceRefit?: boolean) => void;
}

export function MapFloatingControls({
  handleMyLocationClick,
  handleResetBounds,
}: MapFloatingControlsProps) {
  const [mounted, setMounted] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  const { gpsMode, isLocating } = useMapUIStore();
  const {
    activeJourney,
    setFocusedSegment,
    setFocusedStep,
    setAlternativeSegment,
    setFocusBounds,
    isDrawerMaximized,
  } = useJourneyStore();

  const places = activeJourney?.places ?? [];
  const hasPlaces = places.length > 0;

  // Set mounted status on client-side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Monitor DOM modifications to locate mobile portal targets dynamically
  useEffect(() => {
    if (!mounted || !isMobile) {
      setPortalTarget(null);
      return;
    }

    const findTarget = () => {
      const target = 
        document.getElementById('mobile-map-buttons-target') || 
        document.getElementById('mobile-map-buttons-target-route');
      setPortalTarget(target);
    };

    findTarget();

    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [mounted, isMobile]);

  // Handle clicking "전체 여정 보기" (View full journey)
  const handleFullJourneyClick = () => {
    // Clear active segment/step/alternative route highlights
    setFocusedSegment(null);
    setFocusedStep(null);
    setAlternativeSegment(null);
    setFocusBounds(null);
    
    // Zoom out map camera to encompass all places in the current journey
    handleResetBounds(true);
  };

  if (!mounted) return null;

  // 1. GPS / 내 위치 보기 Button Content
  const renderMyLocationButton = () => {
    let Icon = Locate;
    let iconColorClass = 'text-zinc-700';
    let btnBgClass = 'bg-white/95 border-zinc-200/80 hover:bg-white text-zinc-700 shadow-[0_4px_16px_rgba(0,0,0,0.08)]';
    
    if (isLocating) {
      Icon = Loader2;
      iconColorClass = 'text-blue-500 animate-spin';
    } else if (gpsMode === 'location') {
      Icon = LocateFixed;
      iconColorClass = 'text-white';
      btnBgClass = 'bg-blue-600 border-blue-500 text-white shadow-[0_4px_16px_rgba(37,99,235,0.3)]';
    } else if (gpsMode === 'compass') {
      Icon = Compass;
      iconColorClass = 'text-white';
      btnBgClass = 'bg-indigo-600 border-indigo-500 text-white shadow-[0_4px_16px_rgba(79,70,229,0.3)]';
    }

    return (
      <button
        type="button"
        onClick={handleMyLocationClick}
        disabled={isLocating}
        title="내 위치 보기"
        className={`
          relative w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-300 active:scale-95 cursor-pointer backdrop-blur-md group hover:scale-[1.03]
          ${btnBgClass}
        `}
      >
        <Icon className={`w-5 h-5 transition-transform duration-200 ${iconColorClass}`} strokeWidth={2.2} />
        
        {/* Subtle pulsing dot when GPS tracking is active */}
        {gpsMode !== 'none' && !isLocating && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </span>
        )}
      </button>
    );
  };

  // 2. 전체 여정 보기 Button Content
  const renderFullJourneyButton = () => {
    if (!hasPlaces) return null;

    return (
      <button
        type="button"
        onClick={handleFullJourneyClick}
        title="전체 여정 보기"
        className="
          w-12 h-12 rounded-2xl bg-white/95 text-zinc-700 border border-zinc-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.08)]
          flex items-center justify-center transition-all duration-300 hover:scale-[1.03] active:scale-95 cursor-pointer backdrop-blur-md hover:bg-white
        "
      >
        <Route className="w-5 h-5 text-zinc-700 transition-transform duration-200 group-hover:scale-105" strokeWidth={2.2} />
      </button>
    );
  };

  const buttonsContent = (
    <div className={`flex flex-col gap-2.5 pointer-events-auto transition-opacity duration-300 ${isDrawerMaximized && isMobile ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {renderFullJourneyButton()}
      {renderMyLocationButton()}
    </div>
  );

  // If mobile and portal target exists, render into the portal (floating above bottom sheet)
  if (isMobile && portalTarget) {
    return createPortal(buttonsContent, portalTarget);
  }

  // Otherwise, render absolute overlay on desktop map view (bottom-right)
  return (
    <div className="absolute bottom-16 right-6 md:bottom-20 md:right-8 z-[120] pointer-events-none">
      {buttonsContent}
    </div>
  );
}
