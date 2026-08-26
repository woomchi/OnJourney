/**
 * @fileoverview 지하철 역명 정규화, 열차 메타데이터/행선지, 급행 여부, 시간 파싱 모듈
 */

import type { TrainMetadata } from './types';

/**
 * 역명 문자열에서 괄호, 출구, 수식어 등을 정제하여 표준 역명을 반환합니다.
 */
export function normalizeStationName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*\(.*?\)\s*/g, '') // 괄호 및 괄호 안 텍스트 제거 (예: "서울역(1호선)" -> "서울역")
    .replace(/\s*\d+번출구\s*/g, '') // 출구 번호 제거
    .replace(/역$/g, '')            // 끝의 '역' 접미사 제거 ("강남역" -> "강남")
    .trim();
}

/**
 * "M:SS" 형식의 소요 시간 문자열을 총 초(Seconds)로 변환합니다.
 */
export function parseMinSecToSeconds(hmStr: string): number {
  if (!hmStr) return 120;
  const parts = hmStr.trim().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  }
  const num = parseFloat(hmStr);
  return isNaN(num) ? 120 : Math.round(num * 60);
}

/**
 * trainLineNm (예: "광운대행 - 세류방면", "동인천(급행)행 - 신도림방면", "청량리행(막차)", "동인천급행", "천안(급행)행")에서 종착역과 급행 여부를 추출합니다.
 */
export function extractTrainMetadata(trainLineNm?: string): TrainMetadata {
  if (!trainLineNm) {
    return { destination: null, directionName: null, isExpress: false, isSpecialExpress: false };
  }

  const parts = trainLineNm.split('-');
  const lineHead = parts[0].trim();
  const directionName = parts.length > 1 ? parts[1].replace(/방면$/g, '').trim() : null;

  const isSpecialExpress = lineHead.includes('특급');
  const isExpress =
    isSpecialExpress ||
    lineHead.includes('급행') ||
    lineHead.includes('(급)') ||
    lineHead.includes('Express');

  // 1. 접두 "급행 ", "특급 ", "일반 " 제거
  let cleanHead = lineHead.replace(/^(?:급행|특급|일반)\s*/g, '').trim();

  // 2. 괄호 태그 ("(급행)", "(급)", "(막차)", "(특급)", "(순환)" 등) 제거
  cleanHead = cleanHead.replace(/\([^)]*\)/g, '').trim();

  // 3. 접미사 ("급행행", "급행", "특급행", "특급", "행" 등) 안전하게 분리 및 제거
  cleanHead = cleanHead
    .replace(/(?:급행|특급|일반)\s*행?$/g, '')
    .replace(/행$/g, '')
    .trim();

  let destination: string | null = null;

  if (cleanHead) {
    destination = normalizeStationName(cleanHead);
  }

  return { destination, directionName, isExpress, isSpecialExpress };
}

/**
 * trainLineNm에서 종착역명(Destination)을 추출합니다.
 */
export function extractTrainDestination(trainLineNm?: string): string | null {
  return extractTrainMetadata(trainLineNm).destination;
}

/**
 * 실시간 도착 메시지(arvlMsg2)에서 현재 열차의 위치 역명을 정밀 추출합니다.
 */
export function extractCurrentStation(
  arvlMsg2: string,
  targetStation: string,
  _updnLine?: string
): string {
  if (!arvlMsg2) return '';

  const cleanTarget = normalizeStationName(targetStation);

  // 1. "전역 도착", "전역 진입", "전역 출발" -> 전역
  if (arvlMsg2.includes('전역')) {
    return '전역';
  }

  // 2. "[N]번째 전역" 패턴 매칭
  const numBeforeMatch = arvlMsg2.match(/\[?(\d+)\]?번째\s*전역/);
  if (numBeforeMatch) {
    return `${numBeforeMatch[1]}개역 전`;
  }

  // 3. "역명 진입/도착/출발" 패턴 매칭
  const stnActionMatch = arvlMsg2.match(/([가-힣a-zA-Z0-9]+)\s*(?:역)?\s*(?:진입|도착|출발)/);
  if (stnActionMatch) {
    const rawStn = stnActionMatch[1];
    const cleanStn = normalizeStationName(rawStn);
    if (cleanStn && cleanStn !== cleanTarget) {
      return cleanStn;
    }
  }

  // 4. "역명[출발/도착]" 괄호 패턴
  const bracketMatch = arvlMsg2.match(/\[([가-힣a-zA-Z0-9]+)\]/);
  if (bracketMatch) {
    const cleanStn = normalizeStationName(bracketMatch[1]);
    if (cleanStn && cleanStn !== cleanTarget) {
      return cleanStn;
    }
  }

  return '';
}

/**
 * 실시간 도착 메시지(arvlMsg2)에서 남은 역 수를 정밀 추출합니다.
 */
export function extractRemainingStations(arvlMsg2: string): number | null {
  if (!arvlMsg2) return null;

  // 1. "당역 진입/도착" -> 0
  if (arvlMsg2.includes('당역') || arvlMsg2.includes('도착') || arvlMsg2.includes('진입')) {
    return 0;
  }

  // 2. "전역" -> 1
  if (arvlMsg2.includes('전역') && !arvlMsg2.includes('번째')) {
    return 1;
  }

  // 3. "[N]번째 전역" / "N개역 전"
  const match = arvlMsg2.match(/\[?(\d+)\]?(?:번째\s*전역|개역\s*전)/);
  if (match) {
    const count = parseInt(match[1], 10);
    return isNaN(count) ? null : count;
  }

  return null;
}

/**
 * 급행/특급 열차 여부를 판별합니다.
 */
export function isExpressTrain(
  trainLineNm?: string,
  btrainSttus?: string,
  arvlMsg2?: string,
  trainNo?: string
): boolean {
  const lineNm = String(trainLineNm || '');
  const sttus = String(btrainSttus || '');
  const msg = String(arvlMsg2 || '');
  const no = String(trainNo || '');

  if (lineNm.includes('급행') || lineNm.includes('특급') || lineNm.includes('Express')) return true;
  if (sttus.includes('급행') || sttus.includes('특급')) return true;
  if (msg.includes('급행') || msg.includes('특급')) return true;
  // 1호선 경부선 청량리-천안/신창 급행 열차 번호 대역 (1900번대)
  if (no.startsWith('19')) return true;

  return false;
}

/**
 * 서울시 지하철 API recptnDt 문자열("YYYY-MM-DD HH:mm:ss.S")을 KST(+09:00) 기준으로 안전하게 파싱합니다.
 */
export function parseSeoulApiDate(recptnDt: string): number {
  if (!recptnDt) return NaN;
  let cleanStr = recptnDt.trim().replace(' ', 'T');
  if (!cleanStr.includes('+') && !cleanStr.endsWith('Z')) {
    cleanStr = `${cleanStr.split('.')[0]}+09:00`;
  }
  return new Date(cleanStr).getTime();
}
