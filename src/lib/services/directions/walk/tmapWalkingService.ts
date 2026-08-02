import type { DirectionResult, RouteGuideNode } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { externalFetch } from '@/lib/utils/externalFetch';
import { haversineDistance, roundCoord } from '../common/distanceUtils';
import { probeTMapSnapPoint } from './tmapSnapProbeService';
import bearing from '@turf/bearing';
import { point } from '@turf/helpers';

/**
 * TMAP 도보 경로 캐싱 함수
 * - 좌표 정밀도를 소수점 4자리(약 11m)로 통일하여 캐시 히트율 정상화
 */
export const getCachedTMapWalkingRoute = unstable_cache(
  async (sx: number, sy: number, ex: number, ey: number, apiKey: string) => {
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
  },
  ['tmap-walking-route-cache'],
  { revalidate: 3600 }
);

/**
 * TMap API 응답을 DirectionResult 뷰 모델로 파싱
 */
export function parseTMapResponse(
  data: any,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (!data || !data.features || data.features.length === 0) {
    throw new Error('TMap API Response has no features');
  }

  const pathPoints: { lat: number; lng: number }[] = [];
  for (const feature of data.features) {
    if (feature.geometry?.type === 'LineString') {
      const coords = feature.geometry.coordinates;
      if (Array.isArray(coords)) {
        for (const coord of coords) {
          if (Array.isArray(coord) && coord.length >= 2) {
            pathPoints.push({ lat: coord[1], lng: coord[0] });
          }
        }
      }
    }
  }

  const cleanPathPoints: { lat: number; lng: number }[] = [];
  for (const pt of pathPoints) {
    if (cleanPathPoints.length === 0) {
      cleanPathPoints.push(pt);
    } else {
      const last = cleanPathPoints[cleanPathPoints.length - 1];
      if (last.lat !== pt.lat || last.lng !== pt.lng) {
        cleanPathPoints.push(pt);
      }
    }
  }

  let extraDistanceKm = 0;
  let extraTimeSeconds = 0;
  const finalPathPoints = [...cleanPathPoints];

  let startLinkDistance = 0;
  let endLinkDistance = 0;

  if (cleanPathPoints.length > 0) {
    const tmapFirst = cleanPathPoints[0];
    const tmapLast = cleanPathPoints[cleanPathPoints.length - 1];

    startLinkDistance = haversineDistance(sy, sx, tmapFirst.lat, tmapFirst.lng);
    endLinkDistance = haversineDistance(tmapLast.lat, tmapLast.lng, ey, ex);

    if (startLinkDistance > 0.0001) {
      finalPathPoints.unshift({ lat: sy, lng: sx });
      extraDistanceKm += startLinkDistance;
      extraTimeSeconds += (startLinkDistance / 4.5) * 3600;
    }
    if (endLinkDistance > 0.0001) {
      finalPathPoints.push({ lat: ey, lng: ex });
      extraDistanceKm += endLinkDistance;
      extraTimeSeconds += (endLinkDistance / 4.5) * 3600;
    }
  } else {
    finalPathPoints.push({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  }

  const firstProps = data.features[0]?.properties || {};
  const totalDistanceMeters = firstProps.totalDistance ?? 0;
  const totalTimeSeconds = firstProps.totalTime ?? 0;

  const baseDistanceKm =
    totalDistanceMeters > 0 ? totalDistanceMeters / 1000 : haversineDistance(sy, sx, ey, ex);

  const baseTimeSeconds =
    totalTimeSeconds > 0 ? totalTimeSeconds : (baseDistanceKm / 4.5) * 3600;

  const distanceKm = baseDistanceKm + extraDistanceKm;
  const walkDuration = Math.max(1, Math.round((baseTimeSeconds + extraTimeSeconds) / 60));

  const guide: any[] = [];
  for (const feature of data.features) {
    if (feature.geometry?.type === 'Point' && feature.properties?.description) {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        guide.push({
          instructions: props.description,
          distance: props.distance ?? 0,
          duration: (props.time ?? 0) * 1000,
          startLat: coords[1],
          startLng: coords[0],
        });
      }
    }
  }

  if (cleanPathPoints.length > 0) {
    if (startLinkDistance > 0.0001) {
      guide.unshift({
        instructions: '출발지에서 도로(출입구)까지 이동',
        distance: Math.round(startLinkDistance * 1000),
        duration: Math.round((startLinkDistance / 4.5) * 3600 * 1000),
        startLat: sy,
        startLng: sx,
      });
    }

    if (endLinkDistance > 0.0001) {
      const arrivalIdx = guide.findIndex((g) => g.instructions.includes('도착'));
      const endGuideNode = {
        instructions: '도로(출입구)에서 목적지까지 이동',
        distance: Math.round(endLinkDistance * 1000),
        duration: Math.round((endLinkDistance / 4.5) * 3600 * 1000),
        startLat: cleanPathPoints[cleanPathPoints.length - 1].lat,
        startLng: cleanPathPoints[cleanPathPoints.length - 1].lng,
      };

      if (arrivalIdx !== -1) {
        guide.splice(arrivalIdx, 0, endGuideNode);
      } else {
        guide.push(endGuideNode);
      }
    }
  }

  const bicycleDuration = Math.max(1, Math.round((distanceKm / 15) * 60));
  const kickboardDuration = Math.max(1, Math.round((distanceKm / 18) * 60));
  const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

  return [
    {
      id: 'walk',
      type: 'walk' as const,
      name: '도보',
      duration: walkDuration,
      fare: 0,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '도보',
          duration: walkDuration,
          color: '#E4E4E7',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: finalPathPoints,
      guide: guide.length > 0 ? guide : undefined,
    },
    {
      id: 'bicycle',
      type: 'bicycle' as const,
      name: '자전거',
      duration: bicycleDuration,
      fare: 0,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '자전거',
          duration: bicycleDuration,
          color: '#10B981',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: finalPathPoints,
    },
    {
      id: 'kickboard',
      type: 'kickboard' as const,
      name: '공유 킥보드',
      duration: kickboardDuration,
      fare: kickboardFare,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '공유 킥보드',
          duration: kickboardDuration,
          color: '#8B5CF6',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: finalPathPoints,
    },
  ];
}

/**
 * TMAP 상세 경로 지연 호출용 API 핵심 비즈니스 로직
 */
export async function fetchTmapDetailRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<{ polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] }> {
  const apiKey = process.env.TMAP_API_KEY;
  if (!apiKey) {
    throw new Error('TMAP_API_KEY가 설정되지 않았습니다.');
  }

  // 좌표 정밀도를 소수점 4자리(약 11m)로 반올림하여 캐시 키 통일
  const wsx = roundCoord(sx, 4);
  const wsy = roundCoord(sy, 4);
  const wex = roundCoord(ex, 4);
  const wey = roundCoord(ey, 4);

  const bearDeg = bearing(point([wsx, wsy]), point([wex, wey]));
  const probeRes = await probeTMapSnapPoint(wsx, wsy, wex, wey, apiKey, bearDeg);
  const tmapData = probeRes.tmapData;
  const finalSx = probeRes.snappedLng;
  const finalSy = probeRes.snappedLat;

  if (!tmapData || !tmapData.features || tmapData.features.length === 0) {
    throw new Error('TMAP API 상세 경로를 탐색할 수 없습니다.');
  }

  const walkResults = parseTMapResponse(tmapData, finalSx, finalSy, wex, wey);
  const walkResult = walkResults.find((r) => r.id === 'walk');

  if (!walkResult) {
    throw new Error('TMAP 도보 상세 경로 파싱 실패');
  }

  return {
    polyline: walkResult.pathPoints,
    guide: walkResult.guide || [],
  };
}
