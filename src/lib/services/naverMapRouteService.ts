/**
 * @fileoverview 네이버 지도 경로 탐색 관련 유틸리티 모음
 *
 * - NaverRouteResponse: 네이버 Direction 5 API 응답 인터페이스
 * - 좌표 계산 유틸(Haversine, Bounds 등)
 * - NaverDirectionService: 프록시 API 통신 담당
 * - RouteDataParser: API 응답 → 네이버 지도 객체 변환
 * - NaverMapRouteRenderer: 폴리라인 렌더링 및 Viewport 조정
 */

// ─── 외부 의존성 ────────────────────────────────────────────────────────────
import { getDefaultRoute } from '@/lib/utils/routeUtils';
import { Place, DirectionResult, SelectedRoute } from '@/types/journey';
import { TAXI_BASE_FARE, TAXI_DISTANCE_RATE, TAXI_SURCHARGE_FACTOR } from '@/constants/fare';

// ─── 내부 상수 ──────────────────────────────────────────────────────────────

/** 단일 마커 등 크기가 0이거나 매우 작은 Bounds에 적용할 최소 범위 (위/경도 단위) */
const MIN_BOUNDS_SPAN = 0.0015;

/** expandBounds에서 ratio가 0 이하일 때 적용되는 기본 안전 여백 비율 (3%) */
const DEFAULT_EXPAND_RATIO = 0.03;

/** expandBounds에서 적용되는 최소 확장량 (위/경도 단위) */
const MIN_EXPANSION = 0.0005;

/** fitMapBounds에서 bounds를 소량 확장하는 비율 (1%) — 패딩이 이미 역할을 함 */
const BOUNDS_FIT_EXPAND_RATIO = 0.01;

/** 차량 경로 폴리라인 기본 색상 */
const CAR_ROUTE_STROKE_COLOR = '#f59e0b';

/** Fallback 경로 생성 시 사용하는 평균 차량 속도 (m/s, 35 km/h 기준) */
const FALLBACK_AVG_SPEED_MS = 9.72;

/** Fallback 경로 구간당 최소 소요 시간 (밀리초, 3분) */
const FALLBACK_MIN_DURATION_MS = 180_000;

/** 폴리라인 기본 투명도 */
const POLYLINE_STROKE_OPACITY = 0.85;

/** 폴리라인 기본 두께 (px) */
const POLYLINE_STROKE_WEIGHT = 6.5;

// ─── 타입 정의 ──────────────────────────────────────────────────────────────

/** 활성 경로 인자 타입 — DirectionResult 또는 SelectedRoute를 모두 허용 */
type ActiveRoute = DirectionResult | SelectedRoute;

/** 지도에 표시되는 좌표 포인트 */
interface LatLngPoint {
  lat: number;
  lng: number;
}

/** 남서(SW) / 북동(NE) 두 꼭짓점으로 정의되는 경계 직사각형 */
interface BoundsRect {
  sw: LatLngPoint;
  ne: LatLngPoint;
}

// ─── API 응답 인터페이스 ─────────────────────────────────────────────────────

/**
 * 네이버 Direction 5 API 응답 인터페이스.
 * 프록시 서버(`/api/directions-waypoints`)를 통해 수신합니다.
 */
export interface NaverRouteResponse {
  code: number;
  message: string;
  currentDateTime: string;
  route?: {
    traoptimal?: Array<{
      summary: {
        start: { location: [number, number] };
        goal: {
          location: [number, number];
          distance: number;
          duration: number;
          pointIndex: number;
        };
        waypoints?: Array<{
          location: [number, number];
          distance: number;
          duration: number;
          pointIndex: number;
        }>;
        distance: number; // 총 거리 (미터)
        duration: number; // 총 소요시간 (밀리초)
        tollFare?: number;
        taxiFare?: number;
        fuelPrice?: number;
      };
      path: Array<[number, number]>; // [경도, 위도] 순서의 좌표 배열
      section?: Array<{
        pointIndex: number;
        pointCount: number;
        distance: number;
        duration: number;
      }>;
      guide?: Array<{
        pointIndex: number;
        type: number;
        instructions: string;
        distance: number;
        duration: number;
      }>;
    }>;
  };
}

