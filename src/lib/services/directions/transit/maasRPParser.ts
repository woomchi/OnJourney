import type { DirectionResult, DirectionStep } from '@/types/journey';
import { getSubwayColor, cleanSubwayName, getBusColor } from './transitColorUtils';
import { resolveBusRegion, resolveTagoCode } from '@/lib/utils/busRegionUtils';

const TRAIN_SUBTYPES: Record<number, string> = {
  1: 'KTX',
  2: '새마을호',
  3: '무궁화호',
  4: '누리로',
  5: '통근열차',
  6: 'ITX-새마을',
  7: 'ITX-청춘',
  8: 'SRT',
};

/**
 * ODsay maasRP graph 파라미터 ("x y|x y|...") 파싱 유틸
 */
function parseGraphString(graph?: string): { lat: number; lng: number }[] {
  if (!graph) return [];
  const points: { lat: number; lng: number }[] = [];
  const pairs = graph.split('|');
  for (const pair of pairs) {
    const parts = pair.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        points.push({ lat, lng });
      }
    }
  }
  return points;
}

/**
 * 도보 구간(trafficType=3)의 routes[].xyInfos[] 상세 선형 좌표 파싱 유틸
 */
function parseWalkRoutesPoints(routes?: any[]): { lat: number; lng: number }[] {
  if (!routes || !Array.isArray(routes)) return [];
  const points: { lat: number; lng: number }[] = [];
  for (const route of routes) {
    if (route.xyInfos && Array.isArray(route.xyInfos)) {
      for (const pt of route.xyInfos) {
        const lng = parseFloat(pt.x);
        const lat = parseFloat(pt.y);
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng });
        }
      }
    }
  }
  return points;
}

/**
 * sectionInfo[] 데이터를 FareSection[] 배열로 파싱 유틸
 */
function parseSectionInfo(sectionInfo: any[], rpsList: any[]): import('@/types/journey').FareSection[] {
  if (!sectionInfo || !Array.isArray(sectionInfo)) return [];

  return sectionInfo
    .filter((sec: any) => sec && typeof sec.payment === 'number' && sec.payment > 0)
    .map((sec: any) => {
      const isIntercity = !sec.cityName;
      const startIdx = Math.max(0, Math.min(sec.startRpsIdx ?? 0, (rpsList?.length || 1) - 1));
      const rp = (rpsList && rpsList[startIdx]) ? rpsList[startIdx] : {};
      const trafficType = rp.trafficType;
      const trainSubType = rp.trafficSubType ? TRAIN_SUBTYPES[rp.trafficSubType] : undefined;
      const trainSpSeatFare = (rp.trainSpSeatYn === 'Y' && typeof rp.trainSpSeatPayment === 'number') ? rp.trainSpSeatPayment : undefined;

      let label: string;
      if (isIntercity) {
        label = trainSubType || (trafficType === 5 ? '고속버스' : trafficType === 6 ? '시외버스' : '장거리 대중교통');
      } else {
        label = `${sec.cityName} 버스·지하철`;
      }

      return {
        label,
        payment: sec.payment,
        time: sec.time ?? 0,
        distance: sec.distance ?? 0,
        type: isIntercity ? 'intercity' : 'transit',
        trainSpSeatFare,
      };
    });
}

/**
 * ODsay maasRP 단일 path 객체를 DirectionResult로 파싱
 */
