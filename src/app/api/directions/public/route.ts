import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { directionsQuerySchema, DirectionsQueryType } from '@/lib/validations/directions';
import { fetchPublicDirections, isIntercityEligible } from '@/lib/services/serverDirectionsService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams: DirectionsQueryType = directionsQuerySchema.parse(rawParams);
  const data = await fetchPublicDirections(validatedParams);

  // 카카오 결과가 없을 때, 장거리/시외(60km+ 또는 제주도) 조회 가능 여부 판정
  let intercityAvailable = false;
  if (!data || data.length === 0) {
    const eligibility = isIntercityEligible(
      { lat: validatedParams.sy, lng: validatedParams.sx },
      { lat: validatedParams.ey, lng: validatedParams.ex }
    );
    intercityAvailable = eligibility.isEligible;
  }

  return successResponse({ public: data, intercityAvailable });
});


