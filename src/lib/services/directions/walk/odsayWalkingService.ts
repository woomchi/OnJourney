import type { DirectionResult, RouteGuideNode } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { haversineDistance, roundCoord } from '../common/distanceUtils';
import { toKstSearchTime } from '../common/timeUtils';
import { buildWalkFallbackResults } from './walkFallbackService';

/**
 * ODsay maasRP graph 파라미터 ("x y|x y|...") 파싱 유틸
 */
function parseGraphString(graph?: string): { lat: number; lng: number }[] {
  if (!graph) return [];
  const points: { lat: number; lng: number }[] = [];
  const pairs = graph.split('|');
  for (const pair of pairs) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
      }
    }
  }
  return points;
}

/**
 * maasRP 도보 구간의 routes[].(crossXYInfos + xyInfos) 상세 선형 좌표 파싱 유틸
 */
function parseWalkRoutesPoints(routes?: any[]): { lat: number; lng: number }[] {
  if (!routes || !Array.isArray(routes)) return [];
  const points: { lat: number; lng: number }[] = [];
  for (const route of routes) {
    if (route.crossXYInfos && Array.isArray(route.crossXYInfos)) {
      for (const pt of route.crossXYInfos) {
        const lng = typeof pt.x === 'string' ? parseFloat(pt.x) : pt.x;
        const lat = typeof pt.y === 'string' ? parseFloat(pt.y) : pt.y;
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng });
        }
      }
    }
    if (route.xyInfos && Array.isArray(route.xyInfos)) {
      for (const pt of route.xyInfos) {
        const lng = typeof pt.x === 'string' ? parseFloat(pt.x) : pt.x;
        const lat = typeof pt.y === 'string' ? parseFloat(pt.y) : pt.y;
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng });
        }
      }
    }
  }
  return points;
}

/**
 * ODsay 멀티모달 도보 경로(maasRP - SearchMethod: '1') 캐싱 함수
 */
export async function getCachedOdsayWalk(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  apiKey: string,
  departureTime?: number
) {
  const wsx = roundCoord(sx, 4).toFixed(4);
  const wsy = roundCoord(sy, 4).toFixed(4);
  const wex = roundCoord(ex, 4).toFixed(4);
  const wey = roundCoord(ey, 4).toFixed(4);
  const searchTime = toKstSearchTime(departureTime);

  return unstable_cache(
    async () => {
      try {
        const result = await odsayCircuitBreaker.execute<any>(
          async () => {
            const data = await OdsayAdapter.fetchMaasRPWalk(wsx, wsy, wex, wey, searchTime, apiKey);
            return data;
          },
          (err: unknown) => {
            const errorObj = err as { isRetryable?: boolean; message?: string; code?: string };
            const isRetryable = errorObj?.isRetryable === true || errorObj?.message?.includes('Circuit breaker is OPEN');
            if (!isRetryable) {
              console.warn('[odsayWalkingService] maasRP 도보 호출 영구 에러:', errorObj?.message || err);
              return null;
            }
            throw err;
          }
        );

        if (result && (result.result || result.paths || result.path)) {
          return result;
        }
        console.warn(`[odsayWalkingService] maasRP 도보 데이터 미존재, Fallback 적용`);
        return null;
      } catch (err: any) {
        const isQuotaError = err?.status === 429 || err?.code === 'TRANSIT_QUOTA_EXCEEDED' || err?.message?.includes('한도 초과');
        if (isQuotaError) {
          console.warn(`[odsayWalkingService] ODsay API 쿼터 한도 초과(429). Fallback 도보 경로로 즉시 전환합니다.`);
        } else {
          console.warn(`[odsayWalkingService] maasRP 도보 호출 예외 발생, Fallback 적용:`, err?.message || err);
        }
        return null;
      }
    },
    ['odsay-walking-maasrp-cache', wsx, wsy, wex, wey, searchTime.slice(0, 10)], // 1시간 단위 캐싱 분기
    { revalidate: 3600 }
  )();
}

/** 하위 호환성을 위한 alias export */
export const getCachedOdsayMaasRPWalk = getCachedOdsayWalk;

/**
 * ODsay maasRP API 응답 데이터를 DirectionResult[] (도보/자전거/킥보드) 뷰 모델로 파싱
 */
