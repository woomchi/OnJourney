/**
 * 카카오 대중교통 REST API 관련 타입 정의
 * @see https://developers.kakao.com/docs/ko/kakaomap/rest-api#transit
 */

export interface KakaoPublicTrafficParams {
  startX: number | string;
  startY: number | string;
  endX: number | string;
  endY: number | string;
  sName?: string;
  eName?: string;
  inputCoord?: 'WGS84' | 'WTM' | 'TM' | 'WCONGNAMUL';
  outputCoord?: 'WGS84' | 'WTM' | 'TM' | 'WCONGNAMUL';
}

export type KakaoTransitStatusCode =
  | 'OK'                  // 조회 성공
  | 'NO_RESULTS'          // 결과 없음
  | 'STARTNODES_NULL'     // 출발지 주변 정류장/노드 없음
  | 'ENDNODES_NULL'       // 도착지 주변 정류장/노드 없음
  | 'EQUAL_POINTS'        // 출발지와 도착지가 동일
  | 'INVALID_REQUEST';    // 잘못된 요청

export interface KakaoTransitProperties {
  total: number;
  bus: number;
  subway: number;
  busAndSubway: number;
  landingURL: string;
}

export interface KakaoFare {
  value: number; // 요금 (원)
  min?: number;
  max?: number;
}

export interface KakaoRouteProperties {
  type: 'BUS' | 'SUBWAY' | 'BUS_AND_SUBWAY';
  totalDistance: number; // 미터
  totalTime: number;     // 초
  transfers: number;     // 환승 횟수
  fare?: KakaoFare;
}

export interface KakaoStop {
  name: string;
}

export interface KakaoVehicle {
  name: string;
  type: string; // 간선, 지선, 광역, 순환, 마을, 직행, 급행, 일반 등
}

export interface KakaoStepProperties {
  type: 'BUS' | 'SUBWAY' | 'WALKING';
  guidance: string;
  distance: number; // 미터
  time: number;     // 초
  stops?: KakaoStop[];
  vehicles?: KakaoVehicle[];
}

export interface KakaoPath {
  points: [number, number][]; // [lon, lat] 쌍 (WGS84)
}

export interface KakaoStep {
  properties: KakaoStepProperties;
  path?: KakaoPath;
}

export interface KakaoRoute {
  properties: KakaoRouteProperties;
  steps: KakaoStep[];
}

export interface KakaoPublicTrafficResponse {
  status: KakaoTransitStatusCode;
  properties?: KakaoTransitProperties;
  routes?: KakaoRoute[];
}
