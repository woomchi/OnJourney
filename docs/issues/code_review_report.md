# OnJourney 프로젝트 코드 리뷰 리포트

> **검토 기준일**: 2026-08-05  
> **분석 범위**: Next.js App Router 풀스택 (API Routes, Services, Stores, Supabase 연동)  
> **기술 스택**: Next.js 15, TypeScript, Zustand, Supabase, Zod, fast-xml-parser

---

## 1. 🎯 총평 및 리팩토링 결론 (Go / No-Go)

### 전반적 상태 요약

OnJourney는 **Feature-Sliced에 가까운 아키텍처**를 채택하고 있으며, API 라우트 레이어에서 Zod 검증과 `withErrorHandler` 래퍼를 일관되게 사용하는 등 전체적인 코드 수준이 **중상급(B+)** 이상으로 평가됩니다. 서비스-레포지터리 분리, 슬라이스 기반 Zustand 스토어, Fallback 전략 등 설계 의도가 명확하게 코드에 드러납니다.

~~보안(시크릿 노출) 이슈~~는 **✅ 해결 완료** (Supabase Service Role Key 재발급 및 `.env.local` 갱신). 이후 구조·성능 개선을 점진적으로 진행합니다.

### 리팩토링 결론

| 항목 | 판정 | 우선순위 |
|------|------|---------|
| ~~보안(시크릿 노출)~~ | ✅ **완료** | ~~P0~~ |
| 아키텍처·구조 개선 | **🟡 권장** | P1–P2 |
| 코드 품질·가독성 | **🟢 저강도 개선** | P3 |
| 테스트 용이성 | **🟡 중장기 과제** | P2 |

> **결론**: 보안 P0 이슈 해결 완료. 현재는 구조·성능 개선 단계 진행 중.

---

## 2. 🚨 주요 문제점 진단 (Severity 기반)

---

### 🔴 [Critical] 보안 취약점

> ~~**C-1. `.env.local`에 실제 시크릿 키 평문 보관**~~ — ✅ **2026-08-05 해결 완료** (Supabase Service Role Key 재발급 및 반영)

---

> ~~**C-2. `deleteJourneys`에 소유권 검증 없음**~~ — ✅ **2026-08-05 해결 완료**  
> `getUser()` 인증 확인 + `.eq('user_id', user.id)` 필터 추가

---

> ~~**C-3. `updateJourney`에 소유권 검증 없음**~~ — ✅ **2026-08-05 해결 완료**  
> `getUser()` 인증 확인 + `.eq('user_id', user.id)` 필터 추가

---

#### C-4. 외부 API URL에 API 키가 쿼리스트링으로 노출

```typescript
// src/lib/subwayService.ts:250-253
const url =
  `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnList` +
  `?serviceKey=${apiKey}...`; // ← URL에 직접 삽입

// src/lib/services/busRealtimeService.ts:173-176
const url = `https://api.odsay.com/v1/api/searchStation` +
  `?...&apiKey=${encodeURIComponent(apiKey)}`; // ← URL에 직접 삽입
