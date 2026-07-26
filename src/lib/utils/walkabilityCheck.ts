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
    const landUsePath = path.join(dataDir, 'landUseData.json');

    const naturalRaw = fs.readFileSync(naturalPath, 'utf8');
    const landUseRaw = fs.readFileSync(landUsePath, 'utf8');

    const naturalData = JSON.parse(naturalRaw);
    const landUseData = JSON.parse(landUseRaw);

    const merged = [...(naturalData.features || []), ...(landUseData.features || [])];

    const tempFeatures: GeoJsonFeature[] = [];

    for (const feature of merged) {
      if (!feature.geometry) continue;
      if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') continue;

      const fclass = feature.properties?.fclass || '';
      
      // Filter relevant non-walkable categories:
      // forest (산/숲), cliff (절벽), spring (샘/물길), beach (해변 - 보행 불가/불편 구역)
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

      // Compute bounding box for optimization
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
      tempFeatures.push(feature);
    }

    walkableFeatures = tempFeatures;
    isLoaded = true;
    console.log(`[walkabilityCheck] Loaded ${walkableFeatures.length} non-walkable features.`);
  } catch (error) {
    console.error('[walkabilityCheck] Failed to load GeoJSON data:', error);
  }
}

/**
 * Checks if a given coordinate (lng, lat) is inside a non-walkable area (forest, water, cliff, etc.)
 */
export function isNonWalkableArea(lng: number, lat: number): boolean {
  if (!isLoaded) {
    loadGeoJsonData();
  }

  const pt = point([lng, lat]);

  for (const feature of walkableFeatures) {
    if (!feature.bbox) continue;
    const [minLng, minLat, maxLng, maxLat] = feature.bbox;
    // Bbox quick check
    if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
      // Precise Turf check
      if (booleanPointInPolygon(pt, feature as any)) {
        return true;
      }
    }
  }

  return false;
}
