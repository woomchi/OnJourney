export class ExternalApiError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = 'EXTERNAL_API_ERROR',
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

export async function externalFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  // 기본 타임아웃 5초 설정 (options.signal이 없을 경우)
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const fetchOptions = {
    ...options,
    signal: options.signal || controller.signal,
  };

  try {
    const res = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // 1. 일반적인 HTTP 상태 코드 에러 처리
    if (!res.ok) {
      const isRetryable = [408, 429, 502, 503, 504].includes(res.status);
      throw new ExternalApiError(`외부 API HTTP 오류: 상태 코드 ${res.status}`, res.status, `HTTP_${res.status}`, isRetryable);
    }

    // 2. 가짜 200 OK (본문에 error 필드가 있는 경우) 차단 로직
    // 원본 res.json()을 소비하지 않기 위해 clone() 사용
    const clone = res.clone();
    try {
      const data = await clone.json();
      
      // ODsay 등 일부 API는 200 OK와 함께 { error: [...] } 를 반환함
      if (data && data.error) {
        const errorDetail = Array.isArray(data.error) ? data.error[0] : data.error;
        const errorMsg = errorDetail.message || JSON.stringify(data.error);
        const errorCode = errorDetail.code || 'API_ERROR_BODY';

        // ODsay 서버 순간 과부하 시 ApiKeyAuthFailed나 Requests 관련 에러가 일시적으로 발생할 수 있으므로 retryable로 처리함
        const isRetryable =
          errorCode === 'ApiKeyAuthFailed' ||
          errorCode === 'TooManyRequests' ||
          String(errorCode).includes('Requests') ||
          String(errorMsg).includes('ApiKeyAuthFailed');

        throw new ExternalApiError(`[API 내부 에러] ${errorMsg}`, 500, errorCode, isRetryable);
      }
    } catch (parseError) {
      // JSON 파싱 에러는 무시 (응답이 JSON이 아닐 수도 있으므로 통과)
      if (parseError instanceof ExternalApiError) {
        throw parseError; // 에러 본문 감지 시 발생한 ExternalApiError는 재전송
      }
    }

    return res;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ExternalApiError('외부 API 요청 시간 초과 (Timeout)', 408, 'TIMEOUT', true);
    }
    throw error;
  }
}
