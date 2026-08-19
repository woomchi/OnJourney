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
  startWalkSection?: { lat: number; lng: number }[];
  endWalkSection?: { lat: number; lng: number }[];
  tags?: string[];
  fareBreakdown?: FareSection[];
}

/** 구간별 요금 분해 정보 */
export interface FareSection {
  label: string;       // 예: "경기도 화성 버스·지하철", "SRT"
  payment: number;     // 구간 요금 (원)
  time?: number;       // 구간 소요 시간 (분)
  distance?: number;   // 구간 거리 (m)
  type: 'transit' | 'intercity' | 'walk';
  trainSpSeatFare?: number; // 특실 추가 요금
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

export interface SubPathOption {
  id: string;
  label: string;
  type: 'bus' | 'subway' | 'walk';
  stationName: string;
  stationId?: string | number;
  duration: number;
  lineName?: string;
  pathPoints?: { lat: number; lng: number }[];
}

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
  startID?: string | number;
  endID?: string | number;
  startStationID?: string | number;
  endStationID?: string | number;
  subPathOptions?: SubPathOption[];
  passStopList?: {
    stationList: {
      stationName: string;
      lat?: number;
      lng?: number;
    }[];
  };
  // maasRP 전용 추가 필드
  startDateTime?: string;    // "202608101407" (yyyyMMddHHmm)
  endDateTime?: string;      // "202608101435"
  waitingTime?: number;      // 대기 시간 (분)
  trainSubType?: string;     // "SRT", "KTX", "ITX-청춘" 등
  trainSpSeatYn?: 'Y' | 'N'; // 특실 존재 여부
  trainSpSeatFare?: number;  // 특실 요금
  busLaneColor?: string;     // 버스 노선 색상
  startCityCode?: string;    // 버스 정류소 도시 코드
  startRegion?: string;      // 버스 정류소 지역 식별자
  busLocalBlID?: string;     // 지자체 버스 노선 고유 ID (경기도 등)
  odsayBusId?: string;       // ODsay 고유 노선 ID (5자리, fetchBusLaneDetail 전용)
  tagoRouteId?: string;      // 국토교통부 표준 routeId (TAGO 실시간 버스 위치 전용)
  realtimeStationId?: string;// TAGO/지자체 실시간 조회용 정류소 ID
  intervalTime?: number;     // 버스/지하철 배차 간격 (분)
  rawLineName?: string;      // 지하철 원본 노선명 (예: '대전 1호선', '수도권 1호선')
  subwayCode?: number | string; // 지하철 고유 노선 코드 (ODsay: 500 등)
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

/** 지하철 실시간 열차 위치 정보 (realtimePosition) */
export interface SubwayPosition {
  subwayId: string;
  subwayNm: string;
  statnId: string;
  statnNm: string;
  trainNo: string;
  lastRecptnDt?: string;
  recptnDt: string;
  updnLine: string; // '0': 상행/내선, '1': 하행/외선
  statnTid?: string;
  statnTnm?: string;
  trainSttus: string; // '0': 진입, '1': 도착, '2': 출발, '3': 전역출발
  directAt?: string; // '0': 일반, '1': 급행
  lstcarAt?: string; // '0': 일반, '1': 막차
  isExpress?: boolean;
}

/** 노선도 뷰용 정차역 정보 */
export interface SubwayLineStation {
  index: number;
  stationName: string;
  stationId?: string;
  hmSeconds?: number;
  cumulativeSeconds?: number;
  distKm?: number;
}

/** 지하철 운행 계통/구간 정보 (네이버 지도 스타일 탭 분기용) */
export interface SubwayLineBranch {
  id: string;
  name: string;
  startStation: string;
  endStation: string;
  stationCount: number;
}

/** 지하철 시간표 단일 항목 구조 */
export interface SubwayTimetableEntry {
  trainNo: string;
  depTime: string;          // "15:25"
  destStation: string;      // "반석" 또는 "판암"
  drctType: string;         // '1': 상행/판암, '2': 하행/반석
  directionName: string;    // "판암 방면" 또는 "반석 방면"
  minutesLeft: number;      // 현재 시각 기준 잔여 분
  statusText: string;       // "5분 후" 또는 "곧 도착"
  isUpcoming: boolean;      // 가장 빠른 다음 열차 여부
}

/** 노선도 뷰 전체 응답 데이터 구조 */
export interface SubwayLinePositionsData {
  subwayId: string;
  subwayNm: string;
  branches?: SubwayLineBranch[];
  selectedBranchId?: string;
  stations: SubwayLineStation[];
  positions: SubwayPosition[];
  timetable?: SubwayTimetableEntry[];
  timestamp: number;
}

/** 지하철 노선도 패널 열기 대상 정보 */
export interface SubwayLineMapTarget {
  stationName: string;
  subwayId?: string;
  subwayNm?: string;
  wayCode?: string;
  targetTrainNo?: string;
  targetMinutesLeft?: number;
  targetStatusText?: string;
}

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
  trainLineNm?: string;
  arvlCd?: string;
  arrivalPriority?: number;
  canBoard?: boolean;
  destinationStationNm?: string;
  isExpress?: boolean;
  currentTrainPosition?: SubwayPosition;
}

