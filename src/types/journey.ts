export interface SelectedRoute {
  destId: string;      // 목적지 place.id
  id: string;          // 대안 아이디 (public-0, taxi, walk 등)
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;    // 소요시간 (분)
  fare: number;        // 요금 (원)
  taxiFare?: number;   // 택시 요금 (원)
  distance?: number;   // 주행 거리 (km)
  isEstimated?: boolean;     // Fallback 추산 여부 식별 플래그
  isFareEstimated?: boolean; // 요금 추정 여부
  isIntercity?: boolean;     // 기차/시외 구간 포함 여부
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
  detailedPathPoints?: { lat: number; lng: number }[];
  snappedStart?: { lng: number; lat: number };
  snappedEnd?: { lng: number; lat: number };
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

export interface RouteGuideNode {
  instructions: string;
  distance: number; // m
  duration: number; // ms
}

export interface DirectionResult {
  id: string;
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;
  fare: number;
  taxiFare?: number;   // 택시 요금 (원)
  distance?: number; // 주행 거리 (km)
  isEstimated?: boolean;     // Fallback 추산 여부 식별 플래그
  isFareEstimated?: boolean; // 요금 추정 여부
  isIntercity?: boolean;     // 기차/시외 구간 포함 여부
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
  straightSection?: { lat: number; lng: number }[];
  isStraightSectionAtEnd?: boolean;
  snappedStart?: { lng: number; lat: number };
  snappedEnd?: { lng: number; lat: number };
  detailedPathPoints?: { lat: number; lng: number }[];
}

export interface DirectionsApiResponse {
  public: DirectionResult[];
  car: DirectionResult[];
  walk: DirectionResult[];
}

export interface LatLngBoundsLiteral {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

export interface FocusedSegment {
  originId: string;
  destId: string;
}

export interface FocusedStep {
  originId: string;
  destId: string;
  stepIndex: number;
  subType?: 'start' | 'end' | 'dest';
}

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

export interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  score?: number;
  category_group_code?: string;
}

export type SnapType = 'NONE' | 'START' | 'END' | 'BOTH';

export interface SnapMeta {
  snapType: SnapType;
  message?: string;
  snappedStartCoords?: { lng: number; lat: number };
  snappedEndCoords?: { lng: number; lat: number };
}

export type CarWalkDirectionsResult =
  | { status: 'EXCEED_LIMIT'; message: string }
  | { car: DirectionResult[]; walk: DirectionResult[]; snapMeta: SnapMeta };


