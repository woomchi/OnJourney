'use client';

import React from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useOptionalBottomSheet } from './CustomBottomSheet';

export interface BottomSheetFloatingButtonsTargetProps {
  id?: string;
  className?: string;
}

/**
 * CustomBottomSheet 상단 바로 위에 지도 플로팅 버튼(전체 여정 보기, 내 위치 등)을
 * 바텀 시트 높이(y)에 연동하여 위치시키기 위한 포털 타겟 컴포넌트입니다.
 *
 * - 바텀 시트가 드래그되거나 스냅 높이가 변경될 때 상단 16px 간격을 유지하며 함께 이동합니다.
 * - 바텀 시트가 최대 높이로 화면 상단에 닿을 때 상단 바와 겹치지 않도록 자동으로 페이드아웃됩니다.
 */
export const BottomSheetFloatingButtonsTarget: React.FC<BottomSheetFloatingButtonsTargetProps> = ({
  id = 'mobile-map-buttons-target-line',
  className = '',
}) => {
  const bottomSheet = useOptionalBottomSheet();
  const fallbackY = useMotionValue(0);
  const y = bottomSheet?.y || fallbackY;
  const maxHeight = bottomSheet?.maxHeight ?? 800;

  // 최대 높이에 근접할 때 버튼을 서서히 투명화하고 상호작용을 차단
  const opacity = useTransform(y, [-maxHeight + 160, -maxHeight + 40], [1, 0]);
  const pointerEvents = useTransform(y, (latest: number) =>
    latest < -maxHeight + 60 ? 'none' : 'auto'
  );

  return (
    <motion.div
      id={id}
      className={`absolute bottom-[100%] right-4 mb-4 flex flex-col gap-2.5 z-[2000] pointer-events-none *:pointer-events-auto ${className}`}
      style={{
        opacity,
        pointerEvents: pointerEvents as unknown as React.CSSProperties['pointerEvents'],
      }}
    />
  );
};
