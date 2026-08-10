import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { transitScheduleQuerySchema } from '@/lib/validations/transitSchedule';
import { fetchIntercityTransitSchedule } from '@/lib/services/intercityTransitScheduleService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // Zod 검증
  const validatedParams = transitScheduleQuerySchema.parse(rawParams);

  const data = await fetchIntercityTransitSchedule(validatedParams);

  return successResponse(data);
});
