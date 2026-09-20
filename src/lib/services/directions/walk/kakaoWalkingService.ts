import type { DirectionResult, RouteGuideNode } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { KakaoWalkingAdapter, type KakaoWalkResponse } from '@/lib/infrastructure/kakaoWalkingAdapter';
import { haversineDistance, roundCoord } from '../common/distanceUtils';
import { buildWalkFallbackResults } from './walkFallbackService';

/**
 * Kakao Developers Walk API 응답 → { lat, lng }[] 폴리라인 + RouteGuideNode[] 안내 파싱
 */
function parseKakaoWalkingResponse(
  data: KakaoWalkResponse,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): { polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[]; distanceKm: number; durationMin: number } {
  const route = data.route;
  const distanceM = route?.properties?.totalDistance ?? 0;
  const durationSec = route?.properties?.totalTime ?? 0;
  const distanceKm = distanceM > 0 ? distanceM / 1000 : haversineDistance(sy, sx, ey, ex);
  const durationMin = durationSec > 0 ? Math.round(durationSec / 60) : Math.max(1, Math.round((distanceKm / 4.5) * 60));

  const rawPoints: { lat: number; lng: number }[] = [];
  const guide: RouteGuideNode[] = [];

  for (const leg of route?.legs ?? []) {
    for (const step of leg.steps ?? []) {
      // 1. 점(좌표) 수집: step.path.points = [[lng, lat], ...]
      for (const pt of step.path?.points ?? []) {
        const [lng, lat] = pt;
        if (!isNaN(lat) && !isNaN(lng)) {
          rawPoints.push({ lat, lng });
        }
      }

      // 2. 가이드(안내) 수집
      if (step.properties?.guidance) {
        guide.push({
          instructions: step.properties.guidance,
          distance: step.properties.distance ?? 0,
          duration: Math.round((step.properties.time ?? 0) * 1000), // 초 → ms
        });
      }
    }
  }

  // 중복 좌표 제거
  const polyline: { lat: number; lng: number }[] = [];
  for (const pt of rawPoints) {
    if (polyline.length === 0) {
      polyline.push(pt);
    } else {
      const last = polyline[polyline.length - 1];
      if (Math.abs(last.lat - pt.lat) > 1e-7 || Math.abs(last.lng - pt.lng) > 1e-7) {
        polyline.push(pt);
      }
    }
  }

  // 출발/도착 연결 보정
  if (polyline.length === 0) {
    polyline.push({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  } else {
    if (Math.abs(polyline[0].lat - sy) > 1e-5 || Math.abs(polyline[0].lng - sx) > 1e-5) {
      polyline.unshift({ lat: sy, lng: sx });
    }
    if (
      Math.abs(polyline[polyline.length - 1].lat - ey) > 1e-5 ||
      Math.abs(polyline[polyline.length - 1].lng - ex) > 1e-5
    ) {
      polyline.push({ lat: ey, lng: ex });
    }
  }

  return { polyline, guide, distanceKm, durationMin };
}

/**
 * Kakao Walk API 호출 + Next.js unstable_cache (1시간 TTL)
 */
async function getCachedKakaoWalk(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<KakaoWalkResponse | null> {
  const wsx = roundCoord(sx, 4).toFixed(4);
  const wsy = roundCoord(sy, 4).toFixed(4);
  const wex = roundCoord(ex, 4).toFixed(4);
  const wey = roundCoord(ey, 4).toFixed(4);

  return unstable_cache(
    async () => {
      try {
        const data = await KakaoWalkingAdapter.fetchWalkingDirections(sx, sy, ex, ey);
        return data;
      } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? '';
        console.warn('[kakaoWalkingService] Kakao 도보 API 호출 실패, fallback 사용:', msg);
        return null;
      }
    },
    ['kakao-walk-dapi-v1', wsx, wsy, wex, wey],
    { revalidate: 3600 }
  )();
}

/**
 * Kakao Developers 도보 길찾기 메인 서비스 함수
 *
 * 우선순위: Kakao Walk API (dapi.kakao.com/v2/routing/walk) → buildWalkFallbackResults(직선)
 */
export async function fetchKakaoWalkingRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<DirectionResult[]> {
  try {
    const data = await getCachedKakaoWalk(sx, sy, ex, ey);
    if (!data) {
      return buildWalkFallbackResults(sx, sy, ex, ey);
    }

    const { polyline, guide, distanceKm, durationMin } = parseKakaoWalkingResponse(data, sx, sy, ex, ey);
    const bicycleDuration = Math.max(1, Math.round((distanceKm / 15) * 60));
    const kickboardDuration = Math.max(1, Math.round((distanceKm / 18) * 60));
    const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

    return [
      {
        id: 'walk',
        type: 'walk' as const,
        name: '도보',
        duration: durationMin,
        fare: 0,
        distance: distanceKm,
        steps: [
          {
            type: 'walk' as const,
            name: '도보',
            duration: durationMin,
            color: '#E4E4E7',
            pathPoints: polyline,
            startLat: sy,
            startLng: sx,
            endLat: ey,
            endLng: ex,
          },
        ],
        pathPoints: polyline,
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
            pathPoints: polyline,
            startLat: sy,
            startLng: sx,
            endLat: ey,
            endLng: ex,
          },
        ],
        pathPoints: polyline,
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
            pathPoints: polyline,
            startLat: sy,
            startLng: sx,
            endLat: ey,
            endLng: ex,
          },
        ],
        pathPoints: polyline,
      },
    ];
  } catch (error) {
    console.warn('[kakaoWalkingService] 예외 발생, Fallback 직선 경로 사용:', error);
    return buildWalkFallbackResults(sx, sy, ex, ey);
  }
}

/**
 * walk-detail API Route용 - 폴리라인 + 안내 정보 반환
 */
export async function fetchKakaoWalkDetailRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<{ polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] }> {
  try {
    const data = await getCachedKakaoWalk(sx, sy, ex, ey);
    if (!data) {
      return {
        polyline: [{ lat: sy, lng: sx }, { lat: ey, lng: ex }],
        guide: [],
      };
    }
    const { polyline, guide } = parseKakaoWalkingResponse(data, sx, sy, ex, ey);
    return { polyline, guide };
  } catch (error) {
    console.warn('[kakaoWalkingService] 상세 경로 예외, 직선 반환:', error);
    return {
      polyline: [{ lat: sy, lng: sx }, { lat: ey, lng: ex }],
      guide: [],
    };
  }
}
