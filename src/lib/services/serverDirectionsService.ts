import type { DirectionResult, DirectionStep, DirectionsApiResponse } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { externalFetch } from '@/lib/utils/externalFetch';
import { SUBWAY_COLORS, BUS_COLORS, ODSAY_BUS_TYPES } from '@/constants/colors';
import { WALK_LIMITS } from '@/constants/transit';

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
  ey: number,
  referer?: string
): Promise<DirectionResult[]> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new Error('ODsay API Key가 설정되지 않았습니다.');
  }

  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(apiKey)}&SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}`;
  
  let data: any;
  const attempts = 3;
  let delayTime = 200;

  const getCachedDirections = unstable_cache(
    async (ref?: string) => {
      const headers: Record<string, string> = {};
      if (ref) {
        headers['Referer'] = ref;
      }
      const res = await externalFetch(url, { cache: 'no-store', headers });
      return await res.json();
    },
    [
      'odsay-directions-pubtrans',
      sx.toFixed(3),
      sy.toFixed(3),
      ex.toFixed(3),
      ey.toFixed(3)
    ],
    { revalidate: 3600 }
  );

  for (let i = 0; i < attempts; i++) {
    try {
      data = await getCachedDirections(referer);
      break;
    } catch (err: any) {
      const isRateLimit = err.status === 429 || err.code === '429' || err.message?.includes('Requests');
      const isTimeout = err.status === 408 || err.message?.includes('timeout');
      
      if (isRateLimit || isTimeout) {
        if (i < attempts - 1) {
          console.warn(`[directions] ODsay API retry. (${isRateLimit ? '429' : 'timeout'}) Retrying in ${delayTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayTime));
          delayTime *= 2;
          continue;
        }
      }
      throw err;
    }
  }

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

  // 모든 경로를 파싱하여 DirectionResult[] 구성
  const promises = validPaths.map(async (path: any, pathIdx: number) => {
    const info = path.info;
    const subPaths = path.subPath;

    // 상세 궤적 정보(loadLane) 획득 시도
    let hasDetailedLanes = false;
    let laneList: any[] = [];
    if (info.mapObj) {
      try {
        const mapObjectParam = `0:0@${info.mapObj}`;
        const laneUrl = `https://api.odsay.com/v1/api/loadLane?apiKey=${encodeURIComponent(apiKey)}&mapObject=${encodeURIComponent(mapObjectParam)}`;
        
        const getCachedLoadLane = unstable_cache(
          async (ref?: string) => {
            const headers: Record<string, string> = {};
            if (ref) {
              headers['Referer'] = ref;
            }
            const laneRes = await externalFetch(laneUrl, { cache: 'no-store', headers });
            return await laneRes.json();
          },
          ['odsay-loadlane', mapObjectParam],
          { revalidate: 3600 }
        );

        const laneData = await getCachedLoadLane(referer);
        if (laneData.result && laneData.result.lane) {
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
  });

  return Promise.all(promises);
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

  const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${sx},${sy}&goal=${ex},${ey}&option=trafast:traoptimal:traavoidtoll`;

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

export async function fetchPublicDirections(params: DirectionsQueryType, referer?: string): Promise<{ public: DirectionResult[] }> {
  const { sx, sy, ex, ey } = params;

  try {
    const publicResults = await fetchPublicTransitOptions(sx, sy, ex, ey, referer);
    return { public: publicResults };
  } catch (error: any) {
    if (error.name === 'NoRouteFound' || error.message?.includes('찾을 수 없습니다')) {
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
    throw error;
  }
}

export async function fetchCarWalkDirections(params: DirectionsQueryType): Promise<{ car: DirectionResult[], walk: DirectionResult[] }> {
  const { sx, sy, ex, ey } = params;
  const roundCoord = (val: number) => Math.round(val * 10000) / 10000;
  const cacheParams = { rsx: roundCoord(sx), rsy: roundCoord(sy), rex: roundCoord(ex), rey: roundCoord(ey) };
  const distanceKm = haversineDistance(sy, sx, ey, ex);
  const fallbackPath = [{ lat: sy, lng: sx }, { lat: ey, lng: ex }];

  const walkDuration = Math.round((distanceKm / 4.5) * 60);
  const bicycleDuration = Math.round((distanceKm / 15) * 60);
  const kickboardDuration = Math.round((distanceKm / 18) * 60);
  const kickboardFare = 1000 + Math.round(kickboardDuration * 150);

  const walkResults: DirectionResult[] = [
    {
      id: 'walk', type: 'walk', name: '도보', duration: walkDuration, fare: 0,
      steps: [{ type: 'walk', name: '도보', duration: walkDuration, color: '#E4E4E7', pathPoints: fallbackPath }], pathPoints: fallbackPath
    },
    {
      id: 'bicycle', type: 'bicycle', name: '자전거', duration: bicycleDuration, fare: 0,
      steps: [{ type: 'walk', name: '자전거', duration: bicycleDuration, color: '#10B981', pathPoints: fallbackPath }], pathPoints: fallbackPath
    },
    {
      id: 'kickboard', type: 'kickboard', name: '공유 킥보드', duration: kickboardDuration, fare: kickboardFare,
      steps: [{ type: 'walk', name: '공유 킥보드', duration: kickboardDuration, color: '#8B5CF6', pathPoints: fallbackPath }], pathPoints: fallbackPath
    }
  ];

  try {
    const carResults = await fetchCarRoute(sx, sy, ex, ey);
    return { car: carResults, walk: walkResults };
  } catch (error: any) {
    if (error.name === 'NoRouteFound' || error.message?.includes('찾을 수 없습니다')) {
      return {
        car: [calculateCarFallback(sx, sy, ex, ey)],
        walk: walkResults
      };
    }
    throw error;
  }
}