export function parseMaasRPPath(
  rawPath: any,
  pathIdx: number,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult {
  const rpsList: any[] = Array.isArray(rawPath?.rps) ? rawPath.rps : [];
  let isIntercity = false;

  const steps: DirectionStep[] = rpsList.map((rp: any, idx: number): DirectionStep => {
    const trafficType: number = rp.trafficType;
    let type: DirectionStep['type'] = 'walk';
    let name = '도보';
    let color = '#E4E4E7';
    let trainSubTypeStr: string | undefined;

    let startLat = parseFloat(rp.startY);
    let startLng = parseFloat(rp.startX);
    let endLat = parseFloat(rp.endY);
    let endLng = parseFloat(rp.endX);

    // 좌표 fallback (routes 나 passStopList 활용)
    if (isNaN(startLat) || isNaN(startLng)) {
      if (rp.routes?.[0]?.xyInfos?.[0]) {
        startLng = parseFloat(rp.routes[0].xyInfos[0].x);
        startLat = parseFloat(rp.routes[0].xyInfos[0].y);
      } else if (rp.passStopList?.stations?.[0]) {
        startLng = parseFloat(rp.passStopList.stations[0].x);
        startLat = parseFloat(rp.passStopList.stations[0].y);
      } else if (idx === 0) {
        startLat = sy;
        startLng = sx;
      }
    }

    if (isNaN(endLat) || isNaN(endLng)) {
      const lastRoute = rp.routes?.[rp.routes.length - 1];
      const lastXy = lastRoute?.xyInfos?.[lastRoute.xyInfos.length - 1];
      const lastStation = rp.passStopList?.stations?.[rp.passStopList.stations.length - 1];

      if (lastXy) {
        endLng = parseFloat(lastXy.x);
        endLat = parseFloat(lastXy.y);
      } else if (lastStation) {
        endLng = parseFloat(lastStation.x);
        endLat = parseFloat(lastStation.y);
      } else if (idx === rpsList.length - 1) {
        endLat = ey;
        endLng = ex;
      }
    }

    // 선형 좌표 파싱
    let stepPathPoints: { lat: number; lng: number }[] = parseGraphString(rp.graph);
    if (stepPathPoints.length === 0 && trafficType === 3) {
      stepPathPoints = parseWalkRoutesPoints(rp.routes);
    }
    if (stepPathPoints.length === 0 && rp.passStopList?.stations) {
      for (const st of rp.passStopList.stations) {
        const stLng = parseFloat(st.x);
        const stLat = parseFloat(st.y);
        if (!isNaN(stLat) && !isNaN(stLng)) {
          stepPathPoints.push({ lat: stLat, lng: stLng });
        }
      }
    }
    if (stepPathPoints.length === 0) {
      if (!isNaN(startLat) && !isNaN(startLng)) stepPathPoints.push({ lat: startLat, lng: startLng });
      if (!isNaN(endLat) && !isNaN(endLng)) stepPathPoints.push({ lat: endLat, lng: endLng });
    }

    // 이동수단 세부 타입 판별
    if (trafficType === 1) {
      // 지하철
      type = 'subway';
      const rawLineName = rp.lane?.[0]?.name || '지하철';
      name = cleanSubwayName(rawLineName);
      color = getSubwayColor(rawLineName);
    } else if (trafficType === 2) {
      // 시내버스
      type = 'bus';
      const busNo = rp.lane?.[0]?.busNo || '버스';
      const busType = rp.lane?.[0]?.type || 1;
      name = `${busNo}번 버스`;
      color = rp.lane?.[0]?.busLaneColor || getBusColor(busType, busNo);
    } else if (trafficType === 4) {
      // 열차 (KTX, SRT 등)
      type = 'train';
      isIntercity = true;
      const subTypeNum = rp.trafficSubType;
      trainSubTypeStr = TRAIN_SUBTYPES[subTypeNum] || '기차';
      name = trainSubTypeStr;
      if (trainSubTypeStr.includes('SRT')) {
        color = '#582E55';
      } else if (trainSubTypeStr.includes('KTX')) {
        color = '#003366';
      } else {
        color = '#003399';
      }
    } else if (trafficType === 5 || trafficType === 6) {
      // 고속 / 시외버스
      type = 'expressbus';
      isIntercity = true;
      name = trafficType === 5 ? '고속버스' : '시외버스';
      color = '#FF6600';
    } else if (trafficType === 7) {
      // 항공
      type = 'expressbus'; // UI 표현용 fallback
      isIntercity = true;
      name = '항공';
      color = '#0099FF';
    } else {
      type = 'walk';
      name = '도보';
      color = '#E4E4E7';
    }

    // 출발지 / 도착지 이름 파싱 및 추론
    let startName = rp.startName || '';
    let endName = rp.endName || '';

    if (!startName && rp.passStopList?.stations?.length > 0) {
      startName = rp.passStopList.stations[0].stationName || '';
    }
    if (!endName && rp.passStopList?.stations?.length > 0) {
      endName = rp.passStopList.stations[rp.passStopList.stations.length - 1].stationName || '';
    }

    // 도보 구간(trafficType=3) 이름 추론
    if (trafficType === 3) {
      if (!startName) {
        if (idx === 0) {
          startName = '출발지';
        } else {
          const prevRp = rpsList[idx - 1];
          startName = prevRp?.endName || (prevRp?.passStopList?.stations?.slice(-1)[0]?.stationName) || '승차 지점';
        }
      }
      if (!endName) {
        if (idx === rpsList.length - 1) {
          endName = '목적지';
        } else {
          const nextRp = rpsList[idx + 1];
          endName = nextRp?.startName || (nextRp?.passStopList?.stations?.[0]?.stationName) || '하차 지점';
        }
      }
    }

    // 지하철 / 열차 역 이름 깔끔화
    if (type === 'subway' || type === 'train') {
      if (startName && !startName.endsWith('역')) startName = `${startName}역`;
      if (endName && !endName.endsWith('역')) endName = `${endName}역`;
    }

    const passStopStationList = (rp.passStopList?.stations || []).map((st: any) => ({
      stationName: st.stationName,
      lat: parseFloat(st.y),
      lng: parseFloat(st.x),
    }));

    const firstStation = rp.passStopList?.stations?.[0];
    const lastStation = rp.passStopList?.stations?.[rp.passStopList.stations.length - 1];

    const resolvedStartStationID =
      rp.startLocalStationID ||
      firstStation?.localStationID ||
      rp.startArsID ||
      firstStation?.arsID ||
      rp.startStationID ||
      rp.startID;
    const resolvedEndStationID =
      rp.endLocalStationID ||
      lastStation?.localStationID ||
      rp.endArsID ||
      lastStation?.arsID ||
      rp.endStationID ||
      rp.endID;
    const odsayBusId = rp.lane?.[0]?.busID ? String(rp.lane[0].busID) : undefined;
    const tagoRouteId = rp.lane?.[0]?.busLocalBlID || rp.lane?.[0]?.localBusID
      ? String(rp.lane[0].busLocalBlID || rp.lane[0].localBusID)
      : undefined;
    const busLocalBlID = tagoRouteId || odsayBusId;
    const cityCodeRaw = rp.startStationCityCode || rp.lane?.[0]?.busCityCode;

    return {
      type,
      name,
      duration: rp.duration || 0,
      color,
      pathPoints: stepPathPoints,
      startName,
      endName,
      headsign: rp.way || (type === 'bus' ? `${rp.lane?.[0]?.busNo}번` : undefined),
      wayCode: rp.wayCode,
      startLat,
      startLng,
      endLat,
      endLng,
      startID: resolvedStartStationID,
      endID: resolvedEndStationID,
      startStationID: resolvedStartStationID,
      endStationID: resolvedEndStationID,
      realtimeStationId: resolvedStartStationID ? String(resolvedStartStationID) : undefined,
      odsayBusId,
      tagoRouteId,
      busLocalBlID: busLocalBlID ? String(busLocalBlID) : undefined,
      startCityCode: cityCodeRaw ? resolveTagoCode(cityCodeRaw) : undefined,
      startRegion: cityCodeRaw ? resolveBusRegion(cityCodeRaw) : undefined,
      startDateTime: rp.startDateTime,
      endDateTime: rp.endDateTime,
      waitingTime: rp.waitingTime,
      intervalTime: rp.intervalTime ? Number(rp.intervalTime) : undefined,
      trainSubType: trainSubTypeStr,
      trainSpSeatYn: rp.trainSpSeatYn,
      trainSpSeatFare: rp.trainSpSeatPayment,
      busLaneColor: rp.lane?.[0]?.busLaneColor,
      rawLineName: type === 'subway' ? (rp.lane?.[0]?.name || name) : undefined,
      subwayCode: type === 'subway' ? (rp.lane?.[0]?.subwayCode || rp.lane?.[0]?.subwayCityCode) : undefined,
      passStopList: passStopStationList.length > 0 ? { stationList: passStopStationList } : undefined,
    };
  });

  // 전체 pathPoints 수집
  const fullPathPoints: { lat: number; lng: number }[] = [];
  steps.forEach((st) => {
    if (st.pathPoints && st.pathPoints.length > 0) {
      fullPathPoints.push(...st.pathPoints);
    }
  });

  // 경로 명칭 생성 (예: [SRT] 동탄역 -> 부산역 또는 대중교통 최적 경로)
  const intercityStep = steps.find((s) => s.type === 'train' || s.type === 'expressbus');
  let routeName = '대중교통 최적 경로';
  if (intercityStep) {
    const subLabel = intercityStep.trainSubType || intercityStep.name;
    routeName = `[${subLabel}] ${intercityStep.startName} -> ${intercityStep.endName}`;
  }

  const duration = rawPath.totalTime || steps.reduce((sum, s) => sum + s.duration, 0);
  const fare = rawPath.totalPayment || 0;
  const distance = Math.round((rawPath.totalDistance || 0) / 100) / 10; // km
  const fareBreakdown = parseSectionInfo(rawPath.sectionInfo, rpsList);

  return {
    id: `transit_maas_${pathIdx}`,
    type: 'public',
    name: routeName,
    duration,
    fare,
    distance,
    isIntercity,
    steps,
    pathPoints: fullPathPoints,
    fareBreakdown,
  };
}

/**
 * ODsay maasRP 전체 응답 데이터(data)를 DirectionResult[]로 파싱
 */
export function parseMaasRPResponse(
  data: any,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (!data?.result?.paths || !Array.isArray(data.result.paths) || data.result.paths.length === 0) {
    console.warn('[maasRPParser] 해당 구간의 대중교통 경로가 존재하지 않습니다. (paths 비어있음)');
    return [];
  }

  const paths: any[] = data.result.paths;
  return paths.map((pathObj, idx) => parseMaasRPPath(pathObj, idx, sx, sy, ex, ey));
}
