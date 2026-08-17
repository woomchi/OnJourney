# OnJourney — 프로젝트 개요 & 현황

> **온저니(On-Journey)** — 다중 경유지 경로 최적화 서비스  
> 슬로건: *"당신의 모든 이동이 온전히, 여정이 되도록."*  
> 마지막 업데이트: 2026-08-17

---

## 1. 서비스 개요

n개의 방문지를 추가하고 드래그 앤 드롭으로 순서를 조정하면, 구간별 최적 경로와 이동수단을 자동 생성해주는 지도 기반 웹앱입니다.

**브랜드 철학:** 한국어 '온전히'와 영어 'On-Journey'의 언어유희. 문 밖을 나서는 순간부터 목적지에 닿기까지의 모든 평범한 이동을 하나의 소중한 여정으로 대한다는 철학을 담고 있습니다.

### 주요 타겟 유스케이스

| 유형 | 문제 | 해결 |
|------|------|------|
| 🎒 통학/출퇴근 | 매번 앱을 켜서 실시간 도착 정보 검색 | 경로를 '여정'으로 저장, 클릭 한 번으로 즉시 확인 |
| ✈ 뚜벅이 여행객 | 낯선 지역에서 경유지마다 경로 재검색 | 경유지 한 번에 저장 → 구간별 대중교통 정보 일괄 제공 |

---

## 2. 기술 스택

| 분류 | 기술 |
|------|------|
| 프레임워크 | Next.js 16.2.9 (App Router) + TypeScript 5 |
| 스타일링 | Tailwind CSS v4 + `shadcn/ui` (`@radix-ui/react-dialog`) |
| 지도 | `react-naver-maps` |
| 클라이언트 상태 | Zustand v5 (슬라이스 패턴: `journeyDataSlice` / `mapSlice` / `uiSlice`) |
| 서버 상태 | TanStack React Query v5 (persist 포함) |
| 백엔드/DB | Supabase (PostgreSQL + Auth) |
| 드래그 앤 드롭 | `@dnd-kit` (core / sortable / modifiers) |
| 애니메이션 | `framer-motion` v12 |
| GeoSpatial | `@turf/*` (bearing, distance, PIP, line-slice 등) |

### 외부 API 연동 현황

| API | 용도 | 상태 |
|-----|------|------|
| ODsay 대중교통 경로탐색 | 대중교통 경로·폴리라인 | ✅ |
| 네이버 Directions 5 | 차량 경로 (단일/다중 경유지) | ✅ |
| **카카오 로컬 (키워드/카테고리 검색)** | 장소 검색 (네이버 → 카카오로 전환) | ✅ |
| 서울시 실시간 지하철 API | 지하철 실시간 도착 | ✅ |
| TAGO 전국 버스 도착 API | 버스 실시간 도착 | ✅ |
| 경기도 버스 도착 API | 경기도 버스 이중 조회 | ✅ |
| **부산 시내버스 실시간 API** | 부산 버스 도착 조회 | ✅ |
| **TMAP 보행자 경로 API** | 실제 도보 경로 탐색 (10km 미만) | ✅ |

### 주요 의존성

| 패키지 | 용도 |
|--------|------|
| `react-naver-maps` | 지도 렌더링 |
| `zustand` | 클라이언트 상태 |
| `@tanstack/react-query` + persist | 서버 데이터 캐싱·영속화 |
| `@supabase/supabase-js` + `@supabase/ssr` | Supabase 연동 |
| `fast-xml-parser` | 공공 API XML 파싱 |
| `shadcn/ui` + `lucide-react` | UI 컴포넌트 |
| `date-fns` + `use-debounce` | 날짜/검색 유틸 |
| `xlsx` + `adm-zip` + `shpjs` | 철도 운행거리·지형 데이터 처리 |
| `@dnd-kit/*` | 드래그 앤 드롭 (HTML5 Native DnD에서 전환) |
| `framer-motion` | 바텀 시트·애니메이션 |
| `@turf/*` | 지오스패셜 연산 (bearing, PIP, line-slice 등) |
| `idb-keyval` | IndexedDB 기반 쿼리 영속화 |
| `pg` | DB 마이그레이션 스크립트용 |
| `zod` | API 입력 스키마 검증 |

