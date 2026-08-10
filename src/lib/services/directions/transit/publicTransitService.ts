import type { DirectionResult } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import { parseMaasRPResponse } from './maasRPParser';

type MaasRPApiCacheResult =
  | { ok: true; data: any }
  | { ok: false; error: string; code: string };

/**
 * departureTime (timestamp ms) 또는 현재 시각을 yyyyMMddHHmm 문자열로 변환하는 유틸
 */
function toSearchTime(departureTime?: number): string {
  const d = departureTime ? new Date(departureTime) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

/**
 * ODsay 멀티모달(maasRP) 대중교통 경로 캐시 함수 (시간대별 5분 캐싱)
 */
function getCachedMaasRP(sx: string, sy: string, ex: string, ey: string, searchTime: string, apiKey: string) {
  return unstable_cache(
    async () => {
      // ── 이 줄이 출력되면 캐시 MISS (실제 API 호출), 출력되지 않으면 캐시 HIT
      console.log(`[PublicTransitService][DEBUG] 🔄 getCachedMaasRP 캐시 MISS - 실제 API 호출 진행 (SX=${sx}, Time=${searchTime})`);
      return odsayCircuitBreaker.execute<MaasRPApiCacheResult>(
        async () => {
          const data = await OdsayAdapter.fetchMaasRP(sx, sy, ex, ey, searchTime, '2', apiKey);
          console.log(`[PublicTransitService][DEBUG] API 응답 수신 완료, data.result 존재:`, !!data?.result);
          return { ok: true as const, data };
        },
        (err: any) => {
          const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
          console.error(`[PublicTransitService][DEBUG] circuitBreaker fallback 진입:`, err?.name, err?.message, `isRetryable=${isRetryable}`);
          if (!isRetryable) {
            return {
              ok: false as const,
              error: err?.message || 'MaasRP Public Directions Error',
              code: err?.code || 'MAAS_RP_DIRECTIONS_ERROR',
            };
          }
          throw err;
        }
      );
    },
    ['odsay-maas-rp-v2', sx, sy, ex, ey, searchTime],
    { revalidate: 60 * 5 }
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
  const searchTime = toSearchTime(departureTime);

  console.log(`[PublicTransitService][DEBUG] ▶ fetchPublicTransitOptions 호출`);
  console.log(`[PublicTransitService][DEBUG]   좌표: SX=${rsx}, SY=${rsy}, EX=${rex}, EY=${rey}`);
  console.log(`[PublicTransitService][DEBUG]   시간: SearchTime=${searchTime} (departureTime=${departureTime ?? 'undefined(현재시각사용)'})`);
  console.log(`[PublicTransitService][DEBUG]   API Key 존재: ${!!apiKey}`);

  const res = await getCachedMaasRP(rsx, rsy, rex, rey, searchTime, apiKey);
  console.log(`[PublicTransitService][DEBUG] getCachedMaasRP 응답 ok:`, res.ok);

  if (!res.ok) {
    const isNotFound = (res as any).code === 'TRANSIT_ROUTE_NOT_FOUND' || (res as any).error?.includes('찾을 수 없음') || (res as any).error?.includes('결과 데이터');
    if (isNotFound) {
      console.warn(`[PublicTransitService] 해당 좌표 구간에 검색된 대중교통 경로가 없습니다.`);
      return [];
    }
    console.error(`[PublicTransitService][DEBUG] ✗ maasRP 에러:`, (res as any).error, (res as any).code);
    throw new AppError(`[API 내부 에러] ${(res as any).error}`, (res as any).code, 500, false);
  }

  const data = res.data;
  console.log(`[PublicTransitService][DEBUG] raw data 키:`, Object.keys(data || {}));
  if (data?.result) {
    console.log(`[PublicTransitService][DEBUG] result.paths 길이:`, Array.isArray(data.result.paths) ? data.result.paths.length : '비배열');
  }

  let parsedResults: DirectionResult[];
  try {
    parsedResults = parseMaasRPResponse(data, sx, sy, ex, ey);
  } catch (parseErr: any) {
    console.error(`[PublicTransitService][DEBUG] ✗ parseMaasRPResponse 예외:`, parseErr?.name, parseErr?.message);
    throw parseErr;
  }

  console.log(`[PublicTransitService][DEBUG] ✓ 파싱 완료: ${parsedResults.length}개 경로`);
  parsedResults.forEach((r, i) => {
    console.log(`[PublicTransitService][DEBUG]   경로[${i}] id=${r.id}, duration=${r.duration}, steps=${r.steps?.length ?? 0}`);
  });

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