// ─── 순수 함수 유틸리티 ──────────────────────────────────────────────────────

/**
 * 두 좌표 간 직선 거리를 계산합니다 (Haversine 공식).
 * @returns 거리 (미터, m)
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const EARTH_RADIUS_KM = 6_371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c * 1_000; // km → m 환산
}

/**
 * 좌표 배열에서 남서(SW) / 북동(NE) Bounds를 계산하는 내부 헬퍼.
 */
function computeBoundsFromPoints(points: LatLngPoint[]): BoundsRect {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    sw: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    ne: { lat: Math.max(...lats), lng: Math.max(...lngs) },
  };
}

/**
 * ActiveRoute에서 상세 경로 좌표(pathPoints)를 추출합니다.
 * - `pathPoints`가 있으면 그대로 반환합니다.
 * - `steps` 배열이 있으면 각 step의 pathPoints를 평탄화합니다.
 */
function extractPathPointsFromRoute(route: ActiveRoute): LatLngPoint[] {
  const points: LatLngPoint[] = [];

  if ('pathPoints' in route && route.pathPoints && route.pathPoints.length > 0) {
    points.push(...route.pathPoints);
    return points;
  }

  if ('steps' in route && route.steps) {
    for (const step of route.steps) {
      if (step.pathPoints && step.pathPoints.length > 0) {
        points.push(...step.pathPoints);
      }
    }
  }

  return points;
}

/**
 * 특정 구간(출발지 → 목적지)의 상세 경로 포인트를 포함하는 Bounds를 계산합니다.
 * @param origin  출발지 좌표
 * @param dest    목적지 좌표
 * @param activeRoute 해당 구간의 활성 경로 (선택)
 */
export function calculateSegmentBounds(
  origin: LatLngPoint,
  dest: LatLngPoint,
  activeRoute?: ActiveRoute
): BoundsRect {
  const points: LatLngPoint[] = [origin, dest];

  if (activeRoute) {
    points.push(...extractPathPointsFromRoute(activeRoute));
  }

  return computeBoundsFromPoints(points);
}

/**
 * Bounds를 지정된 비율만큼 확장합니다.
 *
 * - ratio가 0 이하이면 안전 여백(`DEFAULT_EXPAND_RATIO = 3%`)을 적용합니다.
 * - 크기가 0에 가까운 Bounds는 최소 크기(`MIN_BOUNDS_SPAN`)를 보장합니다.
 *
 * @param boundsObj 원본 경계
 * @param ratio     확장 비율 (양수: 확장, 0 이하: 기본값 적용)
 */
export function expandBounds(boundsObj: BoundsRect, ratio: number): BoundsRect {
  const latDiff = boundsObj.ne.lat - boundsObj.sw.lat;
  const lngDiff = boundsObj.ne.lng - boundsObj.sw.lng;

  // 단일 마커처럼 크기가 0이거나 매우 작을 때 최소 크기 보장
  const effectiveLatDiff = Math.max(latDiff, MIN_BOUNDS_SPAN);
  const effectiveLngDiff = Math.max(lngDiff, MIN_BOUNDS_SPAN);

  // 음수·0 비율은 기본 안전 여백으로 대체 (침범 방지)
  const safeRatio = ratio <= 0 ? DEFAULT_EXPAND_RATIO : ratio;

  const latExpansion = Math.max(effectiveLatDiff * safeRatio, MIN_EXPANSION);
  const lngExpansion = Math.max(effectiveLngDiff * safeRatio, MIN_EXPANSION);

  return {
    sw: {
      lat: boundsObj.sw.lat - latExpansion,
      lng: boundsObj.sw.lng - lngExpansion,
    },
    ne: {
      lat: boundsObj.ne.lat + latExpansion,
      lng: boundsObj.ne.lng + lngExpansion,
    },
  };
}

/**
 * 전체 여정의 모든 경유지 및 캐시된 경로 좌표를 포함하는 Bounds를 계산합니다.
 * @param places           여정 경유지 배열
 * @param directionsCache  구간별 캐시된 경로 데이터
 * @param transportType    이동 수단 유형
 * @returns 여정 전체를 포함하는 BoundsRect, 경유지가 없으면 null
 */
