import { useQuery } from '@tanstack/react-query';
import { SubwayLinePositionsData } from '@/types/journey';

export interface UseSubwayLinePositionsOptions {
  subwayId?: string;
  subwayNm?: string;
  branchId?: string;
  stationName?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useSubwayLinePositions({
  subwayId,
  subwayNm,
  branchId,
  stationName,
  enabled = true,
  refetchInterval = 60000,
}: UseSubwayLinePositionsOptions) {
  const target = subwayNm || subwayId || '';

  const query = useQuery<SubwayLinePositionsData | null>({
    queryKey: ['subwayLinePositions', target, branchId || '', stationName || ''],
    queryFn: async (): Promise<SubwayLinePositionsData | null> => {
      if (!target) return null;

      const params = new URLSearchParams();
      if (subwayId) params.append('subwayId', subwayId);
      if (subwayNm) params.append('subwayNm', subwayNm);
      if (branchId) params.append('branchId', branchId);
      if (stationName) params.append('stationName', stationName);

      const res = await fetch(`/api/subway/positions?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      if (!res.ok) {
        throw new Error(`지하철 노선도 및 열차 위치 조회 실패 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        return null;
      }

      return json.data as SubwayLinePositionsData;
    },
    enabled: Boolean(enabled && target),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 10000,
    retry: 2,
    retryDelay: 1000,
  });

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
