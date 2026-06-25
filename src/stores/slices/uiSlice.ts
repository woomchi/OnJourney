import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';

export interface UISlice {
  isCreateFormOpen: boolean;
  isSearchMode: boolean;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  openSearchMode: () => void;
  closeSearchMode: () => void;
}

export const createUISlice: StateCreator<
  JourneyStore,
  [],
  [],
  UISlice
> = (set) => ({
  isCreateFormOpen: false,
  isSearchMode: false,
  openCreateForm: () => set({ isCreateFormOpen: true }),
  closeCreateForm: () => set({ isCreateFormOpen: false }),
  openSearchMode: () => set({ isSearchMode: true }),
  closeSearchMode: () => set({ isSearchMode: false, recommendedPlaces: [] }),
});