export function calculateJourneyBounds(
  places: Place[],
  directionsCache: Record<string, unknown>,
  transportType: string = 'public'
): BoundsRect | null {
  if (places.length === 0) return null;

  const points: LatLngPoint[] = places.map((p) => ({ lat: p.lat, lng: p.lng }));

  // 캐시된 활성 경로의 상세 좌표 추가
  for (let i = 0; i < places.length - 1; i++) {
    const origin = places[i];
    const dest = places[i + 1];
    const cacheKey = `${origin.id}-${dest.id}`;
    const segmentData = directionsCache[cacheKey];

    const activeRoute = getDefaultRoute(
      origin,
      dest,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segmentData as any,
      transportType as 'public' | 'car' | 'walk'
    );

    if (activeRoute) {
      points.push(...extractPathPointsFromRoute(activeRoute));
    }
  }

  return computeBoundsFromPoints(points);
}

/**
 * 단일 경로 step 또는 좌표 배열의 Bounds를 계산합니다.
 *
 * - `LatLngPoint[]` 배열을 직접 전달하면 해당 배열의 Bounds를 반환합니다.
 * - step 객체를 전달하면 pathPoints → 시작/종료 좌표 순으로 참조합니다.
 * @returns BoundsRect, 좌표 정보가 전혀 없으면 null
 */
export function calculateStepBounds(
  stepOrPoints:
    | LatLngPoint[]
    | {
        pathPoints?: LatLngPoint[];
        startLat?: number;
        startLng?: number;
        endLat?: number;
        endLng?: number;
      }
): BoundsRect | null {
  // LatLngPoint[] 배열이 직접 전달된 경우
  if (Array.isArray(stepOrPoints)) {
    if (stepOrPoints.length === 0) return null;
    return computeBoundsFromPoints(stepOrPoints);
  }

  const step = stepOrPoints;
  const points: LatLngPoint[] = [];

  if (step.pathPoints && step.pathPoints.length > 0) {
    points.push(...step.pathPoints);
  } else {
    if (step.startLat !== undefined && step.startLng !== undefined) {
      points.push({ lat: step.startLat, lng: step.startLng });
    }
    if (step.endLat !== undefined && step.endLng !== undefined) {
      points.push({ lat: step.endLat, lng: step.endLng });
    }
  }

  if (points.length === 0) return null;

  return computeBoundsFromPoints(points);
}

// ─── 서비스 클래스 ───────────────────────────────────────────────────────────

/**
 * 네이버 Direction API 통신 담당 서비스.
 *
 * 프록시 서버(`/api/directions-waypoints`)에 요청하며,
 * API 호출 실패 시 직선 거리 기반 Fallback 응답을 자동으로 생성합니다.
 */
export class NaverDirectionService {
  private static readonly PROXY_ENDPOINT = '/api/directions-waypoints';

