import { externalFetch } from '@/lib/utils/externalFetch';
import { odsayRateLimiter } from '@/lib/infrastructure/odsayRateLimiter';
import {
  AppError,
  TransitApiError,
  TransitAuthError,
  TransitQuotaError,
  TransitRouteNotFoundError,
  TransitTimeoutError,
} from '@/lib/infrastructure/transitErrors';

// 하위 호환성을 위해 공통 에러 re-export
export {
  AppError,
  TransitApiError,
  TransitAuthError,
  TransitQuotaError,
  TransitRouteNotFoundError,
  TransitTimeoutError,
};

/**
 * ODsay API 호출 시 사용할 Referer 도메인을 안전하게 산출합니다.
 * 1. process.env.DOMAIN (설정 시 양끝 따옴표 및 공백 제거, 프로토콜 보장)
 * 2. process.env.NEXT_PUBLIC_SITE_URL
 * 3. process.env.VERCEL_PROJECT_PRODUCTION_URL
 * 4. process.env.VERCEL_URL
 * 5. NODE_ENV === 'development' 인 경우: http://localhost:3000
 * 6. 그 외 프로덕션 기본 도메인: https://on-journey.vercel.app
 */
export function getOdsayReferer(): string {
  const sanitize = (val?: string): string | null => {
    if (!val) return null;
    let clean = val.trim();
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim();
    }
    if (!clean) return null;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  };

  const domain = sanitize(process.env.DOMAIN);
  if (domain) return domain;

  const siteUrl = sanitize(process.env.NEXT_PUBLIC_SITE_URL);
  if (siteUrl) return siteUrl;

  const vercelProd = sanitize(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelProd) return vercelProd;

  const vercelUrl = sanitize(process.env.VERCEL_URL);
  if (vercelUrl) return vercelUrl;

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  return 'https://on-journey.vercel.app';
}

export interface OdsayGenericResult {
  result?: {
    station?: Array<Record<string, unknown>>;
    lane?: Array<Record<string, unknown>> | Record<string, unknown>;
    busNo?: string;
    busLocalBlID?: string | number;
    busType?: string;
    busColor?: string;
    busStartPoint?: string;
    busEndPoint?: string;
    WeekList?: { up?: { time?: unknown[] }; down?: { time?: unknown[] } };
    SatList?: { up?: { time?: unknown[] }; down?: { time?: unknown[] } };
    SunList?: { up?: { time?: unknown[] }; down?: { time?: unknown[] } };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class OdsayAdapter {
  /**
   * ODsay GET API 공통 호출 메서드
   */
  private static async getOdsayData<T = OdsayGenericResult>(
    endpoint: string,
    params: Record<string, string | undefined>,
    apiKey?: string
  ): Promise<T> {
    const key = apiKey || process.env.ODSAY_API_KEY;
    if (!key) {
      throw new TransitAuthError('ODsay API Key가 설정되지 않았습니다.');
    }

    const queryParams = new URLSearchParams();
    queryParams.set('apiKey', key);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        queryParams.set(k, v);
      }
    }

    const url = `https://api.odsay.com/v1/api/${endpoint}?${queryParams.toString()}`;
    const referer = getOdsayReferer();

    let res: Response;
    try {
      res = await odsayRateLimiter.enqueue(() =>
        externalFetch(url, {
          cache: 'no-store',
          headers: {
            Referer: referer,
          },
        })
      );
    } catch (err: unknown) {
      throw this.convertNetworkError(err);
    }

    const data: unknown = await res.json();
    this.checkAndThrowBodyError(data);
    return data as T;
  }

  /**
   * ODsay 대중교통 경로 검색 API 어댑터 (#20 searchPubTransPathT)
   */
  public static async fetchPublicTransit<T = unknown>(
    sx: string,
    sy: string,
    ex: string,
    ey: string,
    apiKey?: string,
    searchType?: string,
    opt?: string
  ): Promise<T> {
    return this.getOdsayData<T>(
      'searchPubTransPathT',
      { SX: sx, SY: sy, EX: ex, EY: ey, SearchType: searchType, OPT: opt },
      apiKey
    );
  }

  /**
   * ODsay 멀티모달 대중교통 길찾기 API 어댑터 (#28 maasRP)
   */
  public static async fetchMaasRP<T = unknown>(
    sx: string,
    sy: string,
    ex: string,
    ey: string,
    searchTime: string,
    searchMethod: string = '2',
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>(
      'maasRP',
      { SX: sx, SY: sy, EX: ex, EY: ey, SearchTime: searchTime, SearchMethod: searchMethod },
      apiKey
    );
  }

  /**
   * ODsay 멀티모달 도보 길찾기 API 어댑터 (#28 maasRP - SearchMethod: '1' 도보 전용)
   */
  public static async fetchMaasRPWalk<T = unknown>(
    sx: string,
    sy: string,
    ex: string,
    ey: string,
    searchTime: string,
    apiKey?: string
  ): Promise<T> {
    return this.fetchMaasRP<T>(sx, sy, ex, ey, searchTime, '1', apiKey);
  }

