import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import type { Place, DirectionsApiResponse, DirectionResult, SnapMeta } from '@/types/journey';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useJourneyStore } from '@/stores/journey-store';

export const directionKeys = {
  all: ['directions'] as const,
  segment: (originId: string, destId: string) => [...directionKeys.all, originId, destId] as const,
  segmentPublic: (originId: string, destId: string) => [...directionKeys.segment(originId, destId), 'public'] as const,
  segmentCar: (originId: string, destId: string) => [...directionKeys.segment(originId, destId), 'car'] as const,
};

export function useSegmentDirection(origin: Place | null, dest: Place | null) {
  const { departureTime } = useJourneyStore();
  
  const publicQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentPublic(origin.id, dest.id) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchPublicDirectionsApi(origin, dest, departureTime || undefined);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  const carWalkQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentCar(origin.id, dest.id) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchCarWalkDirectionsApi(origin, dest, departureTime || undefined);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  return { publicQuery, carWalkQuery };
}

export function useJourneyDirections() {
  const queryClient = useQueryClient();

  const fetchSequentialDirections = async (places: Place[]) => {
    if (!places || places.length < 2) return;

    for (let i = 0; i < places.length - 1; i++) {
      const currentPlace = places[i];
      const nextPlace = places[i + 1];

      if (currentPlace.selected_route && currentPlace.selected_route.destId === nextPlace.id) {
        continue;
      }

      const publicKey = directionKeys.segmentPublic(currentPlace.id, nextPlace.id);
      const carKey = directionKeys.segmentCar(currentPlace.id, nextPlace.id);
      
      const publicCached = queryClient.getQueryData(publicKey);
      const carCached = queryClient.getQueryData(carKey);

      try {
        const promises = [];
        if (!publicCached) {
          promises.push(queryClient.fetchQuery({
            queryKey: publicKey,
            queryFn: () => fetchPublicDirectionsApi(currentPlace, nextPlace),
            staleTime: 1000 * 60 * 30,
          }));
        }
        if (!carCached) {
          promises.push(queryClient.fetchQuery({
            queryKey: carKey,
            queryFn: () => fetchCarWalkDirectionsApi(currentPlace, nextPlace),
            staleTime: 1000 * 60 * 30,
          }));
        }

        if (promises.length > 0) {
          await Promise.allSettled(promises);
        }
      } catch (error) {
        console.error('[useJourneyDirections] Error fetching segment:', error);
      }
    }
  };

  return { fetchSequentialDirections };
}

export function useJourneyDirectionsCache(places: Place[] | undefined) {
  const queryClient = useQueryClient();
  const [directionsCache, setDirectionsCache] = useState<Record<string, DirectionsApiResponse>>({});

  const placesRef = useRef(places);
  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  const placesKey = useMemo(() => {
    if (!places) return '';
    return places.map(p => `${p.id}-${p.selected_route?.destId || ''}`).join(',');
  }, [places]);

  useEffect(() => {
    const activePlaces = placesRef.current;
    if (!activePlaces || activePlaces.length < 2) {
      setDirectionsCache({});
      return;
    }

    const updateCache = () => {
      const currentPlaces = placesRef.current;
      if (!currentPlaces || currentPlaces.length < 2) return;

      const newCache: Record<string, DirectionsApiResponse> = {};
      currentPlaces.slice(0, -1).forEach((origin, i) => {
        const dest = currentPlaces[i + 1];
        const cacheKey = `${origin.id}-${dest.id}`;
        const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(origin.id, dest.id));
        const carData = queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }>(directionKeys.segmentCar(origin.id, dest.id));
        
        if (publicData || carData) {
          newCache[cacheKey] = {
            public: publicData?.public || [],
            car: carData?.car || [],
            walk: carData?.walk || []
          };
        }
      });
      
      setDirectionsCache(prevCache => {
        const prevKeys = Object.keys(prevCache);
        const newKeys = Object.keys(newCache);
        if (prevKeys.length !== newKeys.length) return newCache;
        
        for (const key of newKeys) {
          if (prevCache[key] !== newCache[key]) {
            return newCache;
          }
        }
        return prevCache;
      });
    };

    updateCache();
  }, [placesKey, queryClient]);

  useEffect(() => {
    let cacheUpdateTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'added') {
        const qKey = event.query.queryKey;
        if (Array.isArray(qKey) && qKey[0] === 'directions') {
          // Check if updated direction segment belongs to active places
          const activePlaces = placesRef.current;
          if (activePlaces && activePlaces.length >= 2 && qKey.length >= 3) {
            const originId = qKey[1];
            const destId = qKey[2];
            const isRelevant = activePlaces.some((p, i) => i < activePlaces.length - 1 && p.id === originId && activePlaces[i + 1].id === destId);
            
            if (isRelevant) {
              if (cacheUpdateTimer) clearTimeout(cacheUpdateTimer);
              cacheUpdateTimer = setTimeout(() => {
                const currentPlaces = placesRef.current;
                if (!currentPlaces || currentPlaces.length < 2) return;

                const newCache: Record<string, DirectionsApiResponse> = {};
                currentPlaces.slice(0, -1).forEach((origin, i) => {
                  const dest = currentPlaces[i + 1];
                  const cacheKey = `${origin.id}-${dest.id}`;
                  const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(directionKeys.segmentPublic(origin.id, dest.id));
                  const carData = queryClient.getQueryData<{ car: DirectionResult[]; walk: DirectionResult[]; snapMeta?: SnapMeta }>(directionKeys.segmentCar(origin.id, dest.id));
                  
                  if (publicData || carData) {
                    newCache[cacheKey] = {
                      public: publicData?.public || [],
                      car: carData?.car || [],
                      walk: carData?.walk || []
                    };
                  }
                });

                setDirectionsCache(prevCache => {
                  const prevKeys = Object.keys(prevCache);
                  const newKeys = Object.keys(newCache);
                  if (prevKeys.length !== newKeys.length) return newCache;
                  
                  for (const key of newKeys) {
                    if (prevCache[key] !== newCache[key]) {
                      return newCache;
                    }
                  }
                  return prevCache;
                });
              }, 50);
            }
          }
        }
      }
    });

    return () => {
      unsubscribe();
      if (cacheUpdateTimer) clearTimeout(cacheUpdateTimer);
    };
  }, [queryClient]);

  return directionsCache;
}
