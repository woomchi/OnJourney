import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';
import type { LatLngBoundsLiteral, FocusedSegment, FocusedStep, DirectionResult, PlaceResult } from '@/types/journey';

export interface MapSlice {
  focusBounds: LatLngBoundsLiteral | null;
  focusedSegment: FocusedSegment | null;
  focusedStep: FocusedStep | null;
  alternativeSegment: FocusedSegment | null;
  hoveredAlternativeRoute: DirectionResult | null;
  isAlternativeFromFocus: boolean;
  mapCenterAddress: string;
  mapCenterCoord: { lat: number; lng: number } | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  mapRegions: string[];
  recommendedPlaces: PlaceResult[];
  setFocusBounds: (bounds: LatLngBoundsLiteral | null) => void;
  setFocusedSegment: (segment: FocusedSegment | null) => void;
  setFocusedStep: (step: FocusedStep | null) => void;
  setAlternativeSegment: (segment: FocusedSegment | null) => void;
  setHoveredAlternativeRoute: (route: DirectionResult | null) => void;
  setIsAlternativeFromFocus: (val: boolean) => void;
  setMapCenterAddress: (address: string) => void;
  setMapCenterCoord: (coord: { lat: number; lng: number } | null) => void;
  setMapBounds: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null) => void;
  setMapRegions: (regions: string[]) => void;
  setRecommendedPlaces: (places: PlaceResult[]) => void;
  clearRecommendedPlaces: () => void;
  isSearchLoading: boolean;
  setIsSearchLoading: (loading: boolean) => void;
  searchTriggerCount: number;
  triggerSearch: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeSearchPlace: PlaceResult | null;
  setActiveSearchPlace: (place: PlaceResult | null) => void;
}

export const createMapSlice: StateCreator<
  JourneyStore,
  [],
  [],
  MapSlice
> = (set) => ({
  focusBounds: null,
  focusedSegment: null,
  focusedStep: null,
  alternativeSegment: null,
  hoveredAlternativeRoute: null,
  isAlternativeFromFocus: false,
  mapCenterAddress: '',
  mapCenterCoord: null,
  mapBounds: null,
  mapRegions: [],
  recommendedPlaces: [],
  isSearchLoading: false,
  searchTriggerCount: 0,
  searchQuery: '',
  setFocusBounds: (bounds) => set({ focusBounds: bounds }),
  setFocusedSegment: (segment) => set((state) => ({ 
    focusedSegment: segment,
    ...(segment ? { alternativeSegment: null, hoveredAlternativeRoute: null } : {})
  })),
  setFocusedStep: (step) => set((state) => ({ 
    focusedStep: step,
    ...(step ? { alternativeSegment: null, hoveredAlternativeRoute: null } : {})
  })),
  setAlternativeSegment: (segment) => set((state) => ({ 
    alternativeSegment: segment,
    ...(segment ? { focusedSegment: null, focusedStep: null } : { hoveredAlternativeRoute: null })
  })),
  setHoveredAlternativeRoute: (route) => set({ hoveredAlternativeRoute: route }),
  setIsAlternativeFromFocus: (val) => set({ isAlternativeFromFocus: val }),
  setMapCenterAddress: (address) => set({ mapCenterAddress: address }),
  setMapCenterCoord: (coord) => set({ mapCenterCoord: coord }),
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  setMapRegions: (regions) => set({ mapRegions: regions }),
  setRecommendedPlaces: (places) => set({ recommendedPlaces: places }),
  clearRecommendedPlaces: () => set({ recommendedPlaces: [] }),
  setIsSearchLoading: (loading) => set({ isSearchLoading: loading }),
  triggerSearch: () => set((state) => ({ searchTriggerCount: state.searchTriggerCount + 1 })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  activeSearchPlace: null,
  setActiveSearchPlace: (place) => set({ activeSearchPlace: place }),
});

