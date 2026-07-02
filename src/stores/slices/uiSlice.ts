import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';

export interface UISlice {
  isCreateFormOpen: boolean;
  isSearchMode: boolean;
  isEditMode: boolean;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  openSearchMode: () => void;
  closeSearchMode: () => void;
  setEditMode: (isEdit: boolean) => void;
}

export const createUISlice: StateCreator<
  JourneyStore,
  [],
  [],
  UISlice
> = (set) => ({
  isCreateFormOpen: false,
  isSearchMode: false,
  isEditMode: false,
  openCreateForm: () => set({ isCreateFormOpen: true }),
  closeCreateForm: () => set({ isCreateFormOpen: false }),
  openSearchMode: () => set({ isSearchMode: true }),
  closeSearchMode: () => set({ isSearchMode: false, recommendedPlaces: [] }),
  setEditMode: (isEdit) => set((state) => ({ 
    isEditMode: isEdit,
    ...(isEdit ? {
      focusedSegment: null,
      focusedStep: null,
      alternativeSegment: null,
      hoveredAlternativeRoute: null,
      focusBounds: null,
    } : {})
  })),
});
