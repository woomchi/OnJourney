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

// ─── TAGO / 지자체 버스 API 관련 상수 ──────────────────────────────────────────

export const TAGO_CITY_CODES: Record<string, string> = {
  seoul: '11',
  busan: '21',
  daegu: '22',
  incheon: '23',
  gwangju: '24',
  daejeon: '25',
  ulsan: '26',
  sejong: '12',
  gyeonggi: '31',
  gangwon: '32',
  chungbuk: '33',
  chungnam: '34',
  jeonbuk: '35',
  jeonnam: '36',
  gyeongbuk: '37',
  gyeongnam: '38',
  jeju: '39',
};

export const RELIABILITY_SCORES = {
  tago: 0.80,
  gyeonggi: 0.85,
  busan: 0.85,
  incheon: 0.85,
  daejeon: 0.85,
  odsay: 0.50,
  staleCache: 0.50,
};

export const CACHE_TTL_SECONDS = {
  tagoSeoul: 15,
  tagoOther: 30,
  gyeonggi: 20,
  busan: 15,
  incheon: 15,
  daejeon: 15,
  default: 20,
};
