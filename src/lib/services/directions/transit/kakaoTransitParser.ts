import type { DirectionResult, DirectionStep, SubPathOption } from '@/types/journey';
import type { KakaoPublicTrafficResponse, KakaoRoute, KakaoStep } from '@/types/kakaoTransit';
import { getSubwayColor } from './transitColorUtils';
import { BUS_COLORS } from '@/constants/colors';
import { haversineDistance } from '../common/distanceUtils';

/**
 * 카카오 버스 타입별 색상 매핑 유틸
 */
export function getKakaoBusColor(busType?: string, routeName?: string): string {
  const type = busType || '';
  const name = routeName || '';

  if (type.includes('광역') || type.includes('직행') || type.includes('급행') || type.includes('시외') || name.startsWith('M')) {
    return BUS_COLORS.RED;
  }
  if (type.includes('마을') || type.includes('지선')) {
    return BUS_COLORS.GREEN;
  }
  if (type.includes('순환')) {
    return BUS_COLORS.YELLOW;
  }
  if (type.includes('간선') || type.includes('일반') || type.includes('좌석')) {
    return BUS_COLORS.BLUE;
  }
  return BUS_COLORS.BLUE;
}

/**
 * 카카오 대중교통 단일 스텝(KakaoStep)을 OnJourney DirectionStep으로 변환
 */
function parseStepToDirectionStep(step: KakaoStep, index: number): DirectionStep {
  const { properties, path } = step;
  const stepType = properties.type;

  // 1. 위경도 좌표 변환 ([lon, lat] -> { lat, lng })
  const pathPoints: { lat: number; lng: number }[] =
    path?.points?.map(([lng, lat]) => ({ lat, lng })) || [];

  const firstPoint = pathPoints.length > 0 ? pathPoints[0] : undefined;
  const lastPoint = pathPoints.length > 0 ? pathPoints[pathPoints.length - 1] : undefined;
  const startLat = firstPoint?.lat;
  const startLng = firstPoint?.lng;
  const endLat = lastPoint?.lat;
  const endLng = lastPoint?.lng;

  // 2. 소요 시간 (초 -> 분 변환, 0초 초과 시 최소 1분 보정)
  const durationMin = properties.time > 0 ? Math.max(1, Math.round(properties.time / 60)) : 0;

  // 3. 시작/도착 정류장 명칭 및 정류장 목록 파싱
  const stops = properties.stops || [];
  const startName = stops.length > 0 ? stops[0].name : undefined;
  const endName = stops.length > 0 ? stops[stops.length - 1].name : undefined;

  const passStopList = stops.length > 0
    ? {
        stationList: stops.map((s, sIndex) => ({
          stationName: s.name,
          lat: sIndex === 0 ? startLat : sIndex === stops.length - 1 ? endLat : undefined,
          lng: sIndex === 0 ? startLng : sIndex === stops.length - 1 ? endLng : undefined,
        })),
      }
    : undefined;

  // 4. 차량 정보 및 다중 탑승 옵션 파싱
  const vehicles = properties.vehicles || [];
  const primaryVehicle = vehicles[0];
  const vehicleName = primaryVehicle?.name || properties.guidance;
  const busType = primaryVehicle?.type;

  const subPathOptions: SubPathOption[] | undefined =
    vehicles.length > 1
      ? vehicles.map((v, vIdx) => ({
          id: `opt-${index}-${vIdx}`,
          label: `${v.name} (${v.type})`,
          type: stepType === 'BUS' ? 'bus' : 'subway',
          stationName: startName || '',
          duration: durationMin,
          lineName: v.name,
        }))
      : undefined;

  // 5. 타입별 특화 매핑
  if (stepType === 'BUS') {
    return {
      type: 'bus',
      name: vehicleName,
      duration: durationMin,
      distance: properties.distance,
      color: getKakaoBusColor(busType, vehicleName),
      pathPoints,
      startName,
      endName,
      startLat,
      startLng,
      startX: startLng,
      startY: startLat,
      endLat,
      endLng,
      endX: endLng,
      endY: endLat,
      stationCount: stops.length,
      busType,
      busLaneColor: getKakaoBusColor(busType, vehicleName),
      passStopList,
      subPathOptions,
      headsign: properties.guidance,
    };
  }

  if (stepType === 'SUBWAY') {
    const cleanName = vehicleName.replace(/^(수도권|인천|부산|대구|대전|광주)\s+/, '');
    const subwayColor = getSubwayColor(cleanName);

    return {
      type: 'subway',
      name: cleanName,
      duration: durationMin,
      distance: properties.distance,
      color: subwayColor,
      pathPoints,
      startName,
      endName,
      startLat,
      startLng,
      startX: startLng,
      startY: startLat,
      endLat,
      endLng,
      endX: endLng,
      endY: endLat,
      stationCount: stops.length,
      passStopList,
      headsign: properties.guidance,
    };
  }

  // 기본 WALKING
  return {
    type: 'walk',
    name: properties.guidance || '도보',
    duration: durationMin,
    distance: properties.distance,
    color: '#9CA3AF',
    pathPoints,
    startName,
    endName,
    startLat,
    startLng,
    startX: startLng,
    startY: startLat,
    endLat,
    endLng,
    endX: endLng,
    endY: endLat,
  };
}

