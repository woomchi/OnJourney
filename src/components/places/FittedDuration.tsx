"use client";

import { useState, useEffect, useRef } from 'react';

interface FittedDurationProps {
  duration: number;
  isWalk: boolean;
}

// 타임라인 바 내 소요시간 표시 (공간에 따라 적응적으로 표시)
// 공간 충분: "5분" / 부족: "2.." / 매우 부족: "1"
export default function FittedDuration({ duration, isWalk }: FittedDurationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState(`${duration}분`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth === 0) return;

      const measurer = document.createElement('span');
      measurer.style.cssText =
        'position:absolute;visibility:hidden;font-size:9px;font-weight:700;white-space:nowrap;';
      document.body.appendChild(measurer);

      // 1) Try full text: "5분"
      const fullText = `${duration}분`;
      measurer.textContent = fullText;
      if (measurer.offsetWidth <= availableWidth) {
        setDisplayText(fullText);
        document.body.removeChild(measurer);
        return;
      }

      // 2) Measure number width and dot width
      const numStr = `${duration}`;
      measurer.textContent = numStr;
      const numWidth = measurer.offsetWidth;

      measurer.textContent = '.';
      const dotWidth = measurer.offsetWidth;

      // 3) Number + as many dots as fit (max 3)
      const spaceForDots = availableWidth - numWidth;
      const maxDots = Math.min(Math.max(Math.floor(spaceForDots / dotWidth), 0), 3);

      if (maxDots > 0) {
        setDisplayText(numStr + '.'.repeat(maxDots));
      } else if (numWidth <= availableWidth) {
        setDisplayText(numStr);
      } else {
        setDisplayText('');
      }

      document.body.removeChild(measurer);
    };

    // Initial + resize observer
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [duration]);

  return (
    <div
      ref={containerRef}
      className={`w-full font-bold text-[9px] whitespace-nowrap text-center overflow-hidden leading-[12px] ${isWalk ? 'text-zinc-700' : 'text-white'}`}
    >
      {displayText}
    </div>
  );
}
