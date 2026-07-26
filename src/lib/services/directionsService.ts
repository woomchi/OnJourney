import type { Place, DirectionResult, DirectionsApiResponse, CarWalkDirectionsResult, SnapMeta } from '@/types/journey';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import { TRANSIT_SPEEDS } from '@/constants/transit';

/**
 * 여정지 순서 변경이나 삭제 시, 매칭되지 않는 기존 경로 선택 정보를 정돈합니다.
 */
export function verifyAndCleanRoutes(places: Place[]): Place[] {
  return places.map((place, idx) => {
    const nextPlace = idx < places.length - 1 ? places[idx + 1] : null;
    if (place.selected_route) {
      if (!nextPlace || place.selected_route.destId !== nextPlace.id) {
        const { selected_route, ...rest } = place;
        return rest as Place;
      }
    }
    return place;
  });
}

/**
 * 외부 API 호출 실패 시 제공할 하드코딩 대체(Fallback) 경로 데이터를 생성합니다.
 */
export function getFallbackDirections(origin: Place, dest: Place): DirectionsApiResponse {
  const distanceKm = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng) / 1000;
  
  const walkDuration = Math.round((distanceKm / TRANSIT_SPEEDS.AVERAGE_WALK_KMH) * 60);
  const carDuration = Math.max(3, Math.round((distanceKm / TRANSIT_SPEEDS.AVERAGE_CAR_KMH) * 60 + 4));
  const taxiFare = 4800 + Math.round(distanceKm * 1.3 * 1100);
  
  const fallbackPath = [
    { lat: origin.lat, lng: origin.lng },
    { lat: dest.lat, lng: dest.lng }
  ];

  const publicResults: DirectionResult[] = distanceKm > 2.0 ? [{
    id: 'public-0',
    type: 'public' as const,
    name: '대중교통(예상)',
    duration: Math.round(carDuration * 1.3),
    fare: 1500,
    steps: [{
      type: 'bus' as const,
      name: '대중교통(예상)',
      duration: Math.round(carDuration * 1.3),
      color: '#0068b7',
      pathPoints: fallbackPath
    }],
    pathPoints: fallbackPath
  }] : [];

  const carFallback: DirectionResult = {
    id: 'car-trafast',
    type: 'car' as const,
    name: '실시간 빠른길(예상)',
    duration: carDuration,
    fare: 0,
    taxiFare,
    steps: [{
      type: 'car' as const,
      name: '차량',
      duration: carDuration,
      color: '#F59E0B',
      pathPoints: fallbackPath
    }],
    pathPoints: fallbackPath
  };

  const walkFallback: DirectionResult = {
    id: 'walk',
    type: 'walk' as const,
    name: '도보',
    duration: walkDuration,
    fare: 0,
    steps: [{
      type: 'walk' as const,
      name: '도보',
      duration: walkDuration,
      color: '#E4E4E7',
      pathPoints: fallbackPath
    }],
    pathPoints: fallbackPath
  };

  return {
    public: publicResults,
    car: [carFallback],
    walk: [walkFallback]
  };
}

export async function fetchPublicDirectionsApi(origin: Place, dest: Place): Promise<{ public: DirectionResult[] }> {
  try {
    const url = `/api/directions/public?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('대중교통 경로 요청 실패');
    const payload = await res.json();
    if (!payload.success) throw new Error(payload.error || '대중교통 경로 요청 실패');
    return payload.data;
  } catch (err) {
    console.warn(`[directionsService] Public API failed for ${origin.place_name} -> ${dest.place_name}, using fallback.`, err);
    const fallback = getFallbackDirections(origin, dest);
    return { public: fallback.public };
  }
}

export async function fetchCarWalkDirectionsApi(
  origin: Place,
  dest: Place
): Promise<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }> {
  try {
    const url = `/api/directions/car?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('차량 경로 요청 실패');
    const payload = await res.json();
    if (!payload.success) throw new Error(payload.error || '차량 경로 요청 실패');

    const data: CarWalkDirectionsResult = payload.data;

    // 거리 초과 응답 처리
    if ('status' in data && data.status === 'EXCEED_LIMIT') {
      console.warn(`[directionsService] ${data.message} (${origin.place_name} -> ${dest.place_name}), using fallback.`);
      const fallback = getFallbackDirections(origin, dest);
      return { car: fallback.car, walk: fallback.walk };
    }

    // 타입 내로잉: EXCEED_LIMIT가 아닌 경우 car/walk/snapMeta 포함 분기
    const successData = data as { car: DirectionResult[]; walk: DirectionResult[]; snapMeta: SnapMeta };
    return { car: successData.car, walk: successData.walk, snapMeta: successData.snapMeta };
  } catch (err) {
    console.warn(`[directionsService] Car API failed for ${origin.place_name} -> ${dest.place_name}, using fallback.`, err);
    const fallback = getFallbackDirections(origin, dest);
    return { car: fallback.car, walk: fallback.walk };
  }
}
