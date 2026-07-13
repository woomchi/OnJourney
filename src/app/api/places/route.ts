import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { placesQuerySchema } from '@/lib/validations/places';
import { fetchPlaces } from '@/lib/services/placesService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // Validate request using Zod
  const validatedParams = placesQuerySchema.parse(rawParams);

  if (!validatedParams.query || validatedParams.query.trim().length < 1) {
    return successResponse({ items: [] });
  }

  const items = await fetchPlaces(validatedParams);

  return successResponse({ items });
});
