import { NextRequest, NextResponse } from 'next/server';

interface DirectionStep {
  type: 'walk' | 'subway' | 'bus' | 'car';
  name: string;
  duration: number;
  color?: string;
  pathPoints?: { lat: number; lng: number }[];
}

interface DirectionResult {
  duration: number; // 분
  fare: number; // 원
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: {
    instructions: string;
    distance: number;
    duration: number;
  }[];
}

interface DirectionsApiResponse {
  primary: DirectionResult;
  alternatives: {
    type: 'taxi' | 'walk' | 'public' | 'car';
    name: string;
    duration: number;
    fare?: number;
  }[];
}

// 두 좌표 간 직선 거리 계산 (Haversine 공식)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
function getSubwayColor(laneName: string): string {
  if (laneName.includes('1호선')) return '#0052A4';
  if (laneName.includes('2호선')) return '#00A84D';
  if (laneName.includes('3호선')) return '#EF7C1C';
  if (laneName.includes('4호선')) return '#00A5DE';
  if (laneName.includes('5호선')) return '#996CAC';
  if (laneName.includes('6호선')) return '#CD7C2F';
  if (laneName.includes('7호선')) return '#747F28';
  if (laneName.includes('8호선')) return '#E6186C';
  if (laneName.includes('9호선')) return '#BDB092';
  if (laneName.includes('수인분당')) return '#E0A100';
  if (laneName.includes('신분당')) return '#D4003B';
  if (laneName.includes('경의중앙')) return '#77C4A3';
  if (laneName.includes('공항철도')) return '#0090D2';
  return '#00A84D';
}

// 버스 색상 매핑 (ODsay type 코드 및 버스 번호 기반)
function getBusColor(busType: number, laneName: string): string {
  // ODsay 버스 타입 코드 매핑
  // 4: 고속/급행, 14: 광역
  if (busType === 14 || busType === 4) return '#e60012'; // 빨간색 (광역/급행)
  // 3: 마을, 12: 지선
  if (busType === 12 || busType === 3) return '#33b35a'; // 초록색 (지선/마을)
  // 13: 순환
  if (busType === 13) return '#f9a825'; // 노란색 (순환)
  // 11: 간선, 2: 좌석
  if (busType === 11 || busType === 2) return '#0068b7'; // 파란색 (간선/좌석)

  // fallback: 버스 번호나 텍스트 기반 매핑
  if (laneName.includes('광역') || laneName.includes('급행') || laneName.includes('red') || laneName.includes('M')) return '#e60012';
  if (laneName.includes('지선') || laneName.includes('green') || laneName.includes('마을')) return '#33b35a';
  if (laneName.includes('순환') || laneName.includes('yellow')) return '#f9a825';
  return '#0068b7';
}

