import { create } from 'zustand';
import type { CreateJourneyInput, Journey, Place, DirectionsApiResponse, LatLngBoundsLiteral, FocusedSegment, SelectedRoute, DirectionResult, FocusedStep } from '@/types/journey';
import { insertJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import { NaverDirectionService, calculateHaversineDistance } from '@/lib/naverMapRouteService';

function verifyAndCleanRoutes(places: Place[]): Place[] {
  return places.map((place, idx) => {
    const nextPlace = idx < places.length - 1 ? places[idx + 1] : null;
    if (place.selected_route) {
      if (!nextPlace || place.selected_route.destId !== nextPlace.id) {
        const { selected_route, ...rest } = place;
        return rest;
      }
    }
    return place;
  });
}

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
  focusedStep: FocusedStep | null;
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
  fetchSegmentDirections: (origin: Place, dest: Place, transportType?: 'public' | 'car') => Promise<void>;
  fetchJourneyDirections: () => Promise<void>;
  setFocusBounds: (bounds: LatLngBoundsLiteral | null) => void;
  setFocusedSegment: (segment: FocusedSegment | null) => void;
  setFocusedStep: (step: FocusedStep | null) => void;
  selectSegmentRoute: (placeId: string, route: SelectedRoute | null) => Promise<void>;
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
  focusedStep: null,

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

  setActiveJourney: (journey) => {
    set({ activeJourney: journey, focusBounds: null, focusedSegment: null, focusedStep: null });
    if (journey) {
      get().fetchJourneyDirections();
    }
  },
  clearJourney: () => set({ activeJourney: null, focusBounds: null, focusedSegment: null, focusedStep: null }),

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
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    get().fetchJourneyDirections();
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
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    get().fetchJourneyDirections();
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
    }));
    // DB 동기화
    await updateJourneyPlaces(activeJourney.id, cleanedPlaces);
    get().fetchJourneyDirections();
  },

  fetchSegmentDirections: async (origin, dest) => {
    const cacheKey = `${origin.id}-${dest.id}`;
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
      const url = `/api/directions?sx=${origin.lng}&sy=${origin.lat}&ex=${dest.lng}&ey=${dest.lat}`;
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
      // Fallback
      const distanceKm = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng) / 1000;
      const walkDuration = Math.round((distanceKm / 4.5) * 60);
      const carDuration = Math.max(3, Math.round((distanceKm / 35) * 60 + 4));
      const taxiFare = 4800 + Math.round(distanceKm * 1.3 * 1100);
      const fallbackPath = [
        { lat: origin.lat, lng: origin.lng },
        { lat: dest.lat, lng: dest.lng }
      ];

      const publicFallback: DirectionResult = {
        id: 'public-0',
        type: 'public' as const,
        name: '대중교통(예상)',
        duration: Math.round(carDuration * 1.3),
        fare: 1500,
        steps: [{ type: 'bus' as const, name: '대중교통(예상)', duration: Math.round(carDuration * 1.3), color: '#0068b7', pathPoints: fallbackPath }],
        pathPoints: fallbackPath
      };

      const carFallback: DirectionResult = {
        id: 'car-trafast',
        type: 'car' as const,
        name: '실시간 빠른길(예상)',
        duration: carDuration,
        fare: 0,
        taxiFare,
        steps: [{ type: 'car' as const, name: '차량', duration: carDuration, color: '#F59E0B', pathPoints: fallbackPath }],
        pathPoints: fallbackPath
      };

      const walkFallback: DirectionResult = {
        id: 'walk',
        type: 'walk' as const,
        name: '도보',
        duration: walkDuration,
        fare: 0,
        steps: [{ type: 'walk' as const, name: '도보', duration: walkDuration, color: '#A1A1AA', pathPoints: fallbackPath }],
        pathPoints: fallbackPath
      };

      set((state) => ({
        directionsCache: {
          ...state.directionsCache,
          [cacheKey]: {
            public: [publicFallback],
            car: [carFallback],
            walk: [walkFallback]
          },
        },
        directionsLoading: {
          ...state.directionsLoading,
          [cacheKey]: false,
        },
      }));
    }
  },

  fetchJourneyDirections: async () => {
    const { activeJourney, fetchSegmentDirections } = get();
    if (!activeJourney || !activeJourney.places || activeJourney.places.length < 2) return;

    const places = activeJourney.places;
    for (let i = 0; i < places.length - 1; i++) {
      await fetchSegmentDirections(places[i], places[i + 1]);
      // ODsay API 429 동시성 제한 방지를 위해 150ms 간격 순차 호출
      if (i < places.length - 2) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
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

    await updateJourneyPlaces(activeJourney.id, updatedPlaces);
  },

  setFocusBounds: (bounds) => set({ focusBounds: bounds }),
  setFocusedSegment: (segment) => set({ focusedSegment: segment }),
  setFocusedStep: (step) => set({ focusedStep: step }),
}));
