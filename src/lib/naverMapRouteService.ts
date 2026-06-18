/**
 * 네이버 Direction 5 API 응답 인터페이스 선언
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

/**
 * 두 좌표 간 직선 거리 계산 (Haversine 공식) - 단위: 미터 (m)
 */
export function calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000;
}

/**
 * 활성 경로의 상세 포인트를 포함하는 구간 바운드(SW, NE)를 계산하는 헬퍼 함수
 */
export function calculateSegmentBounds(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  activeRoute?: any
) {
  const points: { lat: number; lng: number }[] = [
    { lat: origin.lat, lng: origin.lng },
    { lat: dest.lat, lng: dest.lng },
  ];

  if (activeRoute) {
    if (activeRoute.pathPoints && activeRoute.pathPoints.length > 0) {
      points.push(...activeRoute.pathPoints);
    } else if (activeRoute.steps) {
      activeRoute.steps.forEach((step: any) => {
        if (step.pathPoints && step.pathPoints.length > 0) {
          points.push(...step.pathPoints);
        }
      });
    }
  }

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);

  return {
    sw: {
      lat: Math.min(...lats),
      lng: Math.min(...lngs),
    },
    ne: {
      lat: Math.max(...lats),
      lng: Math.max(...lngs),
    },
  };
}

export function calculateStepBounds(step: any) {
  const points: { lat: number; lng: number }[] = [];
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

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);

  return {
    sw: {
      lat: Math.min(...lats),
      lng: Math.min(...lngs),
    },
    ne: {
      lat: Math.max(...lats),
      lng: Math.max(...lngs),
    },
  };
}


/**
 * 1. API 통신 담당 클래스 (Service)
 * 프록시 서버에 요청을 전송하여 다중 경유지 경로 원본 데이터를 가져옵니다.
 * 네이버 API 권한이 없는 경우(401)를 대비하여 자체적인 다중 경유지 Fallback 모크 데이터를 생성합니다.
 */
export class NaverDirectionService {
  private static readonly PROXY_ENDPOINT = '/api/directions-waypoints';

  /**
   * 출발지, 경유지들, 목적지 좌표를 받아 프록시 API를 호출합니다.
   */
  public static async fetchRoute(
    start: { lat: number; lng: number },
    goal: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }> = [],
    option: string = 'traoptimal'
  ): Promise<NaverRouteResponse> {
    const startParam = `${start.lng},${start.lat}`;
    const goalParam = `${goal.lng},${goal.lat}`;
    
    let url = `${this.PROXY_ENDPOINT}?start=${encodeURIComponent(startParam)}&goal=${encodeURIComponent(goalParam)}&option=${option}`;
    
    if (waypoints.length > 0) {
      const waypointsParam = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join('|');
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (error: any) {
      console.warn('[NaverDirectionService] Real route API call failed, generating fallback route. Reason:', error.message);
      return this.generateFallbackResponse(start, goal, waypoints);
    }
  }

  /**
   * API 실패 시 사용하기 위해 직선 거리 및 차량 주행 가속 모델 기반의 Fallback 응답 객체를 빌드합니다.
   */
  private static generateFallbackResponse(
    start: { lat: number; lng: number },
    goal: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }> = []
  ): NaverRouteResponse {
    // 전체 지점 순서대로 결합
    const allPoints = [start, ...waypoints, goal];
    const pathCoords: Array<[number, number]> = [];
    const sections: Array<{ pointIndex: number; pointCount: number; distance: number; duration: number }> = [];
    
    let currentPointIndex = 0;
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < allPoints.length - 1; i++) {
      const p1 = allPoints[i];
      const p2 = allPoints[i + 1];
      
      const dist = calculateHaversineDistance(p1.lat, p1.lng, p2.lat, p2.lng);
      // 평균 속도 35km/h = 9.72m/s
      const dur = Math.max(180, Math.round((dist / 9.72) * 1000)); // 최소 3분

      // path에 좌표 삽입
      pathCoords.push([p1.lng, p1.lat]);
      pathCoords.push([p2.lng, p2.lat]);

      sections.push({
        pointIndex: currentPointIndex,
        pointCount: 2,
        distance: Math.round(dist),
        duration: dur
      });

      totalDistance += dist;
      totalDuration += dur;
      currentPointIndex += 2;
    }

    // 마지막 지점의 좌표 추가
    pathCoords.push([goal.lng, goal.lat]);

    // 대략적인 택시 요금 계산
    const distanceKm = totalDistance / 1000;
    const taxiFare = 4800 + Math.round(distanceKm * 1.3 * 1100);

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
                pointIndex: allPoints.length * 2 - 2
              },
              waypoints: waypoints.map((wp, j) => ({
                location: [wp.lng, wp.lat],
                distance: sections[j].distance,
                duration: sections[j].duration,
                pointIndex: (j + 1) * 2
              })),
              distance: Math.round(totalDistance),
              duration: totalDuration,
              tollFare: 0,
              taxiFare
            },
            path: pathCoords,
            section: sections,
            guide: allPoints.map((pt, idx) => ({
              pointIndex: idx * 2,
              type: idx === 0 ? 1 : idx === allPoints.length - 1 ? 2 : 3,
              instructions: idx === 0 
                ? '출발지에서 출발' 
                : idx === allPoints.length - 1 
                ? '목적지 도착' 
                : `경유지 ${idx} 경유`,
              distance: idx === 0 ? 0 : sections[idx - 1].distance,
              duration: idx === 0 ? 0 : sections[idx - 1].duration
            }))
          }
        ]
      }
    };
  }
}