// 1. ODsay 대중교통 경로 호출 함수
async function fetchPublicTransit(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<DirectionResult> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new Error('ODsay API Key가 설정되지 않았습니다.');
  }

  const url = `https://api.odsay.com/v1/api/searchPubTransPathT?apiKey=${encodeURIComponent(apiKey)}&SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}`;
  
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`ODsay API Error: status ${res.status}`);
  }
  const data = await res.json();

  if (!data.result || !data.result.path || data.result.path.length === 0) {
    throw new Error('대중교통 경로를 찾을 수 없습니다.');
  }

  // 네이버 지도 스타일의 도보 검색 반경 필터링 적용
  const validPaths = data.result.path.filter((path: any) => {
    let totalWalkTime = 0;
    let firstWalkTime = 0;
    let lastWalkTime = 0;
    let maxTransferWalkTime = 0;

    const hasTransit = path.subPath.some((sp: any) => sp.trafficType === 1 || sp.trafficType === 2);
    if (!hasTransit) return false;

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

    // 1) 첫 탑승 정류장까지 도보 15분(약 1km) 초과 시 필터링
    if (firstWalkTime > 15) return false;
    // 2) 하차 후 최종 목적지까지 도보 15분(약 1km) 초과 시 필터링
    if (lastWalkTime > 15) return false;
    // 3) 환승 시 도보 10분 초과 시 필터링
    if (maxTransferWalkTime > 10) return false;
    // 4) 경로 내 총 도보 시간 합계 25분 초과 시 필터링
    if (totalWalkTime > 25) return false;

    return true;
  });

  if (validPaths.length === 0) {
    throw new Error('도보 검색 제한 반경을 초과하여 적절한 대중교통 경로가 없습니다.');
  }

  // 필터링을 통과한 최적 경로 선택
  const bestPath = validPaths[0];
  const info = bestPath.info;
  const subPaths = bestPath.subPath;

  // 상세 궤적 정보(loadLane) 획득 시도
  let hasDetailedLanes = false;
  let laneList: any[] = [];
  if (info.mapObj) {
    try {
      const mapObjectParam = `0:0@${info.mapObj}`;
      const laneUrl = `https://api.odsay.com/v1/api/loadLane?apiKey=${encodeURIComponent(apiKey)}&mapObject=${encodeURIComponent(mapObjectParam)}`;
      const laneRes = await fetch(laneUrl, { next: { revalidate: 3600 } });
      if (laneRes.ok) {
        const laneData = await laneRes.json();
        if (laneData.result && laneData.result.lane) {
          laneList = laneData.result.lane;
          hasDetailedLanes = true;
        }
      }
    } catch (e) {
      console.warn('[directions] loadLane detailed coordinates fetch failed, fallback to station points:', e);
    }
  }

  let transitIndex = 0;
  const steps: DirectionStep[] = subPaths.map((sp: any, idx: number) => {
    let type: 'walk' | 'subway' | 'bus' | 'car' = 'walk';
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
      name = laneName;
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

    return {
      type,
      name,
      duration: sp.sectionTime,
      color,
      pathPoints: stepPathPoints,
    };
  }).filter((step: DirectionStep) => step.duration > 0);

  // 전체 pathPoints 플래튼 처리 (기존 맵 뷰포트 맞춤 등에 호환되도록 제공)
  const pathPoints: { lat: number; lng: number }[] = [];
  pathPoints.push({ lat: sy, lng: sx });
  steps.forEach((step) => {
    if (step.pathPoints) {
      pathPoints.push(...step.pathPoints);
    }
  });
  pathPoints.push({ lat: ey, lng: ex });

  return {
    duration: info.totalTime,
    fare: info.payment || 0,
    steps,
    pathPoints,
  };
}

// 2. 네이버 자동차 경로 호출 함수 (NCP Directions 5)
async function fetchCarRoute(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): Promise<DirectionResult> {
  const clientId = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Naver Directions API ID/Secret이 설정되지 않았습니다.');
  }

  const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${sx},${sy}&goal=${ex},${ey}&option=trafast`;

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Naver API Error: status ${res.status}, body ${errorText}`);
  }

  const data = await res.json();

  if (!data.route || !data.route.trafast || data.route.trafast.length === 0) {
    throw new Error('차량 경로를 찾을 수 없습니다.');
  }

  const route = data.route.trafast[0];
  const summary = route.summary;
  const durationMin = Math.max(1, Math.round(summary.duration / 1000 / 60)); // ms -> min
  const pathPoints = route.path ? route.path.map(([lng, lat]: [number, number]) => ({ lat, lng })) : [];
  const guide = route.guide ? route.guide.map((g: any) => ({
    instructions: g.instructions,
    distance: g.distance,
    duration: g.duration,
  })) : [];

  return {
    duration: durationMin,
    fare: summary.tollFare || 0,
    steps: [
      {
        type: 'car',
        name: '차량',
        duration: durationMin,
        color: '#F59E0B', // 노란색/주황색 계열
        pathPoints,
      },
    ],
    pathPoints,
    guide,
  };
}

