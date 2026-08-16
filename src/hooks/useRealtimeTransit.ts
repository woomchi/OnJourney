import { useQuery } from '@tanstack/react-query';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';

export interface UseRealtimeTransitOptions {
  region: string;
  stationId: string;
  stationName?: string;
  cityCode?: string;
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
  lat,
  lng,
  enabled = true,
  refetchInterval = false,
}: UseRealtimeTransitOptions) {
  const query = useQuery({
    queryKey: ['realtimeBus', region, stationId, stationName, cityCode, lat, lng],
    queryFn: async (): Promise<NormalizedRealtimeData> => {
      const params = new URLSearchParams();
      if (stationName) params.append('stationName', stationName);
      if (cityCode) params.append('cityCode', cityCode);
      if (lat) params.append('lat', String(lat));
      if (lng) params.append('lng', String(lng));

      const url = `/api/realtime/bus/${encodeURIComponent(region)}/${encodeURIComponent(stationId)}?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`실시간 데이터 조회 실패 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || '데이터 형식이 올바르지 않습니다.');
      }

      return json.data as NormalizedRealtimeData;
    },
    enabled: Boolean(enabled && stationId),
    refetchInterval,
    refetchIntervalInBackground: false, // 탭 비활성화 시 자동 갱신 일시정지
    staleTime: 10000, // 10초 이내 중복 호출 방지 및 캐시 활용
    retry: 2, // 2회까지 자동 재시도
    retryDelay: 1000, // 1초 간격 백오프
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
