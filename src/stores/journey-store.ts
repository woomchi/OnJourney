import { create } from 'zustand';
import type { CreateJourneyInput, Journey, Place } from '@/types/journey';
import { insertJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';

interface JourneyStore {
  journeys: Journey[];
  activeJourney: Journey | null;
  isCreateFormOpen: boolean;
  isAddPlaceOpen: boolean;
  isLoading: boolean;
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
}

export const useJourneyStore = create<JourneyStore>((set, get) => ({
  journeys: [],
  activeJourney: null,
  isCreateFormOpen: false,
  isAddPlaceOpen: false,
  isLoading: false,

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

  setActiveJourney: (journey) => set({ activeJourney: journey }),
  clearJourney: () => set({ activeJourney: null }),

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
}));
