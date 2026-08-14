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
  '1000': { region: 'seoul', tagoCode: '11' },
  '21': { region: 'busan', tagoCode: '21' },
  '7000': { region: 'busan', tagoCode: '21' },
  '22': { region: 'daegu', tagoCode: '22' },
  '4000': { region: 'daegu', tagoCode: '22' },
  '23': { region: 'incheon', tagoCode: '23' },
  '3000': { region: 'incheon', tagoCode: '23' },
  '24': { region: 'gwangju', tagoCode: '24' },
  '5000': { region: 'gwangju', tagoCode: '24' },
  '25': { region: 'daejeon', tagoCode: '25' },
  '6000': { region: 'daejeon', tagoCode: '25' },
  '26': { region: 'ulsan', tagoCode: '26' },
  '8000': { region: 'ulsan', tagoCode: '26' },
  '12': { region: 'sejong', tagoCode: '12' },
  '29': { region: 'sejong', tagoCode: '12' },
  '9000': { region: 'sejong', tagoCode: '12' },
  '31': { region: 'gyeonggi', tagoCode: '31' },
  '2000': { region: 'gyeonggi', tagoCode: '31' },
  '32': { region: 'gangwon', tagoCode: '32' },
  '3200': { region: 'gangwon', tagoCode: '32' },
  '33': { region: 'chungbuk', tagoCode: '33' },
  '3300': { region: 'chungbuk', tagoCode: '33' },
  '34': { region: 'chungnam', tagoCode: '34' },
  '3400': { region: 'chungnam', tagoCode: '34' },
  '35': { region: 'jeonbuk', tagoCode: '35' },
  '3500': { region: 'jeonbuk', tagoCode: '35' },
  '36': { region: 'jeonnam', tagoCode: '36' },
  '3600': { region: 'jeonnam', tagoCode: '36' },
  '37': { region: 'gyeongbuk', tagoCode: '37' },
  '3700': { region: 'gyeongbuk', tagoCode: '37' },
  '38': { region: 'gyeongnam', tagoCode: '38' },
  '3800': { region: 'gyeongnam', tagoCode: '38' },
  '39': { region: 'jeju', tagoCode: '39' },
  '3900': { region: 'jeju', tagoCode: '39' },
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

/**
 * 주어진 stationId와 지역 정보를 바탕으로 TAGO API에서 사용 가능한 nodeId 후보군 목록을 생성합니다.
 */
export function generateTagoNodeIdCandidates(
  stationId: string,
  region: string = 'seoul',
  cityCode?: string
): string[] {
  if (!stationId) return [];

  const rawId = String(stationId).trim();
  const normalizedRegion = (region || '').toLowerCase();
  const resolvedCityCode = cityCode || resolveTagoCode(normalizedRegion);

  const candidates: string[] = [rawId];

  // 숫자만 추출된 기본 ID
  const pureNumeric = rawId.replace(/[^0-9]/g, '');

  // 1. 경기도: GGB 접두사 (GGB + 9자리/수치형 ID)
  if (
    normalizedRegion === 'gyeonggi' ||
    normalizedRegion === '경기' ||
    resolvedCityCode.startsWith('31')
  ) {
    if (pureNumeric) {
      candidates.push(`GGB${pureNumeric}`);
      candidates.push(pureNumeric);
    }
    if (rawId.startsWith('GGB')) {
      candidates.push(rawId.replace(/^GGB/i, ''));
    }
  }

  // 2. 부산: BSB 접두사
  if (
    normalizedRegion === 'busan' ||
    normalizedRegion === '부산' ||
    resolvedCityCode === '21'
  ) {
    if (pureNumeric) {
      candidates.push(`BSB${pureNumeric}`);
      candidates.push(pureNumeric);
    }
    if (rawId.startsWith('BSB')) {
      candidates.push(rawId.replace(/^BSB/i, ''));
    }
  }

  // 3. 서울 / 기타 지자체
  if (
    normalizedRegion === 'seoul' ||
    normalizedRegion === '서울' ||
    resolvedCityCode === '11'
  ) {
    if (pureNumeric) {
      candidates.push(pureNumeric);
      // 서울시 5자리 ARS 번호 또는 내부 ID
      candidates.push(`SEB${pureNumeric}`);
    }
  }

  // 4. 일반적인 접두사 제거/포함 후보
  if (pureNumeric && pureNumeric !== rawId) {
    candidates.push(pureNumeric);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

