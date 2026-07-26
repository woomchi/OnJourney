import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { directionsQuerySchema } from '@/lib/validations/directions';
import { fetchTmapDetailRoute } from '@/lib/services/serverDirectionsService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // Zod validation
  const validatedParams = directionsQuerySchema.parse(rawParams);

  const { sx, sy, ex, ey } = validatedParams;
  const data = await fetchTmapDetailRoute(sx, sy, ex, ey);

  return successResponse(data);
});
