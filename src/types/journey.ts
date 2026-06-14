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
