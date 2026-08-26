import { externalFetch } from '@/lib/utils/externalFetch';
import { odsayRateLimiter } from '@/lib/infrastructure/odsayRateLimiter';

/**
 * Domain Standard Custom Errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_APP_ERROR',
    public status: number = 500,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class TransitApiError extends AppError {
  constructor(message: string, code = 'TRANSIT_API_ERROR', status = 500, isRetryable = false) {
    super(message, code, status, isRetryable);
  }
}

export class TransitAuthError extends TransitApiError {
  constructor(message: string) {
    // ODsay의 ApiKeyAuthFailed는 일시적 서버 오류일 수 있으므로 retryable로 분류
    super(message, 'TRANSIT_AUTH_FAILED', 401, true);
  }
}

export class TransitQuotaError extends TransitApiError {
  constructor(message: string) {
    super(message, 'TRANSIT_QUOTA_EXCEEDED', 429, true);
  }
}

export class TransitRouteNotFoundError extends TransitApiError {
  constructor(message: string) {
    super(message, 'TRANSIT_ROUTE_NOT_FOUND', 404, false); // 영구 에러 (캐싱 대상)
  }
}

export class TransitTimeoutError extends TransitApiError {
  constructor(message: string) {
    super(message, 'TRANSIT_TIMEOUT', 408, true);
  }
}

/**
 * ExternalApiAdapter (Adapter Pattern)
 * 
 * [디자인 패턴: Adapter Pattern / Network Middleware Layer]
 * 
 * 1. 작동 방식 (How it works):
 *    - 외부 API(ODsay 등)의 비표준 응답 구조(예: HTTP 200 OK 내부에 에러 본문 반환)를
 *      독립된 네트워크 미들웨어 계층(Adapter)에서 캡처하고 해석합니다.
 *    - 외부의 비표준 에러 규격을 시스템 도메인 표준 에러(`TransitApiError` 계열) 객체로 변환(Adapt)합니다.
 *    - 비즈니스 서비스 레이어(`serverDirectionsService.ts`)는 외부 API의 에러 세부 사항을 직접 알지 못하며,
 *      표준화된 에러 인터페이스와 모델만을 활용합니다.
 * 
 * 2. 기대 효과 (Expected Effects):
 *    - 비즈니스 로직과 외부 공급자 API 구조 간의 강결합(Tight Coupling) 해소.
 *    - 외부 API 스펙 변경 시 비즈니스 로직 수정 없이 어댑터 계층만 업데이트하면 되는 높은 유지보수성.
 *    - 시스템 전체의 에러 처리 일관성 확보.
 */
export class OdsayAdapter {
  /**
   * ODsay GET API 공통 호출 메서드
   */
  private static async getOdsayData<T = any>(
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

    let res: Response;
    try {
      res = await odsayRateLimiter.enqueue(() =>
        externalFetch(url, {
          cache: 'no-store',
          headers: {
            Referer: process.env.DOMAIN || 'http://localhost:3000',
          },
        })
      );
    } catch (err: unknown) {
      throw this.convertNetworkError(err);
    }

    const data = await res.json();
    this.checkAndThrowBodyError(data);
    return data as T;
  }

