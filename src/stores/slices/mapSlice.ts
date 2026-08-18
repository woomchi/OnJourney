import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';
import type { LatLngBoundsLiteral, FocusedSegment, FocusedStep, DirectionResult, PlaceResult, SubwayLineMapTarget, BusLineMapTarget } from '@/types/journey';

export interface MapSlice {
  focusBounds: LatLngBoundsLiteral | null;
  focusedSegment: FocusedSegment | null;
  focusedStep: FocusedStep | null;
  focusedPlaceId: string | null;
  alternativeSegment: FocusedSegment | null;
  hoveredAlternativeRoute: DirectionResult | null;
  isAlternativeFromFocus: boolean;
  subwayLineMapTarget: SubwayLineMapTarget | null;
  busLineMapTarget: BusLineMapTarget | null;
  mapCenterAddress: string;
  mapCenterCoord: { lat: number; lng: number } | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  mapRegions: string[];
  recommendedPlaces: PlaceResult[];
  setFocusBounds: (bounds: LatLngBoundsLiteral | null) => void;
  setFocusedSegment: (segment: FocusedSegment | null) => void;
  setFocusedStep: (step: FocusedStep | null) => void;
  setFocusedPlaceId: (id: string | null) => void;
  setAlternativeSegment: (segment: FocusedSegment | null) => void;
  setHoveredAlternativeRoute: (route: DirectionResult | null) => void;
  setIsAlternativeFromFocus: (val: boolean) => void;
  setSubwayLineMapTarget: (target: SubwayLineMapTarget | null) => void;
  setBusLineMapTarget: (target: BusLineMapTarget | null) => void;
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

const EPSILON = 1e-7;
export function areBoundsEqual(
  a: LatLngBoundsLiteral | null,
  b: LatLngBoundsLiteral | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.sw.lat - b.sw.lat) < EPSILON &&
    Math.abs(a.sw.lng - b.sw.lng) < EPSILON &&
    Math.abs(a.ne.lat - b.ne.lat) < EPSILON &&
    Math.abs(a.ne.lng - b.ne.lng) < EPSILON
  );
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
  focusedPlaceId: null,
  alternativeSegment: null,
  hoveredAlternativeRoute: null,
  isAlternativeFromFocus: false,
  subwayLineMapTarget: null,
  busLineMapTarget: null,
  mapCenterAddress: '',
  mapCenterCoord: null,
  mapBounds: null,
  mapRegions: [],
  recommendedPlaces: [],
  isSearchLoading: false,
  searchTriggerCount: 0,
  searchQuery: '',
  setFocusBounds: (bounds) => set((state) => {
    if (areBoundsEqual(state.focusBounds, bounds)) return state;
    return { focusBounds: bounds };
  }),
  setFocusedSegment: (segment) => set(() => ({ 
    focusedSegment: segment,
    ...(segment 
      ? { alternativeSegment: null, hoveredAlternativeRoute: null, focusedPlaceId: null, subwayLineMapTarget: null, busLineMapTarget: null } 
      : { focusBounds: null, focusedStep: null, alternativeSegment: null, hoveredAlternativeRoute: null, focusedPlaceId: null }
    )
  })),
  setFocusedStep: (step) => set(() => ({ 
    focusedStep: step,
    ...(step ? { alternativeSegment: null, hoveredAlternativeRoute: null, focusedPlaceId: null } : {})
  })),
  setFocusedPlaceId: (id) => set({ focusedPlaceId: id }),
  setAlternativeSegment: (segment) => set(() => ({ 
    alternativeSegment: segment,
    ...(segment ? { focusedSegment: null, focusedStep: null, focusedPlaceId: null, subwayLineMapTarget: null, busLineMapTarget: null } : { hoveredAlternativeRoute: null })
  })),
  setHoveredAlternativeRoute: (route) => set({ hoveredAlternativeRoute: route }),
  setIsAlternativeFromFocus: (val) => set({ isAlternativeFromFocus: val }),
  setSubwayLineMapTarget: (target) => set({ subwayLineMapTarget: target, ...(target ? { busLineMapTarget: null } : {}) }),
  setBusLineMapTarget: (target) => set({ busLineMapTarget: target, ...(target ? { subwayLineMapTarget: null } : {}) }),
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

