import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { directionsQuerySchema } from '@/lib/validations/directions';
import { fetchCarWalkDirections } from '@/lib/services/serverDirectionsService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // Zod 검증
  const validatedParams = directionsQuerySchema.parse(rawParams);

  const data = await fetchCarWalkDirections(validatedParams);

  return successResponse(data);
});
