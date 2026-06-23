import type { Place, DirectionResult, DirectionsApiResponse } from '@/types/journey';
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

/**
 * 단일 구간 길찾기 API를 호출하고 결과를 반환합니다. 실패 시 Fallback 데이터를 제공합니다.
 */
export async function fetchSegmentDirections(origin: Place, dest: Place): Promise<DirectionsApiResponse> {
  try {
    const url = `/api/directions?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('이동 경로 요청 실패');
    }
    return await res.json();
  } catch (err) {
    console.warn(`[directionsService] API failed for ${origin.place_name} -> ${dest.place_name}, using fallback.`, err);
    return getFallbackDirections(origin, dest);
  }
}
