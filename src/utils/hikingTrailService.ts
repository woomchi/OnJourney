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
  if (!isLoaded) {
    loadHikingTrails();
  }

  if (cachedLineFeatures.length === 0 || !pathFinderInstance || cachedGraphNodes.length === 0) {
    return [];
  }

  const startPt = point([start.lng, start.lat]);
  const destPt = point([dest.lng, dest.lat]);

  // 1. Find startNode: nearest graph node to start point
  let startNode: [number, number] | null = null;
  let minStartDist = Infinity;

  for (const node of cachedGraphNodes) {
    const dist = distance(point(node), startPt, { units: 'kilometers' });
    if (dist < minStartDist) {
      minStartDist = dist;
      startNode = node;
    }
  }

  // If closest trail node is farther than 10km, return empty array fallback
  if (!startNode || minStartDist > 10.0) {
    return [];
  }

  // 2. Identify candidate exit nodes sorted by distance to dest
  const candidateExitNodesMap = new Map<string, { node: [number, number]; dist: number }>();

  // Add graph nodes near dest (limit to top 100 for speed)
  const graphCandidates = cachedGraphNodes
    .map(node => {
      const dist = distance(point(node), destPt, { units: 'kilometers' });
      return { node, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 100);

  graphCandidates.forEach(c => {
    const key = `${c.node[0].toFixed(5)},${c.node[1].toFixed(5)}`;
    candidateExitNodesMap.set(key, c);
  });

  // Add Point features (entrances) near dest
  // For each point, find the nearest graph node to it, and add that graph node as a candidate
  const pointCandidates = cachedPointFeatures
    .map(f => {
      const coords = f.geometry.coordinates as [number, number];
      const dist = distance(point(coords), destPt, { units: 'kilometers' });
      return { coords, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 50);

  pointCandidates.forEach(pc => {
    let nearestNode: [number, number] | null = null;
    let minD = Infinity;
    for (const gNode of cachedGraphNodes) {
      const d = distance(point(gNode), point(pc.coords), { units: 'kilometers' });
      if (d < minD) {
        minD = d;
        nearestNode = gNode;
      }
    }
    if (nearestNode) {
      const distToDest = distance(point(nearestNode), destPt, { units: 'kilometers' });
      const key = `${nearestNode[0].toFixed(5)},${nearestNode[1].toFixed(5)}`;
      const existing = candidateExitNodesMap.get(key);
      if (!existing || distToDest < existing.dist) {
        candidateExitNodesMap.set(key, { node: nearestNode, dist: distToDest });
      }
    }
  });

  // Sort combined candidate exit nodes by distance to dest
  const sortedCandidates = Array.from(candidateExitNodesMap.values())
    .sort((a, b) => a.dist - b.dist);

  // 3. Search for valid paths from startNode to reachable exit nodes
  const candidates: HikingPolylineResult[] = [];

  const buildPolyline = (startCoords: { lng: number; lat: number }, pathCoords: [number, number][]) => {
    const polyline: { lat: number; lng: number }[] = [];
    polyline.push({ lat: startCoords.lat, lng: startCoords.lng });
    for (const coord of pathCoords) {
      const last = polyline[polyline.length - 1];
      if (!last || Math.abs(last.lat - coord[1]) > 1e-7 || Math.abs(last.lng - coord[0]) > 1e-7) {
        polyline.push({ lat: coord[1], lng: coord[0] });
      }
    }
    return polyline;
  };

  for (const candidate of sortedCandidates) {
    try {
      const pathResult = pathFinderInstance.findPath(
        point(startNode),
        point(candidate.node)
      );

      if (pathResult && pathResult.path && pathResult.path.length >= 2) {
        const pathCoords = pathResult.path as [number, number][];
        const polyline = buildPolyline(start, pathCoords);

        // Calculate mountain distance
        let mountainDistance = 0;
        for (let j = 0; j < polyline.length - 1; j++) {
          mountainDistance += distance(point([polyline[j].lng, polyline[j].lat]), point([polyline[j + 1].lng, polyline[j + 1].lat]), { units: 'kilometers' });
        }

        // Calculate flat distance to dest
        const flatDistance = distance(point([candidate.node[0], candidate.node[1]]), destPt, { units: 'kilometers' });
        const totalDuration = (mountainDistance / 2.5) * 60 + (flatDistance / 4.5) * 60;

        const difficulty = getPathDifficulty(pathCoords);

        candidates.push({
          polyline,
          snappedStart: { lng: candidate.node[0], lat: candidate.node[1] },
          difficulty,
          mountainDistance,
          totalDuration,
        });
      }
    } catch (e) {
      // Continue
    }
  }

  // 4. Sort and filter duplicate routes
  // Sort by total duration ascending (fastest first)
  candidates.sort((a, b) => (a.totalDuration || 0) - (b.totalDuration || 0));

  const selectedResults: HikingPolylineResult[] = [];

  for (const cand of candidates) {
    // Check overlap with already selected paths
    const isOverlap = selectedResults.some(sel => arePathsOverlapping(cand.polyline, sel.polyline));
    if (!isOverlap) {
      selectedResults.push(cand);
      if (selectedResults.length >= 3) {
        break;
      }
    }
  }

  return selectedResults;
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
