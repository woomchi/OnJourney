/**
 * @fileoverview UI 레이아웃 및 바텀시트 스냅 포인트 상수 정의
 *
 * 모바일 바텀시트 높이, 헤더 높이, 반응형 스냅 포인트 등을 중앙 관리합니다.
 */

export const BOTTOM_SHEET_SNAP = {
  // ─── 메인 타임라인 바텀시트 (FixedJourneyTimelineSheet) ─────────────────────
  /** 기본 축소 상태 (하단 미니 플레이어 바 높이: 54px) */
  TIMELINE_COLLAPSED: 54,
  /** 중간 확장 상태 (노드 목록 기본 노출: 260px) */
  TIMELINE_HALF: 260,
  /** 확장 상태 (320px) */
  TIMELINE_HALF_EXPANDED: 320,

  // ─── 구간 상세 경로 안내 패널 (RouteGuidePanel) ────────────────────────────
  /** 최소화 상태 (상단 칩/요약만 노출: 190px) */
  GUIDE_MINIMIZED: 190,
  /** 기본 안내 높이 (스텝 목록 노출: 370px) */
  GUIDE_DEFAULT: 370,

  // ─── 대안 경로 탐색 패널 (AlternativeRoutePanel) ───────────────────────────
  /** 대안 경로 목록 기본 높이 (단일 카드 및 헤더 안정 노출: 370px) */
  ALTERNATIVE_DEFAULT: 370,
  /** 대안 경로 목록 최소/기본 고정 높이 (px) */
  ALTERNATIVE_MIN_PX: 370,

  // ─── 공통 전체 확장 ────────────────────────────────────────────────────────
  /** 전체 화면 확장 상태 (1 또는 '1') */
  FULL_EXPANDED: 1,
} as const;

export const HEADER_HEIGHT = {
  /** 데스크톱 기본 헤더 높이 (72px) */
  DESKTOP_NORMAL: 72,
  /** 데스크톱 편집 모드 헤더 높이 (48px) */
  DESKTOP_EDIT: 48,
  /** 모바일 바텀시트 내부 상단 버튼 바 높이 (32px) */
  MOBILE_BUTTON_BAR: 32,
} as const;

export const GESTURE_THRESHOLDS = {
  /** 실시간 도착 정보 Hero 카드 좌우 스와이프 감지 최소 거리 (px) */
  HERO_SWIPE_MIN_PX: 35,
} as const;

