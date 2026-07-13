import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { directionsWaypointsQuerySchema } from '@/lib/validations/directions';
import { fetchDirectionsWaypoints } from '@/lib/services/directionsWaypointsService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = directionsWaypointsQuerySchema.parse(rawParams);

  const data = await fetchDirectionsWaypoints(validatedParams);

  return successResponse(data);
});
