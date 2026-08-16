import { z } from 'zod';

export const subwayRealtimeQuerySchema = z.object({
  station: z.string().min(1, '조회할 역이름(station) 파라미터가 필요합니다.'),
  wayCode: z.string().optional(),
  subwayId: z.string().optional(),
  destination: z.string().optional(),
  headsign: z.string().optional(),
});

export type SubwayRealtimeQueryType = z.infer<typeof subwayRealtimeQuerySchema>;


export const subwayTotalQuerySchema = z.object({
  startIndex: z.string().optional().default('0'),
  endIndex: z.string().optional().default('100'),
  station: z.string().optional(),
});

export type SubwayTotalQueryType = z.infer<typeof subwayTotalQuerySchema>;

