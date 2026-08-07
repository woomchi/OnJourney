import { isNonWalkableArea, TerrainCheckResult } from './walkabilityCheck';

export type TerrainType = 'normal' | 'mountain' | 'beach';

/**
 * Classifies a given coordinate into TerrainType ('normal', 'mountain', 'beach')
 * using Phase 1: O(1) BBox 1차 필터링 & PIP 2차 검증.
 */
export function classifyTerrain(lng: number, lat: number): TerrainType {
  const result: TerrainCheckResult = isNonWalkableArea(lng, lat);
  if (result === 'mountain') return 'mountain';
  if (result === 'beach') return 'beach';
  return 'normal';
}
