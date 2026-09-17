import type { DirectionResult } from '@/types/journey';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import { IntercityRouteCache } from '@/lib/infrastructure/intercityRouteCache';
import { OdsayQuotaGuard } from '@/lib/infrastructure/odsayQuotaGuard';
import {
  generateIntercityCacheKey,
  isIslandIntercity,
  isIntercityEligible,
} from './intercityClassifier';
import { parseOdsayIntercityResponse } from './odsayTransitParser';
import { toKstSearchTime } from '../common/timeUtils';

export interface IntercityTransitParams {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  sName?: string;
  eName?: string;
  departureTime?: number;
}

/**
 * ODsay 장거리 멀티모달 대중교통 길찾기 메인 서비스
 * 
 * - 2주(14일) 영속 캐시를 최우선으로 검사하여 쿼터 소모 0회 달성
 * - 일일 25회 하드캡(OdsayQuotaGuard) 초과 시 안전하게 차단(429)
 * - 제주/도서 지역: maasRP (멀티모달), 육상 시외: searchPubTransPathT (SearchType: 0)
 */
export async function fetchIntercityTransitRoute(
  params: IntercityTransitParams
): Promise<DirectionResult[]> {
  const { sx, sy, ex, ey, departureTime } = params;

  // 1. 유효성 검사 (장거리/도서 지역 부합 여부)
  const eligibility = isIntercityEligible({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  if (!eligibility.isEligible) {
    console.info(`[odsayTransitService] 60km 미만 시내/단거리 구간으로 시외 검색 스킵 (거리: ${eligibility.distanceKm.toFixed(1)}km)`);
    return [];
  }

  // 2. 2주 영속 캐시 확인 (소수점 2자리 클러스터링 키)
  const cacheKey = generateIntercityCacheKey(sx, sy, ex, ey);
  const cachedData = IntercityRouteCache.get(cacheKey);

  if (cachedData && cachedData.length > 0) {
    console.info(`[odsayTransitService] 2주 영속 캐시 적중! (0 쿼터) 키: ${cacheKey}`);
    return cachedData;
  }

  // 3. 일일 쿼터 가드 확인 (최대 25회)
  if (!OdsayQuotaGuard.canCall()) {
    const status = OdsayQuotaGuard.getStatus();
    console.warn(`[odsayTransitService] 금일 ODsay 일일 쿼터(${status.used}/${status.hardCap}) 소진됨`);
    throw new AppError(
      '금일 무료 시외 대중교통 조회 한도(25회)가 마감되었습니다. 코레일톡 또는 시외/고속버스 예매 사이트를 이용해주세요.',
      'ODSAY_QUOTA_EXHAUSTED',
      429,
      false
    );
  }

  // 4. ODsay API 호출
  const isIsland = isIslandIntercity({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  let rawData: unknown;

  try {
    if (isIsland) {
      // 제주도/도서 지역: 항공 및 해운 포함 maasRP 호출
      const searchTimeStr = toKstSearchTime(departureTime);
      console.info(`[odsayTransitService] 도서/제주도 멀티모달 maasRP 호출: (${sx},${sy}) -> (${ex},${ey})`);
      rawData = await OdsayAdapter.fetchMaasRP(
        String(sx),
        String(sy),
        String(ex),
        String(ey),
        searchTimeStr,
        '2' // 대중교통 전체
      );
    } else {
      // 육상 도시간 이동: searchPubTransPathT (SearchType: 0 전체 기차/고속버스/시내교통)
      console.info(`[odsayTransitService] 육상 시외/장거리 searchPubTransPathT 호출: (${sx},${sy}) -> (${ex},${ey})`);
      rawData = await OdsayAdapter.fetchPublicTransit(
        String(sx),
        String(sy),
        String(ex),
        String(ey),
        undefined,
        '0' // 도시내 + 도시외 전체
      );
    }

    // 실제 외부 호출 성공 시 쿼터 카운트 1 증가
    OdsayQuotaGuard.recordCall();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[odsayTransitService] ODsay API 호출 실패:', message);
    throw error;
  }


  // 5. 응답 파싱
  const results = parseOdsayIntercityResponse(rawData, sx, sy, ex, ey);

  // 6. 결과가 정상적으로 파싱되었을 경우 2주 영속 캐시에 저장
  if (results && results.length > 0) {
    IntercityRouteCache.set(cacheKey, results);
  }

  return results;
}
