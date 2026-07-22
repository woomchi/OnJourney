import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJourneys, insertJourney, updateJourney, deleteJourneys } from '@/lib/journeys';
import type { CreateJourneyInput, TransportType } from '@/types/journey';

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
    }: {
      id: string;
      title: string;
      journeyDate: string;
      transportType: TransportType;
    }) => updateJourney(id, { title, journey_date: journeyDate, transport_type: transportType }),
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
