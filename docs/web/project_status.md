# On-Journey 프로젝트 진행 상황

> 마지막 업데이트: 2026-07-05

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
- [x] 로컬 개발 환경 설정 및 의존성 설치 검증 (2026-07-01)

### 기술 스택 설치
- [x] `@supabase/supabase-js` + `@supabase/ssr` — 백엔드/인증
- [x] `zustand` — 클라이언트 상태 관리
- [x] `react-naver-maps` — 지도 렌더링
- [x] `pg` — DB 직접 연결 (마이그레이션 스크립트용)
- [x] `fast-xml-parser` — 공공 API XML 응답 파싱 (버스/지하철 실시간 도착 정보)
- [x] `xlsx` — 철도 운행거리 데이터 처리

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
- [x] `src/app/api/subway/realtime/route.ts` — 지하철 실시간 도착 정보 API (서울시 실시간 지하철 + TAGO 시간표 Fallback)
- [x] `src/app/api/bus/realtime/route.ts` — 버스 실시간 도착 정보 API (TAGO + 경기도 공공 API 이중 조회)

### 실시간 교통 정보 서비스 모듈
- [x] `src/lib/subwayService.ts` — 지하철 실시간 도착 정보 서비스 모듈:
  - `calculateSubwayETADynamic()` — 실시간 ETA 동적 계산 (barvlDt 보정, 역간거리 DB 기반 Fallback)
  - `calculateNextTrainFromTimetable()` — TAGO 시간표 기반 다음 열차 도착 계산
  - `fetchAndCacheTimetable()` — 시간표 캐싱 (3시간 TTL, 에러 시 5분 쿨다운)
  - `fetchStationId()` — TAGO SubwayInfo API 역 ID 조회 (메모리 캐시)
  - `fetchDynamicTravelTimeSec()` — 시간표 기반 동적 이동시간 계산
  - `calculateTimeBetweenStations()` — 역간거리 JSON DB 기반 소요시간 계산
  - `extractCurrentStation()`, `extractRemainingStations()` — 실시간 메시지 파싱 유틸리티
- [x] `src/data/subway_distances.json` — 지하철 역간거리 데이터
- [x] `서울교통공사_역간거리.json` — 서울교통공사 역간거리 원본 데이터

### Zustand 상태 관리
- [x] `src/stores/` — 슬라이스 패턴 기반의 확장된 상태 및 액션 관리 (리팩토링 완료):
  - `journeyDataSlice.ts`: `activeJourney`, `journeys` 여정 데이터 생성/수정/삭제 및 장소 관리 (낙관적 업데이트)
  - `mapSlice.ts`: `focusBounds`, `focusedSegment`, `focusedStep` 지도 포커스 상태 관리 및 경로 렌더링 상태
  - `uiSlice.ts`: 모달 및 패널 표시 여부, 경로 API 캐시 및 로딩 상태 관리
  - 기존 `journey-store.ts`를 관심사에 따라 모듈화하여 유지보수성 및 성능 개선

### 타입 시스템
- [x] `src/types/journey.ts` — 확장된 타입 정의:
  - `Place` (+ `selected_route` 필드)
  - `Journey`, `CreateJourneyInput`
  - `TransportType` (`'public' | 'car' | 'walk'`)
  - `SelectedRoute` (+ `isFareEstimated`, `isIntercity` 필드)
  - `DirectionStep` (+ `type: 'train' | 'expressbus'`, `headsign`, `wayCode` 필드)
  - `RouteGuideNode`
  - `DirectionResult` (+ `isFareEstimated`, `isIntercity` 필드)
  - `DirectionsApiResponse`
  - `LatLngBoundsLiteral`, `FocusedSegment`
  - `FocusedStep` (+ `subType: 'start' | 'end' | 'dest'`)
  - `SubwayArrival` — 지하철 실시간 도착 정보 타입
  - `BusArrival` — 버스 실시간 도착 정보 타입

### 핵심 UI 컴포넌트
- [x] `src/components/JourneySidebar.tsx` — 좌측 사이드바 (여정 목록 드래그앤드롭 순서 변경, 여정 다중 선택 삭제, 여정 상세 및 장소 관리 분기)
- [x] `src/components/CreateJourneyModal.tsx` — 여정 생성 모달 (여정명, 이동수단, 날짜 선택)
- [x] `src/components/EditJourneyModal.tsx` — 여정 정보 수정 모달 (여정명, 이동수단, 날짜 수정)
- [x] `src/components/PlaceList.tsx` — 여정 장소 목록 (장소 드래그앤드롭 순서 변경, 장소 다중 선택 삭제, 구간별 실시간 대중교통 타임라인 UI)
- [x] `src/components/AlternativeRoutePanel.tsx` — 대안 이동 수단 탐색 패널 (카테고리별 대안 경로 미리보기, 단거리 도보/대중교통 자동 분기 처리, 타 구간 클릭 시 자동 닫힘 처리, 도보 타임라인 색상 통일)
- [x] `src/components/PlaceSearchBar.tsx` — 네이버 장소 API 연동 검색창 및 실시간 검색 목록 표시
- [x] `src/components/AddPlaceModal.tsx` — 검색된 장소를 선택해 여정에 추가하는 모달
- [x] `src/components/MapArea.tsx` — 네이버 지도 (구간별 폴리라인, 방향 화살표, 환승 마커, 세그먼트/스텝 포커스, 동적 패딩)
- [x] `src/components/RouteGuidePanel.tsx` — 상세 경로 안내 플로팅 패널 (대중교통 step-by-step / 차량 turn-by-turn 안내, 장거리 노선 예매 링크, 세부 구간(step) 및 전체 이동 구간(segment) 탐색 네비게이션 분리, 향후 실시간 추적을 위한 UI 레이아웃 최적화)

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
- [x] `.env.local` — Supabase URL/KEY, 네이버 클라이언트 ID, ODsay API KEY, 서울시 지하철 API KEY, TAGO 실시간 버스 API KEY, 경기도 버스 API KEY 등 환경변수
- [x] `docs/OnJourney.md` — 프로젝트 컨텍스트 문서
- [x] `docs/datatable.md` — DB 스키마 및 데이터 구조 정의서

