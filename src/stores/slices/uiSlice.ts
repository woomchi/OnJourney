import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';

export interface UISlice {
  isCreateFormOpen: boolean;
  isSearchMode: boolean;
  isEditMode: boolean;
  isCacheRestored: boolean;
  isDrawerMaximized: boolean;
  drawerSnapPoint: string | number | null;
  openCreateForm: () => void;
  closeCreateForm: () => void;
  openSearchMode: () => void;
  closeSearchMode: () => void;
  setEditMode: (isEdit: boolean) => void;
  setCacheRestored: (isRestored: boolean) => void;
  setDrawerMaximized: (isMaximized: boolean) => void;
  setDrawerSnapPoint: (snap: string | number | null) => void;
  guidePanelState: 'expanded' | 'minimized' | 'default';
  setGuidePanelState: (state: 'expanded' | 'minimized' | 'default') => void;
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
  isCacheRestored: false,
  isDrawerMaximized: false,
  drawerSnapPoint: '294px',
  guidePanelState: 'default',
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
  setCacheRestored: (isRestored) => set({ isCacheRestored: isRestored }),
  setDrawerMaximized: (isMaximized) => set({ isDrawerMaximized: isMaximized }),
  setDrawerSnapPoint: (snap) => set({ drawerSnapPoint: snap }),
  setGuidePanelState: (state) => set({ guidePanelState: state }),
});
