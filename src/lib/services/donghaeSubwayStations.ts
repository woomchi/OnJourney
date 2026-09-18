/**
 * @fileoverview 동해선 광역전철 역사 메타데이터 & 순수 유틸리티
 *
 * - Node.js 내장 모듈(fs, path 등)에 일절 의존하지 않아 클라이언트 컴포넌트 및 브라우저 환경에서 안전하게 임포트 가능합니다.
 */

import type { SubwayLineStation } from '@/types/journey';

// ─── 동해선 23개 역 순서 및 역명 정의 ─────────────────────────────────────────

export const DONGHAE_STATIONS = [
  '부전',
  '거제해맞이',
  '거제',
  '교대',
  '동래',
  '안락',
  '부산원동',
  '재송',
  '센텀',
  '벡스코',
  '신해운대',
  '송정',
  '오시리아',
  '기장',
  '일광',
  '좌천',
  '월내',
  '서생',
  '남창',
  '망양',
  '덕하',
  '개운포',
  '태화강',
] as const;

/** 동해선 고유역 (부산 1~4호선 등 타 노선과 이름이 겹치지 않는 고유역) */
export const DONGHAE_UNIQUE_STATIONS = new Set([
  '태화강',
  '개운포',
  '덕하',
  '망양',
  '남창',
  '서생',
  '월내',
  '일광',
  '기장',
  '오시리아',
  '신해운대',
  '송정',
  '재송',
  '부산원동',
  '안락',
  '거제해맞이',
]);

/** 역명 별칭/축약 매핑 */
export const DONGHAE_ALIASES: Record<string, string> = {
  '부교대': '교대',
  '교대역': '교대',
  '거제해': '거제해맞이',
  '부산원': '부산원동',
  '신해운': '신해운대',
  '오시리': '오시리아',
  '태화강역': '태화강',
  '부전역': '부전',
  '벡스코역': '벡스코',
  '기장역': '기장',
  '일광역': '일광',
  '송정역': '송정',
};

/**
 * 역명을 동해선 공식 표준 역명으로 정규화합니다.
 */
export function resolveOfficialDonghaeStationName(rawStationName: string): string | null {
  if (!rawStationName) return null;
  const clean = rawStationName
    .replace(/\(.*?\)/g, '') // 괄호 및 부역명 제거
    .replace(/역$/g, '')      // 끝자리 '역' 제거
    .trim();

  if (DONGHAE_ALIASES[clean]) {
    return DONGHAE_ALIASES[clean];
  }

  const exact = DONGHAE_STATIONS.find((s) => s === clean);
  if (exact) return exact;

  const partial = DONGHAE_STATIONS.find((s) => clean.includes(s) || s.includes(clean));
  return partial || null;
}

/**
 * 동해선 역인지 여부를 확인합니다.
 */
export function isDonghaeSubwayStation(rawStationName: string): boolean {
  return Boolean(resolveOfficialDonghaeStationName(rawStationName));
}

/**
 * 노선도 렌더링용 동해선 전체 역 목록을 반환합니다.
 */
export function getDonghaeLineStations(): SubwayLineStation[] {
  return DONGHAE_STATIONS.map((name, index) => ({
    index,
    stationName: `${name}역`,
    stationOrder: index + 1,
  }));
}
