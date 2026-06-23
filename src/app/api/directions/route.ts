import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { DirectionResult, DirectionsApiResponse } from '@/types/journey';
import {
  haversineDistance,
  fetchPublicTransitOptions,
  fetchCarRoute,
  calculateCarFallback,
} from '@/lib/services/serverDirectionsService';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sxStr = searchParams.get('sx');
  const syStr = searchParams.get('sy');
  const exStr = searchParams.get('ex');
  const eyStr = searchParams.get('ey');

  if (!sxStr || !syStr || !exStr || !eyStr) {
    return NextResponse.json(
      { error: '출발지(sx, sy)와 도착지(ex, ey) 좌표가 필요합니다.' },
      { status: 400 }
    );
  }

  const sx = parseFloat(sxStr);
  const sy = parseFloat(syStr);
  const ex = parseFloat(exStr);
  const ey = parseFloat(eyStr);

  if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) {
    return NextResponse.json(
      { error: '좌표는 올바른 숫자 포맷이어야 합니다.' },
      { status: 400 }
    );
  }

  try {
    // 좌표 반올림 (소수점 4자리, 약 11m 오차 범위 내 캐시 히트율 극대화)
    const roundCoord = (val: number) => Math.round(val * 10000) / 10000;
    const rsx = roundCoord(sx);
    const rsy = roundCoord(sy);
    const rex = roundCoord(ex);
    const rey = roundCoord(ey);

    const supabase = await createClient();

    // 7일 TTL 캐시 조회
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: cacheData } = await supabase
      .from('route_cache')
      .select('route_data')
      .eq('origin_lat', rsy)
      .eq('origin_lng', rsx)
      .eq('dest_lat', rey)
      .eq('dest_lng', rex)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cacheData && cacheData.route_data) {
      console.log('[directions] Cache HIT');
      return NextResponse.json(cacheData.route_data);
    }

    console.log('[directions] Cache MISS');

    const distanceKm = haversineDistance(sy, sx, ey, ex);
    const fallbackPath = [
      { lat: sy, lng: sx },
      { lat: ey, lng: ex },
    ];

    const [publicRes, carRes] = await Promise.allSettled([
      fetchPublicTransitOptions(sx, sy, ex, ey),
      fetchCarRoute(sx, sy, ex, ey)
    ]);

    // 1. 대중교통 대안 목록 구성
    let publicResults: DirectionResult[] = [];
    if (publicRes.status === 'fulfilled') {
      publicResults = publicRes.value;
    } else {
      console.warn('[directions] fetchPublicTransitOptions failed:', publicRes.reason);
      const carFallback = calculateCarFallback(sx, sy, ex, ey);
      publicResults = [
        {
          id: 'public-0',
          type: 'public' as const,
          name: '대중교통(예상)',
          duration: Math.round(carFallback.duration * 1.3),
          fare: 1500,
          steps: [
            {
              type: 'bus' as const,
              name: '대중교통(예상)',
              duration: Math.round(carFallback.duration * 1.3),
              color: '#0068b7',
              pathPoints: fallbackPath,
            }
          ],
          pathPoints: fallbackPath
        }
      ];
    }

    // 2. 차량 대안 목록 구성
    let carResults: DirectionResult[] = [];
    let baseCarResults: DirectionResult[];

    if (carRes.status === 'fulfilled') {
      baseCarResults = carRes.value;
    } else {
      console.warn('[directions] fetchCarRoute failed, using fallback:', carRes.reason);
      baseCarResults = [calculateCarFallback(sx, sy, ex, ey)];
    }

    carResults = baseCarResults;

    // 3. 도보 대안 목록 구성 (도보, 자전거, 공유 킥보드)
    const walkDuration = Math.round((distanceKm / 4.5) * 60);
    const bicycleDuration = Math.round((distanceKm / 15) * 60);
    const kickboardDuration = Math.round((distanceKm / 18) * 60);
    const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

    const walkResult: DirectionResult = {
      id: 'walk',
      type: 'walk' as const,
      name: '도보',
      duration: walkDuration,
      fare: 0,
      steps: [
        {
          type: 'walk' as const,
          name: '도보',
          duration: walkDuration,
          color: '#A1A1AA',
          pathPoints: fallbackPath
        }
      ],
      pathPoints: fallbackPath
    };

    const bicycleResult: DirectionResult = {
      id: 'bicycle',
      type: 'bicycle' as const,
      name: '자전거',
      duration: bicycleDuration,
      fare: 0,
      steps: [
        {
          type: 'walk' as const,
          name: '자전거',
          duration: bicycleDuration,
          color: '#10B981',
          pathPoints: fallbackPath
        }
      ],
      pathPoints: fallbackPath
    };

    const kickboardResult: DirectionResult = {
      id: 'kickboard',
      type: 'kickboard' as const,
      name: '공유 킥보드',
      duration: kickboardDuration,
      fare: kickboardFare,
      steps: [
        {
          type: 'walk' as const,
          name: '공유 킥보드',
          duration: kickboardDuration,
          color: '#8B5CF6',
          pathPoints: fallbackPath
        }
      ],
      pathPoints: fallbackPath
    };

    const walkResults = [walkResult, bicycleResult, kickboardResult];

    const responseData: DirectionsApiResponse = {
      public: publicResults,
      car: carResults,
      walk: walkResults
    };

    // 백그라운드 캐시 저장 (응답 지연 방지)
    supabase.from('route_cache').insert({
      origin_lat: rsy,
      origin_lng: rsx,
      dest_lat: rey,
      dest_lng: rex,
      route_data: responseData
    }).then(({ error }) => {
      if (error) console.error('[directions] Failed to save route_cache:', error);
    });

    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[directions] unexpected error:', err);
    return NextResponse.json(
      { error: '이동 경로 정보 조회 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
