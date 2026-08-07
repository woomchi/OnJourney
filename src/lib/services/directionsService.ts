/**
 * @fileoverview 경로 탐색 서비스 — 클라이언트 사이드 API 호출 레이어
 *
 * 서버 API Route(`/api/directions/*`)를 호출하여 대중교통·차량·도보
 * 경로 데이터를 가져옵니다. 비즈니스 로직은 포함하지 않으며,
 * 실패 시 `Fallback` 경로를 생성하는 `getFallbackDirections`를 제공합니다.
 */

import type {
  Place,
  DirectionResult,
  DirectionsApiResponse,
  CarWalkDirectionsResult,
  SnapMeta,
  RouteGuideNode,
} from '@/types/journey';
import { calculateHaversineDistance } from '@/lib/naverMapRouteService';
import { TRANSIT_SPEEDS } from '@/constants/transit';
import { TAXI_BASE_FARE, TAXI_DISTANCE_RATE, TAXI_SURCHARGE_FACTOR } from '@/constants/fare';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 대중교통 Fallback을 제공하는 최소 거리 기준 (km) — 이하는 도보 권장 */
const PUBLIC_FALLBACK_MIN_DISTANCE_KM = 2.0;

/** 차량 Fallback 소요 시간 보정 상수 (분) */
const CAR_FALLBACK_DURATION_OFFSET_MIN = 4;

/** 차량 Fallback 최소 소요 시간 (분) */
const CAR_FALLBACK_MIN_DURATION_MIN = 3;

/** 대중교통 Fallback 소요 시간 배율 (차량 시간 대비) */
const PUBLIC_FALLBACK_DURATION_MULTIPLIER = 1.3;

/** 대중교통 Fallback 기본 요금 (원) */
const PUBLIC_FALLBACK_FARE = 1_500;

// ─── 공개 유틸리티 ────────────────────────────────────────────────────────────

/**
 * 외부 API 호출 실패 시 사용하는 Fallback 경로 데이터를 생성합니다.
 *
 * - Haversine 직선 거리를 기반으로 소요 시간을 추산합니다.
 * - 2km 미만 구간에는 대중교통 Fallback을 포함하지 않습니다.
 * - 경로 좌표(`pathPoints`)는 출발지 → 목적지 직선으로 구성됩니다.
 */
export function getFallbackDirections(origin: Place, dest: Place): DirectionsApiResponse {
  const distanceKm = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng) / 1_000;

  const walkDuration = Math.round((distanceKm / TRANSIT_SPEEDS.AVERAGE_WALK_KMH) * 60);
  const carDuration = Math.max(
    CAR_FALLBACK_MIN_DURATION_MIN,
    Math.round((distanceKm / TRANSIT_SPEEDS.AVERAGE_CAR_KMH) * 60 + CAR_FALLBACK_DURATION_OFFSET_MIN)
  );
  const taxiFare = TAXI_BASE_FARE + Math.round(distanceKm * TAXI_SURCHARGE_FACTOR * TAXI_DISTANCE_RATE);

  const fallbackPath = [
    { lat: origin.lat, lng: origin.lng },
    { lat: dest.lat, lng: dest.lng },
  ];

  // 2km 미만은 도보로 충분하므로 대중교통 Fallback 미포함
  const publicResults: DirectionResult[] =
    distanceKm > PUBLIC_FALLBACK_MIN_DISTANCE_KM
      ? [
          {
            id: 'public-0',
            type: 'public' as const,
            name: '대중교통(예상)',
            duration: Math.round(carDuration * PUBLIC_FALLBACK_DURATION_MULTIPLIER),
            fare: PUBLIC_FALLBACK_FARE,
            steps: [
              {
                type: 'bus' as const,
                name: '대중교통(예상)',
                duration: Math.round(carDuration * PUBLIC_FALLBACK_DURATION_MULTIPLIER),
                color: '#0068b7',
                pathPoints: fallbackPath,
              },
            ],
            pathPoints: fallbackPath,
          },
        ]
      : [];

  const carFallback: DirectionResult = {
    id: 'car-trafast',
    type: 'car' as const,
    name: '실시간 빠른길(예상)',
    duration: carDuration,
    fare: 0,
    taxiFare,
    steps: [
      {
        type: 'car' as const,
        name: '차량',
        duration: carDuration,
        color: '#F59E0B',
        pathPoints: fallbackPath,
      },
    ],
    pathPoints: fallbackPath,
  };

  const walkFallback: DirectionResult = {
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
        color: '#E4E4E7',
        pathPoints: fallbackPath,
      },
    ],
    pathPoints: fallbackPath,
  };

  return {
    public: publicResults,
    car: [carFallback],
    walk: [walkFallback],
  };
}

