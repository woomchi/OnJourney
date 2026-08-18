/**
 * @fileoverview 지하철 노선 ID/이름 매핑 및 방향 판별 — 단일 진실 공급원(SSoT)
 *
 * 변경 시 이 파일만 수정하면 subwayRealtimeService, subwayTotalRealtimeService,
 * subwayPositionService, subwayService 모두에 즉시 반영됩니다.
 */

// ─── 1. 노선 ID ↔ 이름 매핑 테이블 ────────────────────────────────────────

export const SUBWAY_LINE_MAP: Record<string, string> = {
  '1001': '1호선',
  '1': '1호선',
  '1002': '2호선',
  '2': '2호선',
  '1003': '3호선',
  '3': '3호선',
  '1004': '4호선',
  '4': '4호선',
  '1005': '5호선',
  '5': '5호선',
  '1006': '6호선',
  '6': '6호선',
  '1007': '7호선',
  '7': '7호선',
  '1008': '8호선',
  '8': '8호선',
  '1009': '9호선',
  '9': '9호선',
  '1063': '경의중앙선',
  '1065': '공항철도',
  '1067': '경춘선',
  '1075': '수인분당선',
  '1077': '신분당선',
  '1081': '경강선',
  '1092': '우이신설선',
  '1093': '서해선',
  '1094': 'GTX-A',
  '1095': '신림선',
};

// ─── 2. 위치 API 전용 노선명 해석 ─────────────────────────────────────────

/**
 * subwayId 또는 노선명을 서울시 realtimePosition API가 요구하는 subwayNm으로 표준 변환합니다.
 */
export function resolveSubwayNameForApi(subwayIdOrName: string): string {
  const clean = String(subwayIdOrName || '').trim();
  if (!clean) return '';

  if (clean === '1001' || clean === '1' || clean.includes('1호선')) return '1호선';
  if (clean === '1002' || clean === '2' || clean.includes('2호선')) return '2호선';
  if (clean === '1003' || clean === '3' || clean.includes('3호선')) return '3호선';
  if (clean === '1004' || clean === '4' || clean.includes('4호선')) return '4호선';
  if (clean === '1005' || clean === '5' || clean.includes('5호선')) return '5호선';
  if (clean === '1006' || clean === '6' || clean.includes('6호선')) return '6호선';
  if (clean === '1007' || clean === '7' || clean.includes('7호선')) return '7호선';
  if (clean === '1008' || clean === '8' || clean.includes('8호선')) return '8호선';
  if (clean === '1009' || clean === '9' || clean.includes('9호선')) return '9호선';
  if (clean === '1063' || clean.includes('경의중앙') || clean.includes('경의') || clean.includes('중앙선')) return '경의중앙선';
  if (clean === '1065' || clean.includes('공항철도') || clean.includes('공항')) return '공항철도';
  if (clean === '1067' || clean.includes('경춘')) return '경춘선';
  if (clean === '1075' || clean.includes('수인분당') || clean.includes('분당선') || clean.includes('수인선')) return '수인분당선';
  if (clean === '1077' || clean.includes('신분당')) return '신분당선';
  if (clean === '1081' || clean.includes('경강')) return '경강선';
  if (clean === '1092' || clean.includes('우이신설') || clean.includes('우이')) return '우이신설선';
  if (clean === '1093' || clean.includes('서해')) return '서해선';
  if (clean.includes('신림')) return '신림선';
  if (clean.includes('GTX-A') || clean.includes('gtx-a') || clean === '1094') return 'GTX-A';

  if (/^\d+호선$/.test(clean)) return clean;
  if (/^\d+$/.test(clean) && parseInt(clean, 10) >= 1 && parseInt(clean, 10) <= 9) {
    return `${clean}호선`;
  }

  return clean;
}

// ─── 3. 역간거리 DB 후보 코드 목록 해석 ───────────────────────────────────

/**
 * subwayId 또는 노선명을 바탕으로 역간거리 DB 매칭 가능한 코드/이름 목록을 반환합니다.
 */
