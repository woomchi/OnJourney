import type { DirectionResult } from '@/types/journey';
import { externalFetch } from '@/lib/utils/externalFetch';
import { haversineDistance } from '../common/distanceUtils';
import { getCacheDuration } from '../common/timeUtils';

/**
 * 네이버 자동차 경로 호출 함수 (NCP Directions 5)
 */
export async function fetchCarRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  departureTime?: number
): Promise<DirectionResult[]> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Naver Directions API ID/Secret이 설정되지 않았습니다.');
  }

  const rsx = sx.toFixed(6);
  const rsy = sy.toFixed(6);
  const rex = ex.toFixed(6);
  const rey = ey.toFixed(6);
  const cacheDuration = getCacheDuration(departureTime);

  const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${rsx},${rsy}&goal=${rex},${rey}&option=trafast:traoptimal:traavoidtoll`;

  let res;
  try {
    res = await externalFetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      },
      next: { revalidate: cacheDuration },
    });
  } catch (err: any) {
    if (err.status === 408) {
      throw new Error('Naver Directions 5 API Timeout');
    }
    throw err;
  }

  const data = await res.json();

  if (data.code !== undefined && data.code !== 0) {
    console.error(`[carRouteService] Naver Directions API error code: ${data.code}, message: ${data.message}`);
    const err = new Error(`[Naver Directions API Error ${data.code}] ${data.message || '차량 경로를 찾을 수 없습니다.'}`);
    err.name = 'NaverApiError';
    throw err;
  }

  if (!data.route) {
    const err = new Error('차량 경로를 찾을 수 없습니다.');
    err.name = 'NoRouteFound';
    throw err;
  }

  const results: DirectionResult[] = [];
  const optionsMap = [
    { key: 'trafast', name: '실시간 빠른길' },
    { key: 'traoptimal', name: '실시간 최적길' },
    { key: 'traavoidtoll', name: '무료 도로' },
  ];

  for (const option of optionsMap) {
    const routeArray = data.route[option.key];
    if (routeArray && routeArray.length > 0) {
      const route = routeArray[0];
      const summary = route.summary;
      const durationMin = Math.max(1, Math.round(summary.duration / 1000 / 60)); // ms -> min
      const pathPoints = route.path ? route.path.map(([lng, lat]: [number, number]) => ({ lat, lng })) : [];
      const guide = route.guide
        ? route.guide.map((g: any) => ({
            instructions: g.instructions,
            distance: g.distance,
            duration: g.duration,
          }))
        : [];

      results.push({
        id: `car-${option.key}`,
        type: 'car' as const,
        name: option.name,
        duration: durationMin,
        fare: summary.tollFare || 0,
        taxiFare: summary.taxiFare || 0,
        distance: summary.distance / 1000,
        steps: [
          {
            type: 'car',
            name: '차량',
            duration: durationMin,
            color: '#F59E0B',
            pathPoints,
          },
        ],
        pathPoints,
        guide,
      });
    }
  }

  if (results.length === 0) {
    throw new Error('차량 경로를 찾을 수 없습니다.');
  }

  return results;
}

/**
 * 네이버 API 호출 실패 대비 Fallback 계산 함수
 */
export function calculateCarFallback(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult {
  const distance = haversineDistance(sy, sx, ey, ex); // km
  const duration = Math.max(3, Math.round((distance / 35) * 60 + 4));
  const estimatedRoadDistance = distance * 1.3;
  const taxiFare = 4800 + Math.round(estimatedRoadDistance * 1100);

  const fallbackPath = [
    { lat: sy, lng: sx },
    { lat: ey, lng: ex },
  ];

  return {
    id: 'car-trafast',
    type: 'car' as const,
    name: '실시간 빠른길(예상)',
    duration,
    fare: 0,
    taxiFare,
    distance: estimatedRoadDistance,
    isEstimated: true,
    steps: [
      {
        type: 'car',
        name: '차량(예상)',
        duration,
        color: '#F59E0B',
        pathPoints: fallbackPath,
      },
    ],
    pathPoints: fallbackPath,
    guide: [
      {
        instructions: '출발지에서 출발',
        distance: 0,
        duration: 0,
      },
      {
        instructions: '목적지 도착',
        distance: Math.round(distance * 1000), // m
        duration: duration * 60 * 1000, // ms
      },
    ],
  };
}
