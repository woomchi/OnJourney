import { z } from 'zod';

export const transitScheduleQuerySchema = z.object({
  type: z.enum(['train', 'bus']),
  startStationID: z.string().min(1, '출발역/터미널 ID는 필수입니다.'),
  endStationID: z.string().min(1, '도착역/터미널 ID는 필수입니다.'),
  startStationName: z.string().optional(),
  endStationName: z.string().optional(),
  sx: z.string().optional(),
  sy: z.string().optional(),
  ex: z.string().optional(),
  ey: z.string().optional(),
});

export type TransitScheduleQueryType = z.infer<typeof transitScheduleQuerySchema>;
