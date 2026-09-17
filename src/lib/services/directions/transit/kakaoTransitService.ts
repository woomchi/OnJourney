import type { DirectionResult } from '@/types/journey';
import type { KakaoPublicTrafficResponse } from '@/types/kakaoTransit';
import { unstable_cache } from 'next/cache';
import { KakaoTransitAdapter } from '@/lib/infrastructure/kakaoTransitAdapter';
import { parseKakaoTransitResponse } from './kakaoTransitParser';
import { AppError, TransitRouteNotFoundError } from '@/lib/infrastructure/odsayAdapter';

type KakaoTransitCacheResult =
  | { ok: true; data: KakaoPublicTrafficResponse }
  | { ok: false; isNotFound: true; message: string };

/**
 * 카카오 대중교통 경로 검색 캐시 래퍼 (Next.js unstable_cache, 1시간 TTL)
 * - 동일 좌표 구간(소수점 4자리, 약 11m 해상도) 중복 호출 방지로 일일 1,000회 쿼터 극대화
 * - 일시적 오류 발생 시 캐시되지 않도록 re-throw하여 재시도 보장
 */
function getCachedKakaoTransit(
  sx: string,
  sy: string,
  ex: string,
  ey: string,
  sName?: string,
  eName?: string
) {
  const cacheKeyParts = ['kakao-transit-v2', sx, sy, ex, ey];
  if (sName) cacheKeyParts.push(sName);
  if (eName) cacheKeyParts.push(eName);

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
      } catch (err: unknown) {
        const isNotFound =
          err instanceof TransitRouteNotFoundError ||
          (err as { code?: string })?.code === 'TRANSIT_ROUTE_NOT_FOUND' ||
          (err as { message?: string })?.message?.includes('정류장을 찾을 수 없습니다');

        if (isNotFound) {
          return {
            ok: false,
            isNotFound: true,
            message: (err as Error)?.message || '대중교통 정류장 또는 경로를 찾을 수 없습니다.',
          };
        }

        // 일시적 통신 장애, 서버 에러 등은 캐시되지 않도록 throw
        throw err;
      }
    },
    cacheKeyParts,
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
 * @param departureTime 출발 희망 시각 (타임스탬프, ms/s)
 * @returns DirectionResult[] (표준 대중교통 경로 목록)
 */
export async function fetchKakaoTransitOptions(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  sName?: string,
  eName?: string,
  departureTime?: number
): Promise<DirectionResult[]> {
  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);

  let res: KakaoTransitCacheResult;
  try {
    res = await getCachedKakaoTransit(rsx, rsy, rex, rey, sName, eName);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : '카카오 대중교통 경로 검색 실패';
    const code = (err as { code?: string })?.code || 'KAKAO_TRANSIT_ERROR';
    throw new AppError(`[카카오 대중교통 오류] ${message}`, code, 500, false);
  }

  if (!res.ok) {
    if (res.isNotFound) {
      console.warn(`[kakaoTransitService] 해당 좌표 구간에 검색된 대중교통 정류장 또는 경로가 없습니다: (${rsx},${rsy}) -> (${rex},${rey})`);
    }
    return [];
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
  return fetchKakaoTransitOptions(
    params.sx,
    params.sy,
    params.ex,
    params.ey,
    params.sName,
    params.eName,
    params.departureTime
  );
}
