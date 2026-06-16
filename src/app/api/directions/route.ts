import { NextRequest, NextResponse } from 'next/server';

interface DirectionStep {
  type: 'walk' | 'subway' | 'bus' | 'car';
  name: string;
  duration: number;
  color?: string;
}

interface DirectionResult {
  duration: number; // 분
  fare: number; // 원
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
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

// 버스 색상 매핑
function getBusColor(laneName: string): string {
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

  // 최적 경로 선택
  const bestPath = data.result.path[0];
  const info = bestPath.info;
  const subPaths = bestPath.subPath;

  const pathPoints: { lat: number; lng: number }[] = [];
  // 출발지 좌표 먼저 삽입
  pathPoints.push({ lat: sy, lng: sx });

  // 1. 상세 궤적 정보(loadLane) 획득 시도
  let hasDetailedLanes = false;
  if (info.mapObj) {
    try {
      const mapObjectParam = `0:0@${info.mapObj}`;
      const laneUrl = `https://api.odsay.com/v1/api/loadLane?apiKey=${encodeURIComponent(apiKey)}&mapObject=${encodeURIComponent(mapObjectParam)}`;
      const laneRes = await fetch(laneUrl, { next: { revalidate: 3600 } });
      if (laneRes.ok) {
        const laneData = await laneRes.json();
        if (laneData.result && laneData.result.lane) {
          laneData.result.lane.forEach((lane: any) => {
            lane.section.forEach((section: any) => {
              section.graphPos.forEach((pos: any) => {
                pathPoints.push({ lat: pos.y, lng: pos.x });
              });
            });
          });
          hasDetailedLanes = pathPoints.length > 1;
        }
      }
    } catch (e) {
      console.warn('[directions] loadLane detailed coordinates fetch failed, fallback to station points:', e);
    }
  }

  const steps: DirectionStep[] = subPaths.map((sp: any) => {
    let type: 'walk' | 'subway' | 'bus' | 'car' = 'walk';
    let name = '도보';
    let color = '#E4E4E7'; // 도보 회색

    if (sp.trafficType === 1) {
      type = 'subway';
      const laneName = sp.lane?.[0]?.name || '지하철';
      name = laneName;
      color = getSubwayColor(laneName);
    } else if (sp.trafficType === 2) {
      type = 'bus';
      const busNo = sp.lane?.[0]?.busNo || '버스';
      name = `${busNo}번 버스`;
      color = getBusColor(busNo);
    }

    // 상세 궤적 정보가 없는 경우에만 정류장 위위도 리스트로 Fallback 경로 생성
    if (!hasDetailedLanes && sp.passStopList && sp.passStopList.stations) {
      sp.passStopList.stations.forEach((station: any) => {
        const lat = parseFloat(station.y);
        const lng = parseFloat(station.x);
        if (!isNaN(lat) && !isNaN(lng)) {
          pathPoints.push({ lat, lng });
        }
      });
    }

    return {
      type,
      name,
      duration: sp.sectionTime,
      color,
    };
  }).filter((step: DirectionStep) => step.duration > 0);

  // 최종 목적지 좌표 추가
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

  const url = `https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving?start=${sx},${sy}&goal=${ex},${ey}&option=trafast`;

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

  return {
    duration: durationMin,
    fare: summary.tollFare || 0,
    steps: [
      {
        type: 'car',
        name: '차량',
        duration: durationMin,
        color: '#F59E0B', // 노란색/주황색 계열
      },
    ],
    pathPoints,
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

  return {
    duration,
    fare: taxiFare, // 자동차 경로 결과의 요금은 택시 요금을 기반으로 노출
    steps: [
      {
        type: 'car',
        name: '차량(예상)',
        duration,
        color: '#F59E0B',
      },
    ],
    pathPoints: [
      { lat: sy, lng: sx },
      { lat: ey, lng: ex },
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
        primaryResult = {
          duration: Math.round(carFallback.duration * 1.3), // 대중교통은 보통 차량보다 1.3배 더 소요됨
          fare: 1500, // 기본 버스/지하철 단일요금 수준
          steps: [
            {
              type: 'bus',
              name: '대중교통(예상)',
              duration: Math.round(carFallback.duration * 1.3),
              color: '#0068b7',
            }
          ],
          pathPoints: [
            { lat: sy, lng: sx },
            { lat: ey, lng: ex },
          ]
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
