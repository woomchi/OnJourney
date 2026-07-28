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
│   ├── naver_map_infinite_loop_analysis.md  ← 지도 렌더링 무한 루프 분석
│   └── react_map_rendering.md               ← React 환경 지도 렌더링 최적화 가이드
│
├── 🧮 algorithm/  (알고리즘 & 로직 설계)
│   └── travel_search_algorithm_v2.md        ← 장소 검색 랭킹 알고리즘 설계서 v2
│
├── 🗺️ web/  (웹 기획 / DB / API 설계)
│   ├── OnJourney.md                         ← 프로젝트 소개서 (MVP, 전체 아키텍처)
│   ├── project_status.md                    ← 패키지 의존성 현황 & 기능 체크리스트
│   ├── datatable.md                         ← Supabase DB 스키마 정의서
│   ├── api_router_flow.md                   ← API 라우트 흐름 다이어그램 (Mermaid)
│   ├── transport_segment.md                 ← 이동 수단 세그먼트 기획 확정안
│   ├── REALTIME_API_INTEGRATION_PLAN.md     ← 대중교통 실시간 API 연동 계획서
│   ├── pending_routing_ux.md                ← URL 기반 라우팅 상태 관리 보류 내역
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
│   ├── mobile_issues.md                     ← 모바일 환경 버그 & 개선 사항
│   └── web_issues.md                        ← 웹 환경 버그 & 개선 사항
│
└── 📜 history/  (개발 이력)
    └── development_log.md                   ← Git 커밋 기반 개발 흐름 로그
```

---

## 📐 아키텍처 & 기술 분석 (`docs/architecture/`)

### [full_api_and_cache_architecture.md](./architecture/full_api_and_cache_architecture.md)
클라이언트(React/Zustand/TanStack Query) → 서버(Next.js App Router) → 외부 서비스(ODsay, Naver NCP, Supabase) 간의 전체 API 통합 체계 및 3단계 캐시 계층 구조를 정리합니다.

### [odsay_api_architecture.md](./architecture/odsay_api_architecture.md)
ODsay API 기반 대중교통 경로 조회에서 서버 레벨 Rate Limiter, 서킷 브레이커, OdsayAdapter(에러 변환), 2단계 캐싱이 어떻게 작동하는지 전체 흐름을 문서화합니다.

### [naver_map_infinite_loop_analysis.md](./architecture/naver_map_infinite_loop_analysis.md)
`MapArea.tsx`에서 발생하는 `useEffect` 의존성 배열 간 순환 트리거 체인의 원인 분석 및 해결 방향을 정리합니다.

### [react_map_rendering.md](./architecture/react_map_rendering.md)
React 환경에서 네이버 지도의 렌더링 부하·깜박임을 최소화하고, 동적 패딩 및 오프셋 이동을 부드럽게 구현하기 위한 핵심 수칙입니다.

---

## 🧮 알고리즘 & 로직 설계 (`docs/algorithm/`)

### [travel_search_algorithm_v2.md](./algorithm/travel_search_algorithm_v2.md)
카카오 로컬 API를 원천 데이터로 활용해 여행 도메인에 최적화된 복합 점수(카테고리 가중치 + 거리 감쇠 + 인기도)를 부여하고 결과를 재정렬하는 검색 알고리즘 파이프라인 설계서입니다.

---

## 🗺️ 웹 기획 / DB / API 설계 (`docs/web/`)

### [OnJourney.md](./web/OnJourney.md)
프로젝트 전체 소개서. MVP 범위, 서비스 아키텍처, 핵심 기능 목록을 담고 있습니다.

### [project_status.md](./web/project_status.md)
현재 설치된 패키지 의존성 현황과 기능별 완료/진행 체크리스트입니다.

### [datatable.md](./web/datatable.md)
Supabase DB의 테이블 스키마(컬럼, 타입, 제약) 정의서입니다.

### [api_router_flow.md](./web/api_router_flow.md)
`src/app/api` 내 라우트들의 요청 처리 흐름을 Mermaid 다이어그램으로 시각화합니다.

### [transport_segment.md](./web/transport_segment.md)
여정의 이동 수단을 대중교통/택시/자차 3가지로 개편하는 기획 확정안. 타입 변경, UI 개편, 구간별 자동 수단 선택 로직 설계가 포함됩니다.

### [REALTIME_API_INTEGRATION_PLAN.md](./web/REALTIME_API_INTEGRATION_PLAN.md)
버스·지하철 실시간 도착 정보 API 연동 계획서입니다.

### [pending_routing_ux.md](./web/pending_routing_ux.md)
URL Path/Query Parameter 기반 UI 상태 관리 도입 보류 내역 및 향후 Next.js Router 연동 계획입니다.

---

## 📱 모바일 / PWA (`docs/pwa/`)

### [mobile_pwa_testing.md](./pwa/mobile_pwa_testing.md)
로컬 개발 서버를 스마트폰에서 HTTPS로 테스트하는 방법(ngrok, LocalTunnel 등 3가지 방식 비교) 안내서입니다.

### [mobile_ux_pwa_roadmap.md](./pwa/mobile_ux_pwa_roadmap.md)
모바일용 스와이프 바텀 시트, Geolocation API 실시간 위치 추적, 진동 API 하차 알림, 서비스 워커 오프라인 캐싱 로드맵 가이드라인입니다.

---

## 🛠️ 개발 가이드 & 배포 (`docs/guides/`)

### [ai_pipeline_guide.md](./guides/ai_pipeline_guide.md)
AI(Antigravity)와의 효율적인 협업을 위한 4단계 워크플로우 및 코딩 컨벤션, 실전 프롬프트 템플릿입니다.

### [work_prompt.md](./guides/work_prompt.md)
비전문가를 위한 AI 프롬프팅 실용 가이드. 문제 정의, 작업 순서, 트러블슈팅 등 상황별 프롬프트 패턴을 제공합니다.

### [devenv_to_server.md](./guides/devenv_to_server.md)
로컬 개발 환경에서 Vercel 서버까지 배포하는 전체 워크플로우(dev 브랜치 → Preview 확인 → main 병합 → 정식 배포)를 안내합니다.

---

## 🐛 버그 & 개선 이슈 (`docs/issues/`)

> 현재 해결 중이거나 백로그로 보류된 버그 및 개선 사항을 추적합니다.

### [mobile_issues.md](./issues/mobile_issues.md)
모바일 환경에서 발생한 버그(오버스크롤, 경로 호출 실패 등) 및 UX 개선 요청 목록입니다.

### [web_issues.md](./issues/web_issues.md)
웹 환경에서 발생한 버그(차량 경로 API 실패, 줌 불일치 등) 및 개선 사항 목록입니다.

---

## 📜 개발 이력 (`docs/history/`)

### [development_log.md](./history/development_log.md)
Git 커밋 이력을 기반으로 Phase 1~6까지 개발 흐름, 기능 추가/제거, 주요 기술 도입 이력을 정리한 로그입니다.

---

*최종 갱신: 2026-07-28 | OnJourney*
