import { externalFetch } from '@/lib/utils/externalFetch';

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
   * ODsay 대중교통 경로 검색 API 어댑터
   */
  public static async fetchPublicTransit(
    sx: string,
    sy: string,
    ex: string,
    ey: string,
    apiKey: string
  ): Promise<any> {
    const url = `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(apiKey)}&SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}`;
    
    let res: Response;
    try {
      res = await externalFetch(url, {
        cache: 'no-store',
        headers: {
          Referer: process.env.DOMAIN || 'http://localhost:3000',
        },
      });
    } catch (err: any) {
      throw this.convertNetworkError(err);
    }

    const data = await res.json();
    this.checkAndThrowBodyError(data);
    return data;
  }

  /**
   * ODsay 상세 노선 궤적(loadLane) API 어댑터
   */
  public static async fetchLoadLane(mapObjectParam: string, apiKey: string): Promise<any> {
    const laneUrl = `https://api.odsay.com/v1/api/loadLane?apiKey=${encodeURIComponent(apiKey)}&mapObject=${encodeURIComponent(mapObjectParam)}`;

    let res: Response;
    try {
      res = await externalFetch(laneUrl, {
        cache: 'no-store',
        headers: {
          Referer: process.env.DOMAIN || 'http://localhost:3000',
        },
      });
    } catch (err: any) {
      throw this.convertNetworkError(err);
    }

    const data = await res.json();
    this.checkAndThrowBodyError(data);
    return data;
  }

  /**
   * 외부 네트워크 에러를 도메인 표준 Custom Error로 변환
   */
  private static convertNetworkError(err: any): Error {
    if (err.name === 'AbortError' || err.status === 408 || err.code === 'TIMEOUT') {
      return new TransitTimeoutError('ODsay API 호출 시간 초과');
    }
    if (err.status === 429) {
      return new TransitQuotaError('ODsay API 요청 한도 초과');
    }
    return new TransitApiError(err.message || 'ODsay API 통신 오류', 'TRANSIT_API_NETWORK_ERROR', err.status || 500, true);
  }

  /**
   * 200 OK 본문 에러를 파싱하여 도메인 표준 Custom Error로 변환
   */
  private static checkAndThrowBodyError(data: any): void {
    if (!data) {
      throw new TransitApiError('비어 있는 응답 데이터 수신', 'TRANSIT_EMPTY_RESPONSE');
    }

    // ODsay API 특화 에러 판정
    if (data.error) {
      const errorDetail = Array.isArray(data.error) ? data.error[0] : data.error;
      const errorCode = String(errorDetail.code || '');
      const errorMsg = String(errorDetail.message || '');

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
    if (!data.result) {
      throw new TransitRouteNotFoundError('결과 데이터(result)가 본문에 존재하지 않습니다.');
    }
  }
}
