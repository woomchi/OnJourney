import { NextRequest } from 'next/server';
import { withErrorHandler, successResponse } from '@/lib/apiResponse';
import { subwayPositionsQuerySchema } from '@/lib/validations/subway';
import {
  fetchSubwayPositionsByLine,
  resolveSubwayNameForPositionApi,
} from '@/lib/services/subwayPositionService';
import { getLineStationListWithBranches } from '@/lib/services/subwayService';
import {
  fetchDaejeonStationUpcomingTimetable,
  isDaejeonSubwayStation,
} from '@/lib/services/daejeonSubwayService';
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

  // 3. 대전 1호선인 경우 현재 시각 기준 이후 열차 시간표 리스트 조회
  let timetable = undefined;
  const isDaejeon =
    subwayNm.includes('대전') ||
    (validatedParams.stationName && isDaejeonSubwayStation(validatedParams.stationName));

  if (isDaejeon) {
    const targetStation = validatedParams.stationName || '대전역';
    try {
      timetable = await fetchDaejeonStationUpcomingTimetable(targetStation);
    } catch (e) {
      console.warn('[api/subway/positions] 대전 시간표 조회 실패:', e);
    }
  }

  const responseData: SubwayLinePositionsData = {
    subwayId: validatedParams.subwayId || '',
    subwayNm,
    branches,
    selectedBranchId,
    stations,
    positions,
    timetable,
    timestamp: Date.now(),
  };

  return successResponse(responseData, 200, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  });
});
