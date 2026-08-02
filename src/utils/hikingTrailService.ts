import fs from 'fs';
import path from 'path';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { FeatureCollection, Feature, LineString } from 'geojson';
import PathFinder from 'geojson-path-finder';

export interface HikingTrailFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  properties: Record<string, any>;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

export interface HikingPolylineResult {
  polyline: { lat: number; lng: number }[];
  snappedStart: { lng: number; lat: number };
  difficulty?: string;
  mountainDistance?: number;
  totalDuration?: number;
}

let cachedLineFeatures: HikingTrailFeature[] = [];
let cachedPointFeatures: any[] = [];
let cachedGraphNodes: [number, number][] = [];
let pathFinderInstance: PathFinder | null = null;
let isLoaded = false;

/**
 * Loads hikingTrails.json and caches features whose geometry.type is LineString, MultiLineString, or Point.
 * MultiLineString features are normalized into individual LineString features for fast indexing.
 * Builds the geojson-path-finder routing graph using the LineString features.
 */
export function loadHikingTrails(): HikingTrailFeature[] {
  if (isLoaded) return cachedLineFeatures;

  try {
    const jsonPath = path.join(process.cwd(), 'data', 'hikingTrails.json');
    if (!fs.existsSync(jsonPath)) {
      console.warn(`[hikingTrailService] File not found: ${jsonPath}`);
      return [];
    }

    const rawData = fs.readFileSync(jsonPath, 'utf8');
    const geojson: FeatureCollection = JSON.parse(rawData);

    const tempFeatures: HikingTrailFeature[] = [];
    const tempPoints: any[] = [];

    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      const geomType = feature.geometry.type;

      if (geomType === 'LineString') {
        const coords = (feature.geometry as LineString).coordinates;
        if (!coords || coords.length < 2) continue;

        let minLng = Infinity;
        let maxLng = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;

        for (const pt of coords) {
          if (pt[0] < minLng) minLng = pt[0];
          if (pt[0] > maxLng) maxLng = pt[0];
          if (pt[1] < minLat) minLat = pt[1];
          if (pt[1] > maxLat) maxLat = pt[1];
        }

        tempFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: feature.properties || {},
          bbox: [minLng, minLat, maxLng, maxLat],
        });
      } else if (geomType === 'MultiLineString') {
        const multiCoords = (feature.geometry as any).coordinates as number[][][];
        if (!multiCoords) continue;

        for (const coords of multiCoords) {
          if (!coords || coords.length < 2) continue;

          let minLng = Infinity;
          let maxLng = -Infinity;
          let minLat = Infinity;
          let maxLat = -Infinity;

          for (const pt of coords) {
            if (pt[0] < minLng) minLng = pt[0];
            if (pt[0] > maxLng) maxLng = pt[0];
            if (pt[1] < minLat) minLat = pt[1];
            if (pt[1] > maxLat) maxLat = pt[1];
          }

          tempFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            properties: feature.properties || {},
            bbox: [minLng, minLat, maxLng, maxLat],
          });
        }
      } else if (geomType === 'Point') {
        tempPoints.push(feature);
      }
    }

    cachedLineFeatures = tempFeatures;
    cachedPointFeatures = tempPoints;

    // Build the geojson-path-finder routing graph using LineStrings
    const lineFeaturesCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: cachedLineFeatures.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties
      }))
    };

    pathFinderInstance = new PathFinder(lineFeaturesCollection, { precision: 1e-5 });

    // Collect unique graph nodes from LineStrings
    const nodeSet = new Set<string>();
    const tempNodes: [number, number][] = [];
    cachedLineFeatures.forEach(f => {
      f.geometry.coordinates.forEach(coord => {
        const key = `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
        if (!nodeSet.has(key)) {
          nodeSet.add(key);
          tempNodes.push([coord[0], coord[1]]);
        }
      });
    });
    cachedGraphNodes = tempNodes;

    isLoaded = true;
    console.log(`[hikingTrailService] Loaded: ${cachedLineFeatures.length} LineStrings, ${cachedPointFeatures.length} Points, ${cachedGraphNodes.length} Graph Nodes.`);
  } catch (error) {
    console.error('[hikingTrailService] Failed to load hiking trails:', error);
  }

  return cachedLineFeatures;
}

/**
 * Given a start coordinate (inside a mountain/non-walkable area) and a destination coordinate,
 * finds the nearest hiking trail graph node, snaps the start point onto it,
 * and uses geojson-path-finder to query the shortest trail path to the optimal exit node.
 *
 * @param start { lng, lat } Starting coordinate (e.g. in mountain)
 * @param dest { lng, lat } Destination coordinate
 * @returns { polyline, snappedStart } or null if no trail is found near start
 */
export function getHikingTrailPolyline(
  start: { lng: number; lat: number },
  dest: { lng: number; lat: number }
): HikingPolylineResult[] {
  // [임시 비활성화] API 호출 속도 향상을 위해 빈 배열 즉시 반환
  return [];
}


function arePathsOverlapping(p1: { lat: number; lng: number }[], p2: { lat: number; lng: number }[]): boolean {
  let sharedCount = 0;
  for (const pt1 of p1) {
    const hasClosePoint = p2.some(pt2 => 
      Math.abs(pt1.lat - pt2.lat) < 1e-4 && Math.abs(pt1.lng - pt2.lng) < 1e-4
    );
    if (hasClosePoint) {
      sharedCount++;
    }
  }
  const ratio = sharedCount / Math.min(p1.length, p2.length);
  return ratio > 0.6; // 60% overlap threshold
}

function getPathDifficulty(path: [number, number][]): string {
  let difficulty = '쉬움';
  const difficulties: string[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const c1 = path[i];
    const c2 = path[i + 1];

    const matchedFeature = cachedLineFeatures.find(f => {
      const coords = f.geometry.coordinates;
      for (let j = 0; j < coords.length - 1; j++) {
        const pt1 = coords[j];
        const pt2 = coords[j + 1];
        if (
          (Math.abs(pt1[0] - c1[0]) < 1e-5 && Math.abs(pt1[1] - c1[1]) < 1e-5 &&
           Math.abs(pt2[0] - c2[0]) < 1e-5 && Math.abs(pt2[1] - c2[1]) < 1e-5) ||
          (Math.abs(pt1[0] - c2[0]) < 1e-5 && Math.abs(pt1[1] - c2[1]) < 1e-5 &&
           Math.abs(pt2[0] - c1[0]) < 1e-5 && Math.abs(pt2[1] - c1[1]) < 1e-5)
        ) {
          return true;
        }
      }
      return false;
    });

    if (matchedFeature && matchedFeature.properties?.PMNTN_DFFL) {
      difficulties.push(matchedFeature.properties.PMNTN_DFFL);
    }
  }

  if (difficulties.length > 0) {
    if (difficulties.includes('어려움')) difficulty = '어려움';
    else if (difficulties.includes('중간')) difficulty = '중간';
    else difficulty = difficulties[0];
  }

  return difficulty;
}
