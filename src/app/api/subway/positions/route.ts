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
import {
  fetchBusanStationUpcomingTimetable,
  isBusanSubwayStation,
} from '@/lib/services/busanSubwayService';
import { getSeoulTimetableList } from '@/lib/services/subway/seoulTimetableService';
import { detectSubwayRegion } from '@/lib/services/subwayRegionRouter';
import { SubwayLinePositionsData } from '@/types/journey';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const validatedParams = subwayPositionsQuerySchema.parse(rawParams);
  const inputSubway = validatedParams.subwayNm || validatedParams.subwayId || '';
  const stationName = validatedParams.stationName || '';
  const destination = typeof rawParams.destination === 'string' ? rawParams.destination : undefined;
  const headsign = typeof rawParams.headsign === 'string' ? rawParams.headsign : undefined;

  // 정밀 지역 감지 (동명역 혼선 방지)
  const detectedRegion = detectSubwayRegion({
    station: stationName,
    subwayId: inputSubway,
    destination,
    headsign,
  });

  // 지역에 맞는 노선 식별자 보정 (부산/대전에서 서울 2호선 Fallback 방지)
  let subwayTarget = inputSubway;
  if (detectedRegion === 'busan') {
    if (inputSubway.includes('동해')) {
      subwayTarget = '동해선';
    } else {
      const numMatch = inputSubway.match(/\d/);
      subwayTarget = numMatch ? `부산${numMatch[0]}호선` : '부산1호선';
    }
  } else if (detectedRegion === 'daejeon') {
    subwayTarget = '대전1호선';
  } else if (!subwayTarget) {
    subwayTarget = '1002'; // 수도권 기본값
  }

  const subwayNm = resolveSubwayNameForPositionApi(subwayTarget);

  // 1. 실시간 열차 위치 목록 조회 (15초 인메모리 캐시, 수도권 전용)
  const positions = await fetchSubwayPositionsByLine(subwayTarget);

  // 2. 해당 노선의 운행 계통 목록 및 선택된 계통의 정차역 목록 조회 (부산/대전/동해선 포함)
  const { branches, selectedBranchId, stations } = getLineStationListWithBranches(
    subwayTarget,
    validatedParams.branchId,
    validatedParams.stationName
  );

  // 3. 시간표 리스트 조회 (감지된 지역 기준 전용 서비스 호출)
  let timetable = undefined;
  if (detectedRegion === 'daejeon') {
    const targetStation = stationName || '대전역';
    try {
      timetable = await fetchDaejeonStationUpcomingTimetable(targetStation);
    } catch (e) {
      console.warn('[api/subway/positions] 대전 시간표 조회 실패:', e);
    }
  } else if (detectedRegion === 'busan') {
    const defaultStn = subwayTarget.includes('동해') ? '부전' : '부산역';
    const targetStation = stationName || defaultStn;
    try {
      timetable = await fetchBusanStationUpcomingTimetable(targetStation, subwayTarget, 120);
    } catch (e) {
      console.warn('[api/subway/positions] 부산 시간표 조회 실패:', e);
    }
  } else if (stationName) {
    try {
      const wayCode = typeof rawParams.wayCode === 'string' ? rawParams.wayCode : '1';
      const seoulTimetable = getSeoulTimetableList(
        stationName,
        wayCode,
        subwayTarget
      );
      if (seoulTimetable && seoulTimetable.length > 0) {
        timetable = seoulTimetable;
      }
    } catch (e) {
      console.warn('[api/subway/positions] 서울 시간표 조회 실패:', e);
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