export function parseOdsayWalkingResponse(
  data: any,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (!data || (!data.result && !data.paths && !data.result?.paths && !data.result?.path)) {
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }

  const resultObj = data.result || data;
  const paths: any[] = resultObj.paths || resultObj.path || [];

  if (paths.length === 0) {
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }

  // 1. 도보 전용 경로 우선 선택 (pathType === 1), 없을 경우 첫 번째 경로
  const selectedPath = paths.find((p: any) => p.pathType === 1) || paths[0];

  const totalDistanceMeters =
    selectedPath.totalDistance ||
    selectedPath.info?.totalDistance ||
    selectedPath.info?.distance ||
    selectedPath.distance ||
    0;

  const totalTimeMinutes =
    selectedPath.totalTime ||
    selectedPath.info?.totalTime ||
    selectedPath.info?.time ||
    selectedPath.time ||
    0;

  const pathPoints: { lat: number; lng: number }[] = [];
  const guideNodes: RouteGuideNode[] = [];

  const rpsList: any[] = selectedPath.rps || selectedPath.subPath || [];
  for (const rp of rpsList) {
    // 1) graph 선형 파싱
    const graphPts = parseGraphString(rp.graph);
    if (graphPts.length > 0) {
      pathPoints.push(...graphPts);
    } else if (rp.routes && Array.isArray(rp.routes)) {
      // 2) maasRP routes 상세 선형 파싱 (crossXYInfos + xyInfos)
      const routePts = parseWalkRoutesPoints(rp.routes);
      if (routePts.length > 0) {
        pathPoints.push(...routePts);
      }
    } else if (rp.startX && rp.startY && rp.endX && rp.endY) {
      const startLat = parseFloat(rp.startY);
      const startLng = parseFloat(rp.startX);
      const endLat = parseFloat(rp.endY);
      const endLng = parseFloat(rp.endX);
      if (!isNaN(startLat) && !isNaN(startLng)) pathPoints.push({ lat: startLat, lng: startLng });
      if (!isNaN(endLat) && !isNaN(endLng)) pathPoints.push({ lat: endLat, lng: endLng });
    }

    // 3) 가이드 노드 수집 (턴바이턴 상세 안내)
    if (rp.guides && Array.isArray(rp.guides)) {
      for (const g of rp.guides) {
        const guidance = g.GUIDANCE || (g.ROAD_NAME ? `${g.ROAD_NAME} 이동` : '도보 이동');
        const dist = typeof g.LENGTH === 'number' ? g.LENGTH : 0;
        const dur = typeof g.DURATION === 'number'
          ? g.DURATION * 1000
          : Math.round((dist / (4.5 * 1000 / 3600)) * 1000);
        guideNodes.push({
          instructions: guidance,
          distance: dist,
          duration: dur,
        });
      }
    } else if (rp.trafficType === 3 || rp.sectionTime || rp.distance) {
      const stepDist = rp.distance || 0;
      const stepTimeMin = rp.sectionTime || rp.duration || 0;
      guideNodes.push({
        instructions: rp.startName ? `${rp.startName}에서 이동` : '도보 이동',
        distance: stepDist,
        duration: stepTimeMin * 60 * 1000,
      });
    }
  }

  // 중복 좌표 제거
  const cleanPathPoints: { lat: number; lng: number }[] = [];
  for (const pt of pathPoints) {
    if (cleanPathPoints.length === 0) {
      cleanPathPoints.push(pt);
    } else {
      const last = cleanPathPoints[cleanPathPoints.length - 1];
      if (Math.abs(last.lat - pt.lat) > 1e-6 || Math.abs(last.lng - pt.lng) > 1e-6) {
        cleanPathPoints.push(pt);
      }
    }
  }

  if (cleanPathPoints.length === 0) {
    cleanPathPoints.push({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  }

  // 출발지/목적지 지점 연결
  if (Math.abs(cleanPathPoints[0].lat - sy) > 1e-6 || Math.abs(cleanPathPoints[0].lng - sx) > 1e-6) {
    cleanPathPoints.unshift({ lat: sy, lng: sx });
  }
  if (
    Math.abs(cleanPathPoints[cleanPathPoints.length - 1].lat - ey) > 1e-6 ||
    Math.abs(cleanPathPoints[cleanPathPoints.length - 1].lng - ex) > 1e-6
  ) {
    cleanPathPoints.push({ lat: ey, lng: ex });
  }

  const distanceKm = totalDistanceMeters > 0
    ? totalDistanceMeters / 1000
    : haversineDistance(sy, sx, ey, ex);

  // 최소 도보 시간 검증 (8km/h 초과 = 도보 속도 불가능 시 4.5km/h 하버스인 계산 기반 산출)
  const minPossibleTimeMin = Math.round((distanceKm / 8.0) * 60);
  const walkDuration = (totalTimeMinutes > 0 && totalTimeMinutes >= minPossibleTimeMin)
    ? totalTimeMinutes
    : Math.max(1, Math.round((distanceKm / 4.5) * 60));

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
          pathPoints: cleanPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: cleanPathPoints,
      guide: guideNodes.length > 0 ? guideNodes : undefined,
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
          pathPoints: cleanPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: cleanPathPoints,
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
          pathPoints: cleanPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        },
      ],
      pathPoints: cleanPathPoints,
    },
  ];
}

/**
 * ODsay 멀티모달 도보 경로 조회 메인 서비스
 */
export async function fetchOdsayWalkingRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  departureTime?: number
): Promise<DirectionResult[]> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    console.warn('[odsayWalkingService] ODSAY_API_KEY가 설정되지 않았습니다. Fallback 도보 경로를 사용합니다.');
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }

  try {
    const data = await getCachedOdsayWalk(sx, sy, ex, ey, apiKey, departureTime);
    if (!data) {
      return buildWalkFallbackResults(sx, sy, ex, ey);
    }
    return parseOdsayWalkingResponse(data, sx, sy, ex, ey);
  } catch (error) {
    console.warn('[odsayWalkingService] ODsay 도보 API 호출 실패, Fallback 도보 경로를 적용합니다.', error);
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }
}

/**
 * ODsay 도보 상세 경로 지연 호출용 API
 */
export async function fetchOdsayDetailRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  departureTime?: number
): Promise<{ polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] }> {
  const walkResults = await fetchOdsayWalkingRoute(sx, sy, ex, ey, departureTime);
  const walkResult = walkResults.find((r) => r.id === 'walk');

  if (!walkResult) {
    throw new Error('ODsay 도보 상세 경로 파싱 실패');
  }

  return {
    polyline: walkResult.pathPoints,
    guide: walkResult.guide || [],
  };
}
