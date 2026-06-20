# On-Journey 프로젝트 진행 상황

> 마지막 업데이트: 2026-06-19

## 📌 프로젝트 개요

**온저니(On-Journey)** — 다중 경유지 경로 최적화 서비스  
슬로건: *"당신의 모든 이동이 온전히, 여정이 되도록."*

n개의 방문지를 추가하고 드래그 앤 드롭으로 순서를 조정하면 구간별 최적 경로·이동수단을 자동 생성해주는 웹앱.

---

## ✅ 완료된 작업

### 프로젝트 초기화
- [x] Next.js 16 (App Router) + TypeScript 프로젝트 생성
- [x] Tailwind CSS v4 설정
- [x] ESLint 설정

### 기술 스택 설치
- [x] `@supabase/supabase-js` + `@supabase/ssr` — 백엔드/인증
- [x] `zustand` — 클라이언트 상태 관리
- [x] `react-naver-maps` — 지도 렌더링
- [x] `pg` — DB 직접 연결 (마이그레이션 스크립트용)

### 인증 시스템
- [x] `src/providers/AuthProvider.tsx` — Supabase Auth 상태 관리 Provider
- [x] `src/components/AuthModal.tsx` — 로그인/회원가입 모달 UI
- [x] `src/app/auth/` — 인증 콜백 라우트
- [x] `middleware.ts` — 인증 미들웨어 (세션 갱신)
- [x] `src/lib/supabase/` — 서버/클라이언트 Supabase 인스턴스
- [x] `src/lib/auth/security.ts` — 인증 보안 유틸리티

### 데이터베이스 & API
- [x] `supabase/migrations/20240614000000_create_journeys.sql` — `journeys` 테이블 마이그레이션
- [x] `scripts/setup-db.mjs` — DB 초기화 스크립트 (`npm run db:setup`)
- [x] `src/lib/journeys.ts` — `insertJourney`, `fetchLatestJourney`, `fetchJourneys`, `deleteJourneys`, `updateJourney` API 함수
- [x] `src/lib/journeys/updatePlaces.ts` — 여정 장소 목록 및 순서 DB 업데이트 API 함수
- [x] `src/lib/journeys/errors.ts` — Supabase 에러 메시지 변환 유틸리티

### 외부 API 연동
- [x] `src/app/api/places/route.ts` — 네이버 장소 검색 API 프록시
- [x] `src/app/api/directions/route.ts` — 통합 경로 탐색 API (ODsay 대중교통 + 네이버 Directions 5 차량 + 도보/자전거/킥보드)
- [x] `src/app/api/directions-waypoints/route.ts` — 네이버 Directions 5 다중 경유지 차량 경로 프록시

### Zustand 상태 관리
- [x] `src/stores/journey-store.ts` — 확장된 상태 및 액션 관리:
  - `activeJourney`, `journeys` — 여정 데이터
  - `createJourney`, `updateJourneyInfo` — 여정 생성/수정
  - `addPlace`, `removePlace`, `reorderPlaces` — 장소 관리 (낙관적 업데이트)
  - `directionsCache`, `directionsLoading` — 구간별 경로 캐시 및 로딩 상태
  - `fetchSegmentDirections`, `fetchJourneyDirections` — 경로 API 호출 (150ms 간격 순차 호출)
  - `selectSegmentRoute` — 구간별 경로 대안 선택 및 DB 동기화
  - `focusBounds`, `focusedSegment`, `focusedStep` — 지도 포커스 상태 관리
  - `verifyAndCleanRoutes()` — 순서 변경 시 무효화된 `selected_route` 자동 정리

### 타입 시스템
- [x] `src/types/journey.ts` — 확장된 타입 정의:
  - `Place` (+ `selected_route` 필드)
  - `Journey`, `CreateJourneyInput`
  - `TransportType` (`'public' | 'car' | 'walk'`)
  - `SelectedRoute`, `DirectionStep`, `RouteGuideNode`
  - `DirectionResult`, `DirectionsApiResponse`
  - `LatLngBoundsLiteral`, `FocusedSegment`, `FocusedStep`

### 핵심 UI 컴포넌트
- [x] `src/components/JourneySidebar.tsx` — 좌측 사이드바 (여정 목록 드래그앤드롭 순서 변경, 여정 다중 선택 삭제, 여정 상세 및 장소 관리 분기)
- [x] `src/components/CreateJourneyModal.tsx` — 여정 생성 모달 (여정명, 이동수단, 날짜 선택)
- [x] `src/components/EditJourneyModal.tsx` — 여정 정보 수정 모달 (여정명, 이동수단, 날짜 수정)
- [x] `src/components/PlaceList.tsx` — 여정 장소 목록 (장소 드래그앤드롭 순서 변경, 장소 다중 선택 삭제, 구간별 실시간 대중교통 타임라인 UI, 대안 이동 수단 아코디언 UI 포함)
- [x] `src/components/PlaceSearchBar.tsx` — 네이버 장소 API 연동 검색창 및 실시간 검색 목록 표시
- [x] `src/components/AddPlaceModal.tsx` — 검색된 장소를 선택해 여정에 추가하는 모달
- [x] `src/components/MapArea.tsx` — 네이버 지도 (구간별 폴리라인, 방향 화살표, 환승 마커, 세그먼트/스텝 포커스, 동적 패딩)
- [x] `src/components/RouteGuidePanel.tsx` — 상세 경로 안내 플로팅 패널 (대중교통 step-by-step / 차량 turn-by-turn 안내)

