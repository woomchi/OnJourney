import type { DirectionResult } from '@/types/journey';
import type { KakaoPublicTrafficResponse } from '@/types/kakaoTransit';
import { unstable_cache } from 'next/cache';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { parseKakaoTransitResponse } from './kakaoTransitParser';
import { AppError, TransitRouteNotFoundError } from '@/lib/infrastructure/odsayAdapter';

type KakaoTransitCacheResult =
  | { ok: true; data: KakaoPublicTrafficResponse }
  | { ok: false; error: string; code: string };

/**
 * 카카오 대중교통 경로 검색 캐시 래퍼 (Next.js unstable_cache, 1시간 TTL)
 * - 동일 좌표 구간(소수점 4자리, 약 11m 해상도) 중복 호출 방지로 일일 1,000회 쿼터 극대화
 */
function getCachedKakaoTransit(
  sx: string,
  sy: string,
  ex: string,
  ey: string,
  sName?: string,
  eName?: string
) {
  return unstable_cache(
    async (): Promise<KakaoTransitCacheResult> => {
      try {
        const data = await KakaoTransitAdapter.fetchPublicTraffic({
          startX: sx,
          startY: sy,
          endX: ex,
          endY: ey,
          sName,
          eName,
        });
        return { ok: true, data };
      } catch (err: any) {
        const message = err?.message || '카카오 대중교통 경로 검색 실패';
        const code = err?.code || 'KAKAO_TRANSIT_ERROR';
        return { ok: false, error: message, code };
      }
    },
    ['kakao-transit-v1', sx, sy, ex, ey],
    { revalidate: 3600 } // 1시간 (3600초) 캐싱
  )();
}

/**
 * 카카오 대중교통 경로 검색 메인 서비스 함수
 * 
 * @param sx 출발지 경도
 * @param sy 출발지 위도
 * @param ex 도착지 경도
 * @param ey 도착지 위도
 * @param sName 출발지 명칭 (선택)
 * @param eName 도착지 명칭 (선택)
 * @returns DirectionResult[] (표준 대중교통 경로 목록)
 */
export async function fetchKakaoTransitOptions(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  sName?: string,
  eName?: string
): Promise<DirectionResult[]> {
  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);

  const res = await getCachedKakaoTransit(rsx, rsy, rex, rey, sName, eName);

  if (!res.ok) {
    const isNotFound =
      res.code === 'TRANSIT_ROUTE_NOT_FOUND' ||
      res.error.includes('정류장을 찾을 수 없습니다') ||
      res.error.includes('결과 데이터');

    if (isNotFound) {
      console.warn(`[kakaoTransitService] 해당 좌표 구간에 검색된 대중교통 정류장 또는 경로가 없습니다: (${rsx},${rsy}) -> (${rex},${rey})`);
      return [];
    }

    throw new AppError(`[카카오 대중교통 오류] ${res.error}`, res.code, 500, false);
  }

  const data = res.data;

  // status가 NO_RESULTS이거나 경로가 없는 경우 빈 배열 안전 반환
  if (data.status === 'NO_RESULTS' || !data.routes || data.routes.length === 0) {
    console.info(`[kakaoTransitService] 대중교통 경로 결과 없음(NO_RESULTS): (${rsx},${rsy}) -> (${rex},${rey})`);
    return [];
  }

  return parseKakaoTransitResponse(data, sx, sy, ex, ey);
}

/**
 * fetchKakaoTransitDirections 파사드 래퍼 함수 (호환용)
 */
export async function fetchKakaoTransitDirections(params: {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  sName?: string;
  eName?: string;
  departureTime?: number;
}): Promise<DirectionResult[]> {
  return fetchKakaoTransitOptions(params.sx, params.sy, params.ex, params.ey, params.sName, params.eName);
}
