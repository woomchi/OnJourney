import { create } from 'zustand';
import type { CreateJourneyInput, Journey, Place, DirectionsApiResponse, LatLngBoundsLiteral, FocusedSegment } from '@/types/journey';
import { insertJourney } from '@/lib/journeys';
import { updateJourneyPlaces } from '@/lib/journeys/updatePlaces';
import { NaverDirectionService, calculateHaversineDistance } from '@/lib/naverMapRouteService';

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
  fetchJourneyDirections: () => Promise<void>;
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

  setActiveJourney: (journey) => {
    set({ activeJourney: journey, focusBounds: null, focusedSegment: null });
    if (journey) {
      get().fetchJourneyDirections();
    }
  },
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
    get().fetchJourneyDirections();
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
    get().fetchJourneyDirections();
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
    get().fetchJourneyDirections();
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
      if (transportType === 'car') {
        const response = await NaverDirectionService.fetchRoute(origin, dest, []);
        const traoptimal = response.route?.traoptimal?.[0];
        const path = traoptimal?.path || [];
        const pathPoints = path.map(([lng, lat]) => ({ lat, lng }));

        const durationMin = traoptimal
          ? Math.max(1, Math.round(traoptimal.summary.duration / 1000 / 60))
          : Math.max(3, Math.round((calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng) / 1000 / 35) * 60 + 4));

        const distanceKm = traoptimal
          ? traoptimal.summary.distance / 1000
          : calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng) / 1000;

        const fare = traoptimal?.summary.tollFare || traoptimal?.summary.taxiFare || (4800 + Math.round(distanceKm * 1100));

        const guide = traoptimal?.guide
          ? traoptimal.guide.map((g: any) => ({
              instructions: g.instructions,
              distance: g.distance,
              duration: g.duration,
            }))
          : [
              { instructions: '출발지에서 출발', distance: 0, duration: 0 },
              { instructions: '목적지 도착', distance: Math.round(distanceKm * 1000), duration: durationMin * 60 * 1000 }
            ];

        set((state) => ({
          directionsCache: {
            ...state.directionsCache,
            [cacheKey]: {
              primary: {
                duration: durationMin,
                fare,
                steps: [
                  {
                    type: 'car',
                    name: '차량',
                    duration: durationMin,
                    color: '#F59E0B',
                    pathPoints,
                  },
                ],
                pathPoints,
                guide,
              },
              alternatives: [
                {
                  type: 'taxi',
                  name: '택시',
                  duration: durationMin,
                  fare,
                },
                {
                  type: 'walk',
                  name: '도보',
                  duration: Math.round((distanceKm / 4.5) * 60),
                  fare: 0,
                },
              ],
            },
          },
          directionsLoading: {
            ...state.directionsLoading,
            [cacheKey]: false,
          },
        }));
      } else {
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
      }
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

  fetchJourneyDirections: async () => {
    const { activeJourney, fetchSegmentDirections } = get();
    if (!activeJourney || !activeJourney.places || activeJourney.places.length < 2) return;

    const places = activeJourney.places;
    const transportType = activeJourney.transport_type || 'public';

    if (transportType === 'car') {
      const start = places[0];
      const goal = places[places.length - 1];
      const waypoints = places.slice(1, -1);

      // 경유지가 5개를 초과하는 경우, 각 구간별로 개별 호출 처리
      if (waypoints.length > 5) {
        const promises = [];
        for (let i = 0; i < places.length - 1; i++) {
          promises.push(fetchSegmentDirections(places[i], places[i + 1], transportType));
        }
        await Promise.all(promises);
        return;
      }

      const loadingStates: Record<string, boolean> = {};
      for (let i = 0; i < places.length - 1; i++) {
        const key = `${places[i].id}-${places[i+1].id}-car`;
        loadingStates[key] = true;
      }
      set((state) => ({
        directionsLoading: {
          ...state.directionsLoading,
          ...loadingStates,
        },
      }));

      try {
        const response = await NaverDirectionService.fetchRoute(start, goal, waypoints);
        const traoptimal = response.route?.traoptimal?.[0];
        const path = traoptimal?.path || [];
        const sectionArray = traoptimal?.section || (traoptimal as any)?.sections || [];
        const isSingleSegment = places.length === 2;

        const cacheUpdates: Record<string, DirectionsApiResponse> = {};
        const loadingUpdates: Record<string, boolean> = {};

        for (let i = 0; i < places.length - 1; i++) {
          const origin = places[i];
          const dest = places[i + 1];
          const key = `${origin.id}-${dest.id}-car`;

          let sectionPathPoints: { lat: number; lng: number }[] = [];
          let sectionGuides: any[] = [];
          let durationMin = 0;
          let distanceKm = 0;
          let fare = 0;

          let legDistance = 0;
          let legDuration = 0;
          let startIdx = 0;
          let endIdx = 0;

          if (isSingleSegment && traoptimal) {
            // 경유지가 없는 단일 구간의 경우 전체 경로 정보 적용
            legDistance = traoptimal.summary.distance;
            legDuration = traoptimal.summary.duration;
            startIdx = 0;
            endIdx = path.length - 1;
          } else if (traoptimal) {
            // 다중 경유지 구간 (Waypoints) 적용
            const waypointArray = traoptimal.summary.waypoints || [];
            const isLastLeg = i === places.length - 2;

            if (isLastLeg) {
              const targetNode = traoptimal.summary.goal;
              legDistance = targetNode.distance;
              legDuration = targetNode.duration;
              startIdx = waypointArray.length > 0 ? (waypointArray[waypointArray.length - 1]?.pointIndex || 0) : 0;
              endIdx = targetNode.pointIndex;
            } else {
              const targetNode = waypointArray[i];
              if (targetNode) {
                legDistance = targetNode.distance;
                legDuration = targetNode.duration;
                startIdx = i === 0 ? 0 : (waypointArray[i - 1]?.pointIndex || 0);
                endIdx = targetNode.pointIndex;
              } else {
                // 예외 대비 fallback
                legDistance = calculateHaversineDistance(origin.lat, origin.lng, dest.lat, dest.lng);
                legDuration = Math.max(180000, Math.round((legDistance / 9.72) * 1000));
                startIdx = 0;
                endIdx = path.length - 1;
              }
            }
          }

          if (traoptimal && path.length > 0 && endIdx >= startIdx) {
            sectionPathPoints = path
              .slice(startIdx, endIdx + 1)
              .map(([lng, lat]) => ({ lat, lng }));
            
            if (traoptimal.guide) {
              sectionGuides = traoptimal.guide
                .filter(
                  (g: any) =>
                    g.pointIndex >= startIdx &&
                    g.pointIndex <= endIdx
                )
                .map((g: any) => ({
                  instructions: g.instructions,
                  distance: g.distance,
                  duration: g.duration,
                }));
            }
          } else {
            sectionPathPoints = [
              { lat: origin.lat, lng: origin.lng },
              { lat: dest.lat, lng: dest.lng }
            ];
          }

          durationMin = Math.max(1, Math.round(legDuration / 1000 / 60));
          distanceKm = legDistance / 1000;
          fare = 4800 + Math.round(distanceKm * 1100);

          cacheUpdates[key] = {
            primary: {
              duration: durationMin,
              fare,
              steps: [
                {
                  type: 'car',
                  name: '차량',
                  duration: durationMin,
                  color: '#F59E0B',
                  pathPoints: sectionPathPoints,
                },
              ],
              pathPoints: sectionPathPoints,
              guide: sectionGuides.length > 0 ? sectionGuides : [
                { instructions: '출발지에서 출발', distance: 0, duration: 0 },
                { instructions: '목적지 도착', distance: Math.round(distanceKm * 1000), duration: durationMin * 60 * 1000 }
              ],
            },
            alternatives: [
              {
                type: 'taxi',
                name: '택시',
                duration: durationMin,
                fare: fare,
              },
              {
                type: 'walk',
                name: '도보',
                duration: Math.round((distanceKm / 4.5) * 60),
                fare: 0,
              },
            ],
          };
          loadingUpdates[key] = false;
        }

        set((state) => ({
          directionsCache: {
            ...state.directionsCache,
            ...cacheUpdates,
          },
          directionsLoading: {
            ...state.directionsLoading,
            ...loadingUpdates,
          },
        }));

      } catch (err) {
        console.error('[journey-store] fetchJourneyDirections (car) error:', err);
        const loadingUpdates: Record<string, boolean> = {};
        for (let i = 0; i < places.length - 1; i++) {
          const key = `${places[i].id}-${places[i+1].id}-car`;
          loadingUpdates[key] = false;
        }
        set((state) => ({
          directionsLoading: {
            ...state.directionsLoading,
            ...loadingUpdates,
          },
        }));
      }
    } else {
      const promises = [];
      for (let i = 0; i < places.length - 1; i++) {
        promises.push(fetchSegmentDirections(places[i], places[i + 1], transportType));
      }
      await Promise.all(promises);
    }
  },

  setFocusBounds: (bounds) => set({ focusBounds: bounds }),
  setFocusedSegment: (segment) => set({ focusedSegment: segment }),
}));
