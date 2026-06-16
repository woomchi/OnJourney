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

### 데이터베이스
- [x] `supabase/migrations/20240614000000_create_journeys.sql` — `journeys` 테이블 마이그레이션
- [x] `scripts/setup-db.mjs` — DB 초기화 스크립트 (`npm run db:setup`)
- [x] `src/lib/journeys.ts` — `insertJourney`, `fetchLatestJourney` API 함수

### Zustand 상태 관리
- [x] `src/stores/journey-store.ts` — `activeJourney`, `openCreateForm`, `setActiveJourney`, `clearJourney` 액션

### 핵심 UI 컴포넌트
- [x] `src/components/JourneySidebar.tsx` — 좌측 사이드바 (여정 정보, 로그인 상태 분기, 로그아웃)
- [x] `src/components/CreateJourneyModal.tsx` — 여정 생성 모달 (여정명, 이동수단, 날짜 선택)
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
| 장소 검색 & 추가 | ✅ 완료 | 네이버 장소 API 연동 및 여정 미선택 시 여정 선택 모달 연동 |
| 여정 내 장소 목록 표시 | ✅ 완료 | 사이드바에 추가된 장소 렌더링 |
| 드래그 앤 드롭 순서 조정 | ✅ 완료 | HTML5 Native Drag & Drop 사용 (여정 및 장소 목록) |
| 장소/여정 다중 삭제 | ✅ 완료 | 편집 모드(체크박스) 활용한 다중 선택 및 일괄 삭제 |
| 지도 마커 연동 | ✅ 완료 | 장소 목록과 지도 위 마커 동기화 및 줌 이동 |

## 🚧 아직 구현되지 않은 기능 (추후 확장)

| 기능 | 상태 | 비고 |
|------|------|------|
| 구간별 이동 정보 제공 | ❌ 미구현 | ODsay API / 네이버 Directions 5 연동 필요 |
| 이동 수단 대안 선택 | ❌ 미구현 | 다양한 수단(도보/대중교통 등) 비교 |

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

1. **구간 이동 정보** — ODsay API 등 외부 경로 API 연동을 통해 구간별 소요시간·비용·수단 표시
2. **이동 수단 대안 선택** — 경로 계산 결과를 바탕으로 사용자가 대체 수단을 선택할 수 있는 UI 구현
3. **PWA 도입 (선택사항)** — 모바일 환경에서 네이티브 앱처럼 동작하도록 PWA 세팅 검토
