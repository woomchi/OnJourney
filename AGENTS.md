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
├── app/api/          # Next.js Route Handlers (Server-side API)
├── features/         # 피처 단위 컴포넌트 (map / route / places)
├── components/       # 공유 UI 컴포넌트 (sidebar / transit / route / places)
├── lib/
│   ├── services/     # 비즈니스 로직 서비스 레이어
│   ├── infrastructure/ # CircuitBreaker / RateLimiter / OdsayAdapter
│   └── utils/        # 공통 유틸 함수
├── stores/           # Zustand 스토어 (슬라이스 패턴)
├── hooks/            # 커스텀 훅
├── types/            # 타입 정의
└── constants/        # 상수
```

---

## 절대 원칙 (위반 금지)

1. **바퀴 재발명 금지**: 이미 설치된 라이브러리로 해결 가능한 것을 직접 구현하지 않는다.
2. **하드코딩 금지**: 마법 숫자/문자열은 `constants/`에 정의한다.
3. **API Route에서 외부 API 직접 호출 금지**: `lib/services/`의 서비스 레이어를 거쳐야 한다.
4. **`useEffect` 남용 금지**: 네이버 지도 관련 사이드이펙트는 반드시 `useRef` + 이벤트 리스너 패턴 사용 (`docs/architecture/naver_map_guide.md` 참조).
5. **타입 `any` 금지**: 명시적 타입 또는 `unknown` 사용.
6. **클라이언트 컴포넌트에서 Supabase 직접 호출 금지**: API Route를 통해서만 접근.

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

### 외부 API 보호 패턴 (ODsay)
- `circuitBreaker.ts` → `rateLimiter.ts` → `odsayAdapter.ts` 순으로 래핑
- 실패 시 자동 Fallback (`walkFallbackService.ts`)

---

## 외부 API 환경 변수 (`.env.local` 필수)
| 변수명 | 용도 |
|--------|------|
| `NEXT_PUBLIC_NCP_CLIENT_ID` | 네이버 지도 |
| `ODSAY_API_KEY` | 대중교통 경로 |
| `KAKAO_REST_API_KEY` | 장소 검색 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 클라이언트 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서버 |
| `SEOUL_SUBWAY_API_KEY` | 지하철 실시간 |
| `REAL_TIME_SUBWAY_LOCATION_API_KEY` | 열차 위치 |
| `TMAP_APP_KEY` | 도보 경로 |
| `TAGO_API_KEY` | 전국 버스 |
| `GYEONGGI_BUS_API_KEY` | 경기도 버스 |
| `BUSAN_BUS_API_KEY` | 부산 버스 |

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
