import distance from '@turf/distance';
import destination from '@turf/destination';
import { point } from '@turf/helpers';
import { externalFetch } from '@/lib/utils/externalFetch';

/**
 * TMAP 도보 API 직접 호출 (Probing 연산용)
 */
export async function fetchTMapWalkingRouteDirect(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  apiKey: string
): Promise<any> {
  const url = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
  const body = {
    startX: sx,
    startY: sy,
    endX: ex,
    endY: ey,
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName: '출발지',
    endName: '목적지',
  };

  const res = await externalFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      appKey: apiKey,
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

/**
 * TMAP 내부 자동 스냅 좌표 오차 검증 Probing 루프.
 * 요청 좌표와 TMAP 실제 시작 노드 간 오차가 50m 이상인 경우(절벽/옹벽 우회 스냅)
 * 목적지 방향으로 40m씩 전진하며 교차점을 재타진합니다. (최대 3회로 최적화)
 */
export async function probeTMapSnapPoint(
  initialSnapLng: number,
  initialSnapLat: number,
  destLng: number,
  destLat: number,
  apiKey: string,
  bearDeg: number
): Promise<{ tmapData: any; snappedLng: number; snappedLat: number }> {
  const MAX_ITERATIONS = 3; // 5회 -> 3회로 최적화하여 지연시간 단축
  const SNAP_THRESHOLD_KM = 0.05; // 50m
  const ADVANCE_STEP_KM = 0.04; // 40m

  let snapLng = initialSnapLng;
  let snapLat = initialSnapLat;
  let lastTmapData: any = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      const tmapData = await fetchTMapWalkingRouteDirect(snapLng, snapLat, destLng, destLat, apiKey);
      lastTmapData = tmapData;

      if (!tmapData || !tmapData.features || !Array.isArray(tmapData.features) || tmapData.features.length === 0) {
        break;
      }

      let firstCoord: [number, number] | undefined;
      for (const feature of tmapData.features) {
        if (
          feature.geometry?.type === 'LineString' &&
          Array.isArray(feature.geometry.coordinates) &&
          feature.geometry.coordinates.length > 0
        ) {
          firstCoord = feature.geometry.coordinates[0];
          break;
        }
      }

      if (!firstCoord || !Array.isArray(firstCoord) || firstCoord.length < 2) {
        break;
      }

      const [tmapLng, tmapLat] = firstCoord;
      const reqPt = point([snapLng, snapLat]);
      const tmapPt = point([tmapLng, tmapLat]);

      const snapErrorKm = distance(reqPt, tmapPt, { units: 'kilometers' });

      if (snapErrorKm < SNAP_THRESHOLD_KM) {
        // console.log(`[probeTMapSnapPoint] Probing success at step ${i + 1}: snap error = ${Math.round(snapErrorKm * 1000)}m (< 50m)`);
        return { tmapData, snappedLng: snapLng, snappedLat: snapLat };
      }

      // console.warn(`[probeTMapSnapPoint] Probing step ${i + 1} failed: snap error = ${Math.round(snapErrorKm * 1000)}m (>= 50m). Advancing 40m towards destination.`);

      const advanced = destination(point([snapLng, snapLat]), ADVANCE_STEP_KM, bearDeg, { units: 'kilometers' });
      const [nextLng, nextLat] = advanced.geometry.coordinates;

      const remainingDistKm = distance(advanced, point([destLng, destLat]), { units: 'kilometers' });
      snapLng = nextLng;
      snapLat = nextLat;

      if (remainingDistKm <= ADVANCE_STEP_KM) {
        // console.warn('[probeTMapSnapPoint] Reached destination vicinity during probing.');
        break;
      }
    } catch (err) {
      // console.error(`[probeTMapSnapPoint] Error during probing step ${i + 1}:`, err);
      break;
    }
  }

  return { tmapData: lastTmapData, snappedLng: snapLng, snappedLat: snapLat };
}