```

서버 로그, 프록시 액세스 로그, 브라우저 히스토리에 키가 기록될 수 있습니다. 서버 사이드 코드이지만 **오류 응답에 URL이 포함될 경우 클라이언트에 노출** 위험이 있습니다.

---

### 🟠 [High] 구조적 문제

> ~~**H-1. Supabase Placeholder Fallback — 잠재적 무인증 운영**~~ — ✅ **2026-08-05 해결 완료**  
> `server.ts`, `client.ts`, `middleware.ts`에서 placeholder fallback 제거 및 필수 환경변수 없을 시 즉시 에러 발생하도록 Fail-Fast 적용

---

> ~~**H-2. `TAXI_BASE_FARE` / `TAXI_DISTANCE_RATE` 상수 중복 정의**~~ — ✅ **2026-08-05 해결 완료**  
> `src/constants/fare.ts` 생성 후 `naverMapRouteService.ts` 및 `directionsService.ts`에서 중앙 관리 상수를 import하도록 모듈화

---

> ~~**H-3. `updateRouteCache`의 비효율적 read-modify-write 패턴**~~ — ✅ **2026-08-05 해결 완료**  
> `saveRouteCache`에 `upsert` 적용 및 null 처리 추가로 레이스 컨디션 및 중복 축적 방지

---

> ~~**H-4, H-5. `map-store.ts` 및 `apiResponse.ts` `any` 타입 사용**~~ — ✅ **2026-08-05 해결 완료**  
> `PlaceResult`, `MotionValue<number>`, `MapBoundsRect`, `RouteContext` 등 구체적 인터페이스 타입 도입으로 타입 안정성 확보

---

### 🟡 [Medium] 개선이 필요한 문제

> ~~**M-1. 전역 모듈 상태의 메모리 누수 위험**~~ — ✅ **2026-08-05 해결 완료**  
> `pruneExpiredTimetableCache` 헬퍼 함수를 추가하고 `fetchAndCacheTimetable` 호출 시 만료 캐시 항목을 자동 삭제하도록 개선

---

#### M-2. `resolveLineCode`의 하드코딩 및 불완전한 노선 매핑

```typescript
// src/lib/subwayService.ts:137-145
function resolveLineCode(subwayId: string): string {
  if (subwayId.startsWith('100')) {
    return subwayId.substring(3); // "1" ~ "8"
  }
  if (subwayId === '1009') {
    return '9';
  }
  return '';  // 경의중앙선, 공항철도, 신분당선 등 → 항상 실패
}
```

서울 9호선(1009) 외에 경의중앙선(1063), 공항철도(1065), 신분당선(1077) 등은 `''` 를 반환하여 **DB 기반 소요 시간 계산이 항상 실패**합니다.

---

#### M-3. `getPopularityScores`의 전체 테이블 풀스캔

```typescript
// src/lib/services/placesService.ts:204-205
const { data: journeys, error } = await supabase
  .from('journeys')
  .select('places'); // ← user_id 필터 없이 전체 조회
```

장소 검색 시마다 `journeys` 테이블 **전체를 로드**하여 메모리 내에서 집계합니다. 여정이 수만 건 이상이 되면 응답 지연 및 메모리 급증이 발생합니다.

---

#### M-4. 미들웨어의 인증 실패 silent-swallow

```typescript
// src/lib/supabase/middleware.ts:37-41
try {
  await supabase.auth.getUser();
} catch (e) {
  console.error('Middleware auth check error:', e);
  // ← 예외 무시, 요청은 계속 통과
}
```

인증 검증 실패가 에러 로그만 남기고 요청을 그대로 통과시킵니다. 이는 Next.js Supabase 공식 패턴의 의도이지만, **인증이 필요한 페이지 접근 시 명시적 리다이렉션 로직이 없음**을 확인해야 합니다.

---

#### M-5. `subwayService.ts`에서 HTTP API 직접 호출 (서버 검증 없음)

```typescript
// src/lib/subwayService.ts:256-257
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP error ${res.status}`);
```

응답 구조의 타입 가드가 `as unknown as Array<...>`를 통해 강제 캐스팅됩니다. 외부 API 스펙이 변경되면 **런타임 타입 오류**가 발생할 수 있습니다.

---

### 🟢 [Low] 사소한 개선점

#### L-1. `calculateTimeBetweenStations`의 내부 `normalize` 함수 재정의

```typescript
// src/lib/subwayService.ts:209
const normalize = (nm: string) => nm.replace(/역$/, '').trim();
// ↑ normalizeStationName(line 150~152)과 완전히 동일한 로직 인라인 재정의
```

---

#### L-2. `places.ts route.ts`의 중복 검증

```typescript
// src/app/api/places/route.ts:11-15
const validatedParams = placesQuerySchema.parse(rawParams); // Zod에서 이미 검증
if (!validatedParams.query || validatedParams.query.trim().length < 1) { // 재검증
```

