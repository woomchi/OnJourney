export interface SelectedRoute {
  destId: string;      // 목적지 place.id
  id: string;          // 대안 아이디 (public-0, taxi, walk 등)
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;    // 소요시간 (분)
  fare: number;        // 요금 (원)
  taxiFare?: number;   // 택시 요금 (원)
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
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
  type: 'walk' | 'subway' | 'bus' | 'car';
  name: string;
  duration: number;
  color?: string;
  pathPoints?: { lat: number; lng: number }[];
  startName?: string;
  endName?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
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
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
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
}



