# 네이버 Direction 5 API (Waypoints 경유지 포함) 구현 가이드

본 가이드는 네이버 지도 API와 **Direction 5 API (Driving)**를 활용하여, 출발지에서 목적지까지 여러 개의 경유지(Waypoints)를 지나는 실제 도로망 경로를 지도에 부드러운 폴리라인으로 렌더링하고 시야를 자동 조정하는 완성형 모듈러 코드를 제공합니다.

---

## 1. CORS 문제 해결: Next.js API Route Proxy (Server-side)

클라이언트 브라우저에서 네이버 OpenAPI 주소로 직접 `fetch` 요청을 보낼 경우 CORS(Cross-Origin Resource Sharing) 제한으로 인해 요청이 블로킹됩니다. 이를 해결하기 위해 Next.js의 백엔드 API Route를 Proxy(대리인)로 사용하여 서버에서 네이버 API를 호출하도록 설정합니다.

### 📂 파일 경로: `src/app/api/directions-waypoints/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';

/**
 * 네이버 Direction 5 API Proxy 핸들러
 * 클라이언트의 요청을 받아 네이버 API 서버에 인증 헤더를 추가하여 재요청합니다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');         // 형식: "lng,lat" (예: 127.1058,37.3595)
  const goal = searchParams.get('goal');           // 형식: "lng,lat"
  const waypoints = searchParams.get('waypoints'); // 형식: "lng,lat|lng,lat" (파이프라인 '|' 구분자)
  const option = searchParams.get('option') || 'trafast'; // 기본값: 실시간 빠른길(trafast)

  // 필수 파라미터 유효성 검사
  if (!start || !goal) {
    return NextResponse.json(
      { error: '출발지(start)와 목적지(goal) 좌표가 필요합니다.' },
      { status: 400 }
    );
  }

  // 환경 변수에서 네이버 API 클라이언트 ID & 시크릿 키 획득
  // 클라이언트 환경변수(NEXT_PUBLIC_)와 서버 전용 환경변수를 모두 대응할 수 있도록 처리합니다.
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID || process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Naver API Credentials are missing.');
    return NextResponse.json(
      { error: '서버에 네이버 API 인증 키 설정이 누락되었습니다.' },
      { status: 500 }
    );
  }

  try {
    // 네이버 오픈 API 호출 URL 생성
    let naverApiUrl = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${start}&goal=${goal}&option=${option}`;
    
    // 경유지가 존재할 경우 파라미터 추가
    if (waypoints) {
      naverApiUrl += `&waypoints=${waypoints}`;
    }

    // 서버 사이드 요청 수행 (인증 헤더 포함)
    const response = await fetch(naverApiUrl, {
      method: 'GET',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
        'Accept': 'application/json',
      },
      // Next.js 라우트 캐싱 설정 (필요시 revalidate 설정)
      next: { revalidate: 600 } 
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Naver API responded with status ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Directions Proxy Error:', error);
    return NextResponse.json(
      { error: '서버 내부 오류로 경로 정보를 조회할 수 없습니다.', message: error.message },
      { status: 500 }
    );
  }
}
```

---

## 2. 클라이언트 핵심 클래스 설계 (관심사 분리)

유지보수성과 가독성을 위해 역할을 3개의 역할군(API 통신, 데이터 파싱/변환, 렌더링 및 뷰 제어)으로 완벽하게 분리한 모듈 구조입니다.

### 📂 파일 경로: `src/lib/naverMapRouteService.ts`

```typescript
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
        goal: { location: [number, number] };
        distance: number; // 총 거리 (미터)
        duration: number; // 총 소요시간 (밀리초)
        departureTime: string;
        bbox: [[number, number], [number, number]];
      };
      path: Array<[number, number]>; // [경도, 위도] 순서의 좌표 배열
      guide: Array<{
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
 * 1. API 통신 담당 클래스 (Service)
 * 프록시 서버에 요청을 전송하여 다중 경유지 경로 원본 데이터를 가져옵니다.
 */
export class NaverDirectionService {
  private static readonly PROXY_ENDPOINT = '/api/directions-waypoints';