  /**
   * 출발지 → 경유지들 → 목적지 경로를 조회합니다.
   * @param start     출발 좌표
   * @param goal      목적 좌표
   * @param waypoints 중간 경유지 목록 (선택)
   * @param option    경로 옵션 (기본: 'traoptimal')
   */
  public static async fetchRoute(
    start: LatLngPoint,
    goal: LatLngPoint,
    waypoints: LatLngPoint[] = [],
    option = 'traoptimal'
  ): Promise<NaverRouteResponse> {
    const startParam = `${start.lng},${start.lat}`;
    const goalParam = `${goal.lng},${goal.lat}`;

    let url =
      `${this.PROXY_ENDPOINT}` +
      `?start=${encodeURIComponent(startParam)}` +
      `&goal=${encodeURIComponent(goalParam)}` +
      `&option=${option}`;

    if (waypoints.length > 0) {
      const waypointsParam = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join('|');
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `HTTP error ${res.status}`);
      }
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error || 'API 응답 오류');
      return payload.data as NaverRouteResponse;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        '[NaverDirectionService] 실제 경로 API 호출 실패, Fallback 경로로 대체합니다. 원인:',
        reason
      );
      return this.generateFallbackResponse(start, goal, waypoints);
    }
  }

  /**
   * API 실패 시 직선 거리 및 차량 가속 모델 기반의 Fallback 응답을 생성합니다.
   *
   * - 구간별 소요 시간은 평균 35 km/h(FALLBACK_AVG_SPEED_MS)로 추산합니다.
   * - 구간당 최소 소요 시간은 3분(FALLBACK_MIN_DURATION_MS)입니다.
   */
  private static generateFallbackResponse(
    start: LatLngPoint,
    goal: LatLngPoint,
    waypoints: LatLngPoint[] = []
  ): NaverRouteResponse {
    const allPoints = [start, ...waypoints, goal];
    const pathCoords: Array<[number, number]> = [];
    const sections: Array<{
      pointIndex: number;
      pointCount: number;
      distance: number;
      duration: number;
    }> = [];

    let currentPointIndex = 0;
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < allPoints.length - 1; i++) {
      const p1 = allPoints[i];
      const p2 = allPoints[i + 1];

      const dist = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      // 평균 속도(35 km/h = 9.72 m/s) 기반 소요 시간, 최소 3분 보장
      const dur = Math.max(FALLBACK_MIN_DURATION_MS, Math.round((dist / FALLBACK_AVG_SPEED_MS) * 1_000));

      pathCoords.push([p1.lng, p1.lat]);
      pathCoords.push([p2.lng, p2.lat]);

      sections.push({
        pointIndex: currentPointIndex,
        pointCount: 2,
        distance: Math.round(dist),
        duration: dur,
      });

      totalDistance += dist;
      totalDuration += dur;
      currentPointIndex += 2;
    }

    // 마지막 목적지 좌표 추가
    pathCoords.push([goal.lng, goal.lat]);

    // 대략적인 택시 요금 추산
    const distanceKm = totalDistance / 1_000;
    const taxiFare = TAXI_BASE_FARE + Math.round(distanceKm * TAXI_SURCHARGE_FACTOR * TAXI_DISTANCE_RATE);

    return {
      code: 0,
      message: 'fallback_success',
      currentDateTime: new Date().toISOString(),
      route: {
        traoptimal: [
          {
            summary: {
              start: { location: [start.lng, start.lat] },
              goal: {
                location: [goal.lng, goal.lat],
                distance: sections[sections.length - 1].distance,
                duration: sections[sections.length - 1].duration,
                pointIndex: allPoints.length * 2 - 2,
              },
              waypoints: waypoints.map((wp, j) => ({
                location: [wp.lng, wp.lat] as [number, number],
                distance: sections[j].distance,
                duration: sections[j].duration,
                pointIndex: (j + 1) * 2,
              })),
              distance: Math.round(totalDistance),
              duration: totalDuration,
              tollFare: 0,
              taxiFare,
            },
            path: pathCoords,
            section: sections,
            guide: allPoints.map((pt, idx) => ({
              pointIndex: idx * 2,
              type: idx === 0 ? 1 : idx === allPoints.length - 1 ? 2 : 3,
              instructions:
                idx === 0
                  ? '출발지에서 출발'
                  : idx === allPoints.length - 1
                  ? '목적지 도착'
                  : `경유지 ${idx} 경유`,
              distance: idx === 0 ? 0 : sections[idx - 1].distance,
              duration: idx === 0 ? 0 : sections[idx - 1].duration,
            })),
          },
        ],
      },
    };
  }
}

// ─── 파서 클래스 ──────────────────────────────────────────────────────────────

/**
 * 네이버 Direction API 응답 데이터를 파싱하는 클래스.
 *
 * API 응답의 [경도, 위도] 좌표 배열을 네이버 지도 SDK의 LatLng 객체로 변환하거나,
 * 경로 요약 정보(거리, 시간, 요금)를 정규화된 형태로 변환합니다.
 */
export class RouteDataParser {
  /**
   * API 결과의 [경도, 위도] 배열을 `naver.maps.LatLng` 배열로 변환합니다.
   * @throws 네이버 지도 SDK가 로드되지 않은 경우
   */
  public static parsePathToLatLngs(response: NaverRouteResponse): naver.maps.LatLng[] {
    const navermaps = typeof window !== 'undefined' ? window.naver?.maps : null;
    if (!navermaps) {
      throw new Error('Naver Maps JS SDK가 로드되지 않았습니다.');
    }

    const path = response.route?.traoptimal?.[0]?.path;
    if (!path || path.length === 0) return [];

    return path.map(([lng, lat]) => new navermaps.LatLng(lat, lng));
  }

