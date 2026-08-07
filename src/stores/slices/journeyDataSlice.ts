/**
 * @fileoverview 여정 데이터(Journey) 관련 Zustand 슬라이스
 *
 * 여정 CRUD 및 경유지 조작을 담당합니다.
 * 모든 쓰기 작업은 UI 응답성을 위해 낙관적 업데이트를 먼저 적용한 뒤,
 * 백그라운드에서 DB를 동기화합니다.
 */

import { StateCreator } from 'zustand';
import type { JourneyStore } from '../journey-store';
import type {
  CreateJourneyInput,
  Journey,
  Place,
  DirectionsApiResponse,
  SelectedRoute,
  TransportType,
} from '@/types/journey';
import { insertJourney, updateJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import { verifyAndCleanRoutes } from '@/lib/services/directionsService';

// ─── 인터페이스 ───────────────────────────────────────────────────────────────

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
  updatePlace: (targetPlaceId: string, newPlace: Place) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  reorderPlaces: (places: Place[]) => Promise<void>;
  selectSegmentRoute: (placeId: string, route: SelectedRoute | null) => Promise<void>;
}

// ─── 리셋 상태 조각 ──────────────────────────────────────────────────────────

/**
 * 여정 전환 또는 경유지 변경 시 지도·경로 포커스 상태를 초기화하기 위한
 * 공통 상태 조각입니다. 슬라이스 간 결합을 최소화하기 위해 명시적으로 정의합니다.
 */
const RESET_FOCUS_STATE = {
  focusBounds: null,
  focusedSegment: null,
  focusedStep: null,
  focusedPlaceId: null,
  alternativeSegment: null,
  hoveredAlternativeRoute: null,
} as const;

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 업데이트된 경유지 목록을 journeys 배열 및 activeJourney에 낙관적으로 반영합니다.
 *
 * `addPlace`, `removePlace`, `reorderPlaces` 세 액션에서 동일하게 쓰이던
 * 중복 패턴을 단일 함수로 추출합니다.
 *
 * @param activeJourney 현재 활성 여정
 * @param updatedPlaces 변경된 경유지 배열
 */
function buildOptimisticPlacesUpdate(
  activeJourney: Journey,
  updatedPlaces: Place[]
): {
  activeJourney: Journey;
  journeyId: string;
  places: Place[];
} {
  const updatedActiveJourney: Journey = { ...activeJourney, places: updatedPlaces };
  return {
    activeJourney: updatedActiveJourney,
    journeyId: activeJourney.id,
    places: updatedPlaces,
  };
}

