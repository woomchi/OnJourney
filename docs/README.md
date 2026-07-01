# 온저니(On-Journey) 문서 관리 인덱스 (Docs Index)

본 문서는 프로젝트의 지속적인 개발 및 유지보수를 돕기 위해 `@docs` 폴더 내 문서들의 분류체계를 정리한 가이드입니다. 
문서들은 크게 **웹 환경 기반 및 공통 아키텍처 문서(web/)**와 **PWA 및 모바일 UX 최적화 문서(pwa/)** 두 가지 범주로 구분되어 관리됩니다.

---

## 📁 디렉토리 구조 (Directory Structure)

```
docs/
├── README.md (본 문서)
├── pwa/
│   └── mobile_ux_pwa_roadmap.md
└── web/
    ├── OnJourney.md
    ├── project_status.md
    ├── datatable.md
    ├── REALTIME_API_INTEGRATION_PLAN.md
    ├── naver_directions_implementation.md
    ├── api 정책 내용.txt
    └── 프로젝트 아키텍쳐.PNG
```

---

## 📱 1. PWA 및 모바일 UX 문서 (`docs/pwa/`)

모바일 브라우저 최적화, 기기 센서 연동, 오프라인 가용성 확보 등 하이브리드 앱에 가까운 경험을 제공하기 위한 기술 로드맵입니다.

*   [mobile_ux_pwa_roadmap.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/pwa/mobile_ux_pwa_roadmap.md)
    *   **설명**: 모바일용 스와이프 바텀 시트 설계, GPS(Geolocation API) 연동 실시간 위치 추적, 진동 API 활용 하차 알림, 서비스 워커 오프라인 캐싱 및 백그라운드 푸시 구현 가이드라인이 단계별로 정리된 개발 로드맵입니다.

---

## 💻 2. 웹 환경 및 공통 아키텍처 문서 (`docs/web/`)

데스크톱 웹 대시보드 구조, 데이터베이스 설계, 지도 렌더링 최적화, 주요 외부 API 연동 등 온저니의 핵심 코어 비즈니스 로직과 관련된 개발 문서입니다.

*   [OnJourney.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/OnJourney.md)
    *   **설명**: 서비스 슬로건, 핵심 기능 사양(MVP), 그리고 컴포넌트 간 관계와 기술 사양이 전반적으로 요약된 메인 프로젝트 소개서입니다.
*   [project_status.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/project_status.md)
    *   **설명**: 현재 온저니의 패키지 의존성 현황 및 기구현 기능 체크리스트, 데이터베이스와 프록시 API 완료 상황이 정리되어 있는 프로젝트 히스토리입니다.
*   [datatable.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/datatable.md)
    *   **설명**: Supabase 백엔드 데이터베이스 스키마와 `journeys`, `places` 테이블 구조, 그리고 이들의 연동 관계 정의서입니다.
*   [REALTIME_API_INTEGRATION_PLAN.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/REALTIME_API_INTEGRATION_PLAN.md)
    *   **설명**: 대중교통 실시간 도착 정보(버스, 지하철) 조회를 위한 Next.js API Route(BFF 패턴) 아키텍처 및 뱃지 UI 설계 계획서입니다.
*   [naver_directions_implementation.md](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/naver_directions_implementation.md)
    *   **설명**: 네이버 지도 Directions 5 API를 활용한 다중 경유지(Waypoint) 설정 및 이동 시간 계산의 기술적 세부 설계서입니다.
*   [api 정책 내용.txt](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/api%20정책%20내용.txt)
    *   **설명**: ODsay, 네이버 디벨로퍼스, 공공데이터 포털 등 사용 중인 외부 교통 API들의 가격 정책 및 호출 제한 정책 기록입니다.
*   [프로젝트 아키텍쳐.PNG](file:///c:/Users/hitsz/Desktop/OnJourney/docs/web/프로젝트%20아키텍쳐.PNG)
    *   **설명**: 서비스 구조도(Next.js Front, BFF API, DB, 외부 교통 API 간의 네트워크 통신 및 아키텍처 흐름도) 이미지 파일입니다.
