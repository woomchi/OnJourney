import fs from 'fs';
import path from 'path';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import pointToLineDistance from '@turf/point-to-line-distance';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import type { FeatureCollection, Feature, LineString } from 'geojson';
import { isNonWalkableArea } from '@/lib/utils/walkabilityCheck';

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
}

let cachedLineFeatures: HikingTrailFeature[] = [];
let isLoaded = false;

/**
 * Loads hikingTrails.json and caches features whose geometry.type is LineString or MultiLineString.
 * Point features are filtered out.
 * MultiLineString features are normalized into individual LineString features for fast indexing.
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
      }
    }

    cachedLineFeatures = tempFeatures;
    isLoaded = true;
    console.log(`[hikingTrailService] Loaded and cached ${cachedLineFeatures.length} hiking trail LineString features.`);
  } catch (error) {
    console.error('[hikingTrailService] Failed to load hiking trails:', error);
  }

  return cachedLineFeatures;
}

/**
 * Given a start coordinate (inside a mountain/non-walkable area) and a destination coordinate,
 * finds the nearest hiking trail LineString, snaps the start point onto it,
 * and extracts a continuous polyline towards the destination up to the nearest exit node.
 *
 * @param start { lng, lat } Starting coordinate (e.g. in mountain)
 * @param dest { lng, lat } Destination coordinate
 * @returns { polyline, snappedStart } or null if no trail is found near start
 */
export function getHikingTrailPolyline(
  start: { lng: number; lat: number },
  dest: { lng: number; lat: number }
): HikingPolylineResult | null {
  if (!isLoaded) {
    loadHikingTrails();
  }

  if (cachedLineFeatures.length === 0) {
    return null;
  }

  const startPt = point([start.lng, start.lat]);
  const destPt = point([dest.lng, dest.lat]);

  // Spatial search bounding box: start point +/- 0.05 degrees (~5.5km)
  const SEARCH_MARGIN = 0.05;
  let candidates = cachedLineFeatures.filter(f => {
    const [minLng, minLat, maxLng, maxLat] = f.bbox;
    return (
      start.lng >= minLng - SEARCH_MARGIN &&
      start.lng <= maxLng + SEARCH_MARGIN &&
      start.lat >= minLat - SEARCH_MARGIN &&
      start.lat <= maxLat + SEARCH_MARGIN
    );
  });

  if (candidates.length === 0) {
    candidates = cachedLineFeatures;
  }

  let bestFeature: HikingTrailFeature | null = null;
  let minDistanceKm = Infinity;

  for (const candidate of candidates) {
    try {
      const dist = pointToLineDistance(startPt, candidate as any, { units: 'kilometers' });
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        bestFeature = candidate;
      }
    } catch {
      // Continue if geometry error
    }
  }

  // If closest trail is farther than 10km, return null fallback
  if (!bestFeature || minDistanceKm > 10.0) {
    return null;
  }

  // Snap start point onto the best feature
  const startSnap = nearestPointOnLine(bestFeature as any, startPt);
  const snapCoords = startSnap.geometry.coordinates; // [lng, lat]
  const snapLng = snapCoords[0];
  const snapLat = snapCoords[1];
  const segmentIdx = startSnap.properties.index ?? 0;

  const lineCoords = bestFeature.geometry.coordinates;

  // Trace Forward along LineString
  const forwardPath: [number, number][] = [[snapLng, snapLat]];
  let forwardExited = false;

  for (let i = segmentIdx + 1; i < lineCoords.length; i++) {
    const pt = lineCoords[i];
    forwardPath.push([pt[0], pt[1]]);

    if (!isNonWalkableArea(pt[0], pt[1])) {
      forwardExited = true;
      break;
    }
  }

  // Trace Backward along LineString
  const backwardPath: [number, number][] = [[snapLng, snapLat]];
  let backwardExited = false;

  for (let i = segmentIdx; i >= 0; i--) {
    const pt = lineCoords[i];
    backwardPath.push([pt[0], pt[1]]);

    if (!isNonWalkableArea(pt[0], pt[1])) {
      backwardExited = true;
      break;
    }
  }

  // Determine best directional path towards destination
  const forwardExitPt = forwardPath[forwardPath.length - 1];
  const backwardExitPt = backwardPath[backwardPath.length - 1];

  const distForwardToDest = distance(point(forwardExitPt), destPt, { units: 'kilometers' });
  const distBackwardToDest = distance(point(backwardExitPt), destPt, { units: 'kilometers' });

  let chosenPath: [number, number][];

  if (forwardExited && !backwardExited) {
    chosenPath = forwardPath;
  } else if (!forwardExited && backwardExited) {
    chosenPath = backwardPath;
  } else {
    // Both exited or neither exited: pick the exit point closer to destination
    chosenPath = distForwardToDest <= distBackwardToDest ? forwardPath : backwardPath;
  }

  // Format chosen path into { lat, lng }[]
  const polyline: { lat: number; lng: number }[] = [];

  // Start directly at user start location if slightly off snap
  polyline.push({ lat: start.lat, lng: start.lng });

  for (const coord of chosenPath) {
    const last = polyline[polyline.length - 1];
    if (!last || Math.abs(last.lat - coord[1]) > 1e-7 || Math.abs(last.lng - coord[0]) > 1e-7) {
      polyline.push({ lat: coord[1], lng: coord[0] });
    }
  }

  const exitNodeCoord = chosenPath[chosenPath.length - 1];
  const snappedStart = { lng: exitNodeCoord[0], lat: exitNodeCoord[1] };

  return {
    polyline,
    snappedStart,
  };
}
