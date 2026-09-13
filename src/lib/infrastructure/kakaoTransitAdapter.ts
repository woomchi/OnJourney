import { externalFetch, ExternalApiError } from '@/lib/utils/externalFetch';
import {
  TransitApiError,
  TransitAuthError,
  TransitQuotaError,
  TransitRouteNotFoundError,
  AppError,
} from '@/lib/infrastructure/odsayAdapter';
import type { KakaoPublicTrafficParams, KakaoPublicTrafficResponse } from '@/types/kakaoTransit';

/**
 * KakaoTransitAdapter
 * 
 * 카카오 대중교통 경로 검색 REST API 통신을 캡슐화하는 인프라 계층 어댑터입니다.
 * - 엔드포인트: https://dapi.kakao.com/v2/routing/publictraffic
 * - KAKAO_REST_API_KEY 기반 Authorization: KakaoAK 인증
 * - 비정상 상태 코드(STARTNODES_NULL, EQUAL_POINTS 등)를 도메인 표준 예외로 정규화
 */
export class KakaoTransitAdapter {
  private static readonly BASE_URL = 'https://dapi.kakao.com/v2/routing/publictraffic';

  /**
   * 카카오 대중교통 경로 검색 API 호출
   * 
   * @param params 출발지/도착지 좌표 및 옵션
   * @param apiKey 명시적 API 키 (미지정 시 process.env.KAKAO_REST_API_KEY 사용)
   * @returns KakaoPublicTrafficResponse
   */
  public static async fetchPublicTraffic(
    params: KakaoPublicTrafficParams,
    apiKey?: string
  ): Promise<KakaoPublicTrafficResponse> {
    const key = apiKey || process.env.KAKAO_REST_API_KEY;
    if (!key) {
      throw new TransitAuthError('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
    }

    const query = new URLSearchParams({
      start_x: String(params.startX),
      start_y: String(params.startY),
      end_x: String(params.endX),
      end_y: String(params.endY),
      input_coord: params.inputCoord || 'WGS84',
      output_coord: params.outputCoord || 'WGS84',
    });

    if (params.sName) query.set('s_name', params.sName);
    if (params.eName) query.set('e_name', params.eName);

    const requestUrl = `${this.BASE_URL}?${query.toString()}`;

    let res: Response;
    try {
      res = await externalFetch(requestUrl, {
        method: 'GET',
        headers: {
          Authorization: `KakaoAK ${key.trim()}`,
          Accept: 'application/json',
        },
      });
    } catch (err: unknown) {
      this.handleHttpError(err);
      throw err;
    }

    const data: KakaoPublicTrafficResponse = await res.json();

    // 카카오 응답 상태 코드 해석 및 비정상 상태 정규화
    this.handleKakaoStatus(data);

    return data;
  }

  /**
   * HTTP 레벨 에러를 도메인 표준 예외로 변환
   */
  private static handleHttpError(err: unknown): never {
    if (err instanceof ExternalApiError) {
      if (err.status === 401 || err.status === 403) {
        throw new TransitAuthError(`카카오 API 인증 실패: ${err.message}`);
      }
      if (err.status === 429) {
        throw new TransitQuotaError(`카카오 대중교통 API 쿼터 초과 (일일 1000회 제한): ${err.message}`);
      }
      throw new TransitApiError(`카카오 대중교통 통신 오류: ${err.message}`, err.code, err.status, err.isRetryable);
    }
    throw err as Error;
  }

  /**
   * 카카오 응답 본문의 status 코드 해석 및 처리
   */
  private static handleKakaoStatus(data: KakaoPublicTrafficResponse): void {
    switch (data.status) {
      case 'OK':
        return; // 정상

      case 'NO_RESULTS':
        // 장거리/시외 등으로 경로가 없는 경우 (정상 빈 배열 처리 대상, 예외 던지지 않음)
        return;

      case 'STARTNODES_NULL':
        throw new TransitRouteNotFoundError('출발지 주변에서 대중교통 정류장을 찾을 수 없습니다.');

      case 'ENDNODES_NULL':
        throw new TransitRouteNotFoundError('도착지 주변에서 대중교통 정류장을 찾을 수 없습니다.');

      case 'EQUAL_POINTS':
        throw new AppError('출발지와 도착지 좌표가 동일합니다.', 'INVALID_COORDINATES', 400, false);

      case 'INVALID_REQUEST':
        throw new AppError('카카오 대중교통 요청 파라미터가 유효하지 않습니다.', 'INVALID_REQUEST', 400, false);

      default:
        console.warn(`[KakaoTransitAdapter] 미정의 상태 코드 감지: ${(data as any).status}`);
    }
  }
}
