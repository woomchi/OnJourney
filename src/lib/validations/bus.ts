import { z } from 'zod';

export const busRealtimeQuerySchema = z.object({
  station: z.string().min(1, '정류소명(station) 파라미터가 필요합니다.'),
  busNo: z.string().min(1, '버스번호(busNo) 파라미터가 필요합니다.'),
});

export type BusRealtimeQueryType = z.infer<typeof busRealtimeQuerySchema>;

export const busPositionsQuerySchema = z.object({
  busNo: z.string().min(1, '버스 노선 번호(busNo) 파라미터가 필요합니다.'),
  busId: z.string().optional(),
  odsayBusId: z.string().optional(),
  tagoRouteId: z.string().optional(),
  routeId: z.string().optional(),
  cityCode: z.string().optional(),
  region: z.string().optional(),
  stationId: z.string().optional(),
  stationName: z.string().optional(),
});

export type BusPositionsQueryType = z.infer<typeof busPositionsQuerySchema>;

