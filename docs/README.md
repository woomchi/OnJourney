# 온저니(On-Journey) 문서 관리 인덱스 (Docs Index)

본 문서는 프로젝트의 지속적인 개발 및 유지보수를 돕기 위해 `docs/` 폴더 내 문서들의 분류체계를 정리한 가이드입니다.

---

## 📁 디렉토리 구조 (Directory Structure)

```
docs/
├── README.md                          ← 본 문서 (인덱스)
│
├── 📱 모바일/PWA UX ──────────────────────────────────
├── ux_report_bottomsheet.md           ← 바텀 시트 UX 개선 보고서 (진행현황 포함)
├── bottom_sheet_requirements.md       ← 바텀 시트 핵심 요구사항 정의서
├── mobile_pwa_testing.md              ← 모바일 PWA HTTPS 테스트 가이드 (ngrok/localtunnel)
│
├── 🗺️ 지도/경로 ──────────────────────────────────────
├── api_router_flow.md                 ← API 라우트 처리 흐름 다이어그램 (Mermaid)
├── transport_segment.md               ← 이동 수단 다변화 및 세그먼트 기획 확정안
├── pending_routing_ux.md              ← URL 기반 라우팅 상태 관리 보류 내역
│
├── 🛠️ 개발 가이드/규약 ────────────────────────────────
├── library_audit.md                   ← 라이브러리 리팩토링 전수 검사 (전체 완료)
├── ai_pipeline_guide.md               ← AI 협업 파이프라인 및 코딩 컨벤션
├── work_prompt.md                     ← 비전문가용 AI 프롬프팅 가이드
│
├── pwa/
│   └── mobile_ux_pwa_roadmap.md       ← PWA 모바일 UX 개발 로드맵
└── web/
    ├── OnJourney.md                   ← 프로젝트 메인 소개서 (MVP, 아키텍처)
    ├── project_status.md              ← 패키지 의존성 현황 및 기능 체크리스트
    ├── datatable.md                   ← Supabase DB 스키마 정의서
    ├── REALTIME_API_INTEGRATION_PLAN.md ← 대중교통 실시간 API 연동 계획서
    ├── naver_directions_implementation.md ← 네이버 Directions API 구현 설계서
    ├── api 정책 내용.txt              ← 외부 API 가격/호출 정책 기록
    └── 프로젝트 아키텍쳐.PNG         ← 서비스 구조도 이미지
```

---

## 📱 모바일 / PWA UX 문서

### [ux_report_bottomsheet.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/ux_report_bottomsheet.md)
- **설명**: 바텀 시트 UX/UI 개선 보고서. TIER 0~4 분류 기반의 실행 계획 및 진행현황이 정리되어 있습니다.
- **현황**: TIER 0~4 모든 개선 과제 완료 또는 제외 (잔여 과제 없음)

### [bottom_sheet_requirements.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/bottom_sheet_requirements.md)
- **설명**: 바텀 시트의 핵심 동작 요구사항 정의서. "콘크리트 벽" 드래그 하향 제한, 스냅 포인트, 플로팅 버튼 실시간 동기화 등의 기준을 서술합니다.

### [mobile_pwa_testing.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/mobile_pwa_testing.md)
- **설명**: 로컬 개발 서버를 스마트폰에서 HTTPS로 테스트하는 방법 안내. ngrok 고정 도메인, LocalTunnel 방식 등 3가지 방법을 비교하여 제안합니다.

---

## 🗺️ 지도 / 경로 문서

### [api_router_flow.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/api_router_flow.md)
- **설명**: `src/app/api` 내 라우트들의 요청 처리 흐름을 Mermaid 다이어그램으로 시각화한 문서입니다.

### [transport_segment.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/transport_segment.md)
- **설명**: 여정의 이동 수단을 대중교통/택시/자차 3가지로 개편하는 기획 확정안. 타입 변경, UI 개편, 구간별 자동 수단 선택 로직 등의 설계가 포함됩니다.

### [pending_routing_ux.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/pending_routing_ux.md)
- **설명**: URL Path/Query Parameter 기반 UI 상태 관리 도입 보류 내역. 기능 안정화 후 Next.js Router와 연동하는 일괄 작업 계획이 담겨 있습니다.

---

## 🛠️ 개발 가이드 / 규약 문서

### [library_audit.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/library_audit.md)
- **설명**: 직접 구현된 로직 중 라이브러리로 대체 가능한 항목을 전수 검사한 리팩토링 보고서. 모든 항목 완료.

### [ai_pipeline_guide.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/ai_pipeline_guide.md)
- **설명**: AI(Antigravity)와의 효율적인 협업을 위한 4단계 워크플로우 및 실전 프롬프트 템플릿.

### [work_prompt.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/work_prompt.md)
- **설명**: 비전문가를 위한 AI 프롬프팅 실용 가이드. 문제 정의, 작업 순서, 트러블슈팅 등 상황별 프롬프트 패턴을 제공합니다.

---

*최종 갱신: 2026-07-21 | OnJourney PWA v1.x*