/**
 * 여정지 순서 변경·삭제 시 매칭되지 않는 기존 경로 선택 정보를 정돈합니다.
 *
 * 선택된 경로(`selected_route`)의 목적지 ID(`destId`)가 다음 경유지 ID와
 * 일치하지 않으면 해당 선택을 제거합니다.
 */
export function verifyAndCleanRoutes(places: Place[]): Place[] {
  return places.map((place, idx) => {
    const nextPlace = idx < places.length - 1 ? places[idx + 1] : null;
    if (place.selected_route) {
      if (!nextPlace || place.selected_route.destId !== nextPlace.id) {
        const { selected_route: _, ...rest } = place;
        return rest as Place;
      }
    }
    return place;
  });
}

// ─── API 호출 함수 ────────────────────────────────────────────────────────────

/**
 * 대중교통 경로를 서버 API에서 조회합니다.
 *
 * @param origin        출발 장소
 * @param dest          목적 장소
 * @param departureTime 출발 시각 (Unix timestamp, ms). 미전달 시 현재 시각 기준
 * @throws 서버 응답 오류 또는 API 오류 시 에러를 재전파합니다.
 */
export async function fetchPublicDirectionsApi(
  origin: Place,
  dest: Place,
  departureTime?: number
): Promise<{ public: DirectionResult[] }> {
  let url = `/api/directions/public?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
  if (departureTime) url += `&departureTime=${departureTime}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('대중교통 경로 요청 실패');

  const payload = await res.json() as { success: boolean; data?: { public: DirectionResult[] }; error?: string };
  if (!payload.success) throw new Error(payload.error || '대중교통 경로 요청 실패');

  return payload.data!;
}

/**
 * 차량 및 도보 경로를 서버 API에서 조회합니다.
 *
 * - 도보 탐색 범위(10km 초과)를 벗어난 경우 `status: 'EXCEED_LIMIT'` 응답을 에러로 변환합니다.
 *
 * @param origin        출발 장소
 * @param dest          목적 장소
 * @param departureTime 출발 시각 (Unix timestamp, ms). 미전달 시 현재 시각 기준
 * @throws 서버 응답 오류, 범위 초과, API 오류 시 에러를 재전파합니다.
 */
export async function fetchCarWalkDirectionsApi(
  origin: Place,
  dest: Place,
  departureTime?: number
): Promise<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }> {
  let url = `/api/directions/car?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
  if (departureTime) url += `&departureTime=${departureTime}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('차량 경로 요청 실패');

  const payload = await res.json() as { success: boolean; data?: CarWalkDirectionsResult; error?: string };
  if (!payload.success) throw new Error(payload.error || '차량 경로 요청 실패');

  const data = payload.data!;

  const successData = data as { car: DirectionResult[]; walk: DirectionResult[]; snapMeta: SnapMeta };
  return { car: successData.car || [], walk: successData.walk || [], snapMeta: successData.snapMeta };
}

/**
 * T맵 상세 경로(폴리라인 + 안내 정보)를 서버 API에서 조회합니다.
 *
 * @param sx 출발지 경도
 * @param sy 출발지 위도
 * @param ex 목적지 경도
 * @param ey 목적지 위도
 * @throws 서버 응답 오류 또는 API 오류 시 에러를 재전파합니다.
 */
export async function fetchTmapDetailRouteApi(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<{ polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] }> {
  const url = `/api/directions/tmap-detail?sx=${sx}&sy=${sy}&ex=${ex}&ey=${ey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('상세 경로 요청 실패');

  const payload = await res.json() as {
    success: boolean;
    data?: { polyline: { lat: number; lng: number }[]; guide: RouteGuideNode[] };
    error?: string;
  };
  if (!payload.success) throw new Error(payload.error || '상세 경로 요청 실패');

  return payload.data!;
}
