import fs from 'fs';
import path from 'path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

interface GeoJsonFeature {
  type: string;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  } | null;
  properties: {
    fclass?: string;
    [key: string]: any;
  } | null;
  bbox?: [number, number, number, number]; // Calculated bbox [minLng, minLat, maxLng, maxLat]
}

let walkableFeatures: GeoJsonFeature[] = [];
let isLoaded = false;

function loadGeoJsonData() {
  if (isLoaded) return;
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const naturalPath = path.join(dataDir, 'naturalData.json');
    const landUsePath = path.join(dataDir, 'landUseData_processed.json');

    const naturalRaw = fs.existsSync(naturalPath) ? fs.readFileSync(naturalPath, 'utf8') : '{"features":[]}';
    const landUseRaw = fs.existsSync(landUsePath) ? fs.readFileSync(landUsePath, 'utf8') : '{"features":[]}';

    const naturalData = JSON.parse(naturalRaw);
    const landUseData = JSON.parse(landUseRaw);

    const merged = [...(naturalData.features || []), ...(landUseData.features || [])];

    const tempFeatures: GeoJsonFeature[] = [];

    for (const feature of merged) {
      if (!feature.geometry) continue;
      if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue;

      const fclass = feature.properties?.fclass || '';
      
      const isTargetClass = [
        'forest',
        'wood',
        'water',
        'river',
        'lake',
        'wetland',
        'cliff',
        'spring',
        'beach'
      ].includes(fclass);

      if (!isTargetClass) continue;

      // Compute bounding box for optimization if not pre-computed
      if (!feature.bbox) {
        let minLng = Infinity;
        let maxLng = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;

        if (feature.geometry.type === 'Polygon') {
          for (const ring of feature.geometry.coordinates) {
            for (const pt of ring) {
              if (pt[0] < minLng) minLng = pt[0];
              if (pt[0] > maxLng) maxLng = pt[0];
              if (pt[1] < minLat) minLat = pt[1];
              if (pt[1] > maxLat) maxLat = pt[1];
            }
          }
        } else if (feature.geometry.type === 'MultiPolygon') {
          for (const poly of feature.geometry.coordinates) {
            for (const ring of poly) {
              for (const pt of ring) {
                if (pt[0] < minLng) minLng = pt[0];
                if (pt[0] > maxLng) maxLng = pt[0];
                if (pt[1] < minLat) minLat = pt[1];
                if (pt[1] > maxLat) maxLat = pt[1];
              }
            }
          }
        }
        feature.bbox = [minLng, minLat, maxLng, maxLat];
      }

      tempFeatures.push(feature);
    }

    walkableFeatures = tempFeatures;
    isLoaded = true;
    console.log(`[walkabilityCheck] Loaded ${walkableFeatures.length} non-walkable features.`);
  } catch (error) {
    console.error('[walkabilityCheck] Failed to load GeoJSON data:', error);
  }
}

export type TerrainCheckResult = 'mountain' | 'beach' | false;

/**
 * Checks if a given coordinate (lng, lat) is inside a non-walkable/special terrain area.
 * Phase 1: O(1) BBox 1차 검사 -> PIP 2차 검증
 */
export function isNonWalkableArea(lng: number, lat: number): TerrainCheckResult {
  if (!isLoaded) {
    loadGeoJsonData();
  }

  const pt = point([lng, lat]);

  for (const feature of walkableFeatures) {
    if (!feature.bbox) continue;
    const [minLng, minLat, maxLng, maxLat] = feature.bbox;

    // 1차 Phase 1: O(1) BBox 검사
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
      continue;
    }

    // 2차 Phase 1: PIP 2차 검증
    try {
      const isInside = booleanPointInPolygon(pt, feature as any);
      if (isInside) {
        const fclass = feature.properties?.fclass || '';
        if (fclass === 'beach') {
          return 'beach';
        }
        return 'mountain';
      }
    } catch {
      // ignore polygon math errors
    }
  }

  return false;
}