  /**
   * ODsay (신) 지하철역 전체 시간표 조회 어댑터 (#12 searchSubwaySchedule)
   */
  public static async fetchSubwaySchedule<T = OdsayGenericResult>(
    stationID: string,
    wayCode?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchSubwaySchedule', { stationID, wayCode }, apiKey);
  }

  /**
   * ODsay 버스노선 조회 어댑터 (#1 searchBusLane)
   */
  public static async fetchBusLane<T = OdsayGenericResult>(
    busNo: string,
    cid?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchBusLane', { busNo, CID: cid }, apiKey);
  }

  /**
   * ODsay 버스노선 상세정보 조회 어댑터 (#2 busLaneDetail)
   */
  public static async fetchBusLaneDetail<T = OdsayGenericResult>(
    busID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('busLaneDetail', { busID }, apiKey);
  }

  /**
   * ODsay 대중교통 정류장 검색 어댑터 (#14 searchStation)
   */
  public static async fetchSearchStation<T = OdsayGenericResult>(
    stationName: string,
    stationClass: string = '1',
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchStation', { stationName, stationClass, lang: '0' }, apiKey);
  }

  /**
   * ODsay 열차/KTX 운행정보 검색 어댑터 (#4 trainServiceTime)
   */
  public static async fetchTrainServiceTime<T = OdsayGenericResult>(
    startStationID: string,
    endStationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('trainServiceTime', { startStationID, endStationID }, apiKey);
  }

  /**
   * ODsay 고속/시외버스 운행정보 검색 어댑터 (#7 searchInterBusSchedule)
   */
  public static async fetchInterBusSchedule<T = OdsayGenericResult>(
    startStationID: string,
    endStationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchInterBusSchedule', { startStationID, endStationID }, apiKey);
  }

  /**
   * 외부 네트워크 에러를 도메인 표준 Custom Error로 변환
   */
  private static convertNetworkError(err: unknown): Error {
    const errorObj = err as { name?: string; status?: number; code?: string; message?: string } | undefined;
    if (errorObj?.name === 'AbortError' || errorObj?.status === 408 || errorObj?.code === 'TIMEOUT') {
      return new TransitTimeoutError('ODsay API 호출 시간 초과');
    }
    if (errorObj?.status === 429 || errorObj?.message?.includes('Too Many Requests') || errorObj?.message?.includes('429')) {
      return new TransitQuotaError('ODsay API 요청 한도 초과');
    }
    return new TransitApiError(errorObj?.message || 'ODsay API 통신 오류', 'TRANSIT_API_NETWORK_ERROR', errorObj?.status || 500, true);
  }

  /**
   * 200 OK 본문 에러를 파싱하여 도메인 표준 Custom Error로 변환
   */
  private static checkAndThrowBodyError(data: unknown): void {
    if (!data || typeof data !== 'object') {
      throw new TransitApiError('비어 있는 응답 데이터 수신', 'TRANSIT_EMPTY_RESPONSE');
    }

    const payload = data as { error?: { code?: string; message?: string } | { code?: string; message?: string }[]; result?: unknown };

    // ODsay API 특화 에러 판정
    if (payload.error) {
      const errorDetail = Array.isArray(payload.error) ? payload.error[0] : payload.error;
      const errorCode = String(errorDetail?.code || '');
      const errorMsg = String(errorDetail?.message || '');

      if (errorCode === 'ApiKeyAuthFailed' || errorMsg.includes('ApiKeyAuthFailed')) {
        const currentReferer = getOdsayReferer();
        console.error(`[OdsayAdapter] 외부 API 인증 실패 (ApiKeyAuthFailed). 현재 전송된 Referer: "${currentReferer}", 응답 메시지: ${errorMsg}`);
        throw new TransitAuthError(`외부 API 인증 오류: ${errorMsg} (전송된 Referer: ${currentReferer})`);
      }
      if (errorCode === 'TooManyRequests' || errorCode === '429' || errorMsg.includes('Requests')) {
        throw new TransitQuotaError(`외부 API 할당량/요청 한도 초과: ${errorMsg}`);
      }
      if (errorCode === 'NoRouteFound' || errorMsg.includes('찾을 수 없습니다')) {
        throw new TransitRouteNotFoundError(`대중교통 경로를 찾을 수 없음: ${errorMsg}`);
      }

      throw new TransitApiError(`외부 API 본문 오류 [${errorCode}]: ${errorMsg}`, errorCode);
    }

    // 결과가 비어있는 경우
    if (!payload.result) {
      throw new TransitRouteNotFoundError('결과 데이터(result)가 본문에 존재하지 않습니다.');
    }
  }
}
