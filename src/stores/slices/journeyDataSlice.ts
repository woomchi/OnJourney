import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';
import type { CreateJourneyInput, Journey, Place, DirectionsApiResponse, SelectedRoute, TransportType } from '@/types/journey';
import { insertJourney, updateJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import { verifyAndCleanRoutes } from '@/lib/services/directionsService';

export interface JourneyDataSlice {
  journeys: Journey[];
  activeJourney: Journey | null;
  isLoading: boolean;
  isSyncing: boolean;
  setJourneys: (journeys: Journey[]) => void;
  createJourney: (input: CreateJourneyInput) => Promise<void>;
  updateJourneyInfo: (title: string, journeyDate: string, transportType: TransportType) => Promise<void>;
  setActiveJourney: (journey: Journey | null) => void;
  clearJourney: () => void;
  addPlace: (place: Place) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  reorderPlaces: (places: Place[]) => Promise<void>;
  selectSegmentRoute: (placeId: string, route: SelectedRoute | null) => Promise<void>;
}

export const createJourneyDataSlice: StateCreator<
  JourneyStore,
  [],
  [],
  JourneyDataSlice
> = (set, get) => ({
  journeys: [],
  activeJourney: null,
  isLoading: false,
  isSyncing: false,

  setJourneys: (journeys) => set({ journeys }),

  createJourney: async (input) => {
    set({ isLoading: true });
    try {
      const journey = await insertJourney(input);
      set((state) => ({
        activeJourney: journey,
        journeys: [journey, ...state.journeys],
        isCreateFormOpen: false,
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof Error
        ? err
        : new Error('여정 저장에 실패했습니다.');
    }
  },

  updateJourneyInfo: async (title, journeyDate, transportType) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    set({ isLoading: true });
    try {
      const updated = await updateJourney(activeJourney.id, {
        title: title.trim(),
        journey_date: journeyDate,
        transport_type: transportType,
      });

      const updatedActiveJourney = {
        ...updated,
        places: activeJourney.places,
      };

      set((state) => ({
        activeJourney: updatedActiveJourney,
        journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof Error
        ? err
        : new Error('여정 정보 수정에 실패했습니다.');
    }
  },

  setActiveJourney: (journey) => {
    set({ 
      activeJourney: journey, 
      focusBounds: null, 
      focusedSegment: null, 
      focusedStep: null,
      alternativeSegment: null,
      hoveredAlternativeRoute: null,
      isSearchMode: false,
      recommendedPlaces: []
    });
  },

  clearJourney: () => set({ 
    activeJourney: null, 
    focusBounds: null, 
    focusedSegment: null, 
    focusedStep: null,
    alternativeSegment: null,
    hoveredAlternativeRoute: null,
    isSearchMode: false,
    recommendedPlaces: []
  }),

  addPlace: async (place) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const rawPlaces = [...(activeJourney.places || []), place];
    const updatedPlaces = verifyAndCleanRoutes(rawPlaces);
    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    
    // 낙관적 업데이트: UI 먼저 반영
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
      focusBounds: null,
      focusedSegment: null,
      focusedStep: null,
      alternativeSegment: null,
      hoveredAlternativeRoute: null,
    }));
    
    // DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    } finally {
      set({ isSyncing: false });
    }
  },

  removePlace: async (placeId) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const rawPlaces = activeJourney.places.filter((p) => p.id !== placeId);
    const updatedPlaces = verifyAndCleanRoutes(rawPlaces);
    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    
    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
      focusBounds: null,
      focusedSegment: null,
      focusedStep: null,
      alternativeSegment: null,
      hoveredAlternativeRoute: null,
    }));
    
    // DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    } finally {
      set({ isSyncing: false });
    }
  },

  reorderPlaces: async (updatedPlaces) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const cleanedPlaces = verifyAndCleanRoutes(updatedPlaces);
    const updatedActiveJourney = { ...activeJourney, places: cleanedPlaces };
    
    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
      focusBounds: null,
      focusedSegment: null,
      focusedStep: null,
      alternativeSegment: null,
      hoveredAlternativeRoute: null,
    }));
    
    // DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(activeJourney.id, cleanedPlaces);
    } finally {
      set({ isSyncing: false });
    }
  },



  selectSegmentRoute: async (placeId, route) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const updatedPlaces = activeJourney.places.map((p) => {
      if (p.id === placeId) {
        return {
          ...p,
          selected_route: route || undefined,
        };
      }
      return p;
    });

    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
    }));

    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    } finally {
      set({ isSyncing: false });
    }
  },
});
