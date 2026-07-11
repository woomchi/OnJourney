import { useJourneyStore } from '@/stores/journey-store';
import { useShallow } from 'zustand/react/shallow';

export function useMapState() {
  return useJourneyStore(useShallow((state) => ({
    activeJourney: state.activeJourney,
    focusBounds: state.focusBounds,
    setFocusBounds: state.setFocusBounds,
    focusedSegment: state.focusedSegment,
    setFocusedSegment: state.setFocusedSegment,
    focusedStep: state.focusedStep,
    setFocusedStep: state.setFocusedStep,
    alternativeSegment: state.alternativeSegment,
    setAlternativeSegment: state.setAlternativeSegment,
    hoveredAlternativeRoute: state.hoveredAlternativeRoute,
    isAlternativeFromFocus: state.isAlternativeFromFocus,
    recommendedPlaces: state.recommendedPlaces,
    activeSearchPlace: state.activeSearchPlace,
    setMapCenterAddress: state.setMapCenterAddress,
    setMapCenterCoord: state.setMapCenterCoord,
    setMapBounds: state.setMapBounds,
    addPlace: state.addPlace,
    removePlace: state.removePlace,
    isEditMode: state.isEditMode,
    isSearchMode: state.isSearchMode,
    isSearchLoading: state.isSearchLoading,
    triggerSearch: state.triggerSearch,
    hasSearchQuery: state.searchQuery.trim().length > 0,
    isDrawerMaximized: state.isDrawerMaximized,
    drawerSnapPoint: state.drawerSnapPoint,
  })));
}
