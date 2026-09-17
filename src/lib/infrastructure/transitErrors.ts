/**
 * Domain Standard Transit & Infrastructure Errors
 * 
 * 대중교통 및 외부 인프라 연동에서 사용하는 표준 커스텀 예외 계층입니다.
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
    // 일시적 인증 토큰 오류일 수 있으므로 retryable 플래그 지원
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
    super(message, 'TRANSIT_ROUTE_NOT_FOUND', 404, false); // 영구적 결과 부재
  }
}

export class TransitTimeoutError extends TransitApiError {
  constructor(message: string) {
    super(message, 'TRANSIT_TIMEOUT', 408, true);
  }
}
