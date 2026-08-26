/**
 * @fileoverview 지하철 도메인 공통 타입 및 인터페이스
 */

/** 지하철 역간거리 데이터 단일 행 타입 */
export interface StationDistanceRow {
  sbwy_rout_ln: string | number; // 호선 번호 또는 노선명 (예: 1, 2, '1063', '수인분당선')
  sbwy_stns_nm: string;          // 역명 (예: '강남역', '수원')
  hm: string;                    // 전역과의 소요 시간 (형식: "M:SS")
  dist_km?: number;              // 역간 거리 (km)
  acml_dist?: number;            // 누적 거리 (km)
}

/** 역간 거리 JSON 루트 타입 */
export interface StationDistanceDb {
  DATA: StationDistanceRow[];
}

/** 시간표 API 단일 아이템 타입 */
export interface ScheduleItem {
  trainNo: string | number;
  depTime?: string | number;
  arrTime?: string | number;
  endSubwayStationNm?: string;
  isExpress?: boolean;
}

/** calculateSubwayETADynamic 반환 타입 */
export interface SubwayEtaResult {
  statusText: string;
  minutesLeft: number;
  arrivalTime: string;
  isApproaching: boolean;
  isPassed?: boolean;
  arvlCd?: string;
  arrivalPriority?: number;
}

/** 지하철 역 인덱스 및 누적 소요 초 구조체 */
export interface StationIndexedInfo {
  index: number;
  stationName: string;
  hmSeconds: number;
  cumulativeSeconds: number;
  distKm?: number;
  acmlDist?: number;
}

/** 노선별 역간 거리 및 누적합 인덱스 */
export interface LineDistanceIndex {
  lineCode: string;
  stationMap: Map<string, StationIndexedInfo>;
  stations: StationIndexedInfo[];
  totalSeconds: number;
}

/** 지하철 역 인덱스 정보 (순서, 환승선 여부 포함) */
export interface SubwayIndexedStation {
  index: number;
  stationName: string;
  name?: string;
  hmSeconds: number;
  cumulativeSeconds: number;
  distKm?: number;
  isTransfer?: boolean;
  transferLines?: string[];
  branchId?: string; // 지선 식별자 (예: 'seongsu-branch', 'sinseol-branch', 'main')
}

/** 열차 메타데이터 (행선지, 방면, 급행 여부) */
export interface TrainMetadata {
  destination: string | null;
  directionName: string | null;
  isExpress: boolean;
  isSpecialExpress: boolean;
}
