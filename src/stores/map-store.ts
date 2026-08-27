import { create } from 'zustand';
import type { PlaceResult, MapBoundsRect, MapCoord } from '@/types/journey';

interface MapClickedPlace extends MapCoord {
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
  activeRecommendedPlace: PlaceResult | null;
  setActiveRecommendedPlace: (place: PlaceResult | null) => void;
  
  mapClickedPlace: MapClickedPlace | null;
  setMapClickedPlace: (place: MapClickedPlace | null) => void;

  // GPS & Location
  isLocating: boolean;
  setIsLocating: (isLocating: boolean) => void;
  userLocation: MapCoord | null;
  setUserLocation: (location: MapCoord | null) => void;
  currentAddress: string;
  setCurrentAddress: (address: string) => void;
  showLocationCard: boolean;
  setShowLocationCard: (show: boolean) => void;
  gpsMode: 'none' | 'location' | 'compass';
  setGpsMode: (mode: 'none' | 'location' | 'compass') => void;
  deviceHeading: number | null;
  setDeviceHeading: (heading: number | null) => void;

  // Loading
  forceLoad: boolean;
  setForceLoad: (force: boolean) => void;

  // Dragging State
  isMapDragging: boolean;
  setIsMapDragging: (isDragging: boolean) => void;
}

export const useMapUIStore = create<MapUIState>((set) => ({
  mapCenter: { lat: 37.5665, lng: 126.9780 },
  setMapCenter: (center) => set({ mapCenter: center }),
  
  zoomLevel: 15,
  setZoomLevel: (zoom) => set({ zoomLevel: zoom }),

  mapBounds: null,
  setMapBounds: (bounds) => set({ mapBounds: bounds }),

  isMapDragging: false,
  setIsMapDragging: (isDragging) => set({ isMapDragging: isDragging }),

  activeRecommendedPlace: null,
  setActiveRecommendedPlace: (place) => set({ activeRecommendedPlace: place }),

  mapClickedPlace: null,
  setMapClickedPlace: (place) => set({ mapClickedPlace: place }),

  isLocating: false,
  setIsLocating: (isLocating) => set({ isLocating }),

  userLocation: null,
  setUserLocation: (location) => set({ userLocation: location }),

  currentAddress: '',
  setCurrentAddress: (address) => set({ currentAddress: address }),

  showLocationCard: false,
  setShowLocationCard: (show) => set({ showLocationCard: show }),

  gpsMode: 'none',
  setGpsMode: (mode) => set({ gpsMode: mode }),

  deviceHeading: null,
  setDeviceHeading: (heading) => set({ deviceHeading: heading }),

  forceLoad: false,
  setForceLoad: (force) => set({ forceLoad: force }),
}));
