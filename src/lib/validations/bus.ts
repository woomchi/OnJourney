import { z } from 'zod';

export const busRealtimeQuerySchema = z.object({
  station: z.string().min(1, '정류소명(station) 파라미터가 필요합니다.'),
  busNo: z.string().min(1, '버스번호(busNo) 파라미터가 필요합니다.'),
});

export type BusRealtimeQueryType = z.infer<typeof busRealtimeQuerySchema>;
