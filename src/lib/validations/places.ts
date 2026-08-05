import { z } from 'zod';

export const placesQuerySchema = z.object({
  query: z.string().min(1, '검색어를 입력해주세요.'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  sort: z.string().optional(),
  transport_type: z.enum(['public', 'car', 'walk']).optional(),
});

export type PlacesQueryType = z.infer<typeof placesQuerySchema>;