### 최근 업데이트 (2026-07-01 ~ 2026-07-05)
**아키텍처 및 상태 관리 리팩토링**
- [x] 상태 관리 구조 개선: `journey-store`를 슬라이스 패턴(`mapSlice`, `journeyDataSlice`, `uiSlice`)으로 분리하여 관심사 분리 및 컴포넌트 리렌더링 최적화
- [x] 대형 단일 컴포넌트 모듈화: `JourneySidebar` 등 UI 의존성이 높은 모놀리식 코드를 `SearchOverlay`, `JourneyListSidebar` 등으로 분할하여 코드베이스 유지보수성 향상

**지도 및 UI/UX 성능 향상**
- [x] "내 위치 보기" (Geolocation) 버튼 응답성 및 속도 최적화: 위치 정보 획득 및 렌더링 병목 개선
- [x] 지도 기반 검색(Map-Based Search) 기능 추가: 현재 뷰포트(지도 영역) 기준 장소 재검색 기능 구현
- [x] 애니메이션 폴리라인(`AnimatedPolyline`) 렌더링 성능 최적화 및 구조 안정화

### 이전 업데이트 (2026-06-24 ~ 2026-07-01)
**UI/UX 및 디자인 개선**
- [x] `shadcn/ui` 도입을 통한 UX/UI 디자인 요소 체계화
- [x] 경로 렌더링 애니메이션 추가 및 순서 기반 마커/경로 색상 테마 적용 (도보 점선 색상 포함)
- [x] 드래그 앤 드롭 햅틱/시각 효과 구현 및 편집 모드 디자인 개선
- [x] 사이드바 검색 모드 전환 및 추천 기능 구현, 애니메이션 추가
- [x] 상세 패널 및 대안 패널 생성/전환 효과 추가
- [x] 여정 타임라인 바 색상 변경 및 대안 패널 인터랙션 충돌 방지
- [x] 프로젝트 로고 및 아이콘 변경, 데스크톱 환경 UI 최적화

**성능 최적화 및 리팩토링**
- [x] 캐싱 최적화 및 불필요한 리렌더링 버그 해결
- [x] 마커 및 Polyline 렌더링 지연/충돌 문제 해결
- [x] 사이드바, 상세 패널 등 핵심 프론트엔드 파일 코드 리팩토링 및 분할
- [x] 경로 렌더링 애니메이션 도입에 따른 대안 패널 연동 버그 등 다수 버그 수정

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
| 이동 대안 선택 | ✅ 완료 | 대중교통/차량/도보 카테고리별 복수 대안 아코디언 UI, 대안 경로 미리보기, 단거리 로직 개선, 타 구간 클릭 시 자동 닫힘, 경로 선택 시 DB 동기화 |
| 상세 경로 안내 패널 | ✅ 완료 | 대중교통 step-by-step (탑승/하차 정보) + 차량 turn-by-turn 안내, 세부 구간(step)/전체 구간(segment) 탐색 버튼 분리 및 레이아웃 최적화 |
| 세그먼트/스텝 포커스 | ✅ 완료 | 구간 클릭 시 하이라이트+줌 인, 개별 step 포커스, 연속 구간 탐색 |
| 실시간 지하철 도착 정보 | ✅ 완료 | 서울시 실시간 API + TAGO 시간표 Fallback, ETA 동적 계산, 역간거리 DB 기반 소요시간 |
| 실시간 버스 도착 정보 | ✅ 완료 | TAGO 전국 버스 도착 API + 경기도 전용 API 이중 조회, ODsay 정류소 검색 캐싱 |
| 장거리 노선 (기차/시외버스) 지원 | ✅ 완료 | KTX/SRT/무궁화 등 기차 및 고속/시외버스 경로 표시, 예매 링크 (SRT, 코레일, 고속버스, 시외버스) |

## 🚧 아직 구현되지 않은 기능 (추후 확장)

| 기능 | 상태 | 비고 |
|------|------|------|
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
| `fast-xml-parser` | ✅ | 공공 API XML 응답 파싱 (버스/지하철) |
| `xlsx` | ✅ | 철도 운행거리 데이터 처리 |
| `@tanstack/react-query` | ✅ | 데이터 페칭 및 캐싱 최적화 등을 위해 도입 완료 |
| `@atlaskit/pragmatic-drag-and-drop` | ❌ | 불필요 (HTML5 Native DnD로 대체 구현) |
| `shadcn/ui` | ✅ | UI 요소 체계화 및 디자인 개선을 위해 도입 완료 |

---

## 🗺️ 다음 단계 제안

1. **PWA 도입** — 모바일 환경에서 네이티브 앱처럼 동작하도록 PWA 세팅 검토
2. **여정 후기/공유** — Phase 2 기능으로 여정 후기 작성 및 공유 기능 구현
3. **여정 캘린더** — 캘린더 뷰에서 여정 일정 시각화
