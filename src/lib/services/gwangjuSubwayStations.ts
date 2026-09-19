/**
 * @fileoverview 광주 도시철도(1호선) 역사 메타데이터 & 순수 유틸리티
 *
 * - Node.js 내장 모듈(fs, path 등)에 일절 의존하지 않아 클라이언트 컴포넌트 및 브라우저 환경에서 안전하게 임포트 가능합니다.
 */

import type { SubwayLineStation } from '@/types/journey';

// ─── 정차역 순서 정의 ──────────────────────────────────────────────────────────

export const GWANGJU_LINE_1_STATIONS: readonly string[] = [
  '녹동', '소태', '학동증심사입구', '남광주', '문화전당', '금남로4가', '금남로5가',
  '양동시장', '돌고개', '농성', '화정', '쌍촌', '운천', '상무', '김대중컨벤션센터',
  '공항', '송정공원', '광주송정', '도산', '평동',
];

/** 광주 전역 모든 역의 Set (빠른 멤버십 검사) */
export const ALL_GWANGJU_STATIONS_SET: ReadonlySet<string> = new Set(GWANGJU_LINE_1_STATIONS);

/** 광주 주요 역명 별칭/동의어 매핑 */
export const GWANGJU_STATION_NAME_MAP: Record<string, string> = {
  '광주송정역': '광주송정',
  '송정리': '광주송정',
  '김대중컨벤션센터(마륵)': '김대중컨벤션센터',
  '마륵': '김대중컨벤션센터',
  '학동·증심사입구': '학동증심사입구',
  '증심사입구': '학동증심사입구',
  '문화전당(구도청)': '문화전당',
  '구도청': '문화전당',
  '금남로4가역': '금남로4가',
  '금남로5가역': '금남로5가',
  '남광주역': '남광주',
  '상무역': '상무',
  '농성역': '농성',
  '평동역': '평동',
  '녹동역': '녹동',
  '소태역': '소태',
  '양동시장역': '양동시장',
  '돌고개역': '돌고개',
  '화정역': '화정',
  '쌍촌역': '쌍촌',
  '운천역': '운천',
  '공항역': '공항',
  '송정공원역': '송정공원',
  '도산역': '도산',
};

/**
 * 역명을 정규화하여 광주 공식 역명을 찾습니다 (순수 함수).
 */
export function resolveOfficialGwangjuStationName(rawStationName: string): string | null {
  if (!rawStationName) return null;
  const trimmed = rawStationName.trim();

  if (GWANGJU_STATION_NAME_MAP[trimmed]) {
    return GWANGJU_STATION_NAME_MAP[trimmed];
  }
  if (ALL_GWANGJU_STATIONS_SET.has(trimmed)) {
    return trimmed;
  }

  const clean = trimmed.replace(/역$/, '').trim();
  if (GWANGJU_STATION_NAME_MAP[clean]) {
    return GWANGJU_STATION_NAME_MAP[clean];
  }
  if (ALL_GWANGJU_STATIONS_SET.has(clean)) {
    return clean;
  }

  // 괄호 포함 역명 대응 (예: "김대중컨벤션센터(마륵)" -> "김대중컨벤션센터")
  const baseName = clean.split(/[(·.]/)[0].trim();
  if (ALL_GWANGJU_STATIONS_SET.has(baseName)) {
    return baseName;
  }

  return null;
}

/**
 * 주어진 역명이 광주 도시철도 1호선에 속하는지 여부
 */
export function isGwangjuSubwayStation(stationName: string): boolean {
  return resolveOfficialGwangjuStationName(stationName) !== null;
}

/**
 * 정차역 목록 반환 (UI 노선도 뷰 및 역간거리용)
 */
export function getGwangjuLineStations(): SubwayLineStation[] {
  return GWANGJU_LINE_1_STATIONS.map((stationName, index) => ({
    index,
    stationName,
    stationId: `1${String(index).padStart(2, '0')}`,
    hmSeconds: 120,
    cumulativeSeconds: (index + 1) * 120,
    distKm: 1.05,
  }));
}

/**
 * 목적지(destination), 방면(headsign), 출발역(currentStation) 정보를 바탕으로
 * 상행(UP: 평동 방면) / 하행(DOWN: 녹동/소태 방면)을 추론합니다.
 */
export function inferGwangjuDirection(
  destination?: string,
  headsign?: string,
  currentStation?: string
): 'UP' | 'DOWN' {
  const cleanDest = destination ? resolveOfficialGwangjuStationName(destination) || destination.trim() : '';
  const cleanHead = headsign ? resolveOfficialGwangjuStationName(headsign) || headsign.trim() : '';

  // 1. 목적지/방면 텍스트 기반 판별
  // UP: 평동 방면
  if (
    cleanDest.includes('평동') ||
    cleanHead.includes('평동') ||
    cleanDest.includes('도산') ||
    cleanHead.includes('도산') ||
    cleanDest.includes('광주송정') ||
    cleanHead.includes('광주송정')
  ) {
    return 'UP';
  }

  // DOWN: 녹동/소태 방면
  if (
    cleanDest.includes('소태') ||
    cleanHead.includes('소태') ||
    cleanDest.includes('녹동') ||
    cleanHead.includes('녹동') ||
    cleanDest.includes('학동') ||
    cleanHead.includes('학동') ||
    cleanDest.includes('남광주') ||
    cleanHead.includes('남광주') ||
    cleanDest.includes('문화전당') ||
    cleanHead.includes('문화전당')
  ) {
    return 'DOWN';
  }

  // 2. 현재 역과 목적지역의 인덱스 비교
  if (currentStation && cleanDest) {
    const curOfficial = resolveOfficialGwangjuStationName(currentStation);
    const destOfficial = resolveOfficialGwangjuStationName(cleanDest);
    if (curOfficial && destOfficial) {
      const curIdx = GWANGJU_LINE_1_STATIONS.indexOf(curOfficial);
      const destIdx = GWANGJU_LINE_1_STATIONS.indexOf(destOfficial);
      if (curIdx !== -1 && destIdx !== -1 && curIdx !== destIdx) {
        // 녹동(0) -> 평동(19) 방향은 UP
        return destIdx > curIdx ? 'UP' : 'DOWN';
      }
    }
  }

  // 기본값: 상행(UP: 평동 방면)
  return 'UP';
}
