/**
 * @fileoverview 여정(Journey) 도메인 공통 타입 정의
 *
 * 이 파일은 여정, 장소, 경로, 실시간 도착 정보 등
 * 애플리케이션 전반에서 공유되는 핵심 타입을 정의합니다.
 *
 * 설계 원칙:
 * - `BaseRouteData`: DirectionResult와 SelectedRoute의 공통 필드를 하나로 통합합니다.
 *   두 타입이 `extends BaseRouteData`를 사용함으로써 공통 필드의 단일 출처를 보장합니다.
 */

// ─── 기반 인터페이스 ──────────────────────────────────────────────────────────

/**
 * 경로 데이터의 공통 기반 인터페이스.
 *
 * `DirectionResult`(API 응답)와 `SelectedRoute`(사용자 선택 경로) 모두
 * 이 인터페이스를 확장하므로, 두 타입을 같은 변수에 할당하거나
 * 공통 필드에 접근할 때 별도의 타입 단언 없이 사용할 수 있습니다.
 */
export interface BaseRouteData {
  id: string;
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;    // 소요시간 (분)
  fare: number;        // 요금 (원)
  taxiFare?: number;   // 택시 요금 (원)
  distance?: number;   // 주행 거리 (km)
  isEstimated?: boolean;      // Fallback 추산 여부 식별 플래그
  isFareEstimated?: boolean;  // 요금 추정 여부
  isIntercity?: boolean;      // 기차/시외 구간 포함 여부
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
  detailedPathPoints?: { lat: number; lng: number }[];
  snappedStart?: { lng: number; lat: number };
  snappedEnd?: { lng: number; lat: number };
  tags?: string[];
}

// ─── 경유지 ───────────────────────────────────────────────────────────────────

/**
 * 여정에 추가된 경유지를 나타냅니다.
 * `selected_route`는 해당 경유지 → 다음 경유지 구간의 사용자 수동 선택 경로입니다.
 */
export interface SelectedRoute extends BaseRouteData {
  destId: string; // 목적지 place.id — 경로 유효성 검증에 사용
}

export interface Place {
  id: string;          // 고유 식별자 (nanoid)
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  selected_route?: SelectedRoute;
}

// ─── 여정 ─────────────────────────────────────────────────────────────────────

export type TransportType = 'public' | 'car' | 'walk';

export interface Journey {
  id: string;
  user_id?: string;
  title: string;
  transport_type: TransportType;
  journey_date: string;
  places: Place[];
  current_step: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateJourneyInput {
  title: string;
  transport_type: TransportType;
  journey_date: string;
}

// ─── 경로 단계 ────────────────────────────────────────────────────────────────

/** 경로를 구성하는 단일 이동 수단 단계 */
export interface DirectionStep {
  type: 'walk' | 'subway' | 'bus' | 'car' | 'train' | 'expressbus' | 'taxi';
  name: string;
  duration: number;
  color?: string;
  pathPoints?: { lat: number; lng: number }[];
  startName?: string;
  endName?: string;
  headsign?: string;
  wayCode?: number;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  passStopList?: {
    stationList: {
      stationName: string;
      lat?: number;
      lng?: number;
    }[];
  };
}

/** 차량 경로 안내 단일 노드 (거리·시간 포함) */
export interface RouteGuideNode {
  instructions: string;
  distance: number; // 단위: m
  duration: number; // 단위: ms
}

// ─── 경로 탐색 결과 ───────────────────────────────────────────────────────────

/**
 * API에서 반환되는 단일 경로 결과.
 * `BaseRouteData`를 확장하며, 직선 구간 등 API 전용 부가 정보를 추가합니다.
 */
export interface DirectionResult extends BaseRouteData {
  straightSection?: { lat: number; lng: number }[];
  isStraightSectionAtEnd?: boolean;
}

/** 대중교통·차량·도보 경로를 묶어 반환하는 API 응답 타입 */
export interface DirectionsApiResponse {
  public: DirectionResult[];
  car: DirectionResult[];
  walk: DirectionResult[];
}

// ─── 지도 영역 ────────────────────────────────────────────────────────────────

/** 남서(SW)·북동(NE) 꼭짓점으로 정의되는 지도 경계 직사각형 */
export interface LatLngBoundsLiteral {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

/** 지도에서 포커스된 구간 (출발지 → 목적지) */
export interface FocusedSegment {
  originId: string;
  destId: string;
}

/** 지도에서 포커스된 이동 단계 */
export interface FocusedStep {
  originId: string;
  destId: string;
  stepIndex: number;
  subType?: 'start' | 'end' | 'dest';
}

// ─── 실시간 도착 정보 ─────────────────────────────────────────────────────────

/** 지하철 실시간 도착 정보 */
export interface SubwayArrival {
  subwayId: string;
  updnLine: string;
  trainNo: string;
  statnNm: string;
  arvlMsg2: string;
  recptnDt: string;
  statusText: string;
  minutesLeft: number;
  arrivalTime: string;
  isApproaching: boolean;
  isRealtime?: boolean;
}

/** 버스 실시간 도착 정보 */
export interface BusArrival {
  busNo: string;
  stationName: string;
  predictTime1: number;
  stationNum1: number;
  predictTime2?: number;
  stationNum2?: number;
  statusText1: string;
  statusText2?: string;
  isApproaching1: boolean;
  isApproaching2?: boolean;
}

export type ServiceCategoryTag =
  | 'attraction'
  | 'accommodation'
  | 'restaurant'
  | 'cafe'
  | 'transit'
  | 'parking'
  | 'convenience'
  | 'etc';

/** 장소 검색 API 반환 결과 (placesService의 canonical 타입) */
export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  score?: number;
  category_group_code?: string;
  serviceCategory?: ServiceCategoryTag;
}

// ─── 도로 스냅 관련 ──────────────────────────────────────────────────────────

/** 차량 경로에서 출발·도착지를 도로에 스냅한 결과 타입 */
export type SnapType = 'NONE' | 'START' | 'END' | 'BOTH';

export interface SnapMeta {
  snapType: SnapType;
  message?: string;
  snappedStartCoords?: { lng: number; lat: number };
  snappedEndCoords?: { lng: number; lat: number };
}

/** 차량/도보 경로 API 응답 판별 유니온 타입 */
export type CarWalkDirectionsResult =
  | { status: 'EXCEED_LIMIT'; message: string }
  | { car: DirectionResult[]; walk: DirectionResult[]; snapMeta: SnapMeta };