Zod 스키마에 `.min(1)`을 추가하면 라우트 핸들러의 if 분기가 불필요합니다.

---

#### L-3. `map-store.ts`와 `mapSlice.ts`의 책임 중복

`useMapUIStore` (map-store.ts)와 `createMapSlice` (slices/mapSlice.ts) 두 개의 스토어가 별도로 존재하며, 지도 관련 상태가 분산되어 있습니다. 신규 개발자에게 혼란을 줄 수 있습니다.

---

#### L-4. `directionsQuerySchema`에 좌표 범위 검증 없음

```typescript
// src/lib/validations/directions.ts
sx: z.coerce.number() // ← 경도 범위(-180~180) 검증 없음
sy: z.coerce.number() // ← 위도 범위(-90~90) 검증 없음
```

이상한 좌표값이 외부 API로 전달되어 불필요한 API 호출 비용이 발생할 수 있습니다.

---

## 3. 🛠 리팩토링 제안 및 개선 방향

### 3-1. 보안: 시크릿 키 즉시 교체 + 환경변수 강제 검증

```typescript
// src/lib/supabase/server.ts — 권장 방식
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('[Supabase] 필수 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.');
  }
  // ...
}
```

빌드 타임 환경변수 검증을 위해 `src/env.ts` (t3-env, @t3-oss/env-nextjs 등) 도입을 권장합니다.

---

### 3-2. 보안: 소유권 검증 추가

```typescript
// src/lib/journeys.ts — deleteJourneys 수정안
export async function deleteJourneys(ids: string[]): Promise<void> {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('로그인이 필요합니다.');
  
  const { error } = await supabase
    .from('journeys')
    .delete()
    .in('id', ids)
    .eq('user_id', user.id); // ← 소유권 필터 추가
  
  if (error) throw new Error(toJourneyErrorMessage(error));
}
```

동일 패턴을 `updateJourney`에도 적용합니다.

---

### 3-3. DRY: 공유 상수 모듈화

```typescript
// src/constants/fare.ts — 신규 파일
export const TAXI_BASE_FARE = 4_800;
export const TAXI_DISTANCE_RATE = 1_100;
export const TAXI_SURCHARGE_FACTOR = 1.3;

// 기존 두 파일에서 import로 대체
import { TAXI_BASE_FARE, TAXI_DISTANCE_RATE, TAXI_SURCHARGE_FACTOR } from '@/constants/fare';
```

---

### 3-4. 성능: `getPopularityScores` — DB 집계 쿼리로 전환

```typescript
// 현재: 전체 테이블 로드 후 JS에서 집계
// 권장: Supabase RPC 또는 SQL 집계 활용

// Supabase Edge Function 또는 DB Function 예시
const { data } = await supabase.rpc('get_place_popularity', {
  place_ids: placeIds
});
```

단기 대안으로 Next.js `unstable_cache`를 사용해 쿼리 결과를 캐시합니다.

---

### 3-5. 안정성: `routeCacheRepository` Upsert 전환

```typescript
// src/lib/repositories/routeCacheRepository.ts — saveRouteCache 수정
const { error } = await supabase.from('route_cache').upsert({
  origin_lat: params.rsy,
  origin_lng: params.rsx,
  dest_lat: params.rey,
  dest_lng: params.rex,
  route_data: routeData,
  updated_at: new Date().toISOString(),
}, {
  onConflict: 'origin_lat,origin_lng,dest_lat,dest_lng'
});
```

---

### 3-6. 타입 안전성: `withErrorHandler` 타입 강화

```typescript
// Next.js App Router Context 타입 명시
import type { NextRequest } from 'next/server';

type RouteContext = { params?: Record<string, string | string[]> };

export function withErrorHandler(
  handler: (request: NextRequest, context: RouteContext) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
    // ...
  };
}
```

---

### 3-7. 메모리: `timetableCache` 만료 항목 정리

