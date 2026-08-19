import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, errorResponse } from '@/lib/apiResponse';
import { busPositionsQuerySchema } from '@/lib/validations/bus';
import { BusPositionService } from '@/lib/services/busPositionService';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = busPositionsQuerySchema.parse(rawParams);

  const data = await BusPositionService.getBusLinePositions({
    busNo: validatedParams.busNo,
    busId: validatedParams.busId,
    odsayBusId: validatedParams.odsayBusId,
    tagoRouteId: validatedParams.tagoRouteId,
    routeId: validatedParams.routeId,
    cityCode: validatedParams.cityCode,
    region: validatedParams.region,
    stationId: validatedParams.stationId,
    stationName: validatedParams.stationName,
  });

  if (!data) {
    return errorResponse('해당 버스 노선 정보를 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }

  return successResponse(data, 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  });
});
