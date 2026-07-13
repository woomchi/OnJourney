import { z } from 'zod';

export const placesQuerySchema = z.object({
  query: z.string().min(1, '검색어를 입력해주세요.'),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  minLat: z.coerce.number().optional(),
  maxLat: z.coerce.number().optional(),
  minLng: z.coerce.number().optional(),
  maxLng: z.coerce.number().optional(),
  sort: z.string().optional(),
});

export type PlacesQueryType = z.infer<typeof placesQuerySchema>;
