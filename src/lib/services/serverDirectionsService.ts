/**
 * Direction Services Facade & Re-export Proxy
 * 
 * 기존 API 라우트 및 서비스와의 100% 하위 호환성을 유지하기 위한 파사드 모듈입니다.
 * 모든 세부 비즈니스 로직은 src/lib/services/directions/ 하위의 도메인 서비스로 이관되었습니다.
 */

// 1. 공통 유틸리티
export { haversineDistance, roundCoord } from './directions/common/distanceUtils';
export { getTimeSlot, getTimeGroup, getCacheDuration, toKstSearchTime, normalizeTimestampToMs, getKstDateComponents } from './directions/common/timeUtils';

// 2. 대중교통 도메인 서비스 (카카오 대중교통 기반)
export { getSubwayColor, cleanSubwayName, getBusColor, getKakaoBusColor } from './directions/transit/transitColorUtils';

export {
  fetchKakaoTransitOptions,
  fetchKakaoTransitDirections,
  fetchKakaoTransitOptions as fetchPublicTransitOptions,
  fetchKakaoTransitDirections as fetchPublicDirections,
} from './directions/transit/kakaoTransitService';

// 3. 차량 도메인 서비스
export { fetchCarRoute, calculateCarFallback } from './directions/car/carRouteService';

// 4. 도보 도메인 서비스
export { buildWalkFallbackResults } from './directions/walk/walkFallbackService';
// Kakao Mobility Walking API 기반 도보 경로 서비스 (ODsay maasRP 대체)
export {
  fetchKakaoWalkingRoute,
  fetchKakaoWalkDetailRoute as fetchWalkDetailRoute,
  fetchKakaoWalkDetailRoute as fetchTmapDetailRoute,
} from './directions/walk/kakaoWalkingService';
// ODsay 도보 서비스 (하위 호환성 유지용 — 직접 호출하지 말 것)
export { fetchOdsayWalkingRoute, fetchOdsayDetailRoute } from './directions/walk/odsayWalkingService';

// 5. 장거리/시외 멀티모달 도메인 서비스 (ODsay 기반, 2주 캐시 & 쿼터 가드)
export { fetchIntercityTransitRoute } from './directions/transit/odsayTransitService';
export { isIntercityEligible, isIslandIntercity, generateIntercityCacheKey } from './directions/transit/intercityClassifier';
export { OdsayQuotaGuard } from '@/lib/infrastructure/odsayQuotaGuard';
export { IntercityRouteCache } from '@/lib/infrastructure/intercityRouteCache';

// 6. 오케스트레이터 파사드 서비스
export { fetchCarWalkDirections } from './directions/directionsOrchestrator';

