// 대중교통 및 경로 검색 관련 정책 및 기준치 상수

// 도보 제한 시간 상수 (단위: 분)
export const WALK_LIMITS = {
  // 일반적인 시내 이동 시 (Intercity가 아닌 경우)
  GENERAL: {
    MAX_WALK_TO_FIRST_STATION: 15,    // 첫 탑승 정류장까지 최대 도보
    MAX_WALK_FROM_LAST_STATION: 15,   // 하차 후 최종 목적지까지 최대 도보
    MAX_TRANSFER_WALK: 10,            // 환승 시 최대 도보
    MAX_TOTAL_WALK: 25,               // 경로 내 총 도보 시간 합계 제한
  },
  // 시외 이동 포함 시 (Intercity)
  INTERCITY: {
    MAX_WALK_TO_FIRST_STATION: 60,
    MAX_WALK_FROM_LAST_STATION: 60,
    MAX_TRANSFER_WALK: 60,
    MAX_TOTAL_WALK: 120,
  }
};

// 이동 속도 관련 상수
export const TRANSIT_SPEEDS = {
  AVERAGE_WALK_KMH: 4.0, // 평균 도보 속도
  AVERAGE_CAR_KMH: 40.0, // 평균 차량 속도
};
