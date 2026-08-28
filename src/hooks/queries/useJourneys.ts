import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchJourneys,
  fetchJourneyById,
  fetchPublicJourneyById,
  insertJourney,
  updateJourney,
  toggleJourneyPublic,
  deleteJourneys,
} from '@/lib/journeys/index';
import type { CreateJourneyInput, TransportType, Journey } from '@/types/journey';

export const journeyKeys = {
  all: ['journeys'] as const,
  lists: () => [...journeyKeys.all, 'list'] as const,
  detail: (id: string) => [...journeyKeys.all, 'detail', id] as const,
};

export function useJourneys(userId: string | undefined) {
  return useQuery({
    queryKey: [...journeyKeys.lists(), userId ?? ''],
    queryFn: fetchJourneys,
    enabled: !!userId,
  });
}

export function useJourney(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.detail(id ?? ''),
    queryFn: () => (id ? fetchJourneyById(id) : null),
    enabled: !!id && enabled,
  });
}

export function usePublicJourney(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: [...journeyKeys.detail(id ?? ''), 'public'],
    queryFn: () => (id ? fetchPublicJourneyById(id) : null),
    enabled: !!id && enabled,
  });
}

export function useCreateJourney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJourneyInput) => insertJourney(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: journeyKeys.lists() });
    },
  });
}

export function useUpdateJourneyInfo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      title,
      journeyDate,
      transportType,
      isPublic,
    }: {
      id: string;
      title?: string;
      journeyDate?: string;
      transportType?: TransportType;
      isPublic?: boolean;
    }) => updateJourney(id, {
      ...(title !== undefined ? { title } : {}),
      ...(journeyDate !== undefined ? { journey_date: journeyDate } : {}),
      ...(transportType !== undefined ? { transport_type: transportType } : {}),
      ...(isPublic !== undefined ? { is_public: isPublic } : {}),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: journeyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: journeyKeys.detail(data.id) });
    },
  });
}

export function useToggleJourneyPublic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      toggleJourneyPublic(id, isPublic),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: journeyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: journeyKeys.detail(data.id) });
    },
  });
}

export function useDeleteJourneys() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteJourneys(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: journeyKeys.lists() });
    },
  });
}
