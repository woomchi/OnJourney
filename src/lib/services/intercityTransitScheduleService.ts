import { unstable_cache } from 'next/cache';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import {
  parseTrainSchedule,
  parseBusSchedule,
  parseFirstLegFromPath,
  FirstLegInfo,
  ParsedTrainItem,
  ParsedBusItem,
} from './directions/transit/odsayResponseParser';
import { resolveTrainStationId } from './directions/transit/trainStationMapper';

export interface IntercityScheduleParams {
  type: 'train' | 'bus';
  startStationID: string;
  endStationID: string;
  startStationName?: string;
  endStationName?: string;
  sx?: string;
  sy?: string;
  ex?: string;
  ey?: string;
}

export interface IntercityScheduleResult {
  type: 'train' | 'bus';
  firstLeg: FirstLegInfo | null;
  items: ParsedTrainItem[] | ParsedBusItem[];
  rawResult?: any;
}

type ScheduleCacheResult =
  | { ok: true; data: any }
  | { ok: false; error: string; code: string };

/**
 * ODsay 열차/KTX 운행시간표 캐시 함수 (24시간 캐싱)
 */
const getCachedTrainSchedule = unstable_cache(
  async (startStationID: string, endStationID: string, apiKey: string) => {
    return odsayCircuitBreaker.execute<ScheduleCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchTrainServiceTime(startStationID, endStationID, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
        if (!isRetryable) {
          return { ok: false as const, error: err?.message || 'Train Schedule Error', code: err?.code || 'TRAIN_SCHEDULE_ERROR' };
        }
        throw err;
      }
    );
  },
  ['odsay-train-schedule-v3'],
  { revalidate: 60 * 60 * 24 }
);

/**
 * ODsay 고속/시외버스 운행시간표 캐시 함수 (24시간 캐싱)
 */
const getCachedBusSchedule = unstable_cache(
  async (startStationID: string, endStationID: string, apiKey: string) => {
    return odsayCircuitBreaker.execute<ScheduleCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchInterBusSchedule(startStationID, endStationID, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
        if (!isRetryable) {
          return { ok: false as const, error: err?.message || 'Bus Schedule Error', code: err?.code || 'BUS_SCHEDULE_ERROR' };
        }
        throw err;
      }
    );
  },
  ['odsay-bus-schedule-v3'],
  { revalidate: 60 * 60 * 24 }
);

/**
 * ODsay 대중교통 경로(First Leg) 캐시 함수 (시간 독립 1시간 캐시)
 */
const getCachedFirstLegPath = unstable_cache(
  async (sx: string, sy: string, ex: string, ey: string, apiKey: string) => {
    return odsayCircuitBreaker.execute<ScheduleCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchPublicTransit(sx, sy, ex, ey, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        return { ok: false as const, error: err?.message || 'FirstLeg Path Error', code: 'FIRST_LEG_ERROR' };
      }
    );
  },
  ['odsay-first-leg-path-v2'],
  { revalidate: 3600 }
);

/**
 * 장거리 운행 시간표 및 접속 수단(First Leg) 통합 서비스 함수 (500 에러 안전 래핑)
 */
export async function fetchIntercityTransitSchedule(
  params: IntercityScheduleParams
): Promise<IntercityScheduleResult> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new AppError('ODsay API Key가 설정되지 않았습니다.', 'TRANSIT_AUTH_FAILED', 401);
  }

  const { type, startStationID, endStationID, startStationName, endStationName, sx, sy, ex, ey } = params;

  // 1. 출발지 -> 목적지 접속 수단(First Leg) 파싱 (위경도 파라미터 존재 시)
  let firstLeg: FirstLegInfo | null = null;
  if (sx && sy && ex && ey) {
    try {
      const pathRes = await getCachedFirstLegPath(sx, sy, ex, ey, apiKey);
      if (pathRes.ok) {
        firstLeg = parseFirstLegFromPath(pathRes.data);
      }
    } catch (err) {
      console.warn('[intercityTransitScheduleService] First Leg 조회 실패:', err);
    }
  }

  // 2. 기차 vs 버스 데이터 파싱
  if (type === 'train') {
    // 기차역 ID 보정 (정적 매퍼 + searchStation Fallback)
    const resolvedStartId = await resolveTrainStationId(startStationName || '', startStationID, apiKey);
    const resolvedEndId = await resolveTrainStationId(endStationName || '', endStationID, apiKey);

    let items: ParsedTrainItem[] = [];
    let rawResult: any = null;

    try {
      const res = await getCachedTrainSchedule(resolvedStartId, resolvedEndId, apiKey);
      if (res.ok && res.data) {
        items = parseTrainSchedule(res.data);
        rawResult = res.data;
      }
    } catch (err) {
      console.warn(`[intercityTransitScheduleService] 기차 시간표 조회 실패 (${resolvedStartId} -> ${resolvedEndId}):`, err);
    }

    return {
      type: 'train',
      firstLeg,
      items,
      rawResult,
    };
  } else {
    // 버스
    let items: ParsedBusItem[] = [];
    let rawResult: any = null;

    try {
      const res = await getCachedBusSchedule(startStationID, endStationID, apiKey);
      if (res.ok && res.data) {
        items = parseBusSchedule(res.data);
        rawResult = res.data;
      }
    } catch (err) {
      console.warn(`[intercityTransitScheduleService] 버스 시간표 조회 실패 (${startStationID} -> ${endStationID}):`, err);
    }

    return {
      type: 'bus',
      firstLeg,
      items,
      rawResult,
    };
  }
}