---

## 3. 구현 완료된 핵심 기능 (MVP)

| 기능 | 상태 | 비고 |
|------|------|------|
| 여정 목록/전환 관리 | ✅ | 여러 여정 목록 확인 및 전환 |
| 여정 정보 수정 | ✅ | 여정명, 날짜, 이동수단 수정 모달 |
| 장소 검색 & 추가 | ✅ | 카카오 로컬 API + 현 지도 기준 재검색 + 카테고리 검색 |
| 드래그 앤 드롭 순서 조정 | ✅ | `@dnd-kit` 기반 / DB 동기화 |
| 장소/여정 다중 삭제 | ✅ | 편집 모드 체크박스 기반 일괄 삭제 |
| 지도 마커 연동 | ✅ | 순번 마커, 줌 이동, 그라디언트 핀 |
| 구간별 실시간 이동 정보 | ✅ | ODsay (대중교통) + Naver Directions 5 (차량) |
| 이동 경로 시각화 | ✅ | 교통수단별 폴리라인, 방향 화살표, 환승 마커 |
| 이동 대안 선택 | ✅ | 대중교통/차량/도보 카테고리별 아코디언, DB 동기화 |
| 상세 경로 안내 패널 | ✅ | 대중교통 step-by-step / 차량 turn-by-turn |
| 세그먼트/스텝 포커스 | ✅ | 구간 클릭 → 하이라이트 + 줌 인 |
| 실시간 지하철 도착 정보 | ✅ | ODsay API 기반 (서울교통공사 역간거리 Fallback) |
| 실시간 버스 도착 정보 | ✅ | TAGO + 경기도 API 이중 조회 |
| 장거리 노선 (기차/시외버스) | ✅ | KTX/SRT 등, 예매 링크 자동 생성 |
| 모바일 PWA | ✅ | PWA Manifest + 바텀 시트 (`CustomBottomSheet`) |
| **도보 경로 (TMAP 보행자 API)** | ✅ | 10km 미만 실제 보행 경로 + Fallback |
| **출발 시간 기반 경로 탐색** | ✅ | `DepartureTimePicker` UI + 3시간 단위 캐시 그룹화 |
| **지형 분류 (산/해변)** | ✅ | GeoJSON + Turf.js BBox+PIP 2단계 검증 |
| **검색 패턴 기반 장소 추천** | ✅ | `searchPatternService` + Gaussian Decay 거리 점수 |
| **검색 결과 카테고리 칩 필터링** | ✅ | `MapCategoryChips` + 클라이언트 메모리 필터링 (서버 재호출 없음) |
| **GPS 트래킹** | ✅ (복구) | `useGPSTracking` hook 재구현 |
| **지하철 ETA 정밀 파싱** | ✅ | `SubwayMessageParser` (NFD 정규화, 다중 공백/자모 처리) |
| **클라이언트-서버 시각 동기화** | ✅ | `TimeOffsetManager` (RTT 보정, syncConfidence 산출) |

### 아직 구현되지 않은 기능 (Phase 2)

| 기능 | 비고 |
|------|------|
| URL 기반 UI 상태 관리 | 뒤로가기 연동 / Deep Linking — 기능 안정화 후 일괄 진행 |
| 여정 후기 기능 | 여정 복수 선택 → 후기 작성 |
| 여정 캘린더 | 캘린더 뷰에서 일정 시각화 |
| 여정 공유 | 다른 사용자와 여정 공유 |
| 택시 모드 | 대중교통/택시/자차 3모드 개편 |

---

## 4. 주요 아키텍처 파일

### 상태 관리

