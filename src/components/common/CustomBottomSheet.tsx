import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { motion, useDragControls, useMotionValue, animate, useTransform } from 'framer-motion';
import { useMapUIStore } from '@/stores/map-store';

const SPRING_SNAP = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 30,
  mass: 0.8,
  restDelta: 0.5,
  restSpeed: 2,
};

const SPRING_SNAP_FAST = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 40,
  mass: 0.6,
};

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
  y?: any;
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
  y: propY,
}) => {
  const dragControls = useDragControls();
  const internalY = useMotionValue(0);
  const y = propY || internalY;

  const { setBottomSheetY } = useMapUIStore();

  useEffect(() => {
    if (isOpen) {
      setBottomSheetY(y);
      return () => {
        setBottomSheetY((currentY: any) => currentY === y ? null : currentY);
      };
    }
  }, [isOpen, y, setBottomSheetY]);

  // #7. useTransform으로 그림자 강도 동적 변화
  const shadowOpacity = useTransform(y, [-minHeight, -maxHeight], [0.06, 0.20]);
  const shadowBlur = useTransform(y, [-minHeight, -maxHeight], [12, 40]);
  const shadowSpread = useTransform(y, [-minHeight, -maxHeight], [60, 100]);

  const dynamicBoxShadow = useTransform(
    [shadowOpacity, shadowBlur, shadowSpread],
    ([opacityVal, blurVal, spreadVal]) => {
      const op = opacityVal as number;
      const bl = blurVal as number;
      const sp = spreadVal as number;
      return `0 -1px 0 rgba(0,0,0,0.04), 0 -4px ${bl}px rgba(0,0,0,${op}), 0 -20px ${sp}px rgba(0,0,0,${op * 1.5})`;
    }
  );

  // Initial target translation (negative values representing pull-up height)
  const getTargetY = useCallback((snapType: 'min' | 'default' | 'max') => {
    switch (snapType) {
      case 'min': return -minHeight;
      case 'max': return -maxHeight;
      case 'default':
      default:
        return -defaultHeight;
    }
  }, [minHeight, defaultHeight, maxHeight]);

  const [activeSnapY, setActiveSnapY] = useState(isOpen ? getTargetY(initialSnap) : 0);
  const dragVelocityRef = useRef(0);

  // 대상 스냅 포인트와 제스처 속도에 따라 적절한 스프링 구성을 반환하는 헬퍼 함수
  const getSpringConfig = useCallback((targetY: number, velocity: number) => {
    const isFlick = Math.abs(velocity) > 500;
    if (isFlick) {
      return SPRING_SNAP_FAST;
    }
    
    // 최소 높이(-minHeight)로 안착할 때는 바운스 현상 원천 차단을 위해 높은 감쇠(35)를 적용
    const isMovingToMin = targetY === -minHeight;
    return {
      ...SPRING_SNAP,
      damping: isMovingToMin ? 35 : 28, // 그 외(default, max)로 가거나 들어올 때는 Bouncy 버전(28) 적용
    };
  }, [minHeight]);

  // activeSnapY가 변경될 때 모션 밸류 y를 직접 애니메이션 제어
  useEffect(() => {
    const initialVelocity = dragVelocityRef.current;
    dragVelocityRef.current = 0; // 사용 후 리셋

    const springConfig = getSpringConfig(activeSnapY, initialVelocity);

    const controls = animate(y, activeSnapY, {
      ...springConfig,
      velocity: initialVelocity
    });
    return () => controls.stop();
  }, [activeSnapY, y, getSpringConfig]);

  useEffect(() => {
    if (isOpen) {
      setActiveSnapY(getTargetY(initialSnap));
    } else {
      setActiveSnapY(0);
      onClose?.();
    }
  }, [isOpen, getTargetY, initialSnap, onClose]);

  // #9. History API 통합 (백버튼 처리)
  useEffect(() => {
    if (typeof window === 'undefined' || !isOpen) return;

    const stateKey = `bottomsheet-${Date.now()}`;
    
    if (!window.history.state?.bottomSheet) {
      window.history.pushState({ bottomSheet: stateKey }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      if (isOpen) {
        onClose?.();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (window.history.state?.bottomSheet === stateKey) {
        window.history.back();
      }
    };
  }, [isOpen, onClose]);

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

    const springConfig = getSpringConfig(targetSnap.y, velocityY);

    if (activeSnapY === targetSnap.y) {
      // 동일한 스냅 포인트 구역 내에서 미세 조작 후 놓았을 때 제자리로 복귀하도록 명시적 애니메이션 수행
      animate(y, targetSnap.y, {
        ...springConfig,
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
        dragElastic={{ top: 0.08, bottom: 0 }} // Elastic on top, rigid (concrete wall) on bottom
        dragMomentum={false} // 가속도에 의한 관성 밀림 현상 원천 차단
        dragConstraints={{
          top: -maxHeight,
          bottom: -minHeight
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
          boxShadow: dynamicBoxShadow,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        className={`bg-white flex flex-col pointer-events-auto ${className}`}
        onDragEnd={handleDragEnd}
      >
        {/* Global Common Drag Handle */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="w-full flex justify-center py-4 cursor-grab active:cursor-grabbing touch-none flex-shrink-0 bg-white rounded-t-[24px]"
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
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          {children}
        </div>

        {/* 바텀 시트 위쪽 탄성 동작 시 하단의 빈 공간(땜빵)이 노출되는 현상을 방지하는 절대 위치 가림막(Skirt) */}
        <div
          style={{
            position: 'absolute',
            top: '99%', // 서브픽셀 렌더링 틈새 방지를 위해 경계에서 약간 위에서 시작
            left: 0,
            right: 0,
            height: '200px',
            backgroundColor: 'inherit', // 부모(motion.div)의 배경색(bg-white 등)을 그대로 상속
            borderBottomLeftRadius: 'inherit',
            borderBottomRightRadius: 'inherit',
            pointerEvents: 'none', // 포인터 이벤트 통과
          }}
        />
      </motion.div>
    </BottomSheetContext.Provider>
  );
};
