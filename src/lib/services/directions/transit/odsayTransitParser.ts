import type { DirectionResult, DirectionStep } from '@/types/journey';
import { getSubwayColor } from './transitColorUtils';
import { BUS_COLORS } from '@/constants/colors';

/**
 * ODsay API 서브패스 및 경로 원천 데이터 인터페이스
 */
export interface OdsayStationItem {
  stationName?: string;
  name?: string;
  x?: string | number;
  y?: string | number;
  stationID?: string | number;
}

export interface OdsayLaneItem {
  name?: string;
  busNo?: string;
  type?: number;
}

export interface OdsaySubPath {
  trafficType?: number;
  sectionTime?: number;
  distance?: number;
  startName?: string;
  endName?: string;
  startX?: string | number;
  startY?: string | number;
  endX?: string | number;
  endY?: string | number;
  stationCount?: number;
  lane?: OdsayLaneItem[];
  passStopList?: {
    stations?: OdsayStationItem[];
  };
}

export interface OdsayPathInfo {
  totalTime?: number;
  time?: number;
  totalDistance?: number;
  distance?: number;
  payment?: number;
  totalFare?: number;
}

export interface OdsayPath {
  info?: OdsayPathInfo;
  subPath?: OdsaySubPath[];
  subPaths?: OdsaySubPath[];
}

export interface OdsayIntercityApiResponse {
  result?: {
    path?: OdsayPath[];
    paths?: OdsayPath[];
    routes?: OdsayPath[];
  };
}

/**
 * ODsay 이동수단 타입 코드 매핑:
 * 1: 지하철, 2: 버스, 3: 도보, 4: 열차(KTX/SRT/ITX/무궁화), 5: 고속/시외버스, 6: 항공, 7: 해운
 */
export function getOdsayStepType(trafficType: number): DirectionStep['type'] {
  switch (trafficType) {
    case 1:
      return 'subway';
    case 2:
      return 'bus';
    case 3:
      return 'walk';
    case 4:
      return 'train';
    case 5:
      return 'expressbus';
    case 6:
      return 'airplane';
    default:
      return 'bus';
  }
}

/**
 * ODsay 서브패스를 OnJourney DirectionStep으로 변환
 */
export function parseOdsaySubPathToStep(sub: OdsaySubPath, _index: number): DirectionStep {
  const trafficType = sub.trafficType || 3;
  const stepType = getOdsayStepType(trafficType);
  const duration = sub.sectionTime || (sub.distance ? Math.max(1, Math.round(sub.distance / 67)) : 0);
  const distance = sub.distance || 0;

  const startName = sub.startName || (stepType === 'walk' ? '도보 출발' : '');
  const endName = sub.endName || (stepType === 'walk' ? '도보 도착' : '');

  const startLat = sub.startY ? Number(sub.startY) : undefined;
  const startLng = sub.startX ? Number(sub.startX) : undefined;
  const endLat = sub.endY ? Number(sub.endY) : undefined;
  const endLng = sub.endX ? Number(sub.endX) : undefined;

  let lineName: string | undefined;
  let lineColor: string | undefined;
  let trainClass: string | undefined;

  if (trafficType === 1) {
    // 지하철
    const lane = sub.lane?.[0];
    lineName = lane?.name || '지하철';
    lineColor = getSubwayColor(lineName || '지하철');
  } else if (trafficType === 2) {
    // 시내버스
    const lane = sub.lane?.[0];
    lineName = lane?.busNo || '버스';
    lineColor = BUS_COLORS.BLUE;
  } else if (trafficType === 4) {
    // 기차 (KTX, SRT, ITX 등)
    const lane = sub.lane?.[0];
    trainClass = lane?.name || '기차';
    lineName = lane?.name || 'KTX/기차';
    lineColor = '#0054A6'; // 코레일 대표 파란색
  } else if (trafficType === 5) {
    // 고속/시외버스
    const lane = sub.lane?.[0];
    lineName = lane?.name || '고속/시외버스';
    lineColor = '#E63946'; // 고속버스 붉은색
  } else if (trafficType === 6) {
    // 항공
    const lane = sub.lane?.[0];
    lineName = lane?.name || '국내선 항공편';
    lineColor = '#0077B6';
  }

  // 경유 정류소 목록 파싱
  const rawStations = sub.passStopList?.stations || [];
  const stationList = rawStations.map((s: OdsayStationItem) => ({
    stationName: s.stationName || s.name || '',
    lat: s.y ? Number(s.y) : undefined,
    lng: s.x ? Number(s.x) : undefined,
    stationId: s.stationID ? String(s.stationID) : undefined,
  }));

  // 단순 2점 좌표 폴백 또는 시작/끝 좌표
  const pathPoints: { lat: number; lng: number }[] = [];
  if (startLat && startLng) pathPoints.push({ lat: startLat, lng: startLng });
  if (stationList.length > 0) {
    stationList.forEach((st) => {
      if (st.lat && st.lng) pathPoints.push({ lat: st.lat, lng: st.lng });
    });
  }
  if (endLat && endLng) pathPoints.push({ lat: endLat, lng: endLng });

  const stepName = lineName || (stepType === 'walk' ? '도보 이동' : '이동');

  return {
    type: stepType,
    name: stepName,
    instruction: `${startName ? `${startName} ➜ ` : ''}${lineName || '이동'} (${duration}분)`,
    duration,
    distance,
    startName,
    endName,
    startLat,
    startLng,
    endLat,
    endLng,
    lineName,
    lineColor,
    trainClass,
    stationCount: sub.stationCount || stationList.length || 0,
    passStopList: stationList.length > 0 ? { stationList } : undefined,
    pathPoints: pathPoints.length > 0 ? pathPoints : undefined,
  };
}

