import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createMapSlice, type MapSlice } from './slices/mapSlice';
import { createJourneyDataSlice, type JourneyDataSlice } from './slices/journeyDataSlice';

export type JourneyStore = UISlice & MapSlice & JourneyDataSlice;

export const useJourneyStore = create<JourneyStore>()(
  persist(
    (...a) => ({
      ...createUISlice(...a),
      ...createMapSlice(...a),
      ...createJourneyDataSlice(...a),
    }),
    {
      name: 'onjourney-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        journeys: state.journeys,
        activeJourney: state.activeJourney,
      }),
    }
  )
);