  /**
   * 경로 요약 정보(소요 시간, 거리, 요금)를 파싱합니다.
   * @returns 정규화된 요약 객체, 요약 정보가 없으면 null
   */
  public static parseSummary(response: NaverRouteResponse): {
    distanceKm: number;
    durationMin: number;
    fare: number;
  } | null {
    const summary = response.route?.traoptimal?.[0]?.summary;
    if (!summary) return null;

    return {
      distanceKm: +(summary.distance / 1_000).toFixed(2),
      durationMin: Math.max(1, Math.round(summary.duration / 1_000 / 60)),
      fare: summary.tollFare || summary.taxiFare || 0,
    };
  }
}

// ─── 렌더러 클래스 ───────────────────────────────────────────────────────────

/**
 * 네이버 지도에 경로 폴리라인을 그리고, 지도의 Viewport를 조정하는 클래스.
 *
 * 인스턴스당 하나의 폴리라인(`currentPolyline`)을 관리하며,
 * 새 경로 렌더링 전 기존 폴리라인을 자동으로 제거합니다.
 */
export class NaverMapRouteRenderer {
  private map: naver.maps.Map;
  private currentPolyline: naver.maps.Polyline | null = null;

  constructor(map: naver.maps.Map) {
    this.map = map;
  }

  /**
   * 경로 폴리라인을 지도에 렌더링합니다.
   * 기존 폴리라인은 자동으로 제거됩니다.
   * @param pathPoints 폴리라인 경로 좌표 배열
   * @param options    폴리라인 옵션 오버라이드 (선택)
   */
  public renderRoute(
    pathPoints: naver.maps.LatLng[],
    options: Partial<naver.maps.PolylineOptions> = {}
  ): naver.maps.Polyline {
    const navermaps = window.naver?.maps;
    if (!navermaps) throw new Error('Naver Maps JS SDK가 필요합니다.');

    this.clearRoute();

    const defaultOptions: naver.maps.PolylineOptions = {
      map: this.map,
      path: pathPoints,
      strokeColor: CAR_ROUTE_STROKE_COLOR,
      strokeOpacity: POLYLINE_STROKE_OPACITY,
      strokeWeight: POLYLINE_STROKE_WEIGHT,
      strokeStyle: 'solid',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    };

    this.currentPolyline = new navermaps.Polyline({
      ...defaultOptions,
      ...options,
    });

    return this.currentPolyline;
  }

  /**
   * 경로 상의 모든 마커와 상세 좌표를 포함하도록 지도 Viewport를 자동 조정합니다.
   * @param places           여정 경유지 배열
   * @param directionsCache  구간별 캐시된 경로 데이터
   * @param transportType    이동 수단 유형
   * @param padding          지도 내부 패딩 (검색바 등 UI 요소와의 겹침 방지)
   */
  public fitMapBounds(
    places: Place[],
    directionsCache: Record<string, unknown>,
    transportType = 'public',
    padding: { top?: number; right?: number; bottom?: number; left?: number } = { top: 40, right: 30, bottom: 45, left: 30 }
  ): void {
    const navermaps = window.naver?.maps;
    if (!navermaps || places.length === 0) return;

    const boundsObj = calculateJourneyBounds(places, directionsCache, transportType);
    if (!boundsObj) return;

    // 1% 소량 확장 — 패딩이 주된 여백 역할을 담당하므로 최소화
    const expanded = expandBounds(boundsObj, BOUNDS_FIT_EXPAND_RATIO);

    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(expanded.sw.lat, expanded.sw.lng),
      new navermaps.LatLng(expanded.ne.lat, expanded.ne.lng)
    );

    this.map.setOptions({ padding });
    this.map.fitBounds(bounds, { maxZoom: 18 });
  }

  /**
   * 현재 렌더링된 폴리라인을 지도에서 제거합니다.
   */
  public clearRoute(): void {
    if (this.currentPolyline) {
      this.currentPolyline.setMap(null);
      this.currentPolyline = null;
    }
  }
}
