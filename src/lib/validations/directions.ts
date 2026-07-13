import { z } from 'zod';

export const directionsWaypointsQuerySchema = z.object({
  start: z.string().min(1, '출발지(start) 좌표가 필요합니다. (형식: "lng,lat")'),
  goal: z.string().min(1, '목적지(goal) 좌표가 필요합니다. (형식: "lng,lat")'),
  waypoints: z.string().optional(),
  option: z.string().default('traoptimal'),
});

export type DirectionsWaypointsQueryType = z.infer<typeof directionsWaypointsQuerySchema>;

export const directionsQuerySchema = z.object({
  sx: z.coerce.number({ message: "출발지 경도는 숫자여야 합니다." }),
  sy: z.coerce.number({ message: "출발지 위도는 숫자여야 합니다." }),
  ex: z.coerce.number({ message: "도착지 경도는 숫자여야 합니다." }),
  ey: z.coerce.number({ message: "도착지 위도는 숫자여야 합니다." }),
});

export type DirectionsQueryType = z.infer<typeof directionsQuerySchema>;