// ─── 버스 노선도 및 실시간 위치 타입 ─────────────────────────────────────────

/** 노드 사이 엣지에서의 4분위 버스 위치 스테이지 */
export type BusPositionStage =
  | 'at_prev_station' // 0% (이전 정류소 정차)
  | 'departed'        // 33% (출발 직후 주행)
  | 'approaching'     // 66% (다음 정류소 진입 중)
  | 'at_station';      // 100% (해당 정류소 도착/정차)

/** 정류소 간 33%, 66% 사전 계산 앵커 좌표 */
export interface EdgeAnchorPoints {
  departurePoint: {
    lat: number;
    lng: number;
    ratio: number;
  };
  approachingPoint: {
    lat: number;
    lng: number;
    ratio: number;
  };
}

/** 버스 노선 경유 정류소 정보 */
export interface BusLineStation {
  stationId: string;
  stationName: string;
  stationSeq: number;
  lat: number;
  lng: number;
  arsNo?: string;
  isTurningPoint?: boolean;
  edgePoints?: EdgeAnchorPoints | null;
  subwayTransferList?: string[];
}

/** 실시간 버스 위치 정보 */
export interface BusPosition {
  vehicleno: string;
  nodeid?: string;
  nodenm?: string;
  nodeord?: number;
  direction?: '0' | '1'; // '0': 상행/순방향(종점/회차지 방면), '1': 하행/역방향(기점 방면)
  gpslati?: number;
  gpslong?: number;
  stage?: BusPositionStage;
  progressRate?: number; // 0.0 ~ 1.0
  lowplate?: boolean | number;
  remainSeats?: number;
  crowded?: string;
  isLastBus?: boolean;
}

/** 버스 실시간 노선도 API 응답 규격 */
export interface BusLinePositionsData {
  busNo: string;
  busId?: string;
  routeId?: string;
  busType?: string;
  busColor?: string;
  startStationName?: string;
  endStationName?: string;
  turningStationName?: string;
  turningStationSeq?: number;
  stations: BusLineStation[];
  positions: BusPosition[];
  timestamp: number;
}

/** 버스 노선도 패널 열기 대상 정보 */
export interface BusLineMapTarget {
  stationName: string;
  stationId?: string;
  destination?: string;
  headsign?: string;
  busNo: string;
  busId?: string;
  odsayBusId?: string;
  tagoRouteId?: string;
  routeId?: string;
  busCityCode?: string;
  cityCode?: string;
  region?: string;
  lat?: number;
  lng?: number;
  busColor?: string;
  busType?: string;
  targetVehicleNo?: string;
  targetMinutesLeft?: number;
  targetStationsLeft?: number;
  targetStatusText?: string;
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