| 파일 | 설명 |
|------|------|
| `src/stores/slices/journeyDataSlice.ts` | 여정·장소 데이터 상태 슬라이스 |
| `src/stores/slices/mapSlice.ts` | 지도 상태 슬라이스 |
| `src/stores/slices/uiSlice.ts` | UI 상태 슬라이스 |
| `src/stores/journey-store.ts` | 여정 스토어 진입점 |
| `src/stores/map-store.ts` | 지도 스토어 진입점 |

### 핵심 서비스 레이어 (`src/lib/services/`)

| 파일 | 설명 |
|------|------|
| `directions/directionsOrchestrator.ts` | 차량 + 도보 통합 경로 오케스트레이터 |
| `directions/car/carRouteService.ts` | 네이버 Directions 5 차량 경로 |
| `directions/transit/publicTransitService.ts` | ODsay 대중교통 경로 |
| `directions/walk/tmapWalkingService.ts` | TMAP 보행자 경로 API |
| `directions/walk/walkFallbackService.ts` | 도보 Fallback (직선 거리 기반) |
| `naverMapRouteService.ts` | 지도 유틸 (폴리라인 렌더러, Haversine) |
| `subwayService.ts` | 지하철 실시간·시간표 조회 (ODsay) |
| `subwayRealtimeService.ts` | 지하철 실시간 도착 서비스 |
| `busRealtimeService.ts` | 버스 실시간 도착 서비스 |
| `placesService.ts` | 카카오 API 장소 검색 + Gaussian Decay 랭킹 + 멀티 파이프라인 (v3) |
| `searchPatternService.ts` | 검색어 패턴 분석 + 카테고리 매핑 |
| `intercityTransitScheduleService.ts` | 장거리 노선(기차/시외버스) 스케줄 |
| `directionsService.ts` | 경로 탐색 통합 진입점 |
| `subwayMessageParser.ts` | 지하철 실시간 메시지(`arvlMsg2`) 정밀 파싱 (NFD 정규화, 신뢰도 산출) |
| `subwayTotalRealtimeService.ts` | 지하철 전역 실시간 통합 서비스 |

### 인프라 레이어 (`src/lib/infrastructure/`)

| 파일 | 설명 |
|------|------|
| `odsayAdapter.ts` | ODsay API Adapter + 도메인 에러 클래스 |
| `circuitBreaker.ts` | Circuit Breaker 패턴 (ODsay 장애 보호) |
| `rateLimiter.ts` | 요청 속도 제한 |

### 유틸리티 (`src/lib/utils/`)

| 파일 | 설명 |
|------|------|
| `walkabilityCheck.ts` | GeoJSON + Turf BBox+PIP 지형 도보 가능 여부 검사 |
| `terrainClassifier.ts` | 지형 분류 (normal / mountain / beach) |
| `snapToRoad.ts` | TMAP Snap-to-Road 유틸 |
| `routeUtils.ts` | 경로 관련 유틸 |
| `journeyUtils.ts` | 여정 관련 유틸 |
| `externalFetch.ts` | 외부 API 공통 Fetch 래퍼 |
| `odsayThrottle.ts` | ODsay 요청 쓰로틀 |
| `timeOffsetManager.ts` | 클라이언트-서버 시각 오프셋 Singleton 관리 (지하철 ETA 보정) |
| `geoUtils.ts` | 지리 연산 유틸 |
| `busRegionUtils.ts` | 버스 지역 분류 유틸 |

### 피처 컴포넌트 (`src/features/`)

| 파일/디렉터리 | 설명 |
|------|------|
| `features/map/MapArea.tsx` | 네이버 지도 컴포넌트 (폴리라인, 마커, 포커스) |
| `features/map/MapMarkers.tsx` | 지도 마커 관리 |
| `features/map/MapRoutes.tsx` | 경로 폴리라인 렌더링 |
| `features/map/MapOverlays.tsx` | 지도 오버레이 |
| `features/map/MapFloatingControls.tsx` | 지도 플로팅 컨트롤 |
| `features/map/useMapCamera.ts` | 지도 카메라/줌 제어 훅 |
| `features/route/AlternativeRoutePanel.tsx` | 대안 이동 수단 패널 |
| `features/route/RouteGuidePanel.tsx` | 상세 경로 안내 패널 |
| `features/route/RoutePanels.tsx` | 경로 패널 조합 |
| `features/places/PlaceSearchBar.tsx` | 장소 검색바 |