/**
 * 첫 정류장까지 또는 마지막 정류장부터의 문전 도보 스텝 생성 보조 함수
 */
function createWalkStep(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  startName: string,
  endName: string
): DirectionStep {
  const distKm = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const distM = Math.round(distKm * 1000);
  // 성인 보행 속도 약 4km/h 기준 분 계산 (최소 1분)
  const durationMin = Math.max(1, Math.round((distKm / 4) * 60));

  return {
    type: 'walk',
    name: '도보',
    duration: durationMin,
    distance: distM,
    color: '#9CA3AF',
    startName,
    endName,
    pathPoints: [from, to],
  };
}

/**
 * 카카오 대중교통 API 응답(`KakaoPublicTrafficResponse`)을 OnJourney 표준 `DirectionResult[]`로 변환
 */
export function parseKakaoTransitResponse(
  data: KakaoPublicTrafficResponse,
  sx: number,
  sy: number,
  ex: number,
  ey: number
): DirectionResult[] {
  if (data.status !== 'OK' || !data.routes || data.routes.length === 0) {
    return [];
  }

  const startCoord = { lat: sy, lng: sx };
  const endCoord = { lat: ey, lng: ex };

  return data.routes.map((route: KakaoRoute, rIdx: number) => {
    const p = route.properties;
    const rawSteps = route.steps || [];

    // 1. 카카오 세부 스텝 변환
    let steps: DirectionStep[] = rawSteps.map((s, sIdx) => parseStepToDirectionStep(s, sIdx));

    // 2. 출발지 문전 도보 보정 (Door-to-First-Stop)
    const firstStep = steps[0];
    if (firstStep && firstStep.type !== 'walk' && firstStep.pathPoints && firstStep.pathPoints.length > 0) {
      const firstPt = firstStep.pathPoints[0];
      const distToFirstKm = haversineDistance(sy, sx, firstPt.lat, firstPt.lng);
      // 출발지와 첫 승차 정류장 사이 거리가 20m 이상이면 도보 스텝 선행 추가
      if (distToFirstKm >= 0.02) {
        const startWalk = createWalkStep(startCoord, firstPt, '출발지', firstStep.startName || '승차 정류장');
        steps.unshift(startWalk);
      }
    }

    // 3. 도착지 문전 도보 보정 (Last-Stop-to-Door)
    const lastStep = steps[steps.length - 1];
    if (lastStep && lastStep.type !== 'walk' && lastStep.pathPoints && lastStep.pathPoints.length > 0) {
      const lastPt = lastStep.pathPoints[lastStep.pathPoints.length - 1];
      const distFromLastKm = haversineDistance(lastPt.lat, lastPt.lng, ey, ex);
      // 마지막 하차 정류장과 도착지 사이 거리가 20m 이상이면 도보 스텝 후행 추가
      if (distFromLastKm >= 0.02) {
        const endWalk = createWalkStep(lastPt, endCoord, lastStep.endName || '하차 정류장', '도착지');
        steps.push(endWalk);
      }
    }

    // 4. 전체 경로 궤적 좌표 평탄화 (Flatten All Step Points)
    const fullPathPoints: { lat: number; lng: number }[] = [];
    for (const step of steps) {
      if (step.pathPoints && step.pathPoints.length > 0) {
        fullPathPoints.push(...step.pathPoints);
      }
    }

    // 5. 대표 경로 이름 생성 (예: "62-1 → 수인분당선")
    const transitNames = steps
      .filter((s) => s.type === 'bus' || s.type === 'subway')
      .map((s) => s.name);
    const routeName = transitNames.length > 0 ? transitNames.join(' → ') : '대중교통';

    // 6. 태그 생성
    const tags: string[] = [];
    if (rIdx === 0) tags.push('최적');
    if (p.transfers === 0) {
      tags.push('환승 없음');
    } else {
      tags.push(`환승 ${p.transfers}회`);
    }

    // 7. 총 소요시간 및 거리 환산
    const durationMin = Math.max(1, Math.round(p.totalTime / 60));
    const distanceKm = Number((p.totalDistance / 1000).toFixed(1));

    return {
      id: `kakao-transit-${rIdx}`,
      type: 'public',
      name: routeName,
      duration: durationMin,
      distance: distanceKm,
      fare: p.fare?.value || 0,
      steps,
      pathPoints: fullPathPoints,
      tags,
    };
  });
}
