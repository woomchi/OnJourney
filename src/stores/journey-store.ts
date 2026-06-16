import { create } from 'zustand';
import type { CreateJourneyInput, Journey, Place, DirectionsApiResponse, LatLngBoundsLiteral, FocusedSegment } from '@/types/journey';
import { insertJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';

interface JourneyStore {
  journeys: Journey[];
  activeJourney: Journey | null;
  isCreateFormOpen: boolean;
  isAddPlaceOpen: boolean;
  isLoading: boolean;
  directionsCache: Record<string, DirectionsApiResponse>;
  directionsLoading: Record<string, boolean>;
  focusBounds: LatLngBoundsLiteral | null;
  focusedSegment: FocusedSegment | null;
  setJourneys: (journeys: Journey[]) => void;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  openAddPlace: () => void;
  closeAddPlace: () => void;
  createJourney: (input: CreateJourneyInput) => Promise<void>;
  setActiveJourney: (journey: Journey | null) => void;
  clearJourney: () => void;
  addPlace: (place: Place) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  reorderPlaces: (places: Place[]) => Promise<void>;
  fetchSegmentDirections: (origin: Place, dest: Place, transportType: 'public' | 'car') => Promise<void>;
  setFocusBounds: (bounds: LatLngBoundsLiteral | null) => void;
  setFocusedSegment: (segment: FocusedSegment | null) => void;
}



export const useJourneyStore = create<JourneyStore>((set, get) => ({
  journeys: [],
  activeJourney: null,
  isCreateFormOpen: false,
  isAddPlaceOpen: false,
  isLoading: false,
  directionsCache: {},
  directionsLoading: {},
  focusBounds: null,
  focusedSegment: null,

  setJourneys: (journeys) => set({ journeys }),
  openCreateForm: () => set({ isCreateFormOpen: true }),
  closeCreateForm: () => set({ isCreateFormOpen: false }),
  openAddPlace: () => set({ isAddPlaceOpen: true }),
  closeAddPlace: () => set({ isAddPlaceOpen: false }),

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

  setActiveJourney: (journey) => set({ activeJourney: journey, focusBounds: null, focusedSegment: null }),
  clearJourney: () => set({ activeJourney: null, focusBounds: null, focusedSegment: null }),

  addPlace: async (place) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const updatedPlaces = [...(activeJourney.places || []), place];
    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    // 낙관적 업데이트: UI 먼저 반영
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
  },

  removePlace: async (placeId) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const updatedPlaces = activeJourney.places.filter((p) => p.id !== placeId);
    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
  },

  reorderPlaces: async (updatedPlaces) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const updatedActiveJourney = { ...activeJourney, places: updatedPlaces };
    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) => (j.id === activeJourney.id ? updatedActiveJourney : j)),
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
  },

  fetchSegmentDirections: async (origin, dest, transportType) => {
    const cacheKey = `${origin.id}-${dest.id}-${transportType}`;
    const { directionsCache, directionsLoading } = get();

    if (directionsCache[cacheKey] || directionsLoading[cacheKey]) {
      return;
    }

    set((state) => ({
      directionsLoading: {
        ...state.directionsLoading,
        [cacheKey]: true,
      },
    }));

    try {
      const url = `/api/directions?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}&type=${transportType}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('이동 경로 요청 실패');
      }
      const data = await res.json();

      set((state) => ({
        directionsCache: {
          ...state.directionsCache,
          [cacheKey]: data,
        },
        directionsLoading: {
          ...state.directionsLoading,
          [cacheKey]: false,
        },
      }));
    } catch (err) {
      console.error('[journey-store] fetchSegmentDirections error:', err);
      set((state) => ({
        directionsLoading: {
          ...state.directionsLoading,
          [cacheKey]: false,
        },
      }));
    }
  },

  setFocusBounds: (bounds) => set({ focusBounds: bounds }),
  setFocusedSegment: (segment) => set({ focusedSegment: segment }),
}));
