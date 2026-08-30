# OnJourney 🗺️

> **온저니(On-Journey)** — 다중 경유지 경로 최적화 웹앱  
> *"당신의 모든 이동이 온전히, 여정이 되도록."*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)
![Zustand](https://img.shields.io/badge/Zustand-v5-f97316)
![React Query](https://img.shields.io/badge/TanStack_Query-v5-ff4154?logo=reactquery)
![Status](https://img.shields.io/badge/status-Archived-lightgrey)

> 개발 과정과 기술적 의사결정, 마무리 회고는 [`docs/history/retrospective.md`](./docs/history/retrospective.md)에 기록되어 있습니다.

---

## 프로젝트 소개

n개의 경유지를 추가하고 드래그 앤 드롭으로 순서를 조정하면, **구간별 최적 경로와 이동수단(대중교통 / 차량 / 도보)을 자동으로 생성**해주는 지도 기반 웹앱 서비스입니다.

지도 앱을 켜고 경유지마다 경로를 따로 검색하는 번거로움을 없애고, 여정 전체를 한눈에 보며 실시간으로 관리할 수 있는 서비스를 목표로 했습니다.

**브랜드 철학** — 한국어 *'온전히'* 와 영어 *'On-Journey'* 의 언어유희. 문 밖을 나서는 순간부터 목적지에 닿기까지의 모든 이동을 하나의 소중한 여정으로 대한다는 가치를 담았습니다.

---

## 로고 디자인

<img src="./public/service_logo2.png" width="120" align="right" alt="OnJourney 로고"/>

로고는 **커다란 삼각형(재생 버튼 ▶)에서 작은 삼각형 조각 하나가 떼어진** 형태입니다.

결여된 조각이 있는 불완전한 삼각형 — 이 상태가 여정을 **계획하고 준비하는 단계**를 상징합니다. 장소를 추가하고, 순서를 조정하고, 경로를 탐색하는 모든 과정이 이 준비 상태입니다.

그리고 떼어진 작은 삼각형 조각을 제자리에 맞춰 넣으면 — **하나의 완전한 ▶** 가 완성됩니다. 재생 버튼이 비로소 완성되고, 여정이 시작됩니다.

*계획이 완성되어야 실행이 가능하다* 는 이 서비스의 핵심 흐름을, 로고 하나의 형태로 담았습니다.

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| 🗺️ **지도 기반 경유지 관리** | 장소 검색 → 추가 → 드래그 앤 드롭 순서 조정 |
| 🚌 **구간별 이동 정보** | ODsay 멀티모달(대중교통) + Naver Directions 5(차량) + TMAP(도보) 통합 |
| 📡 **실시간 도착 정보** | 지하철(서울) · 버스(전국/경기/인천/부산/대전) 실시간 연동 |
| 🔀 **이동 대안 선택** | 구간별 교통수단 비교·전환, Supabase DB 동기화 |
| 🚄 **장거리 노선 안내** | KTX / SRT / 시외버스 스케줄 + 예매 링크 자동 생성 |
| 📱 **모바일 PWA** | framer-motion 바텀 시트 UX, GPS 트래킹, 오프라인 캐시 |
| 🔗 **여정 공유** | 공개 URL(`/share/[id]`) SSR 뷰어 + 공유 토글 모달 |
| 🌐 **URL 상태 관리** | `useUrlState` — 딥링크 + 브라우저 뒤로가기/앞으로가기 연동 |

---

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| 스타일링 | Tailwind CSS v4 + `shadcn/ui` |
| 지도 | `react-naver-maps` |
| 클라이언트 상태 | Zustand v5 슬라이스 패턴 (`journeyDataSlice` / `mapSlice` / `uiSlice`) |
| 서버 상태 | TanStack React Query v5 + IndexedDB 영속화 (`idb-keyval`) |
| 백엔드 / DB | Supabase (PostgreSQL + Auth + RLS) |
| 드래그 앤 드롭 | `@dnd-kit` |
| 애니메이션 | `framer-motion` v12 |
| GeoSpatial | `@turf/*` (bearing, distance, PIP, line-slice) |
| 입력 검증 | `zod` |

---

## 아키텍처 하이라이트
### ODsay 멀티모달 API 통합

초기에는 이동 수단(버스, 지하철, 기차, 도보)마다 별도 API를 연쇄 호출하는 방식이었습니다. 특히 기차/시외버스는 터미널↔터미널 구간 정보만 제공되어, 하나의 여정 구간에 대해 ① 터미널까지의 이동 ② 장거리 구간 ③ 도착지까지의 이동, 총 3 * n회 호출이 필요했고 이는 ODsay API 1회 호출횟수 한도 초과를 일으켰습니다.(특히, 환승 횟수가 많은 경우 해당 병목 현상이 빈번히 발생하여 API 호출 실패로 이어졌습니다.) ODsay API 명세를 꼼꼼히 재검토한 끝에 `maasRP` 멀티모달 경로탐색 API로 모든 수단을 단일 요청으로 통합해 이 문제를 해결했습니다.

### 시간대별 캐시 전략

ODsay 무료 플랜 한도 내에서 데이터 신선도를 유지하기 위해 **평일/주말 × 낮(4h TTL) / 밤(30m TTL)** 4구간 캐시 키를 설계했습니다. 3시간 단위 `departureTime` 그룹화로 캐시 파편화를 최소화했습니다.

### 장소 검색 엔진 v3 (Gaussian Decay 랭킹)

카카오 로컬 API 기반으로 검색어 패턴 분석(`searchPatternService`), 도보/도심/외곽 scale별 **Gaussian Decay 거리 점수**, `ServiceCategoryTag` 태깅 방식의 멀티 파이프라인 병합 구조를 구현했습니다. 서버 재호출 없이 클라이언트 메모리에서 카테고리 필터링하는 `MapCategoryChips`로 검색 UX를 개선했습니다.

---

## 개발 타임라인

| Phase | 기간 | 주요 내용 |
|-------|------|-----------|
| 1–2 | 06-14 ~ 06-18 | 장소 추가, ODsay 대중교통 + Naver 차량 경로, Polyline 렌더링 |
| 3 | 06-19 ~ 06-21 | 상세 경로 안내 패널, 여정 편집, 실시간 정보 1차 시도 |
| 4 | 06-23 ~ 06-24 | shadcn/ui 도입, React Query 도입, 대규모 리팩토링 |
| 5 | 06-25 ~ 07-05 | 사이드바 고도화, 카카오 장소 검색, Zustand v5 슬라이스 패턴 |
| 6 | 07-06 ~ 07-20 | 모바일 PWA, framer-motion 바텀 시트, GPS 트래킹 |
| 7 | 07-28 | 시간대별 캐시 전략, departureTime 파라미터 |
| 8 | 07-29 ~ 08-12 | ODsay 멀티모달 통합, Circuit Breaker, TMAP 도보, @dnd-kit 전환, 지형 분류 |
| 9 | 08-13 ~ 08-19 | SubwayMessageParser, TimeOffsetManager, 검색 엔진 v3, 부산/인천/대전 버스 |
| 10 | 08-26 ~ 08-28 | 대규모 리팩토링, URL 상태 관리, 여정 공유, **개발 종료** |

---

## 개발을 마무리한 이유

경로 탐색에 사용한 ODsay 통합 멀티 모달 API는 **사전 계산된 고정 데이터베이스**를 반환하는 구조입니다. 출발 시간 파라미터를 전달해도 실제 운행 시간표를 실시간으로 계산하는 것이 아니라, 사전 정형화된 경로 패턴 중 하나를 반환합니다. 심야에 운행하지 않는 노선이 포함된 경로가 제안되는 등, "지금 출발하면 어떤 버스/지하철을 타야 하는가"라는 질문에 정확히 답하지 못했습니다. 특히나 고정된 수단을 제공하다보니 제공받는 정보 수도 실제 이용 가능한 정보보다 턱없이 적게 노출되었습니다.

실시간 ETA 파싱을 아무리 정밀하게 만들어도 경로 자체의 출발 시간 반영 정확도가 낮으면 서비스 본질이 흔들린다는 판단 아래, 더 이상의 고도화가 표면적 개선에 그칠 것으로 보아 개발을 종료했습니다.

자세한 내용은 [회고록](./docs/history/retrospective.md)을 참고해 주세요.

---

## 로컬 실행

### 1. 환경 변수 설정

```bash
cp .env.example .env.local
```

`.env.local`에 아래 API 키를 입력합니다:

| 변수명 | 발급처 |
|--------|--------|
| `NEXT_PUBLIC_NCP_CLIENT_ID` | [Naver Cloud Platform](https://www.ncloud.com/) |
| `ODSAY_API_KEY` | [ODsay](https://lab.odsay.com/) |
| `KAKAO_REST_API_KEY` | [Kakao Developers](https://developers.kakao.com/) |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` | [Supabase](https://supabase.com/) |
| `SEOUL_SUBWAY_API_KEY` | [서울 열린데이터광장](https://data.seoul.go.kr/) |
| `REAL_TIME_SUBWAY_LOCATION_API_KEY` | 서울 열린데이터광장 |
| `TMAP_APP_KEY` | [TMAP Developers](https://tmapapi.sktelecom.com/) |
| `TAGO_API_KEY` | [공공데이터포털](https://www.data.go.kr/) |
| `GYEONGGI_BUS_API_KEY` | 공공데이터포털 |
| `BUSAN_BUS_API_KEY` | 공공데이터포털 |

### 2. 의존성 설치 및 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

### 3. DB 마이그레이션 (최초 1회)

```bash
npm run db:setup
```

---

## 테스트

```bash
npm run test           # 전체 실행
npm run test:watch     # 워치 모드
npm run test:coverage  # 커버리지 리포트
```

---

## 문서

| 문서 | 설명 |
|------|------|
| [`docs/history/retrospective.md`](./docs/history/retrospective.md) ⭐ | 프로젝트 회고록 (기술 결정 흐름, 종료 이유, 배운 것) |
| [`docs/web/project_overview.md`](./docs/web/project_overview.md) | 전체 현황, 구현 기능, 아키텍처 파일 목록 |
| [`docs/history/development_log.md`](./docs/history/development_log.md) | Phase 1~10 개발 흐름 로그 |
| [`docs/architecture/`](./docs/architecture/) | API/캐시 아키텍처, 네이버 지도 가이드 |
| [`docs/algorithm/`](./docs/algorithm/) | 장소 검색 엔진 v3, Gaussian Decay 설계 |

---

*2026-06-14 ~ 2026-08-28 · 개인 프로젝트 · 개발 기간 약 2개월 반*
