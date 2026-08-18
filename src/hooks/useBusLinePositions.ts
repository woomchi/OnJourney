import { useQuery } from '@tanstack/react-query';
import { BusLinePositionsData } from '@/types/journey';

export interface UseBusLinePositionsOptions {
  busNo?: string;
  busId?: string;
  routeId?: string;
  cityCode?: string;
  region?: string;
  stationId?: string;
  stationName?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useBusLinePositions({
  busNo,
  busId,
  routeId,
  cityCode,
  region,
  stationId,
  stationName,
  enabled = true,
  refetchInterval = 30000,
}: UseBusLinePositionsOptions) {
  const query = useQuery<BusLinePositionsData | null>({
    queryKey: [
      'busLinePositions',
      busNo || '',
      busId || '',
      routeId || '',
      cityCode || '',
      region || '',
      stationId || '',
      stationName || '',
    ],
    queryFn: async (): Promise<BusLinePositionsData | null> => {
      if (!busNo) return null;

      const params = new URLSearchParams();
      params.append('busNo', busNo);
      if (busId) params.append('busId', busId);
      if (routeId) params.append('routeId', routeId);
      if (cityCode) params.append('cityCode', cityCode);
      if (region) params.append('region', region);
      if (stationId) params.append('stationId', stationId);
      if (stationName) params.append('stationName', stationName);

      const res = await fetch(`/api/bus/positions?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      if (!res.ok) {
        throw new Error(`버스 노선도 및 실시간 위치 조회 실패 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        return null;
      }

      return json.data as BusLinePositionsData;
    },
    enabled: Boolean(enabled && busNo),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
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
