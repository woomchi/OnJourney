import { useRef, useState, useCallback, MouseEvent } from 'react';

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [dragged, setDragged] = useState(false);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (!ref.current) return;

    // Check if the click is on the scrollbar (outside client area boundaries)
    const rect = ref.current.getBoundingClientRect();
    const isVerticalScrollbar = e.clientX > rect.left + ref.current.clientLeft + ref.current.clientWidth;
    const isHorizontalScrollbar = e.clientY > rect.top + ref.current.clientTop + ref.current.clientHeight;

    if (isVerticalScrollbar || isHorizontalScrollbar) {
      return;
    }

    setIsDragging(true);
    setDragged(false);
    setStartX(e.pageX - ref.current.offsetLeft);
    setStartY(e.pageY - ref.current.offsetTop);
    setScrollLeft(ref.current.scrollLeft);
    setScrollTop(ref.current.scrollTop);
  }, []);

  const onMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !ref.current) return;
    
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const y = e.pageY - ref.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    
    if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
      setDragged(true);
    }
    
    ref.current.scrollLeft = scrollLeft - walkX;
    ref.current.scrollTop = scrollTop - walkY;
  }, [isDragging, startX, startY, scrollLeft, scrollTop]);

  // Click handler wrapper to prevent clicks after dragging
  const withClickPrevent = useCallback((fn: () => void) => {
    return (e: React.MouseEvent) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      fn();
    };
  }, [dragged]);

  return {
    ref,
    events: {
      onMouseDown,
      onMouseLeave,
      onMouseUp,
      onMouseMove,
    },
    withClickPrevent,
    isDragging,
  };
}
