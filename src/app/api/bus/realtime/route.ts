import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { busRealtimeQuerySchema } from '@/lib/validations/bus';
import { fetchBusRealtime } from '@/lib/services/busRealtimeService';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // Zod 검증
  const validatedParams = busRealtimeQuerySchema.parse(rawParams);

  const data = await fetchBusRealtime(validatedParams);

  return successResponse(data);
});