```typescript
// 주기적 만료 항목 제거 (서버 시작 시 1회 등록)
function pruneExpiredTimetableCache(): void {
  const now = Date.now();
  for (const [key, value] of timetableCache.entries()) {
    if (value.expires < now) {
      timetableCache.delete(key);
    }
  }
}

// 5분 간격으로 실행 (모듈 초기화 시)
setInterval(pruneExpiredTimetableCache, 5 * 60 * 1_000);
```

---

### 기대 효과

| 개선 항목 | 기대 효과 |
|-----------|-----------|
| ~~C-1 (완료)~~ | ~~DB/외부 API 무단 접근 차단~~ ✅ |
| ~~C-2, C-3 (완료)~~ | ~~소유권 검증 강화, RLS 의존도 제거~~ ✅ |
| ~~H-1 (완료)~~ | ~~Supabase 환경변수 누락 시 Fail-Fast 적용~~ ✅ |
| ~~H-2 (완료)~~ | ~~요금 상수 중앙화(src/constants/fare.ts), DRY 준수~~ ✅ |
| ~~H-3 (완료)~~ | ~~Upsert 전환으로 레이스 컨디션 해소 및 캐시 누적 방지~~ ✅ |
| ~~M-3 (완료)~~ | ~~`unstable_cache` 10분 캐싱으로 검색 응답 속도 개선~~ ✅ |
| ~~H-4, H-5 (완료)~~ | ~~`any` 타입 제거 및 `MotionValue`, `RouteContext` 등 타입 안정성 확보~~ ✅ |
| ~~M-1 (완료)~~ | ~~만료 캐시 자동 정리(prune) 로직 적용~~ ✅ |
| ~~L-4 (완료)~~ | ~~Zod 좌표 범위(-180~180, -90~90) 검증 강화~~ ✅ |

---

## 4. 우선순위 Action Plan

### ✅ Step 1 — 완료 (2026-08-05)

~~**[C-1] API 시크릿 키 유출 확인 및 교체**~~ → **완료** (Supabase Service Role Key 재발급 및 `.env.local` 갱신)

### ✅ Step 2 — 완료 (2026-08-05)

~~**[C-2, C-3] `deleteJourneys` / `updateJourney` 소유권 검증 추가**~~ → **완료**  
`supabase.auth.getUser()` + `.eq('user_id', user.id)` 필터를 두 함수에 모두 적용

---

### ✅ Step 3 — 완료 (2026-08-05)

~~**[H-1, H-2, L-4] 단기 개선 항목 적용**~~ → **완료**  
- **H-1**: `server.ts`, `client.ts`, `middleware.ts` 환경변수 Fail-Fast 적용  
- **H-2**: `src/constants/fare.ts` 생성 후 택시 요금 공유 상수 일원화  
- **L-4**: `directions.ts`, `places.ts` Zod 좌표 위경도 범위 검증 추가

---

### ✅ Step 4 — 완료 (2026-08-05)

~~**[H-3, M-3, H-4, H-5, M-1] 구조 및 성능 최적화**~~ → **완료**  
- **H-3**: `routeCacheRepository.ts` `upsert` 적용 및 널 안전 처리  
- **M-3**: `placesService.ts` 인기도 점수 집계 `unstable_cache` (10분) 캐싱  
- **H-4, H-5**: `map-store.ts` 및 `apiResponse.ts` `any` 타입 제거 및 구체적 타입 명시  
- **M-1**: `subwayService.ts` `pruneExpiredTimetableCache` 추가 및 자동 캐시 정리

---

## 🔖 자동으로 적용된 설정 요약

| 항목 | 적용 내용 |
|------|-----------|
| 분석 범위 | API Routes, Service Layer, Store, DB Repository, 환경설정 파일 전체 |
| 기준 프레임워크 | Next.js App Router 최신 패턴 기준 |
| 비즈니스 로직 보존 | Fallback 경로 생성 알고리즘, ETA 계산 로직, 인기도 점수 공식 등 핵심 도메인 로직은 리팩토링 대상에서 제외 |
| 보안 판단 기준 | OWASP Top 10 (A01 Broken Access Control, A02 Cryptographic Failures) 기준 적용 |
