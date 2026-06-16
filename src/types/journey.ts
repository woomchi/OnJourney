export interface Place {
  id: string;          // 고유 식별자 (nanoid)
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

export type TransportType = 'public' | 'car';

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
}

export interface DirectionResult {
  duration: number;
  fare: number;
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
}

export interface DirectionAlternative {
  type: 'taxi' | 'walk' | 'public' | 'car';
  name: string;
  duration: number;
  fare?: number;
}

export interface DirectionsApiResponse {
  primary: DirectionResult;
  alternatives: DirectionAlternative[];
}

