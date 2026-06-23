import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';

export interface UISlice {
  isCreateFormOpen: boolean;
  isAddPlaceOpen: boolean;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  openAddPlace: () => void;
  closeAddPlace: () => void;
}

export const createUISlice: StateCreator<
  JourneyStore,
  [],
  [],
  UISlice
> = (set) => ({
  isCreateFormOpen: false,
  isAddPlaceOpen: false,
  openCreateForm: () => set({ isCreateFormOpen: true }),
  closeCreateForm: () => set({ isCreateFormOpen: false }),
  openAddPlace: () => set({ isAddPlaceOpen: true }),
  closeAddPlace: () => set({ isAddPlaceOpen: false }),
});
