import { create } from 'zustand';
import type { PlaceResult, MapBoundsRect, MapCoord } from '@/types/journey';
import { INITIAL_MAP_CENTER, DEFAULT_ZOOM_LEVEL } from '@/constants/map';

export interface MapClickedPlace extends MapCoord {
  address: string;
  place_name: string;
}

export type { MapBoundsRect, MapCoord };

interface MapUIState {
  // Center & Zoom
  mapCenter: MapCoord;
  setMapCenter: (center: MapCoord) => void;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  mapBounds: MapBoundsRect | null;
  setMapBounds: (bounds: MapBoundsRect | null) => void;

  // Selected Places on Map
  mapClickedPlace: MapClickedPlace | null;
  setMapClickedPlace: (place: MapClickedPlace | null) => void;

  // GPS & Location
  isLocating: boolean;
  setIsLocating: (isLocating: boolean) => void;
  userLocation: MapCoord | null;
  setUserLocation: (location: MapCoord | null) => void;
  gpsMode: 'none' | 'location' | 'compass';
  setGpsMode: (mode: 'none' | 'location' | 'compass') => void;
  deviceHeading: number | null;
  setDeviceHeading: (heading: number | null) => void;

  // Dragging State
  isMapDragging: boolean;
  setIsMapDragging: (isDragging: boolean) => void;
}

export const useMapUIStore = create<MapUIState>((set) => ({
  mapCenter: INITIAL_MAP_CENTER,
  setMapCenter: (center) => set({ mapCenter: center }),
  
  zoomLevel: DEFAULT_ZOOM_LEVEL,
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  mapBounds: null,
  setMapBounds: (bounds) => set({ mapBounds: bounds }),

  isMapDragging: false,
  setIsMapDragging: (isDragging) => set({ isMapDragging: isDragging }),

  mapClickedPlace: null,
  setMapClickedPlace: (place) => set({ mapClickedPlace: place }),

  isLocating: false,
  setIsLocating: (isLocating) => set({ isLocating }),

  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),

  gpsMode: 'none',
  setGpsMode: (mode) => set({ gpsMode: mode }),

  deviceHeading: null,
  setDeviceHeading: (heading) => set({ deviceHeading: heading }),
}));
