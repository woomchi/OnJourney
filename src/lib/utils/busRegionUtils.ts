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
  '1040': { region: 'gyeonggi', tagoCode: '31010' }, // 경기도 수원/남부
  '1100': { region: 'gyeonggi', tagoCode: '31240' }, // 수도권/화성 권역 CID
  '1110': { region: 'gyeonggi', tagoCode: '31190' }, // 경기도 용인/수지 권역
  '1120': { region: 'gyeonggi', tagoCode: '31020' }, // 경기도 성남 권역
  '1130': { region: 'gyeonggi', tagoCode: '31040' }, // 경기도 안양 권역
  '1140': { region: 'gyeonggi', tagoCode: '31050' }, // 경기도 부천 권역
  '1150': { region: 'gyeonggi', tagoCode: '31100' }, // 경기도 고양 권역
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
  // ODsay 경기도 주요 시군 CID (1200~1300대)
  '1200': { region: 'gyeonggi', tagoCode: '31010' }, // 수원
  '1210': { region: 'gyeonggi', tagoCode: '31020' }, // 성남
  '1220': { region: 'gyeonggi', tagoCode: '31040' }, // 안양
  '1230': { region: 'gyeonggi', tagoCode: '31240' }, // 화성
  '1240': { region: 'gyeonggi', tagoCode: '31190' }, // 용인
  '1250': { region: 'gyeonggi', tagoCode: '31050' }, // 부천
  '1260': { region: 'gyeonggi', tagoCode: '31100' }, // 고양
  '1270': { region: 'gyeonggi', tagoCode: '31090' }, // 안산
  '1280': { region: 'gyeonggi', tagoCode: '31130' }, // 남양주
  '1290': { region: 'gyeonggi', tagoCode: '31070' }, // 평택
  '1300': { region: 'gyeonggi', tagoCode: '31160' }, // 군포
  '1310': { region: 'gyeonggi', tagoCode: '31060' }, // 광명
  '1320': { region: 'gyeonggi', tagoCode: '31120' }, // 구리
  '1330': { region: 'gyeonggi', tagoCode: '31200' }, // 파주
  '1340': { region: 'gyeonggi', tagoCode: '31230' }, // 김포
  '1350': { region: 'gyeonggi', tagoCode: '31180' }, // 하남
  '1360': { region: 'gyeonggi', tagoCode: '31150' }, // 시흥
  '1370': { region: 'gyeonggi', tagoCode: '31250' }, // 광주(경기)
  '1380': { region: 'gyeonggi', tagoCode: '31260' }, // 양주
  '1390': { region: 'gyeonggi', tagoCode: '31210' }, // 이천
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

  // 31xxx 형태 또는 ODsay 1040~1390 경기도 시군 CID 처리 (1000 서울 제외)
  const numCode = parseInt(codeStr, 10);
  if (codeStr.startsWith('31') || (numCode >= 1040 && numCode <= 1390 && numCode !== 1000)) {
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

  const numCode = parseInt(codeStr, 10);
  if (numCode >= 1040 && numCode <= 1390 && numCode !== 1000) {
    return '31'; // 경기도 공통 TAGO cityCode
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

  // 1. 경기도: GGB 접두사 (GGB + 9자리/수치형 ID 또는 2xx로 시작하는 경기도 정류장 ID)
  if (
    normalizedRegion === 'gyeonggi' ||
    normalizedRegion === '경기' ||
    resolvedCityCode.startsWith('31') ||
    pureNumeric.startsWith('233') ||
    pureNumeric.startsWith('228') ||
    pureNumeric.startsWith('200') ||
    pureNumeric.startsWith('234') ||
    pureNumeric.startsWith('202')
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

/**
 * 버스 노선 번호(busNo/lineName)를 엄격히 정규화하여 실시간 매칭에 적합한 순수 노선 번호로 반환합니다.
 * (예: "직행좌석9401" -> "9401", "5100예약" -> "5100", "M5107" -> "M5107", "3000(예약)" -> "3000")
 */
export function cleanBusNumber(busNo?: string | number): string {
  if (!busNo) return '';
  let str = String(busNo).trim();

  // 1. 괄호 및 내부 텍스트 제거 (예: "(예약)", "(출근)", "(퇴근)")
  str = str.replace(/\s*\([^)]*\)/g, '').trim();

  // 2. 버스 수식 접두사 반복 제거 (직행좌석, 광역급행, 경기순환 등 복합어 대응)
  const prefixRegex = /^(직행좌석|광역급행|경기순환|일반좌석|마을버스|간선급행|직행|광역|급행|간선|지선|순환|마을|맞춤|시외|공항|일반|좌석|따복)\s*/g;
  let prevStr = '';
  while (prevStr !== str) {
    prevStr = str;
    str = str.replace(prefixRegex, '').trim();
  }

  // 3. 버스 접미사 및 상태어 반복 제거 ("버스", "번", "예약", "출근", "퇴근", "심야", "임시")
  const suffixRegex = /\s*(버스|번|예약|출근|퇴근|심야|임시)\s*$/g;
  let prevSuffixStr = '';
  while (prevSuffixStr !== str) {
    prevSuffixStr = str;
    str = str.replace(suffixRegex, '').trim();
  }

  // 4. 영문 광역급행(M, G, P 등) + 숫자(-숫자) 또는 순수 숫자/한글 노선 정규화 추출
  const match = str.match(/([a-zA-Z]?[0-9]+[a-zA-Z가-힣0-9\-]*|[가-힣]+[0-9\-]*)/);
  if (match) {
    let clean = match[0].toUpperCase().trim();
    clean = clean.replace(/(번|버스)$/g, '');
    return clean;
  }

  return str.toUpperCase().trim();
}

