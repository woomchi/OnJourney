import { useState, useRef, useEffect } from 'react';

export interface UsePanelDragOptions {
  isOpen: boolean;
  onClose: () => void;
  dragThreshold?: number;
  snapThreshold?: number;
}

export function usePanelDrag({
  isOpen,
  onClose,
  dragThreshold = 80,
  snapThreshold = -50,
}: UsePanelDragOptions) {
  const [dragY, setDragY] = useState(0);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    touchStartY.current = e.clientY;
    setIsDraggingPanel(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (touchStartY.current === null) return;
    const currentY = e.clientY;
    const diff = currentY - touchStartY.current;
    
    if (isExpanded && diff < 0) {
      setDragY(diff * 0.1);
    } else {
      setDragY(diff);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isExpanded) {
      if (dragY > dragThreshold) {
        setIsExpanded(false);
      }
    } else {
      if (dragY > dragThreshold) {
        onClose();
      } else if (dragY < snapThreshold) {
        setIsExpanded(true);
      }
    }
    setDragY(0);
    setIsDraggingPanel(false);
    touchStartY.current = null;
  };

  return {
    dragY,
    isDraggingPanel,
    isExpanded,
    setIsExpanded,
    collapse: () => setIsExpanded(false),
    expand: () => setIsExpanded(true),
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    }
  };
}
