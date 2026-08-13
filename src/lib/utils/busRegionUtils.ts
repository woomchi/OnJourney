/**
 * ODsay busCityCode 및 지역 정보를 TAGO / 지자체 실시간 API 규격으로 변환하는 유틸리티
 */

export interface BusRegionMapping {
  region: string;
  tagoCode: string;
}

/**
 * ODsay busCityCode (또는 CID) -> { region, tagoCode } 매핑 테이블
 */
const ODSAY_CITY_CODE_MAP: Record<string, BusRegionMapping> = {
  '11': { region: 'seoul', tagoCode: '11' },
  '21': { region: 'busan', tagoCode: '21' },
  '22': { region: 'daegu', tagoCode: '22' },
  '23': { region: 'incheon', tagoCode: '23' },
  '24': { region: 'gwangju', tagoCode: '24' },
  '25': { region: 'daejeon', tagoCode: '25' },
  '26': { region: 'ulsan', tagoCode: '26' },
  '12': { region: 'sejong', tagoCode: '12' },
  '29': { region: 'sejong', tagoCode: '12' },
  '31': { region: 'gyeonggi', tagoCode: '31' },
  '32': { region: 'gangwon', tagoCode: '32' },
  '33': { region: 'chungbuk', tagoCode: '33' },
  '34': { region: 'chungnam', tagoCode: '34' },
  '35': { region: 'jeonbuk', tagoCode: '35' },
  '36': { region: 'jeonnam', tagoCode: '36' },
  '37': { region: 'gyeongbuk', tagoCode: '37' },
  '38': { region: 'gyeongnam', tagoCode: '38' },
  '39': { region: 'jeju', tagoCode: '39' },
};

/**
 * ODsay 버스 도시 코드(busCityCode)를 바탕으로 내부 region ID를 반환합니다.
 */
export function resolveBusRegion(busCityCode?: string | number): string {
  if (!busCityCode) return 'seoul';
  const codeStr = String(busCityCode).trim();
  
  if (ODSAY_CITY_CODE_MAP[codeStr]) {
    return ODSAY_CITY_CODE_MAP[codeStr].region;
  }

  // 31xxx 형태의 경기도 시군 코드 처리
  if (codeStr.startsWith('31')) {
    return 'gyeonggi';
  }

  return 'seoul';
}

/**
 * ODsay 버스 도시 코드(busCityCode)를 바탕으로 TAGO cityCode를 반환합니다.
 */
export function resolveTagoCode(busCityCode?: string | number): string {
  if (!busCityCode) return '11';
  const codeStr = String(busCityCode).trim();

  if (ODSAY_CITY_CODE_MAP[codeStr]) {
    return ODSAY_CITY_CODE_MAP[codeStr].tagoCode;
  }

  return codeStr;
}
