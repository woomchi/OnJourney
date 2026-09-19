import { useQuery } from '@tanstack/react-query';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';

export interface UseRealtimeTransitOptions {
  region: string;
  stationId: string;
  stationName?: string;
  busNo?: string;
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
  busNo,
  cityCode,
  destination,
  headsign,
  lat,
  lng,
  enabled = true,
  refetchInterval = false,
}: UseRealtimeTransitOptions) {
  // 특수 ID('auto', 'none', '_' 또는 숫자가 없는 ID)인 경우에만 좌표 기반 역조회가 필요하므로 queryKey에 좌표 포함
  // 미세한 GPS 오차(소수점 5~6자리)로 인한 캐시 파편화 방지를 위해 약 11m 해상도(소수점 4자리)로 정규화
  const isSpecialId = !stationId || stationId === 'auto' || stationId === 'none' || stationId === '_' || !/[0-9]/.test(stationId);
  const normalizedLat = isSpecialId && lat !== undefined ? Number(lat.toFixed(4)) : undefined;
  const normalizedLng = isSpecialId && lng !== undefined ? Number(lng.toFixed(4)) : undefined;

  const query = useQuery({
    queryKey: ['realtimeBus', region, stationId, stationName, busNo, cityCode, destination, headsign, normalizedLat, normalizedLng],
    queryFn: async (): Promise<NormalizedRealtimeData> => {
      const params = new URLSearchParams();
      if (stationName) params.append('stationName', stationName);
      if (busNo) params.append('busNo', busNo);
      if (cityCode) params.append('cityCode', cityCode);
      if (destination) params.append('destination', destination);
      if (headsign) params.append('headsign', headsign);
      if (lat) params.append('lat', String(lat));
      if (lng) params.append('lng', String(lng));

      const url = `/api/realtime/bus/${encodeURIComponent(region)}/${encodeURIComponent(stationId)}?${params.toString()}`;

      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
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
    staleTime: 0, // 실시간 도착 정보의 즉각적인 갱신 반영 보장
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