// 3. 네이버 API 호출 실패 및 구독 미신청 대비 Fallback 계산 함수
function calculateCarFallback(
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult {
  const distance = haversineDistance(sy, sx, ey, ex); // km

  // 가상의 자동차 예상 속도: 35 km/h
  // 소요시간(분) = (거리 / 속도) * 60 + 신호 대기/차선 변경 가산 시간(최소 4분)
  const duration = Math.max(3, Math.round((distance / 35) * 60 + 4));

  // 예상 택시 요금 계산: 기본 요금 4,800원 + 1km 당 약 1,100원 추가 가산
  const taxiFare = 4800 + Math.round(distance * 1100);

  const fallbackPath = [
    { lat: sy, lng: sx },
    { lat: ey, lng: ex },
  ];

  return {
    duration,
    fare: taxiFare, // 자동차 경로 결과의 요금은 택시 요금을 기반으로 노출
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sxStr = searchParams.get('sx');
  const syStr = searchParams.get('sy');
  const exStr = searchParams.get('ex');
  const eyStr = searchParams.get('ey');
  const type = searchParams.get('type') || 'public'; // 'public' | 'car'

  if (!sxStr || !syStr || !exStr || !eyStr) {
    return NextResponse.json(
      { error: '출발지(sx, sy)와 도착지(ex, ey) 좌표가 필요합니다.' },
      { status: 400 }
    );
  }

  const sx = parseFloat(sxStr);
  const sy = parseFloat(syStr);
  const ex = parseFloat(exStr);
  const ey = parseFloat(eyStr);

  if (isNaN(sx) || isNaN(sy) || isNaN(ex) || isNaN(ey)) {
    return NextResponse.json(
      { error: '좌표는 올바른 숫자 포맷이어야 합니다.' },
      { status: 400 }
    );
  }

  try {
    let primaryResult: DirectionResult;

    // 주 이동 수단 계산
    if (type === 'car') {
      try {
        primaryResult = await fetchCarRoute(sx, sy, ex, ey);
      } catch (err) {
        console.warn('[directions] Naver Directions API failed, using fallback:', err instanceof Error ? err.message : err);
        primaryResult = calculateCarFallback(sx, sy, ex, ey);
      }
    } else {
      // public 대중교통
      try {
        primaryResult = await fetchPublicTransit(sx, sy, ex, ey);
      } catch (err) {
        console.warn('[directions] ODsay API failed, using fallback:', err instanceof Error ? err.message : err);
        // 대중교통 API 실패 시 차량 Fallback 요율과 도보 가산을 조합한 Fallback 제공
        const carFallback = calculateCarFallback(sx, sy, ex, ey);
        const fallbackPath = [
          { lat: sy, lng: sx },
          { lat: ey, lng: ex },
        ];
        primaryResult = {
          duration: Math.round(carFallback.duration * 1.3), // 대중교통은 보통 차량보다 1.3배 더 소요됨
          fare: 1500, // 기본 버스/지하철 단일요금 수준
          steps: [
            {
              type: 'bus',
              name: '대중교통(예상)',
              duration: Math.round(carFallback.duration * 1.3),
              color: '#0068b7',
              pathPoints: fallbackPath,
            }
          ],
          pathPoints: fallbackPath
        };
      }
    }

    // 대안 경로 구성 (아코디언 토글용)
    const distanceKm = haversineDistance(sy, sx, ey, ex);
    const alternatives: DirectionsApiResponse['alternatives'] = [];

    if (type === 'public') {
      // 1) 대안: 택시 (차량 경로 또는 Fallback 이용)
      let taxiDuration = 0;
      let taxiFare = 0;
      try {
        const carRoute = await fetchCarRoute(sx, sy, ex, ey);
        taxiDuration = carRoute.duration;
        // 네이버 Directions 5 요율은 API에 따라 taxiFare가 없는 경우 택시 Fallback 공식으로 계산
        taxiFare = 4800 + Math.round(distanceKm * 1100);
      } catch (e) {
        const carFallback = calculateCarFallback(sx, sy, ex, ey);
        taxiDuration = carFallback.duration;
        taxiFare = carFallback.fare;
      }
      alternatives.push({
        type: 'taxi',
        name: '택시',
        duration: taxiDuration,
        fare: taxiFare,
      });

      // 2) 대안: 도보 (거리 기준 시속 4.5km/h 환산)
      // 도보 시간이 3시간(180분)을 넘는 경우 표시 제외하거나 합리적 제한
      const walkDuration = Math.round((distanceKm / 4.5) * 60);
      alternatives.push({
        type: 'walk',
        name: '도보',
        duration: walkDuration,
        fare: 0,
      });
    } else {
      // type === 'car' 일 때 대안으로 대중교통과 도보 제공
      let publicDuration = 0;
      let publicFare = 1500;
      try {
        const publicRoute = await fetchPublicTransit(sx, sy, ex, ey);
        publicDuration = publicRoute.duration;
        publicFare = publicRoute.fare;
      } catch (e) {
        // 대중교통 Fallback
        const carFallback = calculateCarFallback(sx, sy, ex, ey);
        publicDuration = Math.round(carFallback.duration * 1.3);
      }

      alternatives.push({
        type: 'public',
        name: '대중교통',
        duration: publicDuration,
        fare: publicFare,
      });

      const walkDuration = Math.round((distanceKm / 4.5) * 60);
      alternatives.push({
        type: 'walk',
        name: '도보',
        duration: walkDuration,
        fare: 0,
      });
    }

    const responseData: DirectionsApiResponse = {
      primary: primaryResult,
      alternatives,
    };

    return NextResponse.json(responseData);
  } catch (err) {
    console.error('[directions] unexpected error:', err);
    return NextResponse.json(
      { error: '이동 경로 정보 조회 중 에러가 발생했습니다.' },
      { status: 500 }
    );
  }
}
