/**
 * 실시간 대중교통 정보 정규화 타입 정의
 */

export type DataSourceType = 'tago' | 'gyeonggi' | 'busan' | 'odsay';

export type BusType = 'normal' | 'express' | 'limited' | 'circulation';

export interface ArrivalBusItem {
  lineId?: string;                  // 노선 ID
  lineName: string;                 // 버스/열차 번호 (예: "605", "100-1")
  arrivedInSeconds: number;         // 도착까지 남은 시간 (초)
  currentStationSequence?: number;  // 남은 정류장 수 또는 현재 순서
  totalStationCount?: number;       // 전체 정류소 수
  busType: BusType;                 // 버스 종류
  remainingDistance?: number;       // 남은 거리 (미터)
  destination?: string;             // 종점 지명
  vehicleId?: string;               // 차량 ID
}

export interface NormalizedRealtimeData {
  stationId: string;                // 정류소 ID
  stationName: string;              // 정류소명
  nextArrivals: ArrivalBusItem[];   // 도착 예정 노선 목록
  dataSource: DataSourceType;       // 주 데이터 출처
  mergedSources?: string[];         // 머지된 경우 출처 목록 (예: ['tago', 'gyeonggi'])
  lastUpdated: number;              // 데이터 갱신 timestamp (ms)
  reliability: number;              // 신뢰도 스코어 (0.0 ~ 1.0)
  errorMessage?: string;            // 에러 발생 시 메시지
}

/**
 * TAGO API 원본 응답 인터페이스
 */
export interface TagoBusItem {
  arrprevstationcnt?: number;       // 남은 정류장 수
  arrtime: number;                  // 도착예정시간(초)
  nodeid: string;                   // 정류소 ID
  nodenm?: string;                  // 정류소명
  routeid?: string;                 // 노선 ID
  routeno: string | number;         // 버스 노선번호
  routety?: string;                 // 노선 유형 (예: "간선버스", "일반버스")
  vehicletp?: string;               // 차종
}

export interface TagoApiResponse {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      items?: {
        item?: TagoBusItem | TagoBusItem[];
      };
      numOfRows?: number;
      pageNo?: number;
      totalCount?: number;
    };
  };
}

/**
 * 경기도 버스 API 원본 응답 인터페이스
 */
export interface GyeonggiBusItem {
  routeId?: string;
  routeName: string;                // 버스 번호
  predictedTime1: number;           // 첫번째 도착시간(초 또는 분)
  predictedTime2?: number;          // 두번째 도착시간
  locationNumber1?: number | string;// 정류소 남은 순번
  stopName?: string;                // 종점/도착지
}

export interface GyeonggiApiResponse {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      items?: GyeonggiBusItem[];
    };
  };
}

/**
 * 부산 버스 API 원본 응답 인터페이스
 */
export interface BusanBusItem {
  lineNo: string | number;           // 버스 노선 번호 (예: "1001", "100-1")
  min1?: number;                     // 1번째 버스 도착 남은 시간 (분)
  station1?: number;                 // 1번째 버스 남은 정류장 수
  min2?: number;                     // 2번째 버스 도착 남은 시간 (분)
  station2?: number;                 // 2번째 버스 남은 정류장 수
  bstopId?: string | number;         // 정류소 ID
  bstopNm?: string;                  // 정류소 명
  busType?: string;                  // 차종/버스 종류
  lineId?: string;                   // 노선 ID
}

export interface BusanApiResponse {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    body?: {
      items?: {
        item?: BusanBusItem | BusanBusItem[];
      };
    };
  };
}
