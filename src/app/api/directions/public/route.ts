import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { directionsQuerySchema } from '@/lib/validations/directions';
import { fetchPublicDirections } from '@/lib/services/serverDirectionsService';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  // console.log(`[API /public][DEBUG] 수신 rawParams:`, rawParams);

  // Zod 검증
  let validatedParams: any;
  try {
    validatedParams = directionsQuerySchema.parse(rawParams);
    // console.log(`[API /public][DEBUG] Zod 검증 성공:`, validatedParams);
  } catch (zodErr: any) {
    // console.error(`[API /public][DEBUG] Zod 검증 실패:`, zodErr?.errors ?? zodErr?.message);
    throw zodErr;
  }

  let data: any[];
  try {
    data = await fetchPublicDirections(validatedParams);
  } catch (svcErr: any) {
    // console.error(`[API /public][DEBUG] fetchPublicDirections 실패:`, svcErr?.name, svcErr?.message);
    throw svcErr;
  }

  // console.log(`[API /public][DEBUG] 응답 경로 수: ${data.length}`);
  return successResponse({ public: data });
  return successResponse({ public: data });
});