// ─── 슬라이스 생성 ────────────────────────────────────────────────────────────

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

  // ─ 여정 목록 갱신 ─
  setJourneys: (journeys) =>
    set((state) => {
      if (!state.activeJourney) return { journeys };
      // 목록 갱신 시 activeJourney도 최신 데이터로 동기화
      const updatedActive = journeys.find((j) => j.id === state.activeJourney?.id);
      return {
        journeys,
        activeJourney: updatedActive ?? state.activeJourney,
      };
    }),

  // ─ 여정 생성 ─
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

  // ─ 여정 정보 수정 (제목, 날짜, 이동수단) ─
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

      // 서버 응답의 메타 정보 + 기존 경유지를 합쳐 activeJourney 갱신
      const updatedActiveJourney: Journey = {
        ...updated,
        places: activeJourney.places,
      };

      set((state) => ({
        activeJourney: updatedActiveJourney,
        journeys: state.journeys.map((j) =>
          j.id === activeJourney.id ? updatedActiveJourney : j
        ),
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false });
      throw err instanceof Error
        ? err
        : new Error('여정 정보 수정에 실패했습니다.');
    }
  },

  // ─ 활성 여정 전환 ─
  setActiveJourney: (journey) => {
    // 여정 전환 시 지도·경로 포커스 상태 전체 초기화
    set({
      activeJourney: journey,
      ...RESET_FOCUS_STATE,
      isSearchMode: false,
      recommendedPlaces: [],
    });
  },

  // ─ 활성 여정 해제 ─
  clearJourney: () =>
    set({
      activeJourney: null,
      ...RESET_FOCUS_STATE,
      isSearchMode: false,
      recommendedPlaces: [],
    }),

  // ─ 경유지 추가 ─
  addPlace: async (place) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const rawPlaces = [...(activeJourney.places ?? []), place];
    const updatedPlaces = verifyAndCleanRoutes(rawPlaces);
    const { activeJourney: updatedActiveJourney, journeyId, places } =
      buildOptimisticPlacesUpdate(activeJourney, updatedPlaces);

    // 낙관적 업데이트: UI 먼저 반영
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) =>
        j.id === journeyId ? updatedActiveJourney : j
      ),
      ...RESET_FOCUS_STATE,
    }));

    // 백그라운드 DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(journeyId, places);
    } finally {
      set({ isSyncing: false });
    }
  },

  // ─ 기존 장소 정보 변경 (교체) ─
  updatePlace: async (targetPlaceId, newPlace) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const currentPlaces = activeJourney.places ?? [];
    const targetIndex = currentPlaces.findIndex((p) => p.id === targetPlaceId);
    if (targetIndex === -1) return;

    const rawPlaces = [...currentPlaces];
    rawPlaces[targetIndex] = newPlace;

    const updatedPlaces = verifyAndCleanRoutes(rawPlaces);
    const { activeJourney: updatedActiveJourney, journeyId, places } =
      buildOptimisticPlacesUpdate(activeJourney, updatedPlaces);

    // 낙관적 업데이트: UI 먼저 반영
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) =>
        j.id === journeyId ? updatedActiveJourney : j
      ),
      ...RESET_FOCUS_STATE,
      targetChangePlaceId: null,
    }));

    // 백그라운드 DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(journeyId, places);
    } finally {
      set({ isSyncing: false });
    }
  },

  // ─ 경유지 삭제 ─
  removePlace: async (placeId) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const rawPlaces = activeJourney.places.filter((p) => p.id !== placeId);
    const updatedPlaces = verifyAndCleanRoutes(rawPlaces);
    const { activeJourney: updatedActiveJourney, journeyId, places } =
      buildOptimisticPlacesUpdate(activeJourney, updatedPlaces);

    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) =>
        j.id === journeyId ? updatedActiveJourney : j
      ),
      ...RESET_FOCUS_STATE,
    }));

    // 백그라운드 DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(journeyId, places);
    } finally {
      set({ isSyncing: false });
    }
  },

  // ─ 경유지 순서 변경 ─
  reorderPlaces: async (updatedPlaces) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const cleanedPlaces = verifyAndCleanRoutes(updatedPlaces);
    const { activeJourney: updatedActiveJourney, journeyId, places } =
      buildOptimisticPlacesUpdate(activeJourney, cleanedPlaces);

    // 낙관적 업데이트
    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) =>
        j.id === journeyId ? updatedActiveJourney : j
      ),
      ...RESET_FOCUS_STATE,
    }));

    // 백그라운드 DB 동기화
    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(journeyId, places);
    } finally {
      set({ isSyncing: false });
    }
  },

  // ─ 구간 경로 수동 선택 ─
  selectSegmentRoute: async (placeId, route) => {
    const { activeJourney } = get();
    if (!activeJourney) return;

    const updatedPlaces = activeJourney.places.map((p) =>
      p.id === placeId
        ? { ...p, selected_route: route ?? undefined }
        : p
    );

    const updatedActiveJourney: Journey = { ...activeJourney, places: updatedPlaces };

    set((state) => ({
      activeJourney: updatedActiveJourney,
      journeys: state.journeys.map((j) =>
        j.id === activeJourney.id ? updatedActiveJourney : j
      ),
    }));

    set({ isSyncing: true });
    try {
      await updateJourneyPlaces(activeJourney.id, updatedPlaces);
    } finally {
      set({ isSyncing: false });
    }
  },
});
