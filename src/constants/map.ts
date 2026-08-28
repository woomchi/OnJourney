/**
 * @fileoverview 지도 공통 설정 및 기본 좌표 상수 정의
 */

import type { MapCoord } from '@/types/journey';

/** 지도 초기 중심 좌표 (서울시청 기준) */
export const INITIAL_MAP_CENTER: MapCoord = {
  lat: 37.5665,
  lng: 126.9780,
} as const;

/** 지도 기본 줌 레벨 */
export const DEFAULT_ZOOM_LEVEL = 15 as const;