/**
 * ODsay API 응답(searchPubTransPathT 또는 maasRP)을 DirectionResult[] 로 변환
 */
export function parseOdsayIntercityResponse(
  data: OdsayIntercityApiResponse | unknown,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  const typedData = data as OdsayIntercityApiResponse;
  const result = typedData?.result;
  if (!result) return [];

  // searchPubTransPathT(path) 및 maasRP(paths, routes) 모두 지원
  const paths = result.path || result.paths || (result.routes ? result.routes : []);
  if (!Array.isArray(paths) || paths.length === 0) return [];

  return paths.slice(0, 3).map((p: OdsayPath, pIndex: number) => {
    const info = p.info || {};
    const subPaths = p.subPath || p.subPaths || [];

    const duration = info.totalTime || info.time || 0;
    const distanceMeters = info.totalDistance || info.distance || 0;
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
    const fare = info.payment || info.totalFare || 0;

    const steps: DirectionStep[] = subPaths.map((sub: OdsaySubPath, sIdx: number) =>
      parseOdsaySubPathToStep(sub, sIdx)
    );

    // 전체 경로 포인트 수집
    const pathPoints: { lat: number; lng: number }[] = [{ lat: sy, lng: sx }];
    steps.forEach((step) => {
      if (step.pathPoints && step.pathPoints.length > 0) {
        step.pathPoints.forEach((pt) => pathPoints.push(pt));
      } else {
        if (step.startLat && step.startLng) pathPoints.push({ lat: step.startLat, lng: step.startLng });
        if (step.endLat && step.endLng) pathPoints.push({ lat: step.endLat, lng: step.endLng });
      }
    });
    pathPoints.push({ lat: ey, lng: ex });

    // 주요 이동수단 라벨 생성 (예: "KTX + 지하철", "고속버스")
    const mainModes = steps
      .filter((s) => s.type !== 'walk')
      .map((s) => (s.type === 'train' ? 'KTX/기차' : s.type === 'expressbus' ? '고속/시외버스' : s.type === 'airplane' ? '항공' : s.type === 'subway' ? '지하철' : '버스'));
    const uniqueModes = Array.from(new Set(mainModes));
    const summary = uniqueModes.length > 0 ? uniqueModes.join(' + ') : '시외 대중교통';

    return {
      id: `intercity-odsay-${pIndex + 1}-${Date.now()}`,
      type: 'public' as const,
      name: summary,
      duration,
      distance: distanceKm,
      fare,
      isEstimated: false,
      isIntercity: true,
      steps,
      pathPoints,
    };
  });
}
