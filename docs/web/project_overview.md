# OnJourney — 프로젝트 개요 & 현황

> **온저니(On-Journey)** — 다중 경유지 경로 최적화 서비스  
> 슬로건: *"당신의 모든 이동이 온전히, 여정이 되도록."*  
> 마지막 업데이트: 2026-07-30

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
| 프레임워크 | Next.js 16+ (App Router) + TypeScript |
| 스타일링 | Tailwind CSS v4 + `shadcn/ui` |
| 지도 | `react-naver-maps` |
| 클라이언트 상태 | Zustand (슬라이스 패턴: `journeyDataSlice` / `mapSlice` / `uiSlice`) |
| 서버 상태 | TanStack React Query |
| 백엔드/DB | Supabase (PostgreSQL + Auth) |
| 드래그 앤 드롭 | HTML5 Native DnD API |

### 외부 API 연동 현황

| API | 용도 | 상태 |
|-----|------|------|
| ODsay 대중교통 경로탐색 | 대중교통 경로·폴리라인 | ✅ |
| 네이버 Directions 5 | 차량 경로 (단일/다중 경유지) | ✅ |
| 네이버 장소 검색 | 장소 검색 | ✅ |
| 서울시 실시간 지하철 API | 지하철 실시간 도착 | ✅ |
| TAGO 전국 버스 도착 API | 버스 실시간 도착 | ✅ |
| 경기도 버스 도착 API | 경기도 버스 이중 조회 | ✅ |

### 주요 의존성

| 패키지 | 용도 |
|--------|------|
| `react-naver-maps` | 지도 렌더링 |
| `zustand` | 클라이언트 상태 |
| `@tanstack/react-query` | 서버 데이터 캐싱 |
| `@supabase/supabase-js` + `@supabase/ssr` | Supabase 연동 |
| `fast-xml-parser` | 공공 API XML 파싱 |
| `shadcn/ui` + `lucide-react` | UI 컴포넌트 |
| `date-fns` + `use-debounce` | 날짜/검색 유틸 |
| `xlsx` | 철도 운행거리 데이터 처리 |
| `pg` | DB 마이그레이션 스크립트용 |

---

## 3. 구현 완료된 핵심 기능 (MVP)

| 기능 | 상태 | 비고 |
|------|------|------|
| 여정 목록/전환 관리 | ✅ | 여러 여정 목록 확인 및 전환 |
| 여정 정보 수정 | ✅ | 여정명, 날짜, 이동수단 수정 모달 |
| 장소 검색 & 추가 | ✅ | 네이버 장소 API + 현 지도 기준 재검색 |
| 드래그 앤 드롭 순서 조정 | ✅ | 여정 목록: localStorage / 장소: DB 동기화 |
| 장소/여정 다중 삭제 | ✅ | 편집 모드 체크박스 기반 일괄 삭제 |
| 지도 마커 연동 | ✅ | 순번 마커, 줌 이동, 그라디언트 핀 |
| 구간별 실시간 이동 정보 | ✅ | ODsay (대중교통) + Naver Directions 5 (차량) |
| 이동 경로 시각화 | ✅ | 교통수단별 폴리라인, 방향 화살표, 환승 마커 |
| 이동 대안 선택 | ✅ | 대중교통/차량/도보 카테고리별 아코디언, DB 동기화 |
| 상세 경로 안내 패널 | ✅ | 대중교통 step-by-step / 차량 turn-by-turn |
| 세그먼트/스텝 포커스 | ✅ | 구간 클릭 → 하이라이트 + 줌 인 |
| 실시간 지하철 도착 정보 | ✅ | 서울시 API + TAGO Fallback, ETA 동적 계산 |
| 실시간 버스 도착 정보 | ✅ | TAGO + 경기도 API 이중 조회 |
| 장거리 노선 (기차/시외버스) | ✅ | KTX/SRT 등, 예매 링크 자동 생성 |
| 모바일 PWA | ✅ | PWA Manifest + 바텀 시트 (`CustomBottomSheet`) |

### 아직 구현되지 않은 기능 (Phase 2)

| 기능 | 비고 |
|------|------|
| 이동 수단 다변화 (택시 모드 추가) | 대중교통/택시/자차 3모드 개편 — `transport_segment.md` 참조 |
| URL 기반 UI 상태 관리 | 뒤로가기 연동 / Deep Linking — 기능 안정화 후 일괄 진행 |
| 여정 후기 기능 | 여정 복수 선택 → 후기 작성 |
| 여정 캘린더 | 캘린더 뷰에서 일정 시각화 |
| 여정 공유 | 다른 사용자와 여정 공유 |

---

## 4. 주요 아키텍처 파일

| 파일 | 설명 |
|------|------|
| `src/stores/` | Zustand 슬라이스 (`journeyDataSlice`, `mapSlice`, `uiSlice`) |
| `src/lib/journeys.ts` | 여정 CRUD API 함수 |
| `src/lib/naverMapRouteService.ts` | 지도 유틸 모듈 (Direction 서비스, 폴리라인 렌더러, Haversine 계산) |
| `src/lib/subwayService.ts` | 지하철 실시간 도착 서비스 모듈 |
| `src/app/api/directions/` | 통합 경로 탐색 API (ODsay + Naver) |
| `src/app/api/subway/realtime/` | 지하철 실시간 도착 API |
| `src/app/api/bus/realtime/` | 버스 실시간 도착 API |
| `src/components/MapArea.tsx` | 네이버 지도 컴포넌트 (폴리라인, 마커, 포커스) |
| `src/components/JourneySidebar.tsx` | 사이드바 (여정/장소 관리) |
| `src/components/RouteGuidePanel.tsx` | 상세 경로 안내 플로팅 패널 |
| `src/components/AlternativeRoutePanel.tsx` | 대안 이동 수단 패널 |

---

## 5. 최근 업데이트 이력

### 2026-07-30 — 모바일 UI 미세조정
- 이동 상세(`RouteGuidePanel`) 바텀 시트 최소 스냅 높이 10px 낮춤 (200 → 190px)
- 재생 컨트롤 플로팅바(`JourneyControlFloatingBar`) 화면 하단 기준 위치 10px 낮춤

### 2026-07-21 — 모바일 PWA & 바텀 시트
- PWA Manifest(`manifest.ts`) 적용 완료
- `framer-motion` 기반 통합 `CustomBottomSheet` 도입 (Bouncy 애니메이션, 하단 Skirt)
- TIER 0~4 바텀 시트 UX 개선안 전체 반영 완료

### 2026-07-01 ~ 07-05 — 아키텍처 리팩토링
- Zustand 슬라이스 패턴 적용 (`mapSlice`, `journeyDataSlice`, `uiSlice`)
- `JourneySidebar` 모놀리식 코드 → `SearchOverlay`, `JourneyListSidebar` 등 분할
- 지도 기반 검색(Map-Based Search) 기능 추가
- 애니메이션 폴리라인 렌더링 최적화

### 2026-06-24 ~ 07-01 — UI/UX & 성능
- `shadcn/ui` 도입, 경로 렌더링 애니메이션, 순서 기반 색상 테마
- 드래그 앤 드롭 햅틱/시각 효과
- 사이드바 검색 모드 및 추천 기능
- 캐싱·리렌더링 최적화