### UI 컴포넌트 (`src/components/`)

| 파일/디렉터리 | 설명 |
|------|------|
| `sidebar/JourneySidebar.tsx` | 사이드바 진입점 (여정/장소 관리) |
| `sidebar/ActiveJourneySidebar.tsx` | 활성 여정 전용 사이드바 |
| `sidebar/JourneyListSidebar.tsx` | 여정 목록 사이드바 |
| `sidebar/SearchOverlay.tsx` | 검색 오버레이 |
| `sidebar/FixedJourneyTimelineSheet.tsx` | 여정 타임라인 바텀 시트 (모바일) |
| `sidebar/HorizontalJourneyTimelineBar.tsx` | 가로형 여정 타임라인 바 |
| `sidebar/JourneyControlFloatingBar.tsx` | 여정 재생 컨트롤 플로팅 바 |
| `sidebar/JourneyPlayerHeader.tsx` | 여정 플레이어 헤더 |
| `sidebar/SidebarBottomActions.tsx` | 사이드바 하단 액션 버튼 |
| `common/CustomBottomSheet.tsx` | 통합 바텀 시트 컴포넌트 (framer-motion) |
| `common/DepartureTimePicker.tsx` | 출발 시간 선택 UI |
| `places/PlaceCard.tsx` | 장소 카드 |
| `places/PlaceList.tsx` | 장소 목록 |
| `places/SegmentInfo.tsx` | 구간 이동 정보 |
| `places/AlternativeSegmentInfo.tsx` | 대안 구간 이동 정보 |
| `places/TimelineNode.tsx` | 타임라인 노드 UI |
| `places/FittedDuration.tsx` | 소요시간 적응형 표시 |
| `transit/IntercityTransitScheduleWidget.tsx` | 장거리 노선 스케줄 위젯 |
| `transit/RealtimeArrivalCard.tsx` | 실시간 도착 정보 카드 |
| `transit/SegmentBusRealtimeChip.tsx` | 구간 버스 실시간 칩 |
| `transit/SegmentSubwayRealtimeChip.tsx` | 구간 지하철 실시간 칩 |
| `transit/ReliabilityBadge.tsx` | 실시간 데이터 신뢰도 배지 |
| `route/RouteSegmentCard.tsx` | 경로 구간 카드 |
| `route/RouteSegmentCardStack.tsx` | 구간 카드 스택 레이아웃 |
| `route/RouteSegmentDetailSheet.tsx` | 구간 상세 바텀 시트 |
| `route/RouteTimelineGaugeBar.tsx` | 경로 타임라인 게이지 바 |
| `route/PlaybackBar.tsx` | 재생 컨트롤 바 |
| `route/FareBreakdownTooltip.tsx` | 요금 내역 툴팁 |
| `route/CarGuideList.tsx` | 차량 경로 안내 목록 |
| `route/TransitGuideList.tsx` | 대중교통 상세 안내 목록 |
| `map/TransferMarkers.tsx` | 환승 마커 |
| `map/DirectionalStripes.tsx` | 방향 화살표 폴리라인 |
| `map/MapCategoryChips.tsx` | 검색 결과 카테고리 필터 칩 |
| `map/CustomOverlayView.tsx` | 범용 커스텀 오버레이 컴포넌트 |

### API Routes (`src/app/api/`)

| 라우트 | 설명 |
|--------|------|
| `api/directions/` | 통합 경로 탐색 API (ODsay + Naver + TMAP) |
| `api/directions-waypoints/` | 경유지 포함 경로 탐색 |
| `api/subway/` | 지하철 정보 API |
| `api/bus/realtime/` | 버스 실시간 도착 API |
| `api/realtime/bus/` | 실시간 버스 (지역별 통합) |
| `api/transit/schedule/` | 장거리 노선 스케줄 API |
| `api/places/` | 장소 검색 API (카카오) |
| `api/admin/revalidate/` | 캐시 강제 무효화 API |

