import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { subwayRealtimeQuerySchema } from '@/lib/validations/subway';
import { fetchSubwayRealtime } from '@/lib/services/subwayRealtimeService';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = subwayRealtimeQuerySchema.parse(rawParams);

  const data = await fetchSubwayRealtime(validatedParams);

  return successResponse(data);
});
