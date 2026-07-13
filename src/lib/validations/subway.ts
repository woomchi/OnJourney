import { z } from 'zod';

export const subwayRealtimeQuerySchema = z.object({
  station: z.string().min(1, '조회할 역이름(station) 파라미터가 필요합니다.'),
  wayCode: z.string().optional(),
});

export type SubwayRealtimeQueryType = z.infer<typeof subwayRealtimeQuerySchema>;
