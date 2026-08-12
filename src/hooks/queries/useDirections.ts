import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPublicDirectionsApi, fetchCarWalkDirectionsApi } from '@/lib/services/directionsService';
import type { Place, DirectionsApiResponse, DirectionResult, SnapMeta } from '@/types/journey';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useJourneyStore } from '@/stores/journey-store';

export const directionKeys = {
  all: ['directions'] as const,
  segment: (originId: string, destId: string) => [...directionKeys.all, originId, destId] as const,
  segmentPublic: (originId: string, destId: string, departureTime?: number | null) => [...directionKeys.segment(originId, destId), 'public', departureTime ?? 'now'] as const,
  segmentCar: (originId: string, destId: string, departureTime?: number | null) => [...directionKeys.segment(originId, destId), 'car', departureTime ?? 'now'] as const,
};

export function useSegmentDirection(origin: Place | null, dest: Place | null) {
  const { departureTime } = useJourneyStore();
  
  const publicQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentPublic(origin.id, dest.id, departureTime) : directionKeys.all,
    queryFn: () => {
      if (!origin || !dest) throw new Error('Invalid origin or dest');
      return fetchPublicDirectionsApi(origin, dest, departureTime || undefined);
    },
    enabled: !!origin && !!dest,
    staleTime: 1000 * 60 * 30,
  });

  const carWalkQuery = useQuery({
    queryKey: origin && dest ? directionKeys.segmentCar(origin.id, dest.id, departureTime) : directionKeys.all,
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
  const { departureTime } = useJourneyStore();

  const fetchSequentialDirections = async (places: Place[]) => {
    if (!places || places.length < 2) return;

    const allPromises: Promise<any>[] = [];

    for (let i = 0; i < places.length - 1; i++) {
      const currentPlace = places[i];
      const nextPlace = places[i + 1];

      if (currentPlace.selected_route && currentPlace.selected_route.destId === nextPlace.id) {
        continue;
      }

      const publicKey = directionKeys.segmentPublic(currentPlace.id, nextPlace.id, departureTime);
      const carKey = directionKeys.segmentCar(currentPlace.id, nextPlace.id, departureTime);
      
      const publicCached = queryClient.getQueryData(publicKey);
      const carCached = queryClient.getQueryData(carKey);

      if (!publicCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: publicKey,
          queryFn: () => fetchPublicDirectionsApi(currentPlace, nextPlace, departureTime || undefined),
          staleTime: 1000 * 60 * 30,
        }));
      }
      if (!carCached) {
        allPromises.push(queryClient.fetchQuery({
          queryKey: carKey,
          queryFn: () => fetchCarWalkDirectionsApi(currentPlace, nextPlace, departureTime || undefined),
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
  };

  return { fetchSequentialDirections };
}

export function useJourneyDirectionsCache(places: Place[] | undefined) {
  const queryClient = useQueryClient();
  const { departureTime } = useJourneyStore();

  return useMemo(() => {
    if (!places || places.length < 2) return {};

    const cache: Record<string, DirectionsApiResponse> = {};
    for (let i = 0; i < places.length - 1; i++) {
      const origin = places[i];
      const dest = places[i + 1];
      const cacheKey = `${origin.id}-${dest.id}`;
      const publicData = queryClient.getQueryData<{ public: DirectionResult[] }>(
        directionKeys.segmentPublic(origin.id, dest.id, departureTime)
      );
      const carData = queryClient.getQueryData<{
        car: DirectionResult[];
        walk: DirectionResult[];
        snapMeta?: SnapMeta;
      }>(directionKeys.segmentCar(origin.id, dest.id, departureTime));

      if (publicData || carData) {
        cache[cacheKey] = {
          public: publicData?.public || [],
          car: carData?.car || [],
          walk: carData?.walk || [],
        };
      }
    }
    return cache;
  }, [places, queryClient, departureTime]);
}
