import type { DirectionResult, DirectionStep, DirectionsApiResponse, CarWalkDirectionsResult, SnapMeta, SnapType } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { externalFetch } from '@/lib/utils/externalFetch';
import { chunkAsync } from '@/lib/utils/odsayThrottle';
import { SUBWAY_COLORS, BUS_COLORS, ODSAY_BUS_TYPES } from '@/constants/colors';
import { WALK_LIMITS } from '@/constants/transit';
import { odsayRateLimiter } from '@/lib/infrastructure/rateLimiter';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import { isNonWalkableArea } from '@/lib/utils/walkabilityCheck';
import { getNearestRoadCoords, findExitPoint } from '@/lib/utils/snapToRoad';
import { getHikingTrailPolyline } from '@/utils/hikingTrailService';
import distance from '@turf/distance';
import bearing from '@turf/bearing';
import destination from '@turf/destination';
import { point } from '@turf/helpers';

type OdsayApiCacheResult =
  | { ok: true; data: any }
  | { ok: false; error: string; code: string };

// ODsay 대중교통 경로 조회를 위한 top-level 캐시 함수
// - Circuit Breaker 패턴 도입: 맹목적인 300ms/600ms 동기 딜레이 대기 로직을 제거하고,
//   연속 실패 시 Circuit Breaker가 즉시 OPEN되어 딜레이 없이 Fail-Fast로 Fallback을 반환함.
const getCachedOdsayDirections = unstable_cache(
  async (rsx: string, rsy: string, rex: string, rey: string, apiKey: string) => {
    return odsayCircuitBreaker.execute<OdsayApiCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchPublicTransit(rsx, rsy, rex, rey, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        // 어댑터가 이미 domain-specific standard error를 던짐
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');

        if (!isRetryable) {
          // 영구 에러 (예: TransitRouteNotFoundError): 결과 객체로 반환하여 캐시에 저장
          return { ok: false as const, error: err?.message || 'API Error', code: err?.code || 'API_ERROR' };
        }

        // 일시 에러: throw하여 캐시 저장 방지 (즉시 Fallback 반환 유도)
        throw err;
      }
    );
  },
  ['odsay-directions-pubtrans'],
  { revalidate: 3600 }
);

// ODsay loadLane 조회를 위한 top-level 캐시 함수 (Circuit Breaker 적용)
const getCachedOdsayLoadLane = unstable_cache(
  async (mapObjectParam: string, apiKey: string) => {
    return odsayCircuitBreaker.execute<OdsayApiCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchLoadLane(mapObjectParam, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
        if (!isRetryable) {
          return { ok: false as const, error: err?.message || 'LoadLane Error', code: err?.code || 'LOADLANE_ERROR' };
        }
        throw err;
      }
    );
  },
  ['odsay-loadlane'],
  { revalidate: 3600 }
);

// 두 좌표 간 직선 거리 계산 (Haversine 공식)
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 지하철 색상 매핑
export function getSubwayColor(laneName: string): string {
  const match = Object.keys(SUBWAY_COLORS).find(key => laneName.includes(key));
  return match ? SUBWAY_COLORS[match] : SUBWAY_COLORS['DEFAULT'];
}

// 지하철 노선명 정리 (수도권 등 불필요한 지역 접두사 및 온점/가운데점 제거)
export function cleanSubwayName(laneName: string): string {
  return laneName
    .replace(/^(수도권|인천|부산|대구|대전|광주|울산)\s+/, '')
    .replace(/[·\.]/g, '');
}

// 버스 색상 매핑 (ODsay type 코드 및 버스 번호 기반)
export function getBusColor(busType: number, laneName: string): string {
  if (ODSAY_BUS_TYPES.WIDE_AREA.includes(busType)) return BUS_COLORS.RED;
  if (ODSAY_BUS_TYPES.LOCAL.includes(busType)) return BUS_COLORS.GREEN;
  if (ODSAY_BUS_TYPES.CIRCULAR.includes(busType)) return BUS_COLORS.YELLOW;
  if (ODSAY_BUS_TYPES.MAIN.includes(busType)) return BUS_COLORS.BLUE;

  // fallback: 버스 번호나 텍스트 기반 매핑
  if (laneName.includes('광역') || laneName.includes('급행') || laneName.includes('red') || laneName.includes('M')) return BUS_COLORS.RED;
  if (laneName.includes('지선') || laneName.includes('green') || laneName.includes('마을')) return BUS_COLORS.GREEN;
  if (laneName.includes('순환') || laneName.includes('yellow')) return BUS_COLORS.YELLOW;
  return BUS_COLORS.BLUE;
}

