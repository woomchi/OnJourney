# On-Journey 프로젝트 진행 상황

> 마지막 업데이트: 2026-06-16

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

### 데이터베이스 & API
- [x] `supabase/migrations/20240614000000_create_journeys.sql` — `journeys` 테이블 마이그레이션
- [x] `scripts/setup-db.mjs` — DB 초기화 스크립트 (`npm run db:setup`)
- [x] `src/lib/journeys.ts` — `insertJourney`, `fetchLatestJourney`, `deleteJourneys` API 함수
- [x] `src/lib/journeys/updatePlaces.ts` — 여정 장소 목록 및 순서 DB 업데이트 API 함수

### Zustand 상태 관리
- [x] `src/stores/journey-store.ts` — `activeJourney`, `journeys`, `createJourney`, `addPlace`, `removePlace`, `reorderPlaces` 등 상태 및 액션 관리 (낙관적 업데이트 구현)

### 핵심 UI 컴포넌트
- [x] `src/components/JourneySidebar.tsx` — 좌측 사이드바 (여정 목록 드래그앤드롭 순서 변경, 여정 다중 선택 삭제, 여정 상세 및 장소 관리 분기)
- [x] `src/components/CreateJourneyModal.tsx` — 여정 생성 모달 (여정명, 이동수단, 날짜 선택)
- [x] `src/components/PlaceList.tsx` — 여정 장소 목록 (장소 드래그앤드롭 순서 변경, 장소 다중 선택 삭제, 구간별 대중교통 타임라인 UI, 대안 이동 수단 아코디언 UI 포함)
- [x] `src/components/PlaceSearchBar.tsx` — 네이버 장소 API 연동 검색창 및 실시간 검색 목록 표시
- [x] `src/components/AddPlaceModal.tsx` — 검색된 장소를 선택해 여정에 추가하는 모달
- [x] `src/components/MapArea.tsx` — 네이버 지도 + 검색바 오버레이
- [x] `src/app/page.tsx` — 메인 레이아웃 (사이드바 + 지도 영역)
- [x] `src/app/layout.tsx` — 루트 레이아웃 (AuthProvider, QueryClientProvider)

### 환경 설정
- [x] `.env.local` — Supabase URL/KEY, 네이버 클라이언트 ID 등 환경변수
- [x] `docs/OnJourney.md` — 프로젝트 컨텍스트 문서

---

## 🚀 구현 완료된 핵심 기능 (MVP 기준)

| 기능 | 상태 | 비고 |
|------|------|------|
| 여정 목록/전환 관리 | ✅ 완료 | 여러 여정을 목록에서 확인 및 전환 가능 |
| 장소 검색 & 추가 | ✅ 완료 | 네이버 장소 API 연동 및 장소 추가 모달 구현 |
| 여정 내 장소 목록 표시 | ✅ 완료 | 사이드바에 추가된 장소 렌더링 |
| 드래그 앤 드롭 순서 조정 | ✅ 완료 | HTML5 Native DnD 적용 (여정 목록: 사용자별 `localStorage` 순서 저장 / 장소 목록: DB 실시간 동기화) |
| 장소/여정 다중 삭제 | ✅ 완료 | 편집 모드(체크박스) 활용한 다중 선택 및 일괄 삭제 API 연동 |
| 지도 마커 연동 | ✅ 완료 | 장소 목록과 지도 위 마커 동기화 및 줌 이동 |
| 구간별 이동 정보 UI | ✅ 완료 | 대중교통 노선 색상을 적용한 네이버 지도 스타일의 타임라인 바 및 소요시간/비용 시각화 |
| 대안 이동 수단 UI | ✅ 완료 | 아코디언 토글을 활용한 택시/도보 등의 대안 정보 시각화 |

## 🚧 아직 구현되지 않은 기능 (추후 확장)

| 기능 | 상태 | 비고 |
|------|------|------|
| 구간별 실시간 이동 정보 연동 | ❌ 미구현 | ODsay API / 네이버 Directions 5 API 연동을 통한 실시간 경로 및 소요시간/요금 데이터 바인딩 필요 |
| 실시간 대안 이동 수단 연동 | ❌ 미구현 | 대안 수단(택시, 도보 등) 경로 API 연동 및 실시간 데이터 바인딩 필요 |

---

## 📦 현재 의존성 현황

| 패키지 | 설치됨? | 비고 |
|--------|---------|------|
| `react-naver-maps` | ✅ | |
| `zustand` | ✅ | |
| `@supabase/ssr` | ✅ | |
| `@tanstack/react-query` | ❌ | 보류 (현재 Zustand로 데이터 페칭 충분) |
| `@atlaskit/pragmatic-drag-and-drop` | ❌ | 불필요 (HTML5 Native DnD로 대체 구현) |
| `shadcn/ui` | ❌ | 보류 (Vanilla CSS + Tailwind로 커스텀 구현) |

---

## 🗺️ 다음 단계 제안

1. **실시간 경로 API 연동** — ODsay API 등 외부 경로 API 연동을 통해 하드코딩된 구간별 소요시간·비용·수단 정보를 실시간 데이터로 교체
2. **실시간 대안 수단 연동** — 경로 계산 결과를 바탕으로 사용자가 대체 수단을 선택할 수 있도록 데이터 바인딩 및 지도 경로선 갱신 기능 구현
3. **PWA 도입 (선택사항)** — 모바일 환경에서 네이티브 앱처럼 동작하도록 PWA 세팅 검토
