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
  remainSeats?: number;             // 잔여 좌석 수 (광역/직행좌석버스 특화)
  crowded?: string;                 // 혼잡도 정보
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
 * 경기도 버스 API 원본 응답 인터페이스 (v2 getBusArrivalListv2)
 */
export interface GyeonggiBusItem {
  routeId?: string | number;
  routeName?: string | number;      // 버스 번호
  predictTime1?: number | string;   // 1번째 도착시간 (분)
  predictTime2?: number | string;   // 2번째 도착시간 (분)
  locationNo1?: number | string;    // 1번째 남은 정류장 수
  locationNo2?: number | string;    // 2번째 남은 정류장 수
  remainSeatCnt1?: number | string; // 1번째 빈자리/잔여 좌석 수 (-1이면 정보없음 또는 입석)
  remainSeatCnt2?: number | string; // 2번째 빈자리/잔여 좌석 수
  routeDestName?: string;           // 종점 지명
  routeTypeCd?: number | string;    // 11:직행좌석, 12:좌석, 13:일반, 14:광역급행(M), 15:따복/맞춤, 16:순환 등
  plateNo1?: string;                // 차량 번호 1
  plateNo2?: string;                // 차량 번호 2
  crowded1?: string;                // 혼잡도 1
  crowded2?: string;                // 혼잡도 2
  stopName?: string;                // fallback 종점 지명
}

export interface GyeonggiApiResponse {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    msgHeader?: {
      resultCode: number;
      resultMessage: string;
    };
    msgBody?: {
      busArrivalList?: GyeonggiBusItem | GyeonggiBusItem[];
    };
    body?: {
      items?: {
        busArrivalItem?: GyeonggiBusItem | GyeonggiBusItem[];
      } | GyeonggiBusItem[];
    };
  };
}

/**
 * 경기도 버스 위치 API 원본 응답 인터페이스 (v2 getBusLocationListv2)
 */
export interface GyeonggiBusLocationItem {
  routeId?: string | number;        // 노선 ID
  stationId?: string | number;      // 현재 정류소 ID
  stationSeq?: number | string;     // 현재 정류소 순번 (노선 내 순번)
  plateNo?: string;                 // 차량 번호 (예: "경기70사1234")
  remainSeatCnt?: number | string;  // 잔여 좌석 수 (-1: 정보없음/입석, 0~45: 빈자리)
  plateType?: number | string;      // 차종 (0:정보없음, 1:소형, 2:중형, 3:대형, 4:2층버스)
  lowPlate?: number | string;       // 저상버스 여부 (0: 일반, 1: 저상)
  endBus?: number | string;         // 막차 여부 (0: 일반, 1: 막차)
  density?: number | string;        // 혼잡도
  vehId?: string | number;          // 차량 고유 ID
}

export interface GyeonggiBusLocationApiResponse {
  response?: {
    header?: {
      resultCode: string;
      resultMsg: string;
    };
    msgHeader?: {
      resultCode: number;
      resultMessage: string;
    };
    msgBody?: {
      busLocationList?: GyeonggiBusLocationItem | GyeonggiBusLocationItem[];
    };
    body?: {
      items?: {
        busLocationItem?: GyeonggiBusLocationItem | GyeonggiBusLocationItem[];
      } | GyeonggiBusLocationItem[];
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