// 1. ODsay 대중교통 경로 호출 함수
export async function fetchPublicTransitOptions(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<DirectionResult[]> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new Error('ODsay API Key가 설정되지 않았습니다.');
  }

  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);
  
  // 재시도 로직은 getCachedOdsayDirections 내부에서 처리됨
  const res = await getCachedOdsayDirections(rsx, rsy, rex, rey, apiKey);
  if (!res.ok) {
    throw new AppError(`[API 내부 에러] ${res.error}`, res.code, 500, false);
  }
  const data = res.data;

  if (!data.result || !data.result.path || data.result.path.length === 0) {
    const err = new Error('대중교통 경로를 찾을 수 없습니다.');
    err.name = 'NoRouteFound';
    throw err;
  }

  // 네이버 지도 스타일의 도보 검색 반경 필터링 적용
  const validPaths = data.result.path.filter((path: any) => {
    let totalWalkTime = 0;
    let firstWalkTime = 0;
    let lastWalkTime = 0;
    let maxTransferWalkTime = 0;

    const hasTransit = path.subPath.some((sp: any) => [1, 2, 4, 5, 6].includes(sp.trafficType));
    if (!hasTransit) return false;

    const isIntercity = path.subPath.some((sp: any) => [4, 5, 6].includes(sp.trafficType));
    const limits = isIntercity ? WALK_LIMITS.INTERCITY : WALK_LIMITS.GENERAL;

    const subPathsList = path.subPath;
    subPathsList.forEach((sp: any, i: number) => {
      if (sp.trafficType === 3) {
        const time = sp.sectionTime || 0;
        totalWalkTime += time;

        if (i === 0) {
          firstWalkTime = time;
        } else if (i === subPathsList.length - 1) {
          lastWalkTime = time;
        } else {
          maxTransferWalkTime = Math.max(maxTransferWalkTime, time);
        }
      }
    });

    // 1) 첫 탑승 정류장까지 도보 초과 시 필터링
    if (firstWalkTime > limits.MAX_WALK_TO_FIRST_STATION) return false;
    // 2) 하차 후 최종 목적지까지 도보 초과 시 필터링
    if (lastWalkTime > limits.MAX_WALK_FROM_LAST_STATION) return false;
    // 3) 환승 시 도보 초과 시 필터링
    if (maxTransferWalkTime > limits.MAX_TRANSFER_WALK) return false;
    // 4) 경로 내 총 도보 시간 합계 초과 시 필터링
    if (totalWalkTime > limits.MAX_TOTAL_WALK) return false;

    return true;
  });

  if (validPaths.length === 0) {
    throw new Error('도보 검색 제한 반경을 초과하여 적절한 대중교통 경로가 없습니다.');
  }

  // 동시 폭주 방지를 위해 validPaths를 chunkAsync로 2개씩 순차 조절 실행
  return chunkAsync(validPaths, async (path: any, pathIdx: number) => {
    const info = path.info;
    const subPaths = path.subPath;

    // 상세 궤적 정보(loadLane) 획득 시도
    let hasDetailedLanes = false;
    let laneList: any[] = [];
    if (info.mapObj) {
      try {
        const mapObjectParam = `0:0@${info.mapObj}`;

        // 재시도 로직은 getCachedOdsayLoadLane 내부에서 처리됨
        let laneData: any = null;
        const laneRes = await getCachedOdsayLoadLane(mapObjectParam, apiKey);
        if (laneRes.ok) {
          laneData = laneRes.data;
        }

        if (laneData && laneData.result && laneData.result.lane) {
          laneList = laneData.result.lane;
          const transitCount = subPaths.filter((sp: any) => [1,2,4,5,6].includes(sp.trafficType)).length;
          if (laneList.length === transitCount) {
            hasDetailedLanes = true;
          } else {
            console.warn(`[directions] path ${pathIdx} loadLane length mismatch (${laneList.length} vs ${transitCount}), ignoring detailed lanes`);
          }
        }
      } catch (e) {
        console.warn(`[directions] path ${pathIdx} loadLane detailed coordinates fetch failed, fallback to station points:`, e);
      }
    }

    let transitIndex = 0;
    const steps: DirectionStep[] = subPaths.map((sp: any, idx: number) => {
      let type: DirectionStep['type'] = 'walk';
      let name = '도보';
      let color = '#E4E4E7'; // 도보 회색
      const stepPathPoints: { lat: number; lng: number }[] = [];

      // start 좌표 추론
      let startLat = parseFloat(sp.startY || sp.y1);
      let startLng = parseFloat(sp.startX || sp.x1);
      if (isNaN(startLat) || isNaN(startLng)) {
        if (idx === 0) {
          startLat = sy;
          startLng = sx;
        } else {
          const prevSp = subPaths[idx - 1];
          if (prevSp.passStopList?.stations?.length > 0) {
            const lastStation = prevSp.passStopList.stations[prevSp.passStopList.stations.length - 1];
            startLat = parseFloat(lastStation.y);
            startLng = parseFloat(lastStation.x);
          } else {
            startLat = parseFloat(prevSp.endY || prevSp.y2 || sy);
            startLng = parseFloat(prevSp.endX || prevSp.x2 || sx);
          }
        }
      }

      // end 좌표 추론
      let endLat = parseFloat(sp.endY || sp.y2);
      let endLng = parseFloat(sp.endX || sp.x2);
      if (isNaN(endLat) || isNaN(endLng)) {
        if (idx === subPaths.length - 1) {
          endLat = ey;
          endLng = ex;
        } else {
          const nextSp = subPaths[idx + 1];
          if (nextSp.passStopList?.stations?.length > 0) {
            const firstStation = nextSp.passStopList.stations[0];
            endLat = parseFloat(firstStation.y);
            endLng = parseFloat(firstStation.x);
          } else {
            endLat = parseFloat(nextSp.startY || nextSp.y1 || ey);
            endLng = parseFloat(nextSp.startX || nextSp.x1 || ex);
          }
        }
      }

      if (sp.trafficType === 1) {
        type = 'subway';
        const laneName = sp.lane?.[0]?.name || '지하철';
        name = cleanSubwayName(laneName);
        color = getSubwayColor(laneName);

        if (hasDetailedLanes && laneList[transitIndex]) {
          const lane = laneList[transitIndex];
          lane.section.forEach((section: any) => {
            section.graphPos.forEach((pos: any) => {
              stepPathPoints.push({ lat: pos.y, lng: pos.x });
            });
          });
        } else if (sp.passStopList && sp.passStopList.stations) {
          sp.passStopList.stations.forEach((station: any) => {
            const lat = parseFloat(station.y);
            const lng = parseFloat(station.x);
            if (!isNaN(lat) && !isNaN(lng)) {
              stepPathPoints.push({ lat, lng });
            }
          });
        }
        transitIndex++;
      } else if (sp.trafficType === 2) {
        type = 'bus';
        const busNo = sp.lane?.[0]?.busNo || '버스';
        const busType = sp.lane?.[0]?.type || 1;
        name = `${busNo}번 버스`;
        color = getBusColor(busType, busNo);

        if (hasDetailedLanes && laneList[transitIndex]) {
          const lane = laneList[transitIndex];
          lane.section.forEach((section: any) => {
            section.graphPos.forEach((pos: any) => {
              stepPathPoints.push({ lat: pos.y, lng: pos.x });
            });
          });
        } else if (sp.passStopList && sp.passStopList.stations) {
          sp.passStopList.stations.forEach((station: any) => {
            const lat = parseFloat(station.y);
            const lng = parseFloat(station.x);
            if (!isNaN(lat) && !isNaN(lng)) {
              stepPathPoints.push({ lat, lng });
            }
          });
        }
        transitIndex++;
      } else if (sp.trafficType === 4 || sp.trafficType === 5 || sp.trafficType === 6) {
        type = sp.trafficType === 4 ? 'train' : 'expressbus';
        if (sp.trafficType === 4) {
          const trainTypes: Record<number, string> = {
            1: 'KTX', 2: '새마을호', 3: '무궁화호', 4: '누리로',
            6: 'ITX-새마을', 7: 'SRT', 8: 'ITX-청춘', 9: 'ITX-마음'
          };
          name = trainTypes[sp.trainType] || '기차';
        } else {
          name = sp.trafficType === 5 ? '고속버스' : '시외버스';
        }
        
        if (type === 'train') {
          color = name.includes('SRT') ? '#582E55' : name.includes('KTX') ? '#003366' : '#2C3E50';
        } else {
          color = '#e60012'; // 고속/시외버스는 빨간색 계열
        }

        if (sp.passStopList && sp.passStopList.stations) {
          sp.passStopList.stations.forEach((station: any) => {
            const lat = parseFloat(station.y);
            const lng = parseFloat(station.x);
            if (!isNaN(lat) && !isNaN(lng)) {
              stepPathPoints.push({ lat, lng });
            }
          });
        }
        transitIndex++;
      } else {
        type = 'walk';
        name = '도보';
        color = '#E4E4E7';

        if (!isNaN(startLat) && !isNaN(startLng)) {
          stepPathPoints.push({ lat: startLat, lng: startLng });
        }
        if (!isNaN(endLat) && !isNaN(endLng)) {
          stepPathPoints.push({ lat: endLat, lng: endLng });
        }
      }

      if (stepPathPoints.length === 0) {
        if (!isNaN(startLat) && !isNaN(startLng)) {
          stepPathPoints.push({ lat: startLat, lng: startLng });
        }
        if (!isNaN(endLat) && !isNaN(endLng)) {
          stepPathPoints.push({ lat: endLat, lng: endLng });
        }
      }

      // 상세 경로 포인트(stepPathPoints)의 방향이 탑승 정류장 -> 하차 정류장 흐름과 반대인 경우 뒤집기
      if (stepPathPoints.length >= 2 && !isNaN(startLat) && !isNaN(startLng) && !isNaN(endLat) && !isNaN(endLng)) {
        const firstPoint = stepPathPoints[0];
        const lastPoint = stepPathPoints[stepPathPoints.length - 1];

        const distNormal =
          haversineDistance(startLat, startLng, firstPoint.lat, firstPoint.lng) +
          haversineDistance(endLat, endLng, lastPoint.lat, lastPoint.lng);

        const distReversed =
          haversineDistance(startLat, startLng, lastPoint.lat, lastPoint.lng) +
          haversineDistance(endLat, endLng, firstPoint.lat, firstPoint.lng);

        if (distReversed < distNormal) {
          stepPathPoints.reverse();
        }
      }

      let startName = sp.startName || '';
      let endName = sp.endName || '';
      if (!startName && sp.passStopList?.stations?.length > 0) {
        startName = sp.passStopList.stations[0].stationName || '';
      }
      if (!endName && sp.passStopList?.stations?.length > 0) {
        endName = sp.passStopList.stations[sp.passStopList.stations.length - 1].stationName || '';
      }

      if (type === 'subway' || type === 'train') {
        if (startName && !startName.endsWith('역')) {
          startName = `${startName}역`;
        }
        if (endName && !endName.endsWith('역')) {
          endName = `${endName}역`;
        }
      }

      let passStopList = undefined;
      if (sp.passStopList && sp.passStopList.stations) {
        passStopList = {
          stationList: sp.passStopList.stations.map((station: any) => ({
            stationName: station.stationName,
            lat: parseFloat(station.y) || undefined,
            lng: parseFloat(station.x) || undefined,
          })),
        };
      }

      return {
        type,
        name,
        duration: sp.sectionTime,
        color,
        pathPoints: stepPathPoints,
        startName: startName || undefined,
        endName: endName || undefined,
        headsign: sp.way || undefined,
        wayCode: sp.wayCode || undefined,
        startLat: !isNaN(startLat) ? startLat : undefined,
        startLng: !isNaN(startLng) ? startLng : undefined,
        endLat: !isNaN(endLat) ? endLat : undefined,
        endLng: !isNaN(endLng) ? endLng : undefined,
        passStopList,
      };
    }).filter((step: DirectionStep) => step.duration > 0);

    const pathPoints: { lat: number; lng: number }[] = [];
    pathPoints.push({ lat: sy, lng: sx });
    steps.forEach((step) => {
      if (step.pathPoints) {
        pathPoints.push(...step.pathPoints);
      }
    });
    pathPoints.push({ lat: ey, lng: ex });

    // 대용량 노선 목록에 대한 직관적인 대안 경로명(예: "2호선 + 360") 빌드
    const transitNames = steps
      .filter(s => s.type !== 'walk')
      .map(s => s.name.replace(' 버스', ''));
    const displayTitle = transitNames.length > 0 
      ? transitNames.join(' → ') 
      : '도보 이동';

    const isIntercity = steps.some(s => s.type === 'train' || s.type === 'expressbus');
    let fare = (info.payment && info.payment > 0) ? info.payment : 0;
    let isFareEstimated = false;

    if (fare === 0) {
      const subPathsPayment = subPaths.reduce((sum: number, sp: any) => sum + (sp.payment || 0), 0);
      if (subPathsPayment > 0) {
        fare = subPathsPayment;
      } else if (!isIntercity) {
        const hasWideAreaBus = steps.some(s => s.type === 'bus' && s.color === '#e60012');
        fare = hasWideAreaBus ? 3000 : 1400;
        isFareEstimated = true;
      }
    }

    return {
      id: `public-${pathIdx}`,
      type: 'public' as const,
      name: displayTitle,
      duration: info.totalTime,
      fare,
      isFareEstimated: isFareEstimated ? true : undefined,
      isIntercity: isIntercity ? true : undefined,
      steps,
      pathPoints,
    };
  }, 2, 150);
}

