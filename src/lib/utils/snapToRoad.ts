import distance from '@turf/distance';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import { point } from '@turf/helpers';
import { isNonWalkableArea } from '@/lib/utils/walkabilityCheck';

export interface RoadCoords {
  lng: number;
  lat: number;
}

/**
 * 출발지부터 목적지 방향으로 가상의 선(Ray)을 따라 약 50m(0.05km) 간격으로 이동하며,
 * 비보행 영역(산/수계 등)을 탈출하는 최초의 Exit Point 지점을 찾습니다.
 */
export function findExitPoint(
  startLng: number,
  startLat: number,
  destLng: number,
  destLat: number
): { lng: number; lat: number } {
  try {
    const startPt = point([startLng, startLat]);
    const destPt = point([destLng, destLat]);

    const totalDistKm = distance(startPt, destPt, { units: 'kilometers' });
    if (totalDistKm <= 0) {
      return { lng: startLng, lat: startLat };
    }

    const bearDeg = bearing(startPt, destPt);
    const STEP_KM = 0.05; // 50m 간격

    let traveledKm = STEP_KM;
    while (traveledKm <= totalDistKm) {
      const candidate = destination(startPt, traveledKm, bearDeg, { units: 'kilometers' });
      const [cLng, cLat] = candidate.geometry.coordinates;

      // 산/강/절벽 등 비보행 구역을 빠져나와 보행 가능 구역(false)이 된 최초 지점
      if (!isNonWalkableArea(cLng, cLat)) {
        return { lng: cLng, lat: cLat };
      }

      traveledKm += STEP_KM;
    }

    // 목적지까지 갔으나 여전히 탈출 지점을 못 찾은 경우 원본 출발지 좌표 반환
    return { lng: startLng, lat: startLat };
  } catch (error) {
    console.error('[snapToRoad] Error finding exit point via Turf raycasting:', error);
    return { lng: startLng, lat: startLat };
  }
}

/**
 * Finds the nearest road coordinate to a given start coordinate facing towards destination coordinate
 * by finding the initial Exit Point from non-walkable areas.
 *
 * @param startLng Longitude of the start coordinate
 * @param startLat Latitude of the start coordinate
 * @param destLng Longitude of the destination coordinate
 * @param destLat Latitude of the destination coordinate
 * @returns Exit point coordinate { lng, lat }
 */
export async function getNearestRoadCoords(
  startLng: number,
  startLat: number,
  destLng: number,
  destLat: number
): Promise<RoadCoords> {
  return findExitPoint(startLng, startLat, destLng, destLat);
}