  /**
   * ODsay 대중교통 경로 검색 API 어댑터 (#20 searchPubTransPathT)
   */
  public static async fetchPublicTransit<T = any>(
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
  public static async fetchMaasRP<T = any>(
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
   * ODsay 도보 길찾기 API 어댑터 (#31 searchWalkPathV2)
   */
  public static async fetchWalkPathV2<T = any>(
    sx: string,
    sy: string,
    ex: string,
    ey: string,
    apiKey?: string,
    startName: string = 'Start',
    endName: string = 'End'
  ): Promise<T> {
    return this.getOdsayData<T>('searchWalkPathV2', { SX: sx, SY: sy, EX: ex, EY: ey, startName, endName }, apiKey);
  }

  /**
   * ODsay 위치 기반 반경 정류장 검색 API 어댑터 (#18 pointSearch)
   */
  public static async fetchPointSearch<T = any>(
    x: string,
    y: string,
    radius: string = '5000',
    stationClass?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('pointSearch', { x, y, radius, stationClass }, apiKey);
  }

  /**
   * ODsay 상세 노선 궤적(loadLane) API 어댑터 (#13 loadLane)
   */
  public static async fetchLoadLane<T = any>(mapObjectParam: string, apiKey?: string): Promise<T> {
    return this.getOdsayData<T>('loadLane', { mapObject: mapObjectParam }, apiKey);
  }

  /**
   * ODsay (신) 지하철역 전체 시간표 조회 어댑터 (#12 searchSubwaySchedule)
   */
  public static async fetchSubwaySchedule<T = any>(
    stationID: string,
    wayCode?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchSubwaySchedule', { stationID, wayCode }, apiKey);
  }

  /**
   * ODsay 지하철역 세부 정보 조회 어댑터 (#10 subwayStationInfo)
   */
  public static async fetchSubwayStationInfo<T = any>(
    stationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('subwayStationInfo', { stationID }, apiKey);
  }

  /**
   * ODsay 버스노선 조회 어댑터 (#1 searchBusLane)
   */
  public static async fetchBusLane<T = any>(
    busNo: string,
    cid?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchBusLane', { busNo, CID: cid }, apiKey);
  }

  /**
   * ODsay 버스노선 상세정보 조회 어댑터 (#2 busLaneDetail)
   */
  public static async fetchBusLaneDetail<T = any>(
    busID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('busLaneDetail', { busID }, apiKey);
  }

  /**
   * ODsay 버스정류장 세부 정보 조회 어댑터 (#3 busStationInfo)
   */
  public static async fetchBusStationInfo<T = any>(
    stationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('busStationInfo', { stationID }, apiKey);
  }

  /**
   * ODsay 대중교통 정류장 검색 어댑터 (#14 searchStation)
   */
  public static async fetchSearchStation<T = any>(
    stationName: string,
    stationClass: string = '1',
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchStation', { stationName, stationClass, lang: '0' }, apiKey);
  }

  /**
   * ODsay 도시코드 조회 어댑터 (#24 searchCID)
   */
  public static async fetchSearchCID<T = any>(
    cityName: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchCID', { cityName }, apiKey);
  }

  /**
   * ODsay 열차/KTX 운행정보 검색 어댑터 (#4 trainServiceTime)
   */
  public static async fetchTrainServiceTime<T = any>(
    startStationID: string,
    endStationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('trainServiceTime', { startStationID, endStationID }, apiKey);
  }

  /**
   * ODsay 고속/시외버스 운행정보 검색 어댑터 (#7 searchInterBusSchedule)
   */
  public static async fetchInterBusSchedule<T = any>(
    startStationID: string,
    endStationID: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('searchInterBusSchedule', { startStationID, endStationID }, apiKey);
  }

  /**
   * ODsay 고속버스 터미널 목록 조회 어댑터 (#22 expressBusTerminals)
   */
  public static async fetchExpressBusTerminals<T = any>(
    cid?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('expressBusTerminals', { CID: cid }, apiKey);
  }

  /**
   * ODsay 시외버스 터미널 목록 조회 어댑터 (#23 intercityBusTerminals)
   */
  public static async fetchIntercityBusTerminals<T = any>(
    cid?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('intercityBusTerminals', { CID: cid }, apiKey);
  }

  /**
   * ODsay 기차역 터미널 목록 조회 어댑터 (#25 trainTerminals)
   */
  public static async fetchTrainTerminals<T = any>(
    cid?: string,
    apiKey?: string
  ): Promise<T> {
    return this.getOdsayData<T>('trainTerminals', { CID: cid }, apiKey);
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
        throw new TransitAuthError(`외부 API 인증 오류: ${errorMsg}`);
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