/**
 * 2. 데이터 변환 담당 클래스 (Parser)
 * API 응답 데이터를 네이버 지도 객체에 사용 가능한 포맷으로 정제합니다.
 */
export class RouteDataParser {
  /**
   * API 결과의 [경도, 위도] 배열을 네이버 지도 전용 naver.maps.LatLng 배열로 변환합니다.
   */
  public static parsePathToLatLngs(response: NaverRouteResponse): naver.maps.LatLng[] {
    const navermaps = typeof window !== 'undefined' ? window.naver?.maps : null;
    if (!navermaps) {
      throw new Error('Naver Maps JS SDK가 로드되지 않았습니다.');
    }

    const path = response.route?.traoptimal?.[0]?.path;
    if (!path || path.length === 0) {
      return [];
    }

    return path.map(([lng, lat]) => new navermaps.LatLng(lat, lng));
  }

  /**
   * 경로 탐색의 요약 정보(소요 시간, 거리 등)를 파싱합니다.
   */
  public static parseSummary(response: NaverRouteResponse) {
    const summary = response.route?.traoptimal?.[0]?.summary;
    if (!summary) return null;

    return {
      distanceKm: +(summary.distance / 1000).toFixed(2),
      durationMin: Math.max(1, Math.round(summary.duration / 1000 / 60)),
      fare: summary.tollFare || summary.taxiFare || 0,
    };
  }
}

/**
 * 3. 지도 렌더링 담당 클래스 (Renderer)
 * 폴리라인을 지도에 드로잉하고, 마커 바운드를 계산하여 지도의 시야(Viewport)를 조정합니다.
 */
export class NaverMapRouteRenderer {
  private map: naver.maps.Map;
  private currentPolyline: naver.maps.Polyline | null = null;

  constructor(map: naver.maps.Map) {
    this.map = map;
  }

  /**
   * 도로망을 따라가는 폴리라인을 렌더링합니다.
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
      strokeColor: '#f59e0b', // 주황/노랑 계열 (차량)
      strokeOpacity: 0.85,
      strokeWeight: 6.5,
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
   * 경로 상의 마커들을 모두 포함하도록 지도의 시야(Viewport)를 자동으로 맞춥니다.
   */
  public fitMapBounds(coordinates: Array<{ lat: number; lng: number }>): void {
    const navermaps = window.naver?.maps;
    if (!navermaps || coordinates.length === 0) return;

    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(coordinates[0].lat, coordinates[0].lng),
      new navermaps.LatLng(coordinates[0].lat, coordinates[0].lng)
    );

    coordinates.forEach(coord => {
      bounds.extend(new navermaps.LatLng(coord.lat, coord.lng));
    });

    this.map.fitBounds(bounds, {
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
    });

    if (this.map.getZoom() > 15) {
      this.map.setZoom(15);
    }
  }

  /**
   * 화면 상의 폴리라인을 제거합니다.
   */
  public clearRoute(): void {
    if (this.currentPolyline) {
      this.currentPolyline.setMap(null);
      this.currentPolyline = null;
    }
  }
}