### 지도 서비스 모듈
- [x] `src/lib/naverMapRouteService.ts` — 지도 관련 유틸리티 모듈:
  - `NaverDirectionService` — 네이버 Direction 5 API 호출 서비스 (Fallback 포함)
  - `RouteDataParser` — API 응답 데이터 → 지도 객체 변환 파서
  - `NaverMapRouteRenderer` — 폴리라인 렌더링 및 fitBounds 뷰포트 관리
  - `calculateHaversineDistance()` — 두 좌표 간 직선 거리 계산 (Haversine)
  - `calculateSegmentBounds()`, `calculateStepBounds()`, `calculateJourneyBounds()` — 바운드 계산
  - `expandBounds()` — 경계 상자 확장/수축

### 레이아웃 & 환경
- [x] `src/app/page.tsx` — 메인 레이아웃 (사이드바 + 지도 영역)
- [x] `src/app/layout.tsx` — 루트 레이아웃 (AuthProvider, QueryClientProvider)
- [x] `.env.local` — Supabase URL/KEY, 네이버 클라이언트 ID, ODsay API KEY 등 환경변수
- [x] `docs/OnJourney.md` — 프로젝트 컨텍스트 문서
- [x] `docs/datatable.md` — DB 스키마 및 데이터 구조 정의서

---

## 🚀 구현 완료된 핵심 기능 (MVP 기준)

| 기능 | 상태 | 비고 |
|------|------|------|
| 여정 목록/전환 관리 | ✅ 완료 | 여러 여정을 목록에서 확인 및 전환 가능 |
| 여정 정보 수정 | ✅ 완료 | 여정명, 날짜, 이동수단 수정 모달 |
| 장소 검색 & 추가 | ✅ 완료 | 네이버 장소 API 연동 및 장소 추가 모달 구현 |
| 여정 내 장소 목록 표시 | ✅ 완료 | 사이드바에 추가된 장소 렌더링 |
| 드래그 앤 드롭 순서 조정 | ✅ 완료 | HTML5 Native DnD 적용 (여정 목록: 사용자별 `localStorage` 순서 저장 / 장소 목록: DB 실시간 동기화) |
| 장소/여정 다중 삭제 | ✅ 완료 | 편집 모드(체크박스) 활용한 다중 선택 및 일괄 삭제 API 연동 |
| 지도 마커 연동 | ✅ 완료 | 장소 목록과 지도 위 마커 동기화, 순번 표시, 줌 이동 |
| 구간별 실시간 이동 정보 | ✅ 완료 | ODsay API (대중교통) + 네이버 Directions 5 (차량) 실시간 연동 |
| 구간별 이동 경로 시각화 | ✅ 완료 | 교통수단 색상별 폴리라인, 방향 화살표(Chevron), 환승 마커, 이중 렌더링(외곽선+본선) |
| 이동 대안 선택 | ✅ 완료 | 대중교통/차량/도보 카테고리별 복수 대안 아코디언 UI, 경로 선택 시 DB 동기화 |
| 상세 경로 안내 패널 | ✅ 완료 | 대중교통 step-by-step (탑승/하차 정보) + 차량 turn-by-turn 안내 |
| 세그먼트/스텝 포커스 | ✅ 완료 | 구간 클릭 시 하이라이트+줌 인, 개별 step 포커스, 연속 구간 탐색 |

## 🚧 아직 구현되지 않은 기능 (추후 확장)

| 기능 | 상태 | 비고 |
|------|------|------|
| 실시간 버스/지하철 도착 정보 | ❌ 미구현 | 공공데이터포털 실시간 도착 API 연동 필요 (현재 RouteGuidePanel에 플레이스홀더 표시) |
| PWA (Progressive Web App) | ❌ 미구현 | 모바일 네이티브 앱 경험 제공을 위한 PWA 도입 검토 |
| 여정 후기 기능 | ❌ 미구현 | 여정 복수 선택 → 후기 작성 기능 |
| 여정 캘린더 | ❌ 미구현 | 캘린더 뷰에서 여정 일정 확인 |
| 여정 공유 | ❌ 미구현 | 다른 사용자와 여정 공유 기능 |

---

## 📦 현재 의존성 현황

| 패키지 | 설치됨? | 비고 |
|--------|---------|------|
| `react-naver-maps` | ✅ | 지도 렌더링 |
| `zustand` | ✅ | 클라이언트 상태 관리 |
| `@supabase/ssr` | ✅ | Supabase SSR 통합 |
| `@supabase/supabase-js` | ✅ | Supabase 클라이언트 |
| `pg` | ✅ | DB 마이그레이션 스크립트용 |
| `@tanstack/react-query` | ❌ | 보류 (현재 Zustand로 데이터 페칭 충분) |
| `@atlaskit/pragmatic-drag-and-drop` | ❌ | 불필요 (HTML5 Native DnD로 대체 구현) |
| `shadcn/ui` | ❌ | 보류 (Vanilla CSS + Tailwind로 커스텀 구현) |

---

## 🗺️ 다음 단계 제안

1. **실시간 도착 정보 연동** — 공공데이터포털 버스/지하철 실시간 도착 API 연동을 통해 RouteGuidePanel의 도착 정보 플레이스홀더를 실제 데이터로 교체
2. **PWA 도입** — 모바일 환경에서 네이티브 앱처럼 동작하도록 PWA 세팅 검토
3. **여정 후기/공유** — Phase 2 기능으로 여정 후기 작성 및 공유 기능 구현
