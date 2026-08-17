import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { subwayPositionsQuerySchema } from '@/lib/validations/subway';
import {
  fetchSubwayPositionsByLine,
  resolveSubwayNameForPositionApi,
} from '@/lib/services/subwayPositionService';
import { getLineStationListWithBranches } from '@/lib/services/subwayService';
import { SubwayLinePositionsData } from '@/types/journey';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = subwayPositionsQuerySchema.parse(rawParams);
  const subwayTarget = validatedParams.subwayNm || validatedParams.subwayId || '1002';
  const subwayNm = resolveSubwayNameForPositionApi(subwayTarget);

  // 1. 실시간 열차 위치 목록 조회 (15초 인메모리 캐시)
  const positions = await fetchSubwayPositionsByLine(subwayTarget);

  // 2. 해당 노선의 운행 계통 목록 및 선택된 계통의 정차역 목록 조회
  const { branches, selectedBranchId, stations } = getLineStationListWithBranches(
    subwayTarget,
    validatedParams.branchId,
    validatedParams.stationName
  );

  const responseData: SubwayLinePositionsData = {
    subwayId: validatedParams.subwayId || '',
    subwayNm,
    branches,
    selectedBranchId,
    stations,
    positions,
    timestamp: Date.now(),
  };

  return successResponse(responseData, 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  });
});
