import type { DirectionResult } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import { parseMaasRPResponse } from './maasRPParser';

import { toKstSearchTime, toKstCacheKeyGroup } from '../common/timeUtils';

type MaasRPApiCacheResult =
  | { ok: true; data: any }
  | { ok: false; error: string; code: string };

/**
 * ODsay 멀티모달(maasRP) 대중교통 경로 캐시 함수 (명세서 규격: 1시간 캐싱, 3시간 버킷 키)
 */
function getCachedMaasRP(
  sx: string,
  sy: string,
  ex: string,
  ey: string,
  searchTime: string,
  cacheTimeGroup: string,
  apiKey: string
) {
  return unstable_cache(
    async () => {
      return odsayCircuitBreaker.execute<MaasRPApiCacheResult>(
        async () => {
          const data = await OdsayAdapter.fetchMaasRP(sx, sy, ex, ey, searchTime, '2', apiKey);
          return { ok: true as const, data };
        },
        (err: unknown) => {
          const errorObj = err as { isRetryable?: boolean; message?: string; code?: string };
          const isRetryable = errorObj?.isRetryable === true || errorObj?.message?.includes('Circuit breaker is OPEN');
          if (!isRetryable) {
            return {
              ok: false as const,
              error: errorObj?.message || 'MaasRP Public Directions Error',
              code: errorObj?.code || 'MAAS_RP_DIRECTIONS_ERROR',
            };
          }
          throw err;
        }
      );
    },
    ['odsay-maas-rp-v3', sx, sy, ex, ey, cacheTimeGroup],
    { revalidate: 3600 } // 💡 명세서 5.2절 규격: 1시간 (3600초)
  )();
}

/**
 * 대중교통 경로 호출 메인 함수 (ODsay maasRP 기반 전면 통합)
 */
export async function fetchPublicTransitOptions(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  departureTime?: number
): Promise<DirectionResult[]> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new Error('ODsay API Key가 설정되지 않았습니다.');
  }

  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);
  const searchTime = toKstSearchTime(departureTime);
  const cacheTimeGroup = toKstCacheKeyGroup(departureTime);

  const res = await getCachedMaasRP(rsx, rsy, rex, rey, searchTime, cacheTimeGroup, apiKey);

  if (!res.ok) {
    const isNotFound = (res as any).code === 'TRANSIT_ROUTE_NOT_FOUND' || (res as any).error?.includes('찾을 수 없음') || (res as any).error?.includes('결과 데이터');
    if (isNotFound) {
      console.warn(`[PublicTransitService] 해당 좌표 구간에 검색된 대중교통 경로가 없습니다.`);
      return [];
    }
    throw new AppError(`[API 내부 에러] ${(res as any).error}`, (res as any).code, 500, false);
  }

  const data = res.data;

  let parsedResults: DirectionResult[];
  try {
    parsedResults = parseMaasRPResponse(data, sx, sy, ex, ey);
  } catch (parseErr: unknown) {
    throw parseErr;
  }

  return parsedResults;
}

/**
 * fetchPublicDirections 파사드 래퍼 함수 (하위 호환성 유지)
 */
export async function fetchPublicDirections(params: {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  departureTime?: number;
}): Promise<DirectionResult[]> {
  return fetchPublicTransitOptions(params.sx, params.sy, params.ex, params.ey, params.departureTime);
}
