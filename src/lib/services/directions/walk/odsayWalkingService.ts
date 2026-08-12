import type { DirectionResult, RouteGuideNode } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';
import { haversineDistance, roundCoord } from '../common/distanceUtils';
import { buildWalkFallbackResults } from './walkFallbackService';

/**
 * departureTime 또는 현재 시각을 yyyyMMddHHmm 문자열로 변환 유틸
 */
function toSearchTime(departureTime?: number): string {
  const d = departureTime ? new Date(departureTime) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

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
 * ODsay 멀티모달(maasRP) 도보 경로 캐싱 함수
 */
export async function getCachedOdsayMaasRPWalk(
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
  const searchTime = toSearchTime(departureTime);

  return unstable_cache(
    async () => {
      console.log(`[odsayWalkingService] ODsay maasRP 도보 경로 API 호출 (sx=${wsx}, sy=${wsy}, ex=${wex}, ey=${wey})`);
      try {
        const data = await OdsayAdapter.fetchMaasRP(wsx, wsy, wex, wey, searchTime, '2', apiKey);
        return data;
      } catch (err: any) {
        console.warn(`[odsayWalkingService] maasRP 호출 예외, searchWalkPathV2 폴백 시도:`, err?.message || err);
        try {
          return await OdsayAdapter.fetchWalkPathV2(wsx, wsy, wex, wey, apiKey);
        } catch (v2Err) {
          console.error(`[odsayWalkingService] searchWalkPathV2 호출도 실패:`, v2Err);
          return null;
        }
      }
    },
    ['odsay-walking-maas-cache', wsx, wsy, wex, wey, searchTime],
    { revalidate: 3600 }
  )();
}

/**
 * ODsay API 응답 데이터를 DirectionResult[] (도보/자전거/킥보드) 뷰 모델로 파싱
 */
export function parseOdsayWalkingResponse(
  data: any,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (!data || (!data.result && !data.paths && !data.result?.paths)) {
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }

  const resultObj = data.result || data;
  const paths: any[] = resultObj.paths || resultObj.path || [];
  
  let pathPoints: { lat: number; lng: number }[] = [];
  let totalDistanceMeters = 0;
  let totalTimeMinutes = 0;
  const guideNodes: RouteGuideNode[] = [];

  if (paths.length > 0) {
    // 1. 도보 우선 경로 또는 최단 경로 추출
    let selectedPath = paths.find((p: any) => p.pathType === 3) || paths[0];

    totalDistanceMeters = selectedPath.info?.totalDistance || selectedPath.totalDistance || 0;
    totalTimeMinutes = selectedPath.info?.totalTime || selectedPath.totalTime || 0;

    const rpsList: any[] = selectedPath.rps || selectedPath.subPath || [];
    for (const rp of rpsList) {
      // graph 선형 파싱
      const pts = parseGraphString(rp.graph);
      if (pts.length > 0) {
        pathPoints.push(...pts);
      } else if (rp.startX && rp.startY && rp.endX && rp.endY) {
        const startLat = parseFloat(rp.startY);
        const startLng = parseFloat(rp.startX);
        const endLat = parseFloat(rp.endY);
        const endLng = parseFloat(rp.endX);
        if (!isNaN(startLat) && !isNaN(startLng)) pathPoints.push({ lat: startLat, lng: startLng });
        if (!isNaN(endLat) && !isNaN(endLng)) pathPoints.push({ lat: endLat, lng: endLng });
      }

      // 가이드 노드 수집
      if (rp.trafficType === 3 || rp.sectionTime || rp.distance) {
        const stepDist = rp.distance || 0;
        const stepTimeMin = rp.sectionTime || rp.duration || 0;
        guideNodes.push({
          instructions: rp.startName ? `${rp.startName}에서 이동` : '도보 이동',
          distance: stepDist,
          duration: stepTimeMin * 60 * 1000,
        });
      }
    }
  }

  // 중복 좌표 제거
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

  if (cleanPathPoints.length === 0) {
    cleanPathPoints.push({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  }

  // 출발지/목적지 지점 연결
  if (cleanPathPoints[0].lat !== sy || cleanPathPoints[0].lng !== sx) {
    cleanPathPoints.unshift({ lat: sy, lng: sx });
  }
  if (cleanPathPoints[cleanPathPoints.length - 1].lat !== ey || cleanPathPoints[cleanPathPoints.length - 1].lng !== ex) {
    cleanPathPoints.push({ lat: ey, lng: ex });
  }

  const distanceKm = totalDistanceMeters > 0
    ? totalDistanceMeters / 1000
    : haversineDistance(sy, sx, ey, ex);

  const walkDuration = totalTimeMinutes > 0
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
    const data = await getCachedOdsayMaasRPWalk(sx, sy, ex, ey, apiKey, departureTime);
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
  ey: number
): Promise<{ polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] }> {
  const walkResults = await fetchOdsayWalkingRoute(sx, sy, ex, ey);
  const walkResult = walkResults.find((r) => r.id === 'walk');

  if (!walkResult) {
    throw new Error('ODsay 도보 상세 경로 파싱 실패');
  }

  return {
    polyline: walkResult.pathPoints,
    guide: walkResult.guide || [],
  };
}
