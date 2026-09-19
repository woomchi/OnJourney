# OnJourney — AI 작업 가이드

## 프로젝트 한 줄 요약
n개의 경유지를 추가하고 드래그 앤 드롭으로 순서를 조정하면, 구간별 최적 경로와 이동수단(대중교통/차량/도보)을 자동 생성해주는 지도 기반 웹앱.

---

## 기술 스택 (변경 금지 항목)
- **Framework**: Next.js 16 (App Router) + TypeScript
- **지도**: `react-naver-maps` — 네이버 지도 SDK 직접 접근 시 `useRef` 패턴 필수
- **클라이언트 상태**: Zustand v5 슬라이스 패턴 (`useJourneyStore` / `useMapStore`)
- **서버 상태**: TanStack React Query v5 (`persist` + IndexedDB 영속화)
- **스타일**: Tailwind CSS v4
- **애니메이션**: `framer-motion` v12 (바텀 시트 등 모바일 UX)
- **DB**: Supabase (PostgreSQL + Auth + RLS)
- **DnD**: `@dnd-kit` (Native DnD 사용 금지 — 모바일 지원 안됨)
- **검증**: `zod` (모든 API Route 입력값 검증 필수)

---

## 핵심 디렉터리 구조
```
src/
├── app/api/            # Next.js Route Handlers (Server-side API)
├── features/           # 피처 단위 컴포넌트 (map / route / places)
├── components/         # 공유 UI 컴포넌트 (sidebar / transit / route / places)
├── data/               # 정적 데이터 (지하철 역간거리, 서울 1~9호선 시각표 압축 DB)
├── lib/
│   ├── services/       # 비즈니스 로직 서비스 레이어 (directions, subway, places 등)
│   ├── transit/        # 전국 버스 실시간 API 서비스 (Busan, Incheon, Daejeon, Gyeonggi, Tago)
│   ├── journeys/       # 여정 데이터 처리 로직
│   ├── infrastructure/ # CircuitBreaker / RateLimiter / OdsayAdapter / 캐시 매니저
│   └── utils/          # 공통 유틸 함수
├── providers/          # Context Providers (QueryProvider, AuthProvider)
├── stores/             # Zustand 스토어 (슬라이스 패턴)
├── hooks/              # 커스텀 훅
├── types/              # 타입 정의
└── constants/          # 상수
```

---

## 절대 원칙 (위반 금지)

1. **바퀴 재발명 금지**: 이미 설치된 라이브러리로 해결 가능한 것을 직접 구현하지 않는다.
2. **하드코딩 금지**: 마법 숫자/문자열은 `constants/`에 정의한다.
3. **API Route에서 외부 API 직접 호출 금지**: `lib/services/`의 서비스 레이어를 거쳐야 한다.
4. **`useEffect` 남용 금지**: 네이버 지도 관련 사이드이펙트는 반드시 `useRef` + 이벤트 리스너 패턴 사용 (`docs/architecture/naver_map_guide.md` 참조).
5. **타입 `any` 금지**: 명시적 타입 또는 `unknown` 사용.
6. **클라이언트 컴포넌트에서 Supabase 직접 호출 금지**: API Route를 통해서만 접근.
7. **ODsay 쿼터 보호 및 시간표 호출 금지**: ODsay 일일 무료 쿼터 축소(30회 제한, 25회 하드캡 가드)로 인해, 시간표 및 부가 역 조회를 위한 ODsay API 호출은 전면 금지된다. 시각표는 로컬 압축 DB(`seoulTimetableService`) 및 공공데이터포털 API(`SUBWAY_DATA_API_KEY`)를 통해 조회해야 한다.

---

## 주요 아키텍처 패턴

### 상태 관리
```ts
// 올바른 사용법
const { journeys, activeJourney } = useJourneyStore();
// 슬라이스: journeyDataSlice / mapSlice / uiSlice
```

### API Route 패턴
```ts
// 모든 API Route는 Zod 검증 → 서비스 레이어 호출 → 표준 응답 구조
export async function GET(req: Request) {
  const parsed = schema.safeParse(...)
  if (!parsed.success) return Response.json({ error: ... }, { status: 400 })
  const result = await someService.method(parsed.data)
  return Response.json(result)
}
```

