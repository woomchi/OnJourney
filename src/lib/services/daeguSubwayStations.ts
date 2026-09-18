/**
 * @fileoverview 대구 도시철도 및 대경선 역사 메타데이터 & 순수 유틸리티
 *
 * - Node.js 내장 모듈(fs, path 등)에 일절 의존하지 않아 클라이언트 컴포넌트 및 브라우저 환경에서 안전하게 임포트 가능합니다.
 */

import type { SubwayLineStation } from '@/types/journey';

// ─── 정차역 순서 정의 ──────────────────────────────────────────────────────────

export const DAEGU_LINE_1_STATIONS: readonly string[] = [
  '설화명곡', '화원', '대곡', '진천', '월배', '상인', '월촌', '송현', '서부정류장', '대명',
  '안지랑', '현충로', '영대병원', '교대', '명덕', '반월당', '중앙로', '대구역', '칠성시장', '신천',
  '동대구', '동구청', '아양교', '동촌', '해안', '방촌', '용계', '율하', '신기', '반야월',
  '각산', '안심', '대구한의대병원', '부호', '하양',
];

export const DAEGU_LINE_2_STATIONS: readonly string[] = [
  '문양', '다사', '대실', '강창', '계명대', '성서산업단지', '이곡', '용산', '죽전', '감삼',
  '두류', '내당', '반고개', '청라언덕', '반월당', '경대병원', '대구은행', '범어', '수성구청', '만촌',
  '담티', '연호', '수성알파시티', '고산', '신매', '사월', '정평', '임당', '영남대',
];

export const DAEGU_LINE_3_STATIONS: readonly string[] = [
  '칠곡경대병원', '학정', '팔거', '동천', '칠곡운암', '구암', '태전', '매천', '매천시장', '팔달',
  '공단', '만평', '팔달시장', '원대', '북구청', '달성공원', '서문시장', '청라언덕', '남산', '명덕',
  '건들바위', '대봉교', '수성시장', '수성구민운동장', '어린이세상', '황금', '수성못', '지산', '범물', '용지',
];

export const DAEGYEONG_LINE_STATIONS: readonly string[] = [
  '구미', '사곡', '북삼', '약목', '왜관', '연화', '신동', '지천', '서대구',
  '대구', '동대구', '고모', '가천', '경산',
];

/** 대구 전역 모든 역의 Set (빠른 멤버십 검사) */
export const ALL_DAEGU_STATIONS_SET: ReadonlySet<string> = new Set([
  ...DAEGU_LINE_1_STATIONS,
  ...DAEGU_LINE_2_STATIONS,
  ...DAEGU_LINE_3_STATIONS,
  ...DAEGYEONG_LINE_STATIONS,
]);

/** 대구 주요 역명 별칭/동의어 매핑 */
export const DAEGU_STATION_NAME_MAP: Record<string, string> = {
  '하양(대구가톨릭대)': '하양',
  '대구가톨릭대': '하양',
  '청라언덕(신남)': '청라언덕',
  '신남': '청라언덕',
  '청라언덕2': '청라언덕',
  '반월당1': '반월당',
  '반월당2': '반월당',
  '명덕1': '명덕',
  '명덕3': '명덕',
  '동대구역': '동대구',
  '서대구역': '서대구',
  '대구역': '대구역',
  '대구한의대병원': '대구한의대병원',
  '수성알파시티(고산)': '수성알파시티',
  '어린이세상(어린이회관)': '어린이세상',
  '어린이회관': '어린이세상',
};

/**
 * 역명을 정규화하여 대구 공식 역명을 찾습니다 (순수 함수).
 */
export function resolveOfficialDaeguStationName(rawStationName: string): string | null {
  if (!rawStationName) return null;
  const trimmed = rawStationName.trim();

  if (DAEGU_STATION_NAME_MAP[trimmed]) {
    return DAEGU_STATION_NAME_MAP[trimmed];
  }
  if (ALL_DAEGU_STATIONS_SET.has(trimmed)) {
    return trimmed;
  }

  const clean = trimmed.replace(/역$/, '').trim();
  if (DAEGU_STATION_NAME_MAP[clean]) {
    return DAEGU_STATION_NAME_MAP[clean];
  }
  if (ALL_DAEGU_STATIONS_SET.has(clean)) {
    return clean;
  }

  // 괄호 포함 역명 대응 (예: "하양(대구가톨릭대)" -> "하양")
  const baseName = clean.split(/[(·.]/)[0].trim();
  if (ALL_DAEGU_STATIONS_SET.has(baseName)) {
    return baseName;
  }

  return null;
}

/**
 * 주어진 역명이 대구 도시철도 또는 대경선에 속하는지 여부
 */
export function isDaeguSubwayStation(stationName: string): boolean {
  return resolveOfficialDaeguStationName(stationName) !== null;
}

/**
 * 대구 도시철도 및 대경선의 전체 정차역 순서 목록을 반환합니다 (노선도 뷰용).
 */
export function getDaeguLineStations(lineOrSubwayId: string): SubwayLineStation[] {
  const clean = String(lineOrSubwayId || '').trim();
  let list: readonly string[] = DAEGU_LINE_1_STATIONS;

  if (clean.includes('대경')) {
    list = DAEGYEONG_LINE_STATIONS;
  } else if (clean.includes('3')) {
    list = DAEGU_LINE_3_STATIONS;
  } else if (clean.includes('2')) {
    list = DAEGU_LINE_2_STATIONS;
  } else {
    list = DAEGU_LINE_1_STATIONS;
  }

  return list.map((name, idx) => ({
    index: idx,
    stationName: name.endsWith('역') ? name : `${name}역`,
  }));
}

/**
 * 목적지/방면 키워드로 대구 노선의 방향(UP/DOWN)을 추론합니다 (순수 함수).
 */
export function inferDaeguDirection(
  lineNum: string,
  destination?: string,
  headsign?: string
): 'UP' | 'DOWN' | null {
  const text = `${destination || ''} ${headsign || ''}`.trim();
  if (!text) return null;

  if (lineNum === '1') {
    if (/하양|안심|각산|반야월|신기|율하|용계|방촌|해안|동촌|아양교|동구청|동대구/.test(text)) {
      return 'UP';
    }
    if (/설화명곡|화원|대곡|진천|월배|상인|월촌|송현|서부정류장|대명|안지랑|현충로|영대병원|교대/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '2') {
    if (/영남대|임당|정평|사월|신매|고산|수성알파시티|연호|담티|만촌|수성구청|범어/.test(text)) {
      return 'UP';
    }
    if (/문양|다사|대실|강창|계명대|성서산업단지|이곡|용산|죽전|감삼|두류|내당|반고개/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '3') {
    if (/용지|범물|지산|수성못|황금|어린이세상|수성구민운동장|수성시장|대봉교|건들바위/.test(text)) {
      return 'UP';
    }
    if (/칠곡경대병원|학정|팔거|동천|칠곡운암|구암|태전|매천|매천시장|팔달|공단|만평/.test(text)) {
      return 'DOWN';
    }
  } else if (lineNum === '대경선') {
    if (/구미|사곡|북삼|약목|왜관|연화|신동|지천/.test(text)) {
      return 'UP';
    }
    if (/경산|가천|고모|동대구|대구|서대구/.test(text)) {
      return 'DOWN';
    }
  }

  return null;
}
