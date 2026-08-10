import { useQuery } from '@tanstack/react-query';

export interface TransitScheduleQueryParams {
  type: 'train' | 'bus';
  startStationID: string | number;
  endStationID: string | number;
  startStationName?: string;
  endStationName?: string;
  sx?: string | number;
  sy?: string | number;
  ex?: string | number;
  ey?: string | number;
  enabled?: boolean;
}

export function useTransitSchedule({
  type,
  startStationID,
  endStationID,
  startStationName,
  endStationName,
  sx,
  sy,
  ex,
  ey,
  enabled = true,
}: TransitScheduleQueryParams) {
  const startIdStr = String(startStationID || '');
  const endIdStr = String(endStationID || '');
  const sxStr = sx ? String(sx) : '';
  const syStr = sy ? String(sy) : '';
  const exStr = ex ? String(ex) : '';
  const eyStr = ey ? String(ey) : '';
  const isValid = Boolean(type && startIdStr && endIdStr);

  return useQuery({
    queryKey: ['transit-schedule', type, startIdStr, endIdStr, startStationName, endStationName, sxStr, syStr, exStr, eyStr],
    queryFn: async () => {
      const params = new URLSearchParams({
        type,
        startStationID: startIdStr,
        endStationID: endIdStr,
      });

      if (startStationName) params.set('startStationName', startStationName);
      if (endStationName) params.set('endStationName', endStationName);
      if (sxStr) params.set('sx', sxStr);
      if (syStr) params.set('sy', syStr);
      if (exStr) params.set('ex', exStr);
      if (eyStr) params.set('ey', eyStr);

      const response = await fetch(`/api/transit/schedule?${params.toString()}`);
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error?.message || json.message || '시간표 정보를 불러오지 못했습니다.');
      }

      return json.data;
    },
    enabled: isValid && enabled,
    staleTime: 1000 * 60 * 60, // 1시간 캐싱
    gcTime: 1000 * 60 * 60 * 24, // 24시간
    retry: 1,
  });
}
