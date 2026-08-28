# OnJourney 🗺️

> **온저니(On-Journey)** — 다중 경유지 경로 최적화 서비스  
> *"당신의 모든 이동이 온전히, 여정이 되도록."*

n개의 경유지를 추가하고 드래그 앤 드롭으로 순서를 조정하면, 구간별 최적 경로와 이동수단(대중교통 / 차량 / 도보)을 자동 생성해주는 지도 기반 웹앱입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🗺️ **지도 기반 경유지 관리** | 장소 검색 → 추가 → 드래그 앤 드롭 순서 조정 |
| 🚌 **구간별 실시간 이동 정보** | 대중교통(ODsay) + 차량(Naver) + 도보(TMAP) 통합 |
| 📡 **실시간 도착 정보** | 지하철(서울) · 버스(전국/경기/부산) 실시간 연동 |
| 🔀 **이동 대안 선택** | 구간별 교통수단 비교 및 전환 (DB 동기화) |
| 🚄 **장거리 노선 안내** | KTX/SRT/시외버스 스케줄 + 예매 링크 자동 생성 |
| 📱 **모바일 PWA** | 바텀 시트 UX, GPS 트래킹, 오프라인 캐시 |
| ⏱️ **출발 시간 기반 탐색** | 시간 지정 경로 탐색 + 시간대별 캐시 최적화 |

---

## 기술 스택

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?logo=supabase)
![Zustand](https://img.shields.io/badge/Zustand-v5-orange)
![React Query](https://img.shields.io/badge/TanStack_Query-v5-ff4154?logo=reactquery)

| 분류 | 기술 |
|------|------|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| 지도 | `react-naver-maps` |
| 클라이언트 상태 | Zustand v5 슬라이스 패턴 |
| 서버 상태 | TanStack React Query v5 + IndexedDB 영속화 |
| 백엔드/DB | Supabase (PostgreSQL + Auth + RLS) |
| DnD | `@dnd-kit` |
| 애니메이션 | `framer-motion` v12 |
| GeoSpatial | `@turf/*` |

---

## 로컬 실행

### 1. 환경 변수 설정

`.env.example`을 복사해 `.env.local`을 생성하고 API 키를 입력합니다.

```bash
cp .env.example .env.local
```

필요한 외부 API 키:

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
```

`http://localhost:3000`에서 확인합니다.

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

## 프로젝트 문서

| 문서 | 설명 |
|------|------|
| [`docs/web/project_overview.md`](./docs/web/project_overview.md) ⭐ | 전체 현황, 구현 기능, 아키텍처 파일 목록 |
| [`docs/architecture/`](./docs/architecture/) | API/캐시 아키텍처, 네이버 지도 가이드 |
| [`docs/algorithm/`](./docs/algorithm/) | 장소 검색 엔진 v3, Gaussian Decay 설계 |
| [`docs/history/development_log.md`](./docs/history/development_log.md) | Phase 1~9 개발 흐름 로그 |
| [`docs/issues/issues.md`](./docs/issues/issues.md) | 미해결 이슈 및 백로그 |
| [`docs/README.md`](./docs/README.md) | 문서 전체 인덱스 |
