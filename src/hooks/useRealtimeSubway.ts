import { useQuery } from '@tanstack/react-query';

export interface SubwayArrivalItem {
  subwayId?: string;
  updnLine?: string;
  trainNo?: string | number;
  statnNm?: string;
  arvlMsg2?: string;
  statusText?: string;
  minutesLeft?: number;
  arrivalTime?: string;
  isApproaching?: boolean;
  isRealtime?: boolean;
}

export interface UseRealtimeSubwayOptions {
  stationName?: string;
  wayCode?: string;
  subwayId?: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useRealtimeSubway({
  stationName,
  wayCode,
  subwayId,
  enabled = true,
  refetchInterval = false,
}: UseRealtimeSubwayOptions) {
  const cleanStationName = stationName ? stationName.replace(/역$/g, '').trim() : '';

  const query = useQuery({
    queryKey: ['realtimeSubway', cleanStationName, wayCode, subwayId],
    queryFn: async (): Promise<SubwayArrivalItem[]> => {
      if (!cleanStationName) return [];

      const params = new URLSearchParams();
      params.append('station', cleanStationName);
      if (wayCode) params.append('wayCode', wayCode);
      if (subwayId) params.append('subwayId', subwayId);

      const url = `/api/subway/realtime?${params.toString()}`;


      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`실시간 지하철 데이터 조회 실패 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        return [];
      }

      return (Array.isArray(json.data) ? json.data : [json.data]) as SubwayArrivalItem[];
    },
    enabled: Boolean(enabled && cleanStationName),
    refetchInterval,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 2,
    retryDelay: 1000,
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
