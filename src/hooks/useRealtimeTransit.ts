import { useQuery } from '@tanstack/react-query';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';

export interface UseRealtimeTransitOptions {
  region: string;
  stationId: string;
  stationName?: string;
  cityCode?: string;
  destination?: string;
  headsign?: string;
  lat?: number;
  lng?: number;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useRealtimeTransit({
  region,
  stationId,
  stationName,
  cityCode,
  destination,
  headsign,
  lat,
  lng,
  enabled = true,
  refetchInterval = false,
}: UseRealtimeTransitOptions) {
  const query = useQuery({
    queryKey: ['realtimeBus', region, stationId, stationName, cityCode, destination, headsign, lat, lng],
    queryFn: async (): Promise<NormalizedRealtimeData> => {
      const params = new URLSearchParams();
      if (stationName) params.append('stationName', stationName);
      if (cityCode) params.append('cityCode', cityCode);
      if (destination) params.append('destination', destination);
      if (headsign) params.append('headsign', headsign);
      if (lat) params.append('lat', String(lat));
      if (lng) params.append('lng', String(lng));

      const url = `/api/realtime/bus/${encodeURIComponent(region)}/${encodeURIComponent(stationId)}?${params.toString()}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error(`실시간 버스 데이터 조회 실패 (HTTP ${res.status})`);
        }

        const json = await res.json().catch(() => null);
        if (!json || !json.success || !json.data) {
          throw new Error(json?.error || '실시간 버스 데이터를 불러올 수 없습니다.');
        }

        return json.data as NormalizedRealtimeData;
      } catch (err) {
        console.warn('[useRealtimeTransit] 버스 실시간 데이터 로드 실패:', err);
        throw err;
      }
    },
    enabled: Boolean(enabled && stationId),
    refetchInterval,
    refetchIntervalInBackground: false, // 탭 비활성화 시 자동 갱신 일시정지
    staleTime: 5000, // 5초 이내 중복 호출 방지 및 신선한 실시간성 유지
    placeholderData: (previousData) => previousData,
    retry: 1, // 1회만 재시도
    retryDelay: 500, // 0.5초 간격
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
    lastUpdated: query.data?.lastUpdated,
  };
}
