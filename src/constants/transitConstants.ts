/**
 * 대중교통 관련 상수 정의
 */

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