export function resolveCandidateLineCodes(subwayId: string): string[] {
  const cleanId = String(subwayId || '').trim();

  // 1호선
  if (cleanId === '1001' || cleanId === '1' || cleanId.includes('1호선')) {
    return ['1', '1001', '1001_경부', '1001_경인', '1001_경원', '1001_장항', '1호선_경부선', '1호선_경인선', '1호선_장항선', '1호선_경원선', '경원선'];
  }
  // 2호선
  if (cleanId === '1002' || cleanId === '2' || cleanId.includes('2호선')) {
    return ['2', '1002'];
  }
  // 3호선
  if (cleanId === '1003' || cleanId === '3' || cleanId.includes('3호선')) {
    return ['3', '1003', '3호선_일산선', '1003_일산', '일산선'];
  }
  // 4호선
  if (cleanId === '1004' || cleanId === '4' || cleanId.includes('4호선')) {
    return ['4', '1004', '4호선_과천안산선', '1004_과천안산', '과천선', '안산선'];
  }
  // 5호선
  if (cleanId === '1005' || cleanId === '5' || cleanId.includes('5호선')) {
    return ['5', '1005'];
  }
  // 6호선
  if (cleanId === '1006' || cleanId === '6' || cleanId.includes('6호선')) {
    return ['6', '1006'];
  }
  // 7호선
  if (cleanId === '1007' || cleanId === '7' || cleanId.includes('7호선')) {
    return ['7', '1007'];
  }
  // 8호선
  if (cleanId === '1008' || cleanId === '8' || cleanId.includes('8호선')) {
    return ['8', '1008'];
  }
  // 9호선
  if (cleanId === '1009' || cleanId === '9' || cleanId.includes('9호선')) {
    return ['9', '1009'];
  }
  // 경의중앙선
  if (cleanId === '1063' || cleanId.includes('경의중앙') || cleanId.includes('경의선') || cleanId.includes('중앙선')) {
    return ['1063', '경의중앙선', '경의선', '중앙선'];
  }
  // 공항철도
  if (cleanId === '1065' || cleanId.includes('공항철도') || cleanId.includes('공항')) {
    return ['1065', '공항철도'];
  }
  // 경춘선
  if (cleanId === '1067' || cleanId.includes('경춘')) {
    return ['1067', '경춘선'];
  }
  // 수인분당선
  if (cleanId === '1075' || cleanId.includes('수인분당') || cleanId.includes('분당선') || cleanId.includes('수인선')) {
    return ['1075', '수인분당선', '분당선', '수인선'];
  }
  // 신분당선
  if (cleanId === '1077' || cleanId.includes('신분당')) {
    return ['1077', '신분당선'];
  }
  // 경강선
  if (cleanId === '1081' || cleanId.includes('경강')) {
    return ['1081', '경강선'];
  }
  // 서해선
  if (cleanId === '1093' || cleanId.includes('서해')) {
    return ['1093', '서해선'];
  }
  // 우이신설선
  if (cleanId === '1092' || cleanId.includes('우이')) {
    return ['1092', '우이신설선'];
  }
  // 인천 1호선
  if (cleanId === '1069' || cleanId.includes('인천1') || cleanId.includes('인천 1')) {
    return ['1069', '인천1호선', '인천 1호선'];
  }
  // 인천 2호선
  if (cleanId === '1070' || cleanId.includes('인천2') || cleanId.includes('인천 2')) {
    return ['1070', '인천2호선', '인천 2호선'];
  }
  // 에버라인 (용인경전철)
  if (cleanId.includes('에버') || cleanId.includes('용인')) {
    return ['에버라인', '용인경전철'];
  }
  // 의정부경전철
  if (cleanId.includes('의정부')) {
    return ['의정부경전철'];
  }
  // 부산 1~4호선
  if (cleanId.includes('부산')) {
    const m = cleanId.match(/\d/);
    if (m) return [`부산${m[0]}호선`];
  }
  // 대구 1~3호선
  if (cleanId.includes('대구')) {
    const m = cleanId.match(/\d/);
    if (m) return [`대구${m[0]}호선`];
  }
  // 대전 1호선
  if (cleanId.includes('대전')) {
    return ['대전1호선'];
  }
  // 광주 1호선
  if (cleanId.includes('광주')) {
    return ['광주1호선'];
  }

  // 기본 단일 호선 번호 추출 시도
  if (cleanId.startsWith('100')) {
    return [cleanId.substring(3), cleanId];
  }
  return [cleanId];
}

// ─── 4. 노선 필터링용 ID 동치 판별 ────────────────────────────────────────

/**
 * 실시간 도착 API의 row.subwayId가 요청된 targetSubwayId와 일치하는지 판별합니다.
 */
export function isMatchingSubwayId(rowSubwayId: string | number | undefined, targetSubwayId: string | undefined): boolean {
  if (!targetSubwayId) return true;
  const cleanTarget = String(targetSubwayId).trim();
  const cleanRow = String(rowSubwayId || '').trim();

  if (!cleanRow) return true;
  if (cleanRow === cleanTarget) return true;
  if (parseInt(cleanRow, 10) === parseInt(cleanTarget, 10)) return true;

  const targetName = resolveSubwayNameForApi(cleanTarget);
  const rowName = resolveSubwayNameForApi(cleanRow);

  if (targetName && rowName && targetName === rowName) {
    return true;
  }

  return false;
}

// ─── 5. 방향 판별 단일 공통 함수 ──────────────────────────────────────────

/**
 * 문자열/코드가 상행/내선 방향인지 판별합니다.
 *
 * 공공 API 및 내부 표준 매핑:
 * - '상행', '내선', '내선순환', '상선', '0', '1'(wayCode) -> true
 * - '하행', '외선', '외선순환', '하선', '1'(위치API), '2'(wayCode) -> false
 */
export function isUpLine(updnLine: string | number | undefined): boolean {
  const s = String(updnLine || '').trim();
  if (!s) return true;

  // 1. 하행/외선 명시적 확인
  if (
    s === '하행' ||
    s === '외선' ||
    s === '외선순환' ||
    s === '하선' ||
    s === '2' // wayCode: 2 (하행)
  ) {
    return false;
  }

  // 2. 상행/내선 명시적 확인
  if (
    s === '상행' ||
    s === '내선' ||
    s === '내선순환' ||
    s === '상선' ||
    s === '0' // 위치 API updnLine: 0 (상행)
  ) {
    return true;
  }

  // 3. '1'의 경우: wayCode '1'은 상행이지만 위치 API '1'은 하행임.
  // 기본적으로 문자열 '상'/'내' 포함 여부로 1차 안전 판별
  if (s.includes('상') || s.includes('내')) return true;
  if (s.includes('하') || s.includes('외')) return false;

  // wayCode 기본값 ('1' = 상행)
  return s === '1';
}

/**
 * 문자열을 wayCode ('1': 상행/내선, '2': 하행/외선)로 변환합니다.
 */
export function resolveWayCode(updnLine: string | number | undefined): '1' | '2' {
  return isUpLine(updnLine) ? '1' : '2';
}

/**
 * wayCode ('1'/'2') 또는 updnLine 문자열을 서울시 실시간 열차 위치 API 방향 ('0': 상행, '1': 하행)으로 변환합니다.
 */
export function resolvePositionDirection(wayCodeOrUpdnLine: string | number | undefined): '0' | '1' {
  return isUpLine(wayCodeOrUpdnLine) ? '0' : '1';
}
