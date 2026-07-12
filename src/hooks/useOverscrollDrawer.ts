import { useRef } from 'react';
import { useJourneyStore } from '@/stores/journey-store';

export function useOverscrollDrawer() {
  const { setDrawerSnapPoint, drawerSnapPoint, activeJourney } = useJourneyStore();
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.touches[0].clientY;
    const deltaY = touchStartY.current - currentY; // Positive = pulling up, Negative = pulling down
    
    const target = e.currentTarget as HTMLElement;
    const isAtTop = target.scrollTop <= 0;
    const isAtBottom = target.scrollHeight - Math.ceil(target.scrollTop) <= target.clientHeight + 2;

    const defaultSnap = activeJourney ? '360px' : '294px';
    const minSnap = activeJourney ? '126px' : '74px';

    if (isAtTop && deltaY < -20) {
      if (drawerSnapPoint === 1 || drawerSnapPoint === '1') {
        setDrawerSnapPoint(defaultSnap);
      } else {
        setDrawerSnapPoint(minSnap);
      }
      touchStartY.current = null;
    } else if (isAtBottom && deltaY > 20) {
      if (drawerSnapPoint === minSnap) {
        setDrawerSnapPoint(defaultSnap);
      } else {
        setDrawerSnapPoint(1);
      }
      touchStartY.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const target = e.currentTarget as HTMLElement;
    const isAtTop = target.scrollTop <= 0;
    const isAtBottom = target.scrollHeight - Math.ceil(target.scrollTop) <= target.clientHeight + 2;

    const defaultSnap = activeJourney ? '360px' : '294px';
    const minSnap = activeJourney ? '126px' : '74px';

    if (isAtTop && e.deltaY < -10) {
      if (drawerSnapPoint === 1 || drawerSnapPoint === '1') {
        setDrawerSnapPoint(defaultSnap);
      } else {
        setDrawerSnapPoint(minSnap);
      }
    } else if (isAtBottom && e.deltaY > 10) {
      if (drawerSnapPoint === minSnap) {
        setDrawerSnapPoint(defaultSnap);
      } else {
        setDrawerSnapPoint(1);
      }
    }
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onWheel: handleWheel,
  };
}
