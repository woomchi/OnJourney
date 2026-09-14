import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse, errorResponse } from '@/lib/apiResponse';
import { directionsQuerySchema, DirectionsQueryType } from '@/lib/validations/directions';
import { fetchIntercityTransitRoute, OdsayQuotaGuard } from '@/lib/services/serverDirectionsService';

/**
 * 온디맨드(On-Demand) 장거리/시외 멀티모달 대중교통 길찾기 API 엔드포인트
 * 
 * - 카카오 대중교통 경로가 없는 장거리 구간에서 사용자가 명시적으로 요청 시 호출됩니다.
 * - 2주(14일) 영속 캐시 및 일일 25회 하드캡 보호를 적용합니다.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams: DirectionsQueryType = directionsQuerySchema.parse(rawParams);

  try {
    const data = await fetchIntercityTransitRoute({
      sx: validatedParams.sx,
      sy: validatedParams.sy,
      ex: validatedParams.ex,
      ey: validatedParams.ey,
      sName: validatedParams.sName,
      eName: validatedParams.eName,
      departureTime: validatedParams.departureTime,
    });

    const quotaStatus = OdsayQuotaGuard.getStatus();

    return successResponse({
      public: data,
      isIntercity: true,
      quota: {
        remaining: quotaStatus.remaining,
        used: quotaStatus.used,
      },
    });
  } catch (error: any) {
    if (error?.code === 'ODSAY_QUOTA_EXHAUSTED') {
      return errorResponse(
        '금일 무료 시외 대중교통 조회 한도(25회)가 마감되었습니다. 코레일톡 또는 시외/고속버스 예매 사이트를 이용해주세요.',
        'ODSAY_QUOTA_EXHAUSTED',
        429
      );
    }
    throw error;
  }
});
