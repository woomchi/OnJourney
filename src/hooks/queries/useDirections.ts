import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import type { Place, DirectionsApiResponse, DirectionResult, SnapMeta } from '@/types/journey';
import { useEffect, useRef, useMemo, useCallback } from 'react';
import { useJourneyStore } from '@/stores/journey-store';

/**
 * 출발 시각(Unix ms)을 1시간(60분) 단위 버킷으로 정규화하여 캐시 파편화를 방지하고 적중률을 극대화 (명세서 규격)
 */
export function normalizeDepartureTime(time?: number | null, bucketMinutes = 60): number | null {
  if (!time) return null;
  const bucketMs = bucketMinutes * 60 * 1000;
  return Math.floor(time / bucketMs) * bucketMs;
}

export const directionKeys = {
  all: ['directions'] as const,
  segment: (originId: string, destId: string) => [...directionKeys.all, originId, destId] as const,
  segmentPublic: (originId: string, destId: string, departureTime?: number | null) => [
    ...directionKeys.segment(originId, destId),
    'public',
    normalizeDepartureTime(departureTime) ?? 'now',
  ] as const,
  segmentCar: (originId: string, destId: string, departureTime?: number | null) => [
    ...directionKeys.segment(originId, destId),
    'car',
    normalizeDepartureTime(departureTime) ?? 'now',
  ] as const,
};

export function useSegmentDirection(origin: Place | null, dest: Place | null) {
  const departureTime = useJourneyStore((s) => s.departureTime);
  const normalizedTime = useMemo(() => normalizeDepartureTime(departureTime), [departureTime]);
  
  const publicQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentPublic(origin.id, dest.id, normalizedTime) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchPublicDirectionsApi(origin, dest, normalizedTime || undefined);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  const carWalkQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentCar(origin.id, dest.id, normalizedTime) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchCarWalkDirectionsApi(origin, dest, normalizedTime || undefined);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  return { publicQuery, carWalkQuery };
}

export function useJourneyDirections() {
  const queryClient = useQueryClient();
  const departureTime = useJourneyStore((s) => s.departureTime);
  // departureTime을 ref로 유지하여 useCallback deps를 최소화
  const departureTimeRef = useRef(departureTime);
  useEffect(() => {
    departureTimeRef.current = departureTime;
  }, [departureTime]);

  // useCallback으로 함수 참조를 안정화 — 렌더마다 새 참조가 생성되지 않음
  const fetchSequentialDirections = useCallback(async (places: Place[]) => {
    if (!places || places.length < 2) return;

    const normalizedTime = normalizeDepartureTime(departureTimeRef.current);
    const allPromises: Promise<unknown>[] = [];

    for (let i = 0; i < places.length - 1; i++) {
      const currentPlace = places[i];
      const nextPlace = places[i + 1];

      if (currentPlace.selected_route && currentPlace.selected_route.destId === nextPlace.id) {
        continue;
      }

      const publicKey = directionKeys.segmentPublic(currentPlace.id, nextPlace.id, normalizedTime);
      const carKey = directionKeys.segmentCar(currentPlace.id, nextPlace.id, normalizedTime);
      
      const publicCached = queryClient.getQueryData(publicKey);
      const carCached = queryClient.getQueryData(carKey);

      if (!publicCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: publicKey,
          queryFn: () => fetchPublicDirectionsApi(currentPlace, nextPlace, normalizedTime || undefined),
          staleTime: 1000 * 60 * 30,
        }));
      }
      if (!carCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: carKey,
          queryFn: () => fetchCarWalkDirectionsApi(currentPlace, nextPlace, normalizedTime || undefined),
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
  // queryClient는 안정적인 참조이므로 deps에서 제외해도 안전
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  return { fetchSequentialDirections };
}

export function useJourneyDirectionsCache(places: Place[] | undefined) {
  const departureTime = useJourneyStore((s) => s.departureTime);
  const normalizedTime = useMemo(() => normalizeDepartureTime(departureTime), [departureTime]);

  const segmentQueries = useMemo(() => {
    if (!places || places.length < 2) return [];

    const queries = [];
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];

      queries.push({
        queryKey: directionKeys.segmentPublic(origin.id, dest.id, normalizedTime),
        queryFn: () => fetchPublicDirectionsApi(origin, dest, normalizedTime || undefined),
        staleTime: 1000 * 60 * 30,
        enabled: !!origin && !!dest,
      });

      queries.push({
        queryKey: directionKeys.segmentCar(origin.id, dest.id, normalizedTime),
        queryFn: () => fetchCarWalkDirectionsApi(origin, dest, normalizedTime || undefined),
        staleTime: 1000 * 60 * 30,
        enabled: !!origin && !!dest,
      });
    }
    return queries;
  }, [places, normalizedTime]);

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

