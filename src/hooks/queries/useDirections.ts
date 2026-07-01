import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSegmentDirections as fetchDirectionsApi } from '@/lib/services/directionsService';
import type { Place, DirectionsApiResponse } from '@/types/journey';
import { useEffect, useState } from 'react';

export const directionKeys = {
  all: ['directions'] as const,
  segment: (originId: string, destId: string) => [...directionKeys.all, originId, destId] as const,
};

export function useSegmentDirection(origin: Place | null, dest: Place | null) {
  return useQuery({
    queryKey: origin && dest ? directionKeys.segment(origin.id, dest.id) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchDirectionsApi(origin, dest);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
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

      const queryKey = directionKeys.segment(currentPlace.id, nextPlace.id);
      
      const cachedData = queryClient.getQueryData(queryKey);
      if (cachedData) continue;

      try {
        await queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchDirectionsApi(currentPlace, nextPlace),
          staleTime: 1000 * 60 * 30,
        });

        if (i < places.length - 2) {
          await new Promise((resolve) => setTimeout(resolve, 150));
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

  useEffect(() => {
    if (!places || places.length < 2) {
      setTimeout(() => setDirectionsCache({}), 0);
      return;
    }

    const updateCache = () => {
      const newCache: Record<string, DirectionsApiResponse> = {};
      places.slice(0, -1).forEach((origin, i) => {
        const dest = places[i + 1];
        const cacheKey = `${origin.id}-${dest.id}`;
        const queryKey = directionKeys.segment(origin.id, dest.id);
        const data = queryClient.getQueryData<DirectionsApiResponse>(queryKey);
        if (data) {
          newCache[cacheKey] = data;
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

    // Initial populate
    setTimeout(updateCache, 0);

    // Subscribe to query cache changes
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' || event.type === 'added') {
        // Only update if the query matches our direction keys
        const isDirectionQuery = event.query.queryKey[0] === 'directions';
        if (isDirectionQuery) {
          updateCache();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [places, queryClient]);

  return directionsCache;
}
