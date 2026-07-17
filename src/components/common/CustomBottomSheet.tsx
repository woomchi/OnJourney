import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { motion, useDragControls, useMotionValue, animate } from 'framer-motion';

export interface CustomBottomSheetProps {
  isOpen: boolean;
  minHeight: number;       // e.g. 210
  defaultHeight: number;   // e.g. 360
  maxHeight: number;       // e.g. 800 (usually window.innerHeight)
  initialSnap?: 'min' | 'default' | 'max';
  onSnap?: (snap: 'min' | 'default' | 'max') => void;
  onClose?: () => void;
  headerContent?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  scrollRef?: React.Ref<HTMLDivElement>;
}

export const BottomSheetContext = createContext<{
  y: any; // MotionValue<number>
  minHeight: number;
  defaultHeight: number;
  maxHeight: number;
  dragControls: any;
} | null>(null);

export const useOptionalBottomSheet = () => {
  return useContext(BottomSheetContext);
};

export const useBottomSheet = () => {
  const context = useContext(BottomSheetContext);
  if (!context) {
    throw new Error('useBottomSheet must be used within a CustomBottomSheet');
  }
  return context;
};

export const CustomBottomSheet: React.FC<CustomBottomSheetProps> = ({
  isOpen,
  minHeight,
  defaultHeight,
  maxHeight,
  initialSnap = 'default',
  onSnap,
  onClose,
  headerContent,
  children,
  className = '',
  zIndex = 1000,
  scrollRef,
}) => {
  const dragControls = useDragControls();
  const y = useMotionValue(0);

  // Initial target translation (negative values representing pull-up height)
  const getTargetY = (snapType: 'min' | 'default' | 'max') => {
    switch (snapType) {
      case 'min': return -minHeight;
      case 'max': return -maxHeight;
      case 'default':
      default:
        return -defaultHeight;
    }
  };

  const [activeSnapY, setActiveSnapY] = useState(isOpen ? getTargetY(initialSnap) : 0);
  const dragVelocityRef = useRef(0);

  // activeSnapY가 변경될 때 모션 밸류 y를 직접 애니메이션 제어
  useEffect(() => {
    const initialVelocity = dragVelocityRef.current;
    dragVelocityRef.current = 0; // 사용 후 리셋

    const controls = animate(y, activeSnapY, {
      type: 'spring',
      damping: 25,
      stiffness: 200,
      velocity: initialVelocity
    });
    return () => controls.stop();
  }, [activeSnapY, y]);

  useEffect(() => {
    if (isOpen) {
      setActiveSnapY(getTargetY(initialSnap));
    } else {
      setActiveSnapY(0);
      if (onClose) onClose();
    }
  }, [isOpen, minHeight, defaultHeight, maxHeight, initialSnap]);

  const handleDragEnd = (event: any, info: any) => {
    const currentY = y.get(); // Current dynamic translation value (negative)
    const velocityY = info.velocity.y; // Swipe velocity (positive down, negative up)

    const snapPoints = [
      { y: -maxHeight, name: 'max' as const },
      { y: -defaultHeight, name: 'default' as const },
      { y: -minHeight, name: 'min' as const }
    ];

    const VELOCITY_THRESHOLD = 500;
    // 임계값(80px) 미달 시 제자리로 복귀하도록 현재 활성화된 스냅 포인트(activeSnapY)로 초기화
    let targetSnap = snapPoints.find(p => p.y === activeSnapY) || snapPoints[1];

    if (velocityY > VELOCITY_THRESHOLD) {
      // Swiping down -> Snap to a lower (less pulled up, larger value) snap point
      const belowPoints = snapPoints.filter(p => p.y > currentY);
      targetSnap = belowPoints.length > 0 ? belowPoints[0] : snapPoints[0];
    } else if (velocityY < -VELOCITY_THRESHOLD) {
      // Swiping up -> Snap to a higher (more pulled up, smaller value) snap point
      const abovePoints = snapPoints.filter(p => p.y < currentY);
      targetSnap = abovePoints.length > 0 ? abovePoints[abovePoints.length - 1] : snapPoints[snapPoints.length - 1];
    } else {
      // Slow drag -> Snap to next point if user dragged at least 20px
      const deltaY = currentY - activeSnapY;
      const PIXEL_THRESHOLD = 20;
      if (deltaY > PIXEL_THRESHOLD) {
        // Dragging DOWN -> Find below points (y > activeSnapY)
        const belowPoints = snapPoints.filter(p => p.y > activeSnapY);
        if (belowPoints.length > 0) {
          targetSnap = belowPoints.reduce((prev, curr) =>
            Math.abs(curr.y - currentY) < Math.abs(prev.y - currentY) ? curr : prev
          );
        }
      } else if (deltaY < -PIXEL_THRESHOLD) {
        // Dragging UP -> Find above points (y < activeSnapY)
        const abovePoints = snapPoints.filter(p => p.y < activeSnapY);
        if (abovePoints.length > 0) {
          targetSnap = abovePoints.reduce((prev, curr) =>
            Math.abs(curr.y - currentY) < Math.abs(prev.y - currentY) ? curr : prev
          );
        }
      }
    }

    if (activeSnapY === targetSnap.y) {
      // 동일한 스냅 포인트 구역 내에서 미세 조작 후 놓았을 때 제자리로 복귀하도록 명시적 애니메이션 수행
      animate(y, targetSnap.y, {
        type: 'spring',
        damping: 25,
        stiffness: 200,
        velocity: velocityY
      });
    } else {
      // 스냅 포인트 구역이 달라진 경우 상태를 변경하여 useEffect를 통한 애니메이션 유발
      dragVelocityRef.current = velocityY;
      setActiveSnapY(targetSnap.y);
    }

    if (onSnap) onSnap(targetSnap.name);
  };

  return (
    <BottomSheetContext.Provider value={{ y, minHeight, defaultHeight, maxHeight, dragControls }}>
      <motion.div
        drag="y"
        dragControls={dragControls}
        dragListener={false} // Only drag when explicitly starting from a handler
        dragElastic={0} // Disable elasticity (rigid/no bounce) at boundaries
        dragMomentum={false} // 가속도에 의한 관성 밀림 현상 원천 차단
        dragConstraints={{
          top: -maxHeight,
          bottom: isOpen ? -minHeight : 0 // Prevents dragging below minHeight when open
        }}
        style={{
          y,
          position: 'fixed',
          bottom: -maxHeight, // Positioned off-screen, pulled up by translation Y
          left: 0,
          right: 0,
          height: maxHeight,
          zIndex,
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)',
        }}
        className={`bg-white flex flex-col pointer-events-auto ${className}`}
        onDragEnd={handleDragEnd}
      >
        {/* Global Common Drag Handle */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="w-full flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none flex-shrink-0 bg-white rounded-t-[24px]"
        >
          <div className="w-12 h-1.5 bg-zinc-300 rounded-full pointer-events-none" />
        </div>

        {headerContent && (
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="w-full flex flex-col items-center cursor-grab active:cursor-grabbing select-none flex-shrink-0 bg-white"
            style={{ touchAction: 'none' }}
          >
            {headerContent}
          </div>
        )}

        <div
          ref={scrollRef}
          className="flex-1 w-full flex flex-col min-h-0"
        >
          {children}
        </div>
      </motion.div>
    </BottomSheetContext.Provider>
  );
};
