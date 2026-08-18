/**
 * Direction Services Facade & Re-export Proxy
 * 
 * 기존 API 라우트 및 서비스와의 100% 하위 호환성을 유지하기 위한 파사드 모듈입니다.
 * 모든 세부 비즈니스 로직은 src/lib/services/directions/ 하위의 도메인 서비스로 이관되었습니다.
 */

// 1. 공통 유틸리티
export { haversineDistance, roundCoord } from './directions/common/distanceUtils';
export { getTimeSlot, getTimeGroup, getCacheDuration, toKstSearchTime, normalizeTimestampToMs, getKstDateComponents } from './directions/common/timeUtils';

// 2. 대중교통 도메인 서비스
export { getSubwayColor, cleanSubwayName, getBusColor } from './directions/transit/transitColorUtils';
export { fetchPublicTransitOptions, fetchPublicDirections } from './directions/transit/publicTransitService';

// 3. 차량 도메인 서비스
export { fetchCarRoute, calculateCarFallback } from './directions/car/carRouteService';

// 4. 도보 도메인 서비스
export { buildWalkFallbackResults } from './directions/walk/walkFallbackService';
export { fetchOdsayWalkingRoute, fetchOdsayDetailRoute as fetchTmapDetailRoute } from './directions/walk/odsayWalkingService';

// 5. 오케스트레이터 파사드 서비스
export { fetchCarWalkDirections } from './directions/directionsOrchestrator';
