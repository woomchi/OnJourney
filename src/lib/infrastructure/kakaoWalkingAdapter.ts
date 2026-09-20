import { externalFetch, ExternalApiError } from '@/lib/utils/externalFetch';
import {
  TransitApiError,
  TransitAuthError,
  TransitQuotaError,
  TransitRouteNotFoundError,
} from '@/lib/infrastructure/transitErrors';

/** Kakao Developers Walking API (https://dapi.kakao.com/v2/routing/walk) 응답 타입 */
export interface KakaoWalkStep {
  path: {
    points: [number, number][]; // [lng, lat][]
  };
  properties: {
    distance: number; // meters
    guidance?: string;
    time: number; // seconds
    x: number; // lng
    y: number; // lat
  };
}

export interface KakaoWalkLeg {
  properties: {
    distance: number; // meters
    time: number; // seconds
  };
  steps: KakaoWalkStep[];
}

export interface KakaoWalkRoute {
  properties: {
    landingUrl?: string;
    totalDistance: number; // meters
    totalTime: number; // seconds
  };
  legs: KakaoWalkLeg[];
}

export interface KakaoWalkResponse {
  status: string; // "OK" 등
  route?: KakaoWalkRoute;
  errorType?: string;
  message?: string;
}

/**
 * KakaoWalkingAdapter
 *
 * 카카오디벨로퍼스 도보 경로 조회 REST API 통신을 캡슐화하는 인프라 계층 어댑터입니다.
 * - 엔드포인트: https://dapi.kakao.com/v2/routing/walk
 * - KAKAO_REST_API_KEY 기반 Authorization: KakaoAK 인증
 * - HTTP/응답 에러를 도메인 표준 예외로 정규화
 */
export class KakaoWalkingAdapter {
  private static readonly BASE_URL = 'https://dapi.kakao.com/v2/routing/walk';

  /**
   * 카카오 도보 길찾기 API 호출
   *
   * @param sx 출발지 경도 (WGS84)
   * @param sy 출발지 위도 (WGS84)
   * @param ex 도착지 경도 (WGS84)
   * @param ey 도착지 위도 (WGS84)
   * @param apiKey 명시적 API 키 (미지정 시 process.env.KAKAO_REST_API_KEY 사용)
   */
  public static async fetchWalkingDirections(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    apiKey?: string
  ): Promise<KakaoWalkResponse> {
    const rawKey = apiKey || process.env.KAKAO_REST_API_KEY;
    if (!rawKey) {
      throw new TransitAuthError('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
    }
    const key = rawKey.replace(/["'\r\n]/g, '').trim();

    const query = new URLSearchParams({
      start_x: String(sx),
      start_y: String(sy),
      end_x: String(ex),
      end_y: String(ey),
    });

    const requestUrl = `${this.BASE_URL}?${query.toString()}`;

    let res: Response;
    try {
      res = await externalFetch(requestUrl, {
        method: 'GET',
        headers: {
          Authorization: `KakaoAK ${key}`,
          Accept: 'application/json',
        },
      });
    } catch (err: unknown) {
      this.handleHttpError(err);
      throw err; // unreachable — handleHttpError always throws
    }

    const data: KakaoWalkResponse = await res.json();
    this.handleKakaoRouteResult(data);
    return data;
  }

  /** HTTP 레벨 에러를 도메인 표준 예외로 변환 */
  private static handleHttpError(err: unknown): never {
    if (err instanceof ExternalApiError) {
      if (err.status === 401 || err.status === 403) {
        throw new TransitAuthError(`카카오 도보 API 인증 실패: ${err.message}`);
      }
      if (err.status === 429) {
        throw new TransitQuotaError(`카카오 도보 API 쿼터 초과: ${err.message}`);
      }
      if (err.status === 404) {
        throw new TransitRouteNotFoundError(
          '카카오 도보 API 엔드포인트에 접근할 수 없습니다.'
        );
      }
      throw new TransitApiError(
        `카카오 도보 API 통신 오류: ${err.message}`,
        err.code,
        err.status,
        err.isRetryable
      );
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  /** 응답 본문 상태 검증 */
  private static handleKakaoRouteResult(data: KakaoWalkResponse): void {
    if (data.status !== 'OK' || !data.route || !data.route.legs || data.route.legs.length === 0) {
      const errMsg = data.message || `API 상태: ${data.status || 'UNKNOWN'}`;
      throw new TransitRouteNotFoundError(`카카오 도보 경로 없음: ${errMsg}`);
    }
  }
}
