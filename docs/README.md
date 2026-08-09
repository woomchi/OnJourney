# 온저니(On-Journey) 문서 인덱스

> `docs/` 폴더 내 문서의 분류 체계 및 빠른 탐색을 위한 인덱스입니다.
> 새 문서를 추가할 때는 이 README도 함께 업데이트해주세요.

---

## 📁 디렉토리 구조

```
docs/
├── README.md                        ← 본 문서 (인덱스)
│
├── 📐 architecture/  (아키텍처 & 기술 분석)
│   ├── full_api_and_cache_architecture.md   ← 전체 API 호출 및 캐싱 아키텍처
│   ├── odsay_api_architecture.md            ← ODsay API 서킷 브레이커 & 캐시 구조
│   └── naver_map_guide.md                   ← 네이버 지도 React 최적화 수칙 & 무한 루프 분석
│
├── 🧮 algorithm/  (알고리즘 & 로직 설계)
│   └── travel_search_algorithm_v2.md        ← 장소 검색 랭킹 알고리즘 설계서 v2
│
├── 🗺️ web/  (웹 기획 / DB / API 설계)
│   ├── project_overview.md                  ← 프로젝트 개요, 기술 스택, 구현 현황 (메인 레퍼런스)
│   ├── datatable.md                         ← Supabase DB 스키마 정의서
│   ├── api_router_flow.md                   ← API 라우트 흐름 다이어그램 (Mermaid)
│   ├── transport_segment.md                 ← [Phase 2] 이동 수단 다변화 기획 확정안
│   ├── api 정책 내용.txt                    ← 외부 API 가격/호출 정책 기록
│   └── 프로젝트 아키텍쳐.PNG               ← 서비스 구조도 이미지
│
├── 📱 pwa/  (모바일 / PWA UX)
│   ├── mobile_pwa_testing.md                ← 모바일 PWA HTTPS 로컬 테스트 가이드
│   └── mobile_ux_pwa_roadmap.md             ← PWA 모바일 UX 개발 로드맵
│
├── 🛠️ guides/  (개발 가이드 / 규약 / 배포)
│   ├── ai_pipeline_guide.md                 ← AI 협업 파이프라인 & 코딩 컨벤션
│   ├── work_prompt.md                       ← 비전문가용 AI 프롬프팅 가이드
│   └── devenv_to_server.md                  ← 로컬 개발 → 서버 배포 워크플로우
│
├── 🐛 issues/  (버그 & 개선 이슈 트래킹)
│   └── issues.md                            ← 모바일/웹 버그 & 개선 사항 통합 목록
│
└── 📜 history/  (개발 이력)
    └── development_log.md                   ← Git 커밋 기반 개발 흐름 로그 (Phase 1~6)
```

---

## 📐 아키텍처 & 기술 분석 (`docs/architecture/`)

### [full_api_and_cache_architecture.md](./architecture/full_api_and_cache_architecture.md)
클라이언트(React/Zustand/TanStack Query) → 서버(Next.js App Router) → 외부 서비스(ODsay, Naver NCP, Supabase) 간의 전체 API 통합 체계 및 3단계 캐시 계층 구조.

### [odsay_api_architecture.md](./architecture/odsay_api_architecture.md)
ODsay API 기반 대중교통 경로 조회에서 Rate Limiter, 서킷 브레이커, OdsayAdapter(에러 변환), 2단계 캐싱의 전체 작동 흐름.

### [naver_map_guide.md](./architecture/naver_map_guide.md)
**두 문서 통합** — React 환경 네이버 지도 렌더링 최적화 수칙 (useRef 활용, 애니메이션 분리, fitBounds 패턴) + `MapArea.tsx`에서 실제 발생한 무한 루프 원인 분석 및 수정 방향.

---

## 🧮 알고리즘 & 로직 설계 (`docs/algorithm/`)

### [travel_search_algorithm_v2.md](./algorithm/travel_search_algorithm_v2.md)
카카오 로컬 API를 원천 데이터로 활용해 여행 도메인에 최적화된 복합 점수(카테고리 가중치 + 거리 감쇠 + 인기도)로 검색 결과를 재정렬하는 알고리즘 파이프라인 설계서.

---

## 🗺️ 웹 기획 / DB / API 설계 (`docs/web/`)

### [project_overview.md](./web/project_overview.md) ⭐ 메인 레퍼런스
**두 문서 통합** (구 `OnJourney.md` + `project_status.md`) — 서비스 개요, 기술 스택, 외부 API 연동 현황, MVP 구현 완료 기능 표, Phase 2 미구현 기능, 주요 아키텍처 파일 목록, 최근 업데이트 이력을 한 곳에서 확인.

### [datatable.md](./web/datatable.md)
Supabase DB 테이블 스키마(컬럼, 타입, 제약, RLS 정책) 및 프론트엔드 데이터 구조 정의서. 설계 철학(JSONB 배열, 실행 중심 추적) 포함.

### [api_router_flow.md](./web/api_router_flow.md)
`src/app/api` 내 라우트들의 요청 처리 흐름 (라우팅 → 에러 핸들링 → Zod 검증 → 서비스 레이어 → 응답) Mermaid 다이어그램.

### [transport_segment.md](./web/transport_segment.md)
**[Phase 2 기획서]** 이동 수단을 대중교통 / 택시 / 자차 3모드로 개편하는 확정안. 타입 변경, UI 개편, 구간별 자동 수단 선택 로직 설계 포함.

---

## 📱 모바일 / PWA (`docs/pwa/`)

### [mobile_pwa_testing.md](./pwa/mobile_pwa_testing.md)
로컬 개발 서버를 스마트폰에서 HTTPS로 테스트하는 방법 (ngrok, LocalTunnel 등 3가지 방식 비교).

### [mobile_ux_pwa_roadmap.md](./pwa/mobile_ux_pwa_roadmap.md)
모바일용 스와이프 바텀 시트, Geolocation 실시간 위치 추적, 진동 API 하차 알림, 서비스 워커 오프라인 캐싱 로드맵.

---

## 🛠️ 개발 가이드 & 배포 (`docs/guides/`)

### [ai_pipeline_guide.md](./guides/ai_pipeline_guide.md)
AI(Antigravity)와의 효율적인 협업을 위한 4단계 워크플로우 및 코딩 컨벤션, 실전 프롬프트 템플릿.

### [work_prompt.md](./guides/work_prompt.md)
비전문가를 위한 AI 프롬프팅 실용 가이드. 문제 정의, 작업 순서, 트러블슈팅 상황별 프롬프트 패턴.

### [devenv_to_server.md](./guides/devenv_to_server.md)
로컬 개발 환경에서 Vercel 서버까지 배포하는 전체 워크플로우 (dev → Preview 확인 → main 병합 → 정식 배포).

---

## 🐛 버그 & 개선 이슈 (`docs/issues/`)

### [issues.md](./issues/issues.md)
**두 파일 통합** (구 `mobile_issues.md` + `web_issues.md`) — 현재 해결 중이거나 백로그로 보류된 버그 및 UX 개선 사항을 모바일 / 웹 / 공통으로 구분하여 관리.

---

## 📜 개발 이력 (`docs/history/`)

### [development_log.md](./history/development_log.md)
Git 커밋 이력을 기반으로 Phase 1~6까지 개발 흐름, 기능 추가/제거, 주요 기술 도입 이력을 정리한 로그.

---

*최종 갱신: 2026-07-28 | OnJourney*