// 2. 네이버 자동차 경로 호출 함수 (NCP Directions 5)
export async function fetchCarRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<DirectionResult[]> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Naver Directions API ID/Secret이 설정되지 않았습니다.');
  }

  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);

  const url = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${rsx},${rsy}&goal=${rex},${rey}&option=trafast:traoptimal:traavoidtoll`;

  let res;
  try {
    res = await externalFetch(url, {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      },
      next: { revalidate: 3600 }
    });
  } catch (err: any) {
    if (err.status === 408) {
      throw new Error('Naver Directions 5 API Timeout');
    }
    throw err;
  }

  const data = await res.json();

  if (!data.route) {
    const err = new Error('차량 경로를 찾을 수 없습니다.');
    err.name = 'NoRouteFound';
    throw err;
  }

  const results: DirectionResult[] = [];
  const optionsMap = [
    { key: 'trafast', name: '실시간 빠른길' },
    { key: 'traoptimal', name: '실시간 최적길' },
    { key: 'traavoidtoll', name: '무료 도로' }
  ];

  for (const option of optionsMap) {
    const routeArray = data.route[option.key];
    if (routeArray && routeArray.length > 0) {
      const route = routeArray[0];
      const summary = route.summary;
      const durationMin = Math.max(1, Math.round(summary.duration / 1000 / 60)); // ms -> min
      const pathPoints = route.path ? route.path.map(([lng, lat]: [number, number]) => ({ lat, lng })) : [];
      const guide = route.guide ? route.guide.map((g: any) => ({
        instructions: g.instructions,
        distance: g.distance,
        duration: g.duration,
      })) : [];

      results.push({
        id: `car-${option.key}`,
        type: 'car' as const,
        name: option.name,
        duration: durationMin,
        fare: summary.tollFare || 0,
        taxiFare: summary.taxiFare || 0,
        distance: summary.distance / 1000,
        steps: [
          {
            type: 'car',
            name: '차량',
            duration: durationMin,
            color: '#F59E0B',
            pathPoints,
          },
        ],
        pathPoints,
        guide,
      });
    }
  }

  if (results.length === 0) {
    throw new Error('차량 경로를 찾을 수 없습니다.');
  }

  return results;
}

// 3. 네이버 API 호출 실패 대비 Fallback 계산 함수
export function calculateCarFallback(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult {
  const distance = haversineDistance(sy, sx, ey, ex); // km
  const duration = Math.max(3, Math.round((distance / 35) * 60 + 4));
  const estimatedRoadDistance = distance * 1.3;
  const taxiFare = 4800 + Math.round(estimatedRoadDistance * 1100);

  const fallbackPath = [
    { lat: sy, lng: sx },
    { lat: ey, lng: ex },
  ];

  return {
    id: 'car-trafast',
    type: 'car' as const,
    name: '실시간 빠른길(예상)',
    duration,
    fare: 0,
    taxiFare,
    distance: estimatedRoadDistance,
    isEstimated: true, // Fallback 식별 플래그 추가
    steps: [
      {
        type: 'car',
        name: '차량(예상)',
        duration,
        color: '#F59E0B',
        pathPoints: fallbackPath,
      },
    ],
    pathPoints: fallbackPath,
    guide: [
      {
        instructions: '출발지에서 출발',
        distance: 0,
        duration: 0,
      },
      {
        instructions: '목적지 도착',
        distance: Math.round(distance * 1000), // m
        duration: duration * 60 * 1000, // ms
      }
    ],
  };
}

import { DirectionsQueryType } from '../validations/directions';

export async function fetchPublicDirections(params: DirectionsQueryType): Promise<{ public: DirectionResult[] }> {
  const { sx, sy, ex, ey } = params;

  try {
    const publicResults = await fetchPublicTransitOptions(sx, sy, ex, ey);
    return { public: publicResults };
  } catch (error: any) {
    // API 실패 (경로 없음, 네트웍 장애, 서킷 오픈 등 모든 에러) 시 Fallback 반환
    const distanceKm = haversineDistance(sy, sx, ey, ex);
    if (distanceKm > 2.0) {
      const carFallback = calculateCarFallback(sx, sy, ex, ey);
      const fallbackPath = [{ lat: sy, lng: sx }, { lat: ey, lng: ex }];
      return {
        public: [{
          id: 'public-0',
          type: 'public',
          name: '대중교통(예상)',
          duration: Math.round(carFallback.duration * 1.3),
          fare: 1500,
          isEstimated: true, // Fallback 식별 플래그 추가
          steps: [{
            type: 'bus',
            name: '대중교통(예상)',
            duration: Math.round(carFallback.duration * 1.3),
            color: '#0068b7',
            pathPoints: fallbackPath,
          }],
          pathPoints: fallbackPath
        }]
      };
    }
    return { public: [] };
  }
}

export function buildWalkFallbackResults(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  const distanceKm = haversineDistance(sy, sx, ey, ex);
  const fallbackPath = [{ lat: sy, lng: sx }, { lat: ey, lng: ex }];

  const walkDuration = Math.round((distanceKm / 4.5) * 60);
  const bicycleDuration = Math.round((distanceKm / 15) * 60);
  const kickboardDuration = Math.round((distanceKm / 18) * 60);
  const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

  return [
    {
      id: 'walk', type: 'walk', name: '도보', duration: walkDuration, fare: 0, distance: distanceKm,
      steps: [{ type: 'walk', name: '도보', duration: walkDuration, color: '#E4E4E7', pathPoints: fallbackPath }], pathPoints: fallbackPath
    },
    {
      id: 'bicycle', type: 'bicycle', name: '자전거', duration: bicycleDuration, fare: 0, distance: distanceKm,
      steps: [{ type: 'walk', name: '자전거', duration: bicycleDuration, color: '#10B981', pathPoints: fallbackPath }], pathPoints: fallbackPath
    },
    {
      id: 'kickboard', type: 'kickboard', name: '공유 킥보드', duration: kickboardDuration, fare: kickboardFare, distance: distanceKm,
      steps: [{ type: 'walk', name: '공유 킥보드', duration: kickboardDuration, color: '#8B5CF6', pathPoints: fallbackPath }], pathPoints: fallbackPath
    }
  ];
}

const getCachedTMapWalkingRoute = unstable_cache(
  async (sx: number, sy: number, ex: number, ey: number, apiKey: string) => {
    const url = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
    const body = {
      startX: sx,
      startY: sy,
      endX: ex,
      endY: ey,
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: '출발지',
      endName: '목적지'
    };

    const res = await externalFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'appKey': apiKey,
      },
      body: JSON.stringify(body),
    });

    return res.json();
  },
  ['tmap-walking-route-cache'],
  { revalidate: 3600 }
);

async function fetchTMapWalkingRouteDirect(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  apiKey: string
): Promise<any> {
  const url = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';
  const body = {
    startX: sx,
    startY: sy,
    endX: ex,
    endY: ey,
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    startName: '출발지',
    endName: '목적지'
  };

  const res = await externalFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'appKey': apiKey,
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

/**
 * TMAP 내부 자동 스냅 좌표 오차 검증 Probing 루프.
 * 요청 좌표와 TMAP 실제 시작 노드 간 오차가 50m 이상인 경우(절벽/옹벽 우회 스냅)
 * 목적지 방향으로 40m씩 전진하며 교차점을 재타진합니다. (최대 5회)
 */
async function probeTMapSnapPoint(
  initialSnapLng: number,
  initialSnapLat: number,
  destLng: number,
  destLat: number,
  apiKey: string,
  bearDeg: number
): Promise<{ tmapData: any; snappedLng: number; snappedLat: number }> {
  const MAX_ITERATIONS = 5;
  const SNAP_THRESHOLD_KM = 0.05; // 50m
  const ADVANCE_STEP_KM = 0.04;  // 40m

  let snapLng = initialSnapLng;
  let snapLat = initialSnapLat;
  let lastTmapData: any = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    try {
      const tmapData = await fetchTMapWalkingRouteDirect(snapLng, snapLat, destLng, destLat, apiKey);
      lastTmapData = tmapData;

      if (!tmapData || !tmapData.features || !Array.isArray(tmapData.features) || tmapData.features.length === 0) {
        break;
      }

      // 첫 번째 LineString feature에서 TMAP 내부 실제 시작 노드 좌표 추출
      let firstCoord: [number, number] | undefined;
      for (const feature of tmapData.features) {
        if (feature.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 0) {
          firstCoord = feature.geometry.coordinates[0];
          break;
        }
      }

      if (!firstCoord || !Array.isArray(firstCoord) || firstCoord.length < 2) {
        break;
      }

      const [tmapLng, tmapLat] = firstCoord;
      const reqPt = point([snapLng, snapLat]);
      const tmapPt = point([tmapLng, tmapLat]);

      const snapErrorKm = distance(reqPt, tmapPt, { units: 'kilometers' });

      // 조건 1: 거리가 50m 미만인 경우 (성공) -> 즉시 종료
      if (snapErrorKm < SNAP_THRESHOLD_KM) {
        console.log(`[probeTMapSnapPoint] Probing success at step ${i + 1}: snap error = ${Math.round(snapErrorKm * 1000)}m (< 50m)`);
        return { tmapData, snappedLng: snapLng, snappedLat: snapLat };
      }

      console.warn(`[probeTMapSnapPoint] Probing step ${i + 1} failed: snap error = ${Math.round(snapErrorKm * 1000)}m (>= 50m). Advancing 40m towards destination.`);

      // 조건 2: 50m 이상인 경우 -> 40m 전진 후 다음 회차
      const advanced = destination(point([snapLng, snapLat]), ADVANCE_STEP_KM, bearDeg, { units: 'kilometers' });
      const [nextLng, nextLat] = advanced.geometry.coordinates;

      // 목적지에 너무 가까워지면 중단
      const remainingDistKm = distance(advanced, point([destLng, destLat]), { units: 'kilometers' });
      snapLng = nextLng;
      snapLat = nextLat;

      if (remainingDistKm <= ADVANCE_STEP_KM) {
        console.warn('[probeTMapSnapPoint] Reached destination vicinity during probing.');
        break;
      }
    } catch (err) {
      console.error(`[probeTMapSnapPoint] Error during probing step ${i + 1}:`, err);
      break;
    }
  }

  return { tmapData: lastTmapData, snappedLng: snapLng, snappedLat: snapLat };
}

function parseTMapResponse(
  data: any,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (!data || !data.features || data.features.length === 0) {
    throw new Error('TMap API Response has no features');
  }

  const pathPoints: { lat: number; lng: number }[] = [];
  for (const feature of data.features) {
    if (feature.geometry?.type === 'LineString') {
      const coords = feature.geometry.coordinates;
      if (Array.isArray(coords)) {
        for (const coord of coords) {
          if (Array.isArray(coord) && coord.length >= 2) {
            pathPoints.push({ lat: coord[1], lng: coord[0] });
          }
        }
      }
    }
  }

  const cleanPathPoints: { lat: number; lng: number }[] = [];
  for (const pt of pathPoints) {
    if (cleanPathPoints.length === 0) {
      cleanPathPoints.push(pt);
    } else {
      const last = cleanPathPoints[cleanPathPoints.length - 1];
      if (last.lat !== pt.lat || last.lng !== pt.lng) {
        cleanPathPoints.push(pt);
      }
    }
  }

  // 도어투도어 직선거리 보정 연산
  let extraDistanceKm = 0;
  let extraTimeSeconds = 0;
  const finalPathPoints = [...cleanPathPoints];

  let startLinkDistance = 0;
  let endLinkDistance = 0;

  if (cleanPathPoints.length > 0) {
    const tmapFirst = cleanPathPoints[0];
    const tmapLast = cleanPathPoints[cleanPathPoints.length - 1];
    
    startLinkDistance = haversineDistance(sy, sx, tmapFirst.lat, tmapFirst.lng);
    endLinkDistance = haversineDistance(tmapLast.lat, tmapLast.lng, ey, ex);

    // 위치가 완전히 일치하지 않는 경우(10cm 초과 차이) 도어투도어 직선거리 보정 대상으로 판정
    if (startLinkDistance > 0.0001) {
      finalPathPoints.unshift({ lat: sy, lng: sx });
      extraDistanceKm += startLinkDistance;
      extraTimeSeconds += (startLinkDistance / 4.5) * 3600;
    }
    if (endLinkDistance > 0.0001) {
      finalPathPoints.push({ lat: ey, lng: ex });
      extraDistanceKm += endLinkDistance;
      extraTimeSeconds += (endLinkDistance / 4.5) * 3600;
    }
  } else {
    finalPathPoints.push({ lat: sy, lng: sx }, { lat: ey, lng: ex });
  }

  const firstProps = data.features[0]?.properties || {};
  const totalDistanceMeters = firstProps.totalDistance ?? 0;
  const totalTimeSeconds = firstProps.totalTime ?? 0;

  const baseDistanceKm = totalDistanceMeters > 0 
    ? totalDistanceMeters / 1000 
    : haversineDistance(sy, sx, ey, ex);

  const baseTimeSeconds = totalTimeSeconds > 0 
    ? totalTimeSeconds 
    : (baseDistanceKm / 4.5) * 3600;

  const distanceKm = baseDistanceKm + extraDistanceKm;
  const walkDuration = Math.max(1, Math.round((baseTimeSeconds + extraTimeSeconds) / 60));

  const guide: any[] = [];
  for (const feature of data.features) {
    if (feature.geometry?.type === 'Point' && feature.properties?.description) {
      const props = feature.properties;
      const coords = feature.geometry.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        guide.push({
          instructions: props.description,
          distance: props.distance ?? 0,
          duration: (props.time ?? 0) * 1000,
          startLat: coords[1],
          startLng: coords[0]
        });
      }
    }
  }

  // 도어투도어 턴바이턴 가이드 노드 추가
  if (cleanPathPoints.length > 0) {
    if (startLinkDistance > 0.0001) {
      guide.unshift({
        instructions: '출발지에서 도로(출입구)까지 이동',
        distance: Math.round(startLinkDistance * 1000),
        duration: Math.round((startLinkDistance / 4.5) * 3600 * 1000),
        startLat: sy,
        startLng: sx
      });
    }

    if (endLinkDistance > 0.0001) {
      const arrivalIdx = guide.findIndex(g => g.instructions.includes('도착'));
      const endGuideNode = {
        instructions: '도로(출입구)에서 목적지까지 이동',
        distance: Math.round(endLinkDistance * 1000),
        duration: Math.round((endLinkDistance / 4.5) * 3600 * 1000),
        startLat: cleanPathPoints[cleanPathPoints.length - 1].lat,
        startLng: cleanPathPoints[cleanPathPoints.length - 1].lng
      };

      if (arrivalIdx !== -1) {
        guide.splice(arrivalIdx, 0, endGuideNode);
      } else {
        guide.push(endGuideNode);
      }
    }
  }

  const bicycleDuration = Math.max(1, Math.round((distanceKm / 15) * 60));
  const kickboardDuration = Math.max(1, Math.round((distanceKm / 18) * 60));
  const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

  return [
    {
      id: 'walk',
      type: 'walk' as const,
      name: '도보',
      duration: walkDuration,
      fare: 0,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '도보',
          duration: walkDuration,
          color: '#E4E4E7',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        }
      ],
      pathPoints: finalPathPoints,
      guide: guide.length > 0 ? guide : undefined
    },
    {
      id: 'bicycle',
      type: 'bicycle' as const,
      name: '자전거',
      duration: bicycleDuration,
      fare: 0,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '자전거',
          duration: bicycleDuration,
          color: '#10B981',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        }
      ],
      pathPoints: finalPathPoints
    },
    {
      id: 'kickboard',
      type: 'kickboard' as const,
      name: '공유 킥보드',
      duration: kickboardDuration,
      fare: kickboardFare,
      distance: distanceKm,
      steps: [
        {
          type: 'walk' as const,
          name: '공유 킥보드',
          duration: kickboardDuration,
          color: '#8B5CF6',
          pathPoints: finalPathPoints,
          startLat: sy,
          startLng: sx,
          endLat: ey,
          endLng: ex,
        }
      ],
      pathPoints: finalPathPoints
    }
  ];
}

export async function fetchCarWalkDirections(params: DirectionsQueryType): Promise<CarWalkDirectionsResult> {
  const { sx, sy, ex, ey } = params;

  // 1. 거리 제한 검증 (직선거리 10km 이상시 API 호출 금지)
  const straightDistKm = haversineDistance(sy, sx, ey, ex);
  if (straightDistKm >= 10.0) {
    return {
      status: 'EXCEED_LIMIT',
      message: '도보 탐색 거리는 10km 이내만 지원합니다.'
    };
  }

  // 2. 지형 기반 좌표 보정 (Snap to Road / Hiking Trail)
  const isStartNonWalkable = isNonWalkableArea(sx, sy);
  const isEndNonWalkable = isNonWalkableArea(ex, ey);

  let effectiveSx = sx;
  let effectiveSy = sy;
  let effectiveEx = ex;
  let effectiveEy = ey;

  let snappedStartCoords: { lng: number; lat: number } | undefined;
  let snappedEndCoords: { lng: number; lat: number } | undefined;

  let startHikingPolyline: { lat: number; lng: number }[] | undefined;
  let endHikingPolyline: { lat: number; lng: number }[] | undefined;

  if (isStartNonWalkable) {
    const trailResult = getHikingTrailPolyline({ lng: sx, lat: sy }, { lng: ex, lat: ey });
    if (trailResult && trailResult.polyline.length >= 2) {
      effectiveSx = trailResult.snappedStart.lng;
      effectiveSy = trailResult.snappedStart.lat;
      snappedStartCoords = trailResult.snappedStart;
      startHikingPolyline = trailResult.polyline;
    } else {
      const snapped = await getNearestRoadCoords(sx, sy, ex, ey);
      effectiveSx = snapped.lng;
      effectiveSy = snapped.lat;
      snappedStartCoords = snapped;
      startHikingPolyline = [
        { lat: sy, lng: sx },
        { lat: effectiveSy, lng: effectiveSx }
      ];
    }
  }

  if (isEndNonWalkable) {
    const trailResult = getHikingTrailPolyline({ lng: ex, lat: ey }, { lng: sx, lat: sy });
    if (trailResult && trailResult.polyline.length >= 2) {
      effectiveEx = trailResult.snappedStart.lng;
      effectiveEy = trailResult.snappedStart.lat;
      snappedEndCoords = trailResult.snappedStart;
      endHikingPolyline = [...trailResult.polyline].reverse();
    } else {
      const snapped = await getNearestRoadCoords(ex, ey, sx, sy);
      effectiveEx = snapped.lng;
      effectiveEy = snapped.lat;
      snappedEndCoords = snapped;
      endHikingPolyline = [
        { lat: effectiveEy, lng: effectiveEx },
        { lat: ey, lng: ex }
      ];
    }
  }

  // 3. 상황별 snapMeta 설정
  let snapType: SnapType = 'NONE';
  let message = '';

  if (isStartNonWalkable && isEndNonWalkable) {
    snapType = 'BOTH';
    message = '출발지와 도착지 모두 가장 가까운 도로/등산로를 기준으로 경로를 탐색했습니다.';
  } else if (isStartNonWalkable) {
    snapType = 'START';
    message = '출발지 근처 산림청 등산로 및 도로를 기준으로 경로를 탐색했습니다.';
  } else if (isEndNonWalkable) {
    snapType = 'END';
    message = '도착지 근처 산림청 등산로 및 도로를 기준으로 경로를 탐색했습니다.';
  }

  const snapMeta: SnapMeta = {
    snapType,
    ...(snapType !== 'NONE' ? { message } : {}),
    ...(snappedStartCoords ? { snappedStartCoords } : {}),
    ...(snappedEndCoords ? { snappedEndCoords } : {}),
  };
  
  // 도보는 정밀도가 중요하므로 소수점 8자리(약 1.1mm 초정밀 오차범위)로 반올림하여 TMap API에 전송 및 캐싱
  const roundCoordWalk = (val: number) => Math.round(val * 100000000) / 100000000;
  const roundCoordCar = (val: number) => Math.round(val * 10000) / 10000;
  
  const wsx = roundCoordWalk(effectiveSx);
  const wsy = roundCoordWalk(effectiveSy);
  const wex = roundCoordWalk(effectiveEx);
  const wey = roundCoordWalk(effectiveEy);

  const csx = roundCoordCar(effectiveSx);
  const csy = roundCoordCar(effectiveSy);
  const cex = roundCoordCar(effectiveEx);
  const cey = roundCoordCar(effectiveEy);

  let walkResults: DirectionResult[];

  const apiKey = process.env.TMAP_API_KEY;
  if (!apiKey) {
    console.warn('[serverDirectionsService] TMAP_API_KEY is not defined. Using fallback straight line calculations.');
    walkResults = buildWalkFallbackResults(sx, sy, ex, ey);
  } else {
    try {
      let tmapData: any;
      let finalSx = wsx;
      let finalSy = wsy;
      let finalEx = wex;
      let finalEy = wey;

      if (isStartNonWalkable || isEndNonWalkable) {
        const bearDeg = bearing(point([effectiveSx, effectiveSy]), point([effectiveEx, effectiveEy]));
        const probeRes = await probeTMapSnapPoint(effectiveSx, effectiveSy, effectiveEx, effectiveEy, apiKey, bearDeg);
        tmapData = probeRes.tmapData;
        finalSx = probeRes.snappedLng;
        finalSy = probeRes.snappedLat;

        effectiveSx = finalSx;
        effectiveSy = finalSy;
      } else {
        tmapData = await getCachedTMapWalkingRoute(wsx, wsy, wex, wey, apiKey);
      }

      walkResults = parseTMapResponse(tmapData, finalSx, finalSy, finalEx, finalEy);

      // 산/비보행 구역이 포함되어 구간 분할이 필요한 경우 산림청 등산로 Polyline 또는 보정 구간 조합
      if (isStartNonWalkable || isEndNonWalkable) {
        walkResults = walkResults.map((result) => {
          let updatedPathPoints = [...result.pathPoints];
          let addedDistKm = 0;
          let addedTimeMin = 0;

          // 1) 출발지 비보행 구역 -> 산림청 등산로 Polyline
          let startStraightSection: { lat: number; lng: number }[] | undefined;
          if (isStartNonWalkable) {
            startStraightSection = startHikingPolyline || [
              { lat: sy, lng: sx },
              { lat: effectiveSy, lng: effectiveSx }
            ];
            let dist = 0;
            for (let i = 0; i < startStraightSection.length - 1; i++) {
              dist += haversineDistance(
                startStraightSection[i].lat, startStraightSection[i].lng,
                startStraightSection[i + 1].lat, startStraightSection[i + 1].lng
              );
            }
            const timeMin = Math.round((dist / 4.5) * 60);
            addedDistKm += dist;
            addedTimeMin += timeMin;

            // pathPoints 중복 제거하며 맨 앞에 등산로 Polyline 합침
            const firstTmap = updatedPathPoints[0];
            const lastStartPoly = startStraightSection[startStraightSection.length - 1];
            if (
              firstTmap &&
              Math.abs(firstTmap.lat - lastStartPoly.lat) < 1e-5 &&
              Math.abs(firstTmap.lng - lastStartPoly.lng) < 1e-5
            ) {
              updatedPathPoints = [...startStraightSection, ...updatedPathPoints.slice(1)];
            } else {
              updatedPathPoints = [...startStraightSection, ...updatedPathPoints];
            }
          }

          // 2) 탈출 도로 좌표 -> 도착지 비보행 구역 산림청 등산로 Polyline
          let endStraightSection: { lat: number; lng: number }[] | undefined;
          if (isEndNonWalkable) {
            endStraightSection = endHikingPolyline || [
              { lat: effectiveEy, lng: effectiveEx },
              { lat: ey, lng: ex }
            ];
            let dist = 0;
            for (let i = 0; i < endStraightSection.length - 1; i++) {
              dist += haversineDistance(
                endStraightSection[i].lat, endStraightSection[i].lng,
                endStraightSection[i + 1].lat, endStraightSection[i + 1].lng
              );
            }
            const timeMin = Math.round((dist / 4.5) * 60);
            addedDistKm += dist;
            addedTimeMin += timeMin;

            const lastIdx = updatedPathPoints.length - 1;
            const firstEndPoly = endStraightSection[0];
            if (
              lastIdx >= 0 &&
              Math.abs(updatedPathPoints[lastIdx].lat - firstEndPoly.lat) < 1e-5 &&
              Math.abs(updatedPathPoints[lastIdx].lng - firstEndPoly.lng) < 1e-5
            ) {
              updatedPathPoints = [...updatedPathPoints, ...endStraightSection.slice(1)];
            } else {
              updatedPathPoints = [...updatedPathPoints, ...endStraightSection];
            }
          }

          // 등산로 구간 정보 설정 (출발지 또는 도착지 산 탈출 등산로)
          const straightSection = startStraightSection || endStraightSection;
          const isStraightSectionAtEnd = isEndNonWalkable && !isStartNonWalkable;

          // steps의 pathPoints 및 첫/끝 좌표 보정
          const updatedSteps = result.steps.map((step, idx) => {
            if (idx === 0 && isStartNonWalkable) {
              return {
                ...step,
                startLat: sy,
                startLng: sx,
                pathPoints: updatedPathPoints
              };
            }
            if (idx === result.steps.length - 1 && isEndNonWalkable) {
              return {
                ...step,
                endLat: ey,
                endLng: ex,
                pathPoints: updatedPathPoints
              };
            }
            return {
              ...step,
              pathPoints: updatedPathPoints
            };
          });

          return {
            ...result,
            duration: result.duration + addedTimeMin,
            distance: (result.distance ?? 0) + addedDistKm,
            pathPoints: updatedPathPoints,
            steps: updatedSteps,
            ...(straightSection ? { straightSection } : {}),
            ...(isStraightSectionAtEnd ? { isStraightSectionAtEnd: true } : {})
          };
        });
      }
    } catch (error) {
      console.warn('[serverDirectionsService] TMap Walking API failed, using fallback.', error);
      const hasHikingTrail = !!(startHikingPolyline || endHikingPolyline);
      if (hasHikingTrail) {
        let combinedPath: { lat: number; lng: number }[] = [];
        
        if (startHikingPolyline && startHikingPolyline.length >= 1) {
          combinedPath.push(...startHikingPolyline);
        } else {
          combinedPath.push({ lat: sy, lng: sx });
        }
        
        if (endHikingPolyline && endHikingPolyline.length >= 1) {
          const lastPoint = combinedPath[combinedPath.length - 1];
          const firstEnd = endHikingPolyline[0];
          if (Math.abs(lastPoint.lat - firstEnd.lat) > 1e-6 || Math.abs(lastPoint.lng - firstEnd.lng) > 1e-6) {
            combinedPath.push(...endHikingPolyline);
          } else {
            combinedPath.push(...endHikingPolyline.slice(1));
          }
        } else {
          const lastPoint = combinedPath[combinedPath.length - 1];
          if (Math.abs(lastPoint.lat - ey) > 1e-6 || Math.abs(lastPoint.lng - ex) > 1e-6) {
            combinedPath.push({ lat: ey, lng: ex });
          }
        }

        const cleanPathPoints: { lat: number; lng: number }[] = [];
        for (const pt of combinedPath) {
          if (cleanPathPoints.length === 0) {
            cleanPathPoints.push(pt);
          } else {
            const last = cleanPathPoints[cleanPathPoints.length - 1];
            if (Math.abs(last.lat - pt.lat) > 1e-7 || Math.abs(last.lng - pt.lng) > 1e-7) {
              cleanPathPoints.push(pt);
            }
          }
        }

        let totalDistanceKm = 0;
        for (let i = 0; i < cleanPathPoints.length - 1; i++) {
          totalDistanceKm += haversineDistance(
            cleanPathPoints[i].lat, cleanPathPoints[i].lng,
            cleanPathPoints[i + 1].lat, cleanPathPoints[i + 1].lng
          );
        }

        const walkDuration = Math.max(1, Math.round((totalDistanceKm / 4.5) * 60));
        const bicycleDuration = Math.max(1, Math.round((totalDistanceKm / 15) * 60));
        const kickboardDuration = Math.max(1, Math.round((totalDistanceKm / 18) * 60));
        const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

        const straightSection = startHikingPolyline || endHikingPolyline;
        const isStraightSectionAtEnd = !!(endHikingPolyline && !startHikingPolyline);

        walkResults = [
          {
            id: 'walk',
            type: 'walk' as const,
            name: '도보(우회)',
            duration: walkDuration,
            fare: 0,
            distance: totalDistanceKm,
            isEstimated: true,
            steps: [
              {
                type: 'walk' as const,
                name: '도보(우회)',
                duration: walkDuration,
                color: '#E4E4E7',
                pathPoints: cleanPathPoints,
                startLat: sy,
                startLng: sx,
                endLat: ey,
                endLng: ex,
              }
            ],
            pathPoints: cleanPathPoints,
            ...(straightSection ? { straightSection } : {}),
            ...(isStraightSectionAtEnd ? { isStraightSectionAtEnd: true } : {})
          },
          {
            id: 'bicycle',
            type: 'bicycle' as const,
            name: '자전거(우회)',
            duration: bicycleDuration,
            fare: 0,
            distance: totalDistanceKm,
            isEstimated: true,
            steps: [
              {
                type: 'walk' as const,
                name: '자전거(우회)',
                duration: bicycleDuration,
                color: '#10B981',
                pathPoints: cleanPathPoints,
                startLat: sy,
                startLng: sx,
                endLat: ey,
                endLng: ex,
              }
            ],
            pathPoints: cleanPathPoints
          },
          {
            id: 'kickboard',
            type: 'kickboard' as const,
            name: '공유 킥보드(우회)',
            duration: kickboardDuration,
            fare: kickboardFare,
            distance: totalDistanceKm,
            isEstimated: true,
            steps: [
              {
                type: 'walk' as const,
                name: '공유 킥보드(우회)',
                duration: kickboardDuration,
                color: '#8B5CF6',
                pathPoints: cleanPathPoints,
                startLat: sy,
                startLng: sx,
                endLat: ey,
                endLng: ex,
              }
            ],
            pathPoints: cleanPathPoints
          }
        ];
      } else {
        walkResults = buildWalkFallbackResults(sx, sy, ex, ey);
      }
    }
  }

  let carResults: DirectionResult[];
  try {
    carResults = await fetchCarRoute(csx, csy, cex, cey);
  } catch (error: any) {
    // 모든 차량 탐색 실패 시 Fallback 반환
    carResults = [calculateCarFallback(sx, sy, ex, ey)];
  }

  return {
    car: carResults,
    walk: walkResults,
    snapMeta
  };
}

