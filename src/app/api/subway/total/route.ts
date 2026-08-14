import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { subwayTotalQuerySchema } from '@/lib/validations/subway';
import { fetchSubwayTotalArrivals } from '@/lib/services/subwayTotalRealtimeService';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = subwayTotalQuerySchema.parse(rawParams);

  const data = await fetchSubwayTotalArrivals(validatedParams);

  return successResponse(data);
});
