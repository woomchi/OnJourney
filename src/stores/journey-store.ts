import { create } from 'zustand';
import { createUISlice, type UISlice } from './slices/uiSlice';
import { createMapSlice, type MapSlice } from './slices/mapSlice';
import { createJourneyDataSlice, type JourneyDataSlice } from './slices/journeyDataSlice';

export type JourneyStore = UISlice & MapSlice & JourneyDataSlice;

export const useJourneyStore = create<JourneyStore>()((...a) => ({
  ...createUISlice(...a),
  ...createMapSlice(...a),
  ...createJourneyDataSlice(...a),
}));