### 대중교통 및 외부 API 보호 패턴
- **대중교통 경로 탐색**: Kakao Transit 및 ODsay maasRP 기반 이중화 (`OdsayQuotaGuard` 25회 하드캡 보호)
- **외부 API 장애 보호**: `circuitBreaker.ts` → `rateLimiter.ts` → 서비스 어댑터 순 래핑 (실패 시 도보/배차간격 자동 Fallback)
- **지역별 도시철도 도착 및 시각표 분기 (`subwayRegionRouter.ts`)**:
  - **수도권**: 서울시 실시간 지하철 API(`REAL_TIME_SUBWAY_API_KEY`) + 서울교통공사 공식 압축 시각표 DB(`seoulTimetableService.ts`)
  - **부산**: 부산교통공사 GW API(`SUBWAY_DATA_API_KEY`, `busanSubwayService.ts`)
  - **대전**: 대전교통공사 API(`SUBWAY_DATA_API_KEY`, `daejeonSubwayService.ts`)
  - **대구**: 대구교통공사 공식 압축 시각표 DB(1~3호선 + 대경선 103개 역, `daeguTimetableService.ts`, `daeguSubwayService.ts`)
  - **광주**: 광주교통공사 공식 압축 시각표 DB(1호선 20개 역, `gwangjuTimetableService.ts`, `gwangjuSubwayService.ts`)
  - **전국 버스**: 공공데이터포털 통합 버스 API(`BUS_DATA_API_KEY`)
  - **공통 캐싱**: Upstash Redis 분산 캐시 + In-Memory 캐시(24시간 `revalidate: 86400`)

### 버스 노선 위상 매칭 패턴 (`BusLineMapPanel.tsx`)
- **왕복·순환 노선 상행/하행 구분**: 동일 역명이 상행·하행에 각각 별도 정류소(`arsNo`)로 존재하는 경우(예: 부산 307번), Kakao Transit `stationId: 'auto'` 가상 ID 상황에서도 올바른 승차 정류소를 판정해야 함
- **`resolveActualBoardingInfo` 다차원 스코어링**: `nextStationName`(+1000) → `destination` 도달 가능성(+500) → 방면 텍스트(+200) → GPS 근접(+100) 순 가중치 채점
- **`findBestMatchingStationIndex` 폴백 4단계**: ID/ARS 완전 일치 → 정규화 명칭 → 퍼지 매칭 → Haversine 2km 근접 매칭 순으로 폴백

---

## 외부 API 환경 변수 (`.env.local` 필수)
| 변수명 | 용도 |
|--------|------|
| `NEXT_PUBLIC_NAVER_CLIENT_ID` | 네이버 지도 (MapArea, QueryProvider) |
| `NAVER_CLIENT_SECRET` | 네이버 Directions 5 차량 / 경유지 경로 API |
| `NEXT_PUBLIC_NAVER_LOGIN_CLIENT_ID` | 네이버 로그인 OAuth Client ID |
| `NEXT_NAVER_LOGIN_SECRET_ID` | 네이버 로그인 OAuth Client Secret |
| `ODSAY_API_KEY` | 대중교통 및 도보 경로 (ODsay maasRP, 25회 쿼터 가드) |
| `DOMAIN` | ODsay 웹 서비스 Referer 도메인 (기본: `https://on-journey.vercel.app`) |
| `KAKAO_REST_API_KEY` | 장소 검색 및 카카오 대중교통 경로 API |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 클라이언트 (`sb_publishable_` 포맷) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서버 (`sb_secret_` 포맷) |
| `ADMIN_SECRET_KEY` | 관리자 캐시 재검증 / 온디맨드 무효화 API |
| `REAL_TIME_SUBWAY_API_KEY` | 서울시 지하철 실시간 역별 도착 정보 (열린데이터광장) |
| `REAL_TIME_SUBWAY_LOCATION_API_KEY` | 서울시 실시간 열차 위치 (열린데이터광장) |
| `REAL_TIME_SUBWAY_TOTAL_API_KEY` | 서울시 지하철 전역 실시간 도착 정보 (OA-15799) |
| `BUS_DATA_API_KEY` | 공공데이터포털 전국 버스 실시간 도착 정보 통합 키 (TAGO/경기/부산/인천/대전 공통) |
| `SUBWAY_DATA_API_KEY` | 공공데이터포털 전국 도시철도 실시간/시각표 통합 키 (부산/대전 공통, 미설정 시 BUS_DATA_API_KEY 자동 공유) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL (지하철 실시간 분산 캐시) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token (지하철 실시간 분산 캐시) |

---

## 테스트
```bash
npm run test          # 전체 실행
npm run test:watch    # 워치 모드
npm run test:coverage # 커버리지
```
테스트 파일은 `tests/` 아래 소스 구조와 동일하게 배치 (`src/lib/utils/geoUtils.ts` → `tests/utils/geoUtils.test.ts`).

---

## 주요 참조 문서
- **프로젝트 전체 현황**: `docs/web/project_overview.md` ⭐
- **DB 스키마**: `docs/web/datatable.md`
- **아키텍처 다이어그램**: `docs/architecture/full_api_and_cache_architecture.md`
- **네이버 지도 주의사항**: `docs/architecture/naver_map_guide.md` (무한 루프 방지)
- **검색 엔진 설계**: `docs/algorithm/place_search_engine_v3.md`
- **미해결 이슈**: `docs/issues/issues.md`
- **개발 이력**: `docs/history/development_log.md`