---

## 5. 아키텍처 패턴

- **Circuit Breaker**: ODsay API 연속 실패 시 즉시 Fallback 전환 (CLOSED → OPEN → HALF_OPEN)
- **Rate Limiter**: ODsay 무료 플랜(1,000회/일) 한도 초과 방지
- **시간대별 캐싱**: 평일/주말 × 낮(06~23시, 4h TTL) / 밤(23~06시, 30m TTL)
- **출발 시간 캐시 그룹화**: 3시간 단위로 rounding → 캐시 파편화 최소화
- **Gaussian Decay 거리 점수**: 장소 검색 결과 거리 기반 랭킹
- **BBox+PIP 2단계 지형 검사**: O(1) BBox 선검사 후 Turf.js PIP 정밀 검증
- **Repository 패턴**: `routeCacheRepository.ts`로 DB 캐시 접근 추상화

---

## 6. 최근 업데이트 이력

### 2026-08-13 ~ 08-17 — Phase 9: 실시간 정확도 고도화 & 검색 엔진 v3
- `SubwayMessageParser` 구현 — `arvlMsg2` 메시지 정밀 파싱 (NFD 정규화, 다중 공백/자모 결합 처리, 신뢰도 점수)
- `TimeOffsetManager` 구현 — 클라이언트-서버 시각 오프셋 동기화 (RTT 보정, ETA 정확도 향상)
- 장소 검색 엔진 v3 적용 — Drop 방식 → `ServiceCategoryTag` 태깅 방식 전환, 멀티 파이프라인 병합
- `MapCategoryChips` 컴포넌트 — 검색 결과 카테고리 칩 필터링 (클라이언트 메모리 방식)
- 부산 시내버스 실시간 API 연동 (`BusanBusService`)
- UI 컴포넌트 대규모 확충: `HorizontalJourneyTimelineBar`, `ActiveJourneySidebar`, `RealtimeArrivalCard`, `SegmentBusRealtimeChip`, `SegmentSubwayRealtimeChip`, `ReliabilityBadge`, `CustomOverlayView` 등

### 2026-08-12 — 문서 현행화
- `project_overview.md` / `development_log.md` 현재 코드 기준으로 전면 업데이트

### 2026-07-30 — 모바일 UI 미세조정
- 이동 상세(`RouteGuidePanel`) 바텀 시트 최소 스냅 높이 10px 낮춤 (200 → 190px)
- 재생 컨트롤 플로팅바(`JourneyControlFloatingBar`) 화면 하단 기준 위치 10px 낮춤

### 2026-07-28 — 캐싱 전략 고도화
- 시간대별 캐시 키 분리 (평일/주말 × 낮/밤 4구간)
- `departureTime` 파라미터 추가 (3시간 단위 그룹화)
- 시간대별 동적 캐시 만료 시간 적용

### 2026-07-21 — 모바일 PWA & 바텀 시트
- PWA Manifest(`manifest.ts`) 적용 완료
- `framer-motion` 기반 통합 `CustomBottomSheet` 도입
- TIER 0~4 바텀 시트 UX 개선안 전체 반영 완료

### 2026-07-01 ~ 07-05 — 아키텍처 리팩토링
- Zustand v5 슬라이스 패턴 적용 (`mapSlice`, `journeyDataSlice`, `uiSlice`)
- `JourneySidebar` 모놀리식 코드 → `SearchOverlay`, `JourneyListSidebar` 등 분할
- `features/` 디렉터리 도입 (map, route, places 피처 분리)
- 애니메이션 폴리라인 렌더링 최적화

### 2026-06-24 ~ 07-01 — UI/UX & 성능
- `shadcn/ui` 도입, 경로 렌더링 애니메이션, 순서 기반 색상 테마
- HTML5 Native DnD → `@dnd-kit` 전환
- 사이드바 검색 모드 및 추천 기능
- 캐싱·리렌더링 최적화
