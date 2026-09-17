import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi, fetchIntercityDirectionsApi } from '@/lib/services/directionsService';
import type { Place, DirectionsApiResponse, DirectionResult, SnapMeta } from '@/types/journey';
import { useMemo, useCallback } from 'react';

/**
 * @deprecated 출발 시각 정규화 함수 (더 이상 directionKeys에 시간을 반영하지 않으므로 하위 호환용으로만 유지)
 */
export function normalizeDepartureTime(_time?: number | null, _bucketMinutes = 60): number | null {
  return null;
}

export const directionKeys = {
  all: ['directions'] as const,
  segment: (originId: string, destId: string) => [...directionKeys.all, originId, destId] as const,
  segmentPublic: (originId: string, destId: string, _departureTime?: number | null) => [
    ...directionKeys.segment(originId, destId),
    'public',
  ] as const,
  segmentIntercity: (originId: string, destId: string, _departureTime?: number | null) => [
    ...directionKeys.segment(originId, destId),
    'intercity',
  ] as const,
  segmentCar: (originId: string, destId: string, _departureTime?: number | null) => [
    ...directionKeys.segment(originId, destId),
    'car',
  ] as const,
};

export function useSegmentDirection(origin: Place | null, dest: Place | null) {
  const publicQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentPublic(origin.id, dest.id) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchPublicDirectionsApi(origin, dest);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  const carWalkQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentCar(origin.id, dest.id) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchCarWalkDirectionsApi(origin, dest);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  return { publicQuery, carWalkQuery };
}

export function useJourneyDirections() {
  const queryClient = useQueryClient();

  // useCallback으로 함수 참조를 안정화 — 렌더마다 새 참조가 생성되지 않음
  const fetchSequentialDirections = useCallback(async (places: Place[]) => {
    if (!places || places.length < 2) return;

    const allPromises: Promise<unknown>[] = [];

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

      if (!publicCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: publicKey,
          queryFn: () => fetchPublicDirectionsApi(currentPlace, nextPlace),
          staleTime: 1000 * 60 * 30,
        }));
      }
      if (!carCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: carKey,
          queryFn: () => fetchCarWalkDirectionsApi(currentPlace, nextPlace),
          staleTime: 1000 * 60 * 30,
        }));
      }
    }

    if (allPromises.length > 0) {
      try {
        await Promise.allSettled(allPromises);
      } catch (error) {
        console.error('[useJourneyDirections] Error fetching segment:', error);
      }
    }
  }, [queryClient]);

  return { fetchSequentialDirections };
}

export function useJourneyDirectionsCache(places: Place[] | undefined) {
  const segmentQueries = useMemo(() => {
    if (!places || places.length < 2) return [];

    const queries = [];
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];

      queries.push({
        queryKey: directionKeys.segmentPublic(origin.id, dest.id),
        queryFn: () => fetchPublicDirectionsApi(origin, dest),
        staleTime: 1000 * 60 * 30,
        enabled: !!origin && !!dest,
      });

      queries.push({
        queryKey: directionKeys.segmentCar(origin.id, dest.id),
        queryFn: () => fetchCarWalkDirectionsApi(origin, dest),
        staleTime: 1000 * 60 * 30,
        enabled: !!origin && !!dest,
      });
    }
    return queries;
  }, [places]);

  const queryResults = useQueries({ queries: segmentQueries });
  const resultsKey = queryResults.map((r) => `${r.status}-${r.dataUpdatedAt}`).join('|');

  return useMemo(() => {
    if (!places || places.length < 2) return {};

    const cache: Record<string, DirectionsApiResponse> = {};
    let resultIdx = 0;

    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      const cacheKey = `${origin.id}-${dest.id}`;

      const publicResult = queryResults[resultIdx++];
      const carResult = queryResults[resultIdx++];

      const publicData = publicResult?.data as { public: DirectionResult[] } | undefined;
      const carData = carResult?.data as {
        car: DirectionResult[];
        walk: DirectionResult[];
        snapMeta?: SnapMeta;
      } | undefined;

      if (publicData || carData) {
        cache[cacheKey] = {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || [],
        };
      }
    }
    return cache;
  }, [places, resultsKey]);
}

