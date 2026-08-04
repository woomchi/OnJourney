'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DirectionStep } from '@/types/journey';
import RouteSegmentCard from './RouteSegmentCard';

interface RouteSegmentCardStackProps {
  steps: DirectionStep[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  onOpenDetailSheet?: (step: DirectionStep) => void;
  className?: string;
  focusedStep?: { stepIndex: number; subType?: 'start' | 'end' | 'dest' } | null;
  onSelectStartPoint?: (index: number) => void;
  onSelectEndPoint?: (index: number) => void;
}

export const RouteSegmentCardStack: React.FC<RouteSegmentCardStackProps> = ({
  steps = [],
  currentIndex: externalIndex,
  onIndexChange,
  onOpenDetailSheet,
  className = '',
  focusedStep,
  onSelectStartPoint,
  onSelectEndPoint,
}) => {
  const [internalIndex, setInternalIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Flags for Pure DOM Direct Switch & Zero Vibration
  const isProgrammaticScroll = useRef(false);
  const isUserInteracting = useRef(false);
  const scrollProgrammaticTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapSyncDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const activeDomIndexRef = useRef(0);

  const activeIndex = internalIndex;
  const totalSteps = steps.length;

  // Programmatic Smooth Scroll (Timeline Playback step change / Button click)
  const scrollToIndex = useCallback((index: number) => {
    if (index < 0 || index >= totalSteps) return;
    const container = scrollRef.current;
    if (!container) return;

    const cards = container.querySelectorAll<HTMLElement>('.timeline-card-item');
    const targetCard = cards[index];
    if (targetCard) {
      isProgrammaticScroll.current = true;
      const targetLeft = targetCard.offsetLeft - (container.clientWidth - targetCard.clientWidth) / 2;

      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });

      if (scrollProgrammaticTimeoutRef.current) clearTimeout(scrollProgrammaticTimeoutRef.current);
      scrollProgrammaticTimeoutRef.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 350);
    }
  }, [totalSteps]);

  // Synchronize internal state and scroll container when external index prop changes (e.g. Playback timeline step change)
  useEffect(() => {
    if (externalIndex !== undefined && !isUserInteracting.current) {
      setInternalIndex(externalIndex);
      activeDomIndexRef.current = externalIndex;
      scrollToIndex(externalIndex);
    }
  }, [externalIndex, scrollToIndex]);

  // Track user touch/mouse drag start & end
  const handleTouchStart = () => {
    isUserInteracting.current = true;
  };

  const handleTouchEnd = () => {
    isUserInteracting.current = false;
  };

  // Pure DOM Direct Switch Handler for Card Highlight
  const handleScroll = () => {
    if (isProgrammaticScroll.current) return;
    const container = scrollRef.current;
    if (!container) return;

    // 1. Calculate Closest Card Index to Center 0ms
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    const cardItems = container.querySelectorAll<HTMLElement>('.timeline-card-item');
    let closestIndex = 0;
    let minDistance = Infinity;

    cardItems.forEach((card, idx) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const distance = Math.abs(containerCenter - cardCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    // 2. Direct DOM Switching for Cards (0ms Instant Highlight!)
    if (closestIndex !== activeDomIndexRef.current) {
      activeDomIndexRef.current = closestIndex;

      cardItems.forEach((card, idx) => {
        const innerCard = card.querySelector<HTMLElement>('.timeline-card-inner');
        if (!innerCard) return;

        if (idx === closestIndex) {
          innerCard.classList.add('border-blue-500', 'shadow-md', 'shadow-blue-500/10', 'ring-1', 'ring-blue-500/20', 'opacity-100');
          innerCard.classList.remove('border-zinc-200/80', 'shadow-sm', 'opacity-80');
        } else {
          innerCard.classList.remove('border-blue-500', 'shadow-md', 'shadow-blue-500/10', 'ring-1', 'ring-blue-500/20', 'opacity-100');
          innerCard.classList.add('border-zinc-200/80', 'shadow-sm', 'opacity-80');
        }
      });
    }

    // 3. Debounce Heavy Map Sync & React State Settle ONLY after scroll finishes (100ms)
    if (mapSyncDebounceRef.current) clearTimeout(mapSyncDebounceRef.current);
    mapSyncDebounceRef.current = setTimeout(() => {
      setInternalIndex(closestIndex);
      if (onIndexChange && closestIndex !== externalIndex) {
        onIndexChange(closestIndex);
      }
    }, 100);
  };

  const handleSelectIndex = (newIndex: number) => {
    if (newIndex < 0 || newIndex >= totalSteps) return;
    isUserInteracting.current = false;
    setInternalIndex(newIndex);
    activeDomIndexRef.current = newIndex;
    if (onIndexChange) {
      onIndexChange(newIndex);
    }
    scrollToIndex(newIndex);
  };

  if (!steps || steps.length === 0) {
    return null;
  }

  const isFirst = activeIndex === 0;
  const isLast = activeIndex === totalSteps - 1;

  return (
    <div
      ref={containerRef}
      className={`
        relative w-full min-h-[220px] max-h-[420px]
        flex flex-col justify-between items-center px-0 py-1 select-none pointer-events-auto
        md:max-w-[460px] md:mx-auto
        ${className}
      `}
    >

      {/* Main Container & Pure Hardware Snap Slider */}
      <div className="relative w-full flex-1 flex items-center overflow-hidden">
        {/* 100% Pure Hardware Snap Container (Fixed Scale Size for Zero Vibration & Smooth 120fps Snap) */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          className="w-full h-full flex items-center overflow-x-auto snap-x snap-mandatory scrollbar-none py-1 px-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {steps.map((step, idx) => {
            const isActive = idx === activeIndex;
            const isStepFocused = !!(focusedStep && focusedStep.stepIndex === idx);
            const isStartHighlighted = isStepFocused && (focusedStep.subType === 'start' || !focusedStep.subType);
            const isEndHighlighted = isStepFocused && (focusedStep.subType === 'end' || focusedStep.subType === 'dest');

            return (
              <div
                key={idx}
                onClick={() => handleSelectIndex(idx)}
                className="timeline-card-item shrink-0 snap-center snap-always mx-1.5 h-auto self-start cursor-pointer w-[84vw] max-w-[340px] rounded-2xl overflow-hidden"
              >
                <RouteSegmentCard
                  step={step}
                  index={idx}
                  totalSteps={totalSteps}
                  prevStep={steps[idx - 1]}
                  nextStep={steps[idx + 1]}
                  isActive={isActive}
                  isStartHighlighted={isStartHighlighted}
                  isEndHighlighted={isEndHighlighted}
                  onOpenDetailSheet={onOpenDetailSheet}
                  onSelectStartPoint={() => {
                    handleSelectIndex(idx);
                    if (onSelectStartPoint) onSelectStartPoint(idx);
                  }}
                  onSelectEndPoint={() => {
                    handleSelectIndex(idx);
                    if (onSelectEndPoint) onSelectEndPoint(idx);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default RouteSegmentCardStack;
