/**
 * ODsay API 응답 표준 파서 모듈
 * 
 * - parseTrainSchedule: 열차 시간표 및 trainNo+trainClass 파싱
 * - parseBusSchedule: 고속/시외버스 시간표 및 요금 파싱
 * - parseFirstLegFromPath: searchPubTransPathT 응답에서 출발지 -> 역까지의 접속 이동수단(First Leg) 파싱
 */

export interface FirstLegInfo {
  type: 'walk' | 'subway' | 'bus' | 'car';
  typeLabel: string;
  details: string;
  distance?: number;
  duration?: number;
  lineName?: string;
  stationCount?: number;
}

export interface ParsedTrainItem {
  trainNumber: string;    // 예: "KTX 100001", "ITX-청춘 2001"
  trainClass: string;     // 예: "KTX", "ITX-청춘", "무궁화"
  trainNo: number | string;
  departureTime: string;  // HH:mm
  arrivalTime: string;    // HH:mm
  wasteTime: string;      // 소요시간 (예: "2시간 15분")
  runDay: string;
  fare: {
    general?: number;
    special?: number;
    standing?: number;
  };
}

export interface ParsedBusItem {
  busTypeLabel: string;   // 예: "고속버스", "시외버스"
  startTerminal: string;
  destTerminal: string;
  wasteTime: string;
  normalFare: number;
  specialFare: number;
  nightFare: number;
  nightSpecialFare: number;
  schedule: string;
  nightSchedule?: string;
}

/**
 * ODsay trainServiceTime 응답 파서
 */
export function parseTrainSchedule(data: any): ParsedTrainItem[] {
  const result = data?.result;
  if (!result || !result.station || !Array.isArray(result.station)) {
    return [];
  }

  return result.station.map((item: any) => {
    const rawTrainClass = item.trainClass || '열차';
    const trainNo = item.trainNo || item.trainCode || '';
    const trainNumber = trainNo ? `${rawTrainClass} ${trainNo}` : rawTrainClass;

    // 요금 파싱
    const generalFare = item.fare?.general ? Number(item.fare.general) : (item.generalFare?.weekday ? Number(item.generalFare.weekday) : undefined);
    const specialFare = item.fare?.special ? Number(item.fare.special) : (item.specialFare?.weekday ? Number(item.specialFare.weekday) : undefined);
    const standingFare = item.fare?.standing ? Number(item.fare.standing) : (item.standingFare?.weekday ? Number(item.standingFare.weekday) : undefined);

    return {
      trainNumber,
      trainClass: rawTrainClass,
      trainNo,
      departureTime: formatTimeStr(item.departureTime),
      arrivalTime: formatTimeStr(item.arrivalTime),
      wasteTime: item.wasteTime || '-',
      runDay: item.runDay || '매일',
      fare: {
        general: generalFare,
        special: specialFare,
        standing: standingFare,
      },
    };
  });
}

/**
 * ODsay searchInterBusSchedule 응답 파서
 */
export function parseBusSchedule(data: any): ParsedBusItem[] {
  const result = data?.result;
  if (!result || !result.station || !Array.isArray(result.station)) {
    return [];
  }

  return result.station.map((item: any) => {
    const isExpress = (item.specialFare && item.specialFare > 0) || (item.startTerminal || '').includes('고속');
    return {
      busTypeLabel: isExpress ? '고속버스' : '시외버스',
      startTerminal: item.startTerminal || '',
      destTerminal: item.destTerminal || '',
      wasteTime: item.wasteTime || '-',
      normalFare: item.normalFare || 0,
      specialFare: item.specialFare || 0,
      nightFare: item.nightFare || 0,
      nightSpecialFare: item.nightSpecialFare || 0,
      schedule: item.schedule || '수시 운행',
      nightSchedule: item.nightSchedule || undefined,
    };
  });
}

/**
 * ODsay searchPubTransPathT 응답에서 첫 번째 Leg(접속 이동수단) 파싱
 */
export function parseFirstLegFromPath(pathData: any): FirstLegInfo | null {
  const paths = pathData?.result?.path;
  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return null;
  }

  // 가장 최적의 1순위 경로 선택
  const bestPath = paths[0];
  const subPaths = bestPath?.subPath;
  if (!subPaths || !Array.isArray(subPaths) || subPaths.length === 0) {
    return null;
  }

  // 첫 번째 대중교통 이동 수단(trafficType 1:지하철, 2:버스) 또는 도보(trafficType 3)
  const firstSub = subPaths[0];
  if (!firstSub) return null;

  const trafficType = firstSub.trafficType; // 1:지하철, 2:버스, 3:도보
  const sectionTime = firstSub.sectionTime || 0; // 분
  const distance = firstSub.distance || 0; // m

  if (trafficType === 3) {
    return {
      type: 'walk',
      typeLabel: '도보',
      details: `${distance}m (약 ${sectionTime}분)`,
      distance,
      duration: sectionTime,
    };
  } else if (trafficType === 1) {
    const lane = firstSub.lane?.[0]?.name || '지하철';
    const stationCnt = firstSub.stationCount || firstSub.passStopList?.stations?.length || 0;
    return {
      type: 'subway',
      typeLabel: '지하철',
      details: `${lane} ${stationCnt > 0 ? `${stationCnt}정거장` : ''} (약 ${sectionTime}분)`,
      distance,
      duration: sectionTime,
      lineName: lane,
      stationCount: stationCnt,
    };
  } else if (trafficType === 2) {
    const busNo = firstSub.lane?.[0]?.busNo || '버스';
    const stationCnt = firstSub.stationCount || firstSub.passStopList?.stations?.length || 0;
    return {
      type: 'bus',
      typeLabel: '시내버스',
      details: `${busNo}번 버스 ${stationCnt > 0 ? `${stationCnt}정류장` : ''} (약 ${sectionTime}분)`,
      distance,
      duration: sectionTime,
      lineName: busNo,
      stationCount: stationCnt,
    };
  }

  return {
    type: 'walk',
    typeLabel: '도보',
    details: `${distance}m (약 ${sectionTime}분)`,
    distance,
    duration: sectionTime,
  };
}

/**
 * HHmm 또는 HH:mm 형식의 시간 문자열 정제 헬퍼
 */
function formatTimeStr(timeStr: string | undefined): string {
  if (!timeStr) return '-';
  if (timeStr.includes(':')) return timeStr;
  if (timeStr.length === 4) {
    return `${timeStr.slice(0, 2)}:${timeStr.slice(2)}`;
  }
  return timeStr;
}