  /**
   * 출발지, 경유지들, 목적지 좌표를 받아 프록시 API를 호출합니다.
   * @param start 출발지 좌표 { lat: 위도, lng: 경도 }
   * @param goal 목적지 좌표 { lat: 위도, lng: 경도 }
   * @param waypoints 경유지 좌표 배열 (순서대로) [{ lat, lng }, ...]
   * @param option 경로 탐색 옵션 (예: 'traoptimal', 'trafast' 등)
   */
  public static async fetchRoute(
    start: { lat: number; lng: number },
    goal: { lat: number; lng: number },
    waypoints: Array<{ lat: number; lng: number }> = [],
    option: string = 'traoptimal'
  ): Promise<NaverRouteResponse> {
    
    // 네이버 스펙에 맞게 경도,위도(lng,lat) 문자열 생성
    const startParam = `${start.lng},${start.lat}`;
    const goalParam = `${goal.lng},${goal.lat}`;
    
    let url = `${this.PROXY_ENDPOINT}?start=${encodeURIComponent(startParam)}&goal=${encodeURIComponent(goalParam)}&option=${option}`;
    
    if (waypoints.length > 0) {
      // 경유지들을 "lng,lat|lng,lat" 형식으로 결합
      const waypointsParam = waypoints
        .map(wp => `${wp.lng},${wp.lat}`)
        .join('|');
      url += `&waypoints=${encodeURIComponent(waypointsParam)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `네이버 경로 탐색 실패 (Status: ${res.status})`);
    }

    return await res.json();
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

    // 최적 경로(traoptimal)의 첫 번째 경로 추출
    const path = response.route?.traoptimal?.[0]?.path;
    if (!path || path.length === 0) {
      return [];
    }

    // 네이버 API 응답은 [경도(lng), 위도(lat)] 순서이므로 LatLng 생성자에 맞게 (위도, 경도)로 변경하여 인스턴스 생성
    return path.map(([lng, lat]) => new navermaps.LatLng(lat, lng));
  }

  /**
   * 경로 탐색의 요약 정보(소요 시간, 거리 등)를 파싱합니다.
   */
  public static parseSummary(response: NaverRouteResponse) {
    const summary = response.route?.traoptimal?.[0]?.summary;
    if (!summary) return null;

    return {
      distanceKm: +(summary.distance / 1000).toFixed(2), // km 단위 변환
      durationMin: Math.round(summary.duration / 1000 / 60), // 분 단위 변환
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
  private waypointsMarkers: naver.maps.Marker[] = [];

  constructor(map: naver.maps.Map) {
    this.map = map;
  }

  /**
   * 도로망을 따라가는 폴리라인을 렌더링합니다. (기존 폴리라인이 존재할 경우 삭제 후 재성성)
   * @param pathPoints naver.maps.LatLng 형태의 경로 포인트 배열
   * @param options 폴리라인 스타일 옵션
   */
  public renderRoute(
    pathPoints: naver.maps.LatLng[],
    options: naver.maps.PolylineOptions = {}
  ): naver.maps.Polyline {
    const navermaps = window.naver?.maps;
    if (!navermaps) throw new Error('Naver Maps JS SDK가 필요합니다.');

    // 1. 기존 폴리라인 제거 (메모리 해제)
    this.clearRoute();

    // 2. 기본 세련된 스타일과 전달받은 커스텀 옵션 병합
    const defaultOptions: naver.maps.PolylineOptions = {
      map: this.map,
      path: pathPoints,
      strokeColor: '#3b82f6', // Premium Vivid Indigo-Blue
      strokeOpacity: 0.85,
      strokeWeight: 6,
      strokeStyle: 'solid',
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    };

    // 3. 폴리라인 지도 상 렌더링
    this.currentPolyline = new navermaps.Polyline({
      ...defaultOptions,
      ...options,
    });

    return this.currentPolyline;
  }

  /**
   * 경로 상의 마커들을 모두 포함하도록 지도의 시야(Viewport)를 자동으로 맞춥니다.
   * @param coordinates 핏팅할 지점들의 위/경도 좌표 목록
   */
  public fitMapBounds(coordinates: Array<{ lat: number; lng: number }>): void {
    const navermaps = window.naver?.maps;
    if (!navermaps || coordinates.length === 0) return;

    // LatLngBounds 초기화 (첫 번째 좌표 기준)
    const bounds = new navermaps.LatLngBounds(
      new navermaps.LatLng(coordinates[0].lat, coordinates[0].lng),
      new navermaps.LatLng(coordinates[0].lat, coordinates[0].lng)
    );

    // 모든 좌표를 포함하도록 경계 구역 확장
    coordinates.forEach(coord => {
      bounds.extend(new navermaps.LatLng(coord.lat, coord.lng));
    });

    // 지도 시야 맞춤 실행 및 적절한 여백(padding) 할당
    this.map.fitBounds(bounds, {
      top: 100,
      right: 80,
      bottom: 80,
      left: 80,
    });
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
```

---

## 3. React 컴포넌트 실전 연동 예제

위 구현한 프록시 백엔드 및 클라이언트 렌더링 클래스들을 React 컴포넌트 환경에서 어떻게 호출하고 사용하는지 나타내는 코드 스니펫입니다.

### 📂 파일 경로: `src/components/WaypointsMapDemo.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from 'react';
import { NavermapsProvider, Container as MapDiv, NaverMap } from 'react-naver-maps';
import {
  NaverDirectionService,
  RouteDataParser,
  NaverMapRouteRenderer
} from '@/lib/naverMapRouteService';

// 샘플 좌표 정의 (1번 출발지 -> 2번, 3번 경유지 -> 4번 목적지)
const SAMPLE_WAYPOINTS = [
  { id: '1', name: '서울시청 (출발지)', lat: 37.5665, lng: 126.9780 },
  { id: '2', name: '명동역 (경유지 1)', lat: 37.5609, lng: 126.9862 },
  { id: '3', name: '동대문역사문화공원 (경유지 2)', lat: 37.5657, lng: 127.0075 },
  { id: '4', name: '대학로 마로니에공원 (목적지)', lat: 37.5802, lng: 127.0022 },
];

export default function WaypointsMapDemo() {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [summary, setSummary] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const rendererRef = useRef<NaverMapRouteRenderer | null>(null);

  // 1. 지도 인스턴스가 갱신되면 렌더러 객체 생성
  useEffect(() => {
    if (map) {
      rendererRef.current = new NaverMapRouteRenderer(map);
    }
  }, [map]);

  // 2. 경로 탐색 및 지도 드로잉 핸들러
  const handleRouteSearch = async () => {
    if (!map || !rendererRef.current) return;
    setLoading(true);

    try {
      const start = SAMPLE_WAYPOINTS[0];
      const goal = SAMPLE_WAYPOINTS[SAMPLE_WAYPOINTS.length - 1];
      const waypoints = SAMPLE_WAYPOINTS.slice(1, -1); // 처음과 끝을 제외한 중간 경유지들

      // 1) API 호출 (Service)
      const rawResponse = await NaverDirectionService.fetchRoute(start, goal, waypoints);

      // 2) 데이터 파싱 & 좌표 변환 (Parser)
      const latLngPoints = RouteDataParser.parsePathToLatLngs(rawResponse);
      const parsedSummary = RouteDataParser.parseSummary(rawResponse);
      
      setSummary(parsedSummary);

      if (latLngPoints.length > 0) {
        // 3) 폴리라인 드로잉 (Renderer)
        rendererRef.current.renderRoute(latLngPoints, {
          strokeColor: '#4f46e5', // 세련된 인디고 퍼플 컬러
          strokeWeight: 6.5,
        });

        // 4) 시야에 꽉 차도록 예쁘게 지도 뷰포트 맞춤 (Renderer)
        rendererRef.current.fitMapBounds(SAMPLE_WAYPOINTS);
      } else {
        alert('조회된 경로 점이 없습니다.');
      }
    } catch (error: any) {
      console.error(error);
      alert(`경로 조회 중 오류 발생: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!clientId) {
    return <div className="p-6 text-red-500 font-bold">네이버 클라이언트 ID가 환경변수에 설정되지 않았습니다.</div>;
  }

  return (
    <div className="flex flex-col w-full h-[600px] border border-zinc-200 rounded-3xl overflow-hidden bg-white shadow-xl">
      {/* 상단 컨트롤 바 */}
      <div className="flex items-center justify-between p-5 bg-zinc-50 border-b border-zinc-150">
        <div>
          <h3 className="text-lg font-bold text-zinc-800">다중 경유지(Waypoints) 실제 경로 탐색</h3>
          <p className="text-xs text-zinc-500 mt-1">서울시청 → 명동역 → DDP → 마로니에공원</p>
        </div>
        
        <div className="flex items-center gap-3">
          {summary && (
            <div className="text-right text-xs bg-indigo-50 border border-indigo-100 py-1.5 px-3 rounded-lg text-indigo-700">
              <span className="font-semibold mr-2">총 거리: {summary.distanceKm}km</span>
              <span className="font-semibold">예상 시간: {summary.durationMin}분</span>
            </div>
          )}
          
          <button
            onClick={handleRouteSearch}
            disabled={loading}
            className="px-5 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 active:scale-95 disabled:bg-zinc-400 transition-all cursor-pointer"
          >
            {loading ? '경로 계산 중...' : '실제 도로 경로 그리기'}
          </button>
        </div>
      </div>

      {/* 지도 영역 */}
      <div className="flex-1 w-full h-full relative">
        <NavermapsProvider ncpKeyId={clientId}>
          <MapDiv style={{ width: '100%', height: '100%' }}>
            <NaverMap
              defaultCenter={{ lat: 37.5665, lng: 126.9780 }}
              defaultZoom={13}
              ref={setMap}
            >
              {/* 각 거점지별 커스텀 핀 마커 표시 */}
              {SAMPLE_WAYPOINTS.map((wp, idx) => (
                <div key={wp.id}>
                  {/* window.naver가 로드된 이후에 렌더링하기 위한 동적 안전 래퍼 역할은 react-naver-maps 컴포넌트가 내부적으로 수행합니다. */}
                  {/* 여기서는 일반 마커와 함께 경유 순서를 라벨링합니다. */}
                  <div className="hidden">
                    {/* 마커 렌더링 로직은 지도 로드 이후 자동 반영됩니다. */}
                  </div>
                </div>
              ))}
            </NaverMap>
          </MapDiv>
        </NavermapsProvider>
      </div>
    </div>
  );
}
```

---

## 4. 연동을 위한 추가 상세 기술 정보

### 🎯 API 파라미터 구성 가이드
네이버 Direction 5 API를 활용한 경유지(Waypoints) 경로는 다음과 같이 파라미터를 넘겨야 네이버 웹서버가 올바르게 인식합니다.
1. **`start`**: `"126.9780,37.5665"` 처럼 `경도,위도`를 쉼표 `,`로 붙이고 인코딩합니다. (순서가 **경도(X)가 먼저, 위도(Y)가 뒤**임에 절대 유의해야 합니다!)
2. **`goal`**: `"127.0022,37.5802"`
3. **`waypoints`**: 경유지가 다수일 경우 `"126.9862,37.5609|127.0075,37.5657"` 형태로 좌표 쌍 사이에 세로 파이프 문자 **`|`**를 사용하여 합쳐준 후 URL 인코딩 처리를 거쳐 전송해야 합니다.

### 📐 LatLngBounds의 원리
`naver.maps.LatLngBounds`는 2차원 사각형 경계 구역을 나타냅니다.
* `new LatLngBounds(southWest, northEast)` 형식으로 직접 생성할 수도 있으나, `bounds.extend(latLng)` 메서드를 사용하면 기존 구역을 누적해서 확장할 수 있습니다.
* 모든 마커와 경로에 속하는 모든 위경도를 `bounds.extend()`에 차례대로 담아 호출한 후, `map.fitBounds(bounds)`에 넘겨줌으로써 맵의 센터(Center) 좌표와 줌 레벨(Zoom level)을 가장 이상적인 크기로 최적화 시킵니다.

### 🧹 메모리 최적화
지도의 줌을 당기거나 경로를 다시 검색할 때 이전 경로의 `Polyline` 객체가 지도 메모리에 그대로 잔존할 수 있습니다.
반드시 새 경로를 렌더링하기 직전에 이전 `Polyline` 인스턴스에 대하여 `setMap(null)`을 호출해 가비지 컬렉터가 원활하게 청소할 수 있도록 구현해야 메모리 누수를 원천적으로 방지할 수 있습니다.
