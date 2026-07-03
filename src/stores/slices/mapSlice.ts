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
  recommendedPlaces: PlaceResult[];
  setFocusBounds: (bounds: LatLngBoundsLiteral | null) => void;
  setFocusedSegment: (segment: FocusedSegment | null) => void;
  setFocusedStep: (step: FocusedStep | null) => void;
  setAlternativeSegment: (segment: FocusedSegment | null) => void;
  setHoveredAlternativeRoute: (route: DirectionResult | null) => void;
  setIsAlternativeFromFocus: (val: boolean) => void;
  setMapCenterAddress: (address: string) => void;
  setMapCenterCoord: (coord: { lat: number; lng: number } | null) => void;
  setRecommendedPlaces: (places: PlaceResult[]) => void;
  clearRecommendedPlaces: () => void;
  hoveredSearchPlace: PlaceResult | null;
  setHoveredSearchPlace: (place: PlaceResult | null) => void;
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
  recommendedPlaces: [],
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
  setRecommendedPlaces: (places) => set({ recommendedPlaces: places }),
  clearRecommendedPlaces: () => set({ recommendedPlaces: [] }),
  hoveredSearchPlace: null,
  setHoveredSearchPlace: (place) => set({ hoveredSearchPlace: place }),
});

