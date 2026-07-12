# OnJourney 라이브러리 대체 가능 코드 전수 검사 보고서

> 작성일: 2026-07-12  
> 프로젝트: `c:\Users\hitsz\Desktop\OnJourney`  
> 목적: 직접 구현된 컴포넌트 및 유틸리티 로직 중 기존/신규 라이브러리로 대체 가능한 항목 식별

---

## 현재 사용 중인 주요 라이브러리

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| `@dnd-kit/*` | core 6, sortable 10 | 드래그&드롭 (여정 카드 정렬) |
| `@radix-ui/react-dialog` | 1.1 | 다이얼로그 Primitive |
| `@tanstack/react-query` | 5 | 서버 상태 관리 |
| `class-variance-authority` | 0.7 | 조건부 className 빌더 |
| `clsx` + `tailwind-merge` | - | className 병합 유틸 |
| `fast-xml-parser` | 5 | XML 파싱 (TAGO API 응답) |
| `idb-keyval` | 6 | IndexedDB 키-값 캐시 |
| `lucide-react` | 1.21 | 아이콘 (일부 사용) |
| `react-naver-maps` | 0.2 | 네이버 지도 React 래퍼 |
| `vaul` | 1.1 | 모바일 바텀 드로어 |
| `zustand` | 5 | 클라이언트 전역 상태 관리 |
| `zustand/react/shallow` | - | 렌더 최적화 |

---

## 🔴 우선순위 높음 — 직접 구현했지만 라이브러리로 완전 대체 가능

### 1. `useMediaQuery` hook
**파일:** [`src/hooks/useMediaQuery.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/hooks/useMediaQuery.ts)

```typescript
// 현재 구현: 17줄의 직접 구현
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
```

**대체 라이브러리:** `@uidotdev/usehooks` 또는 `react-use`

```bash
npm install @uidotdev/usehooks
```
```typescript
// 대체 후
import { useMediaQuery } from "@uidotdev/usehooks";
```

**이점:** SSR 안전 처리, 초기값 처리, 테스트 코드 불필요

---

### 2. `useDragScroll` hook
**파일:** [`src/hooks/useDragScroll.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/hooks/useDragScroll.ts)

현재 81줄로 마우스 드래그 스크롤을 직접 구현 (스크롤바 충돌 방지, 드래그 감지, 클릭 방지 등 포함).

**대체 라이브러리:** `react-indiana-drag-scroll` 또는 `@dnd-kit`의 드래그 인터페이스

```bash
npm install react-indiana-drag-scroll
```
```tsx
// 대체 후
import ScrollContainer from 'react-indiana-drag-scroll';
<ScrollContainer className="...">
  {children}
</ScrollContainer>
```

**이점:** 터치 이벤트, 스크롤바 충돌, 모멘텀 스크롤 등 엣지 케이스 처리 내장

---

### 3. ✅ Haversine 거리 계산 함수
**파일:** [`src/lib/naverMapRouteService.ts#L51-L63`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/naverMapRouteService.ts#L51-L63), [`src/components/sidebar/SearchOverlay.tsx#L13-L23`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/sidebar/SearchOverlay.tsx#L13-L23)

`getDistance` 함수가 `SearchOverlay.tsx`에 인라인 정의되어 있고, `calculateHaversineDistance`가 `naverMapRouteService.ts`에 별도 구현되어 있어 **중복**이 존재합니다.

**대체 라이브러리:** `geolib` (경량, 좌표 계산 전문)

```bash
npm install geolib
```
```typescript
// 대체 후
import { getDistance } from 'geolib';
const distInMeters = getDistance(
  { latitude: lat1, longitude: lng1 },
  { latitude: lat2, longitude: lng2 }
);
```

**이점:** 검증된 정확도, 추가 지리 연산(bearings, 중심점 등) 무료 제공, 코드 중복 제거

---

### 4. ✅ 날짜 포맷팅 함수
**파일:** [`src/lib/journeyUtils.ts#L3-L7`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/journeyUtils.ts#L3-L7), [`src/features/places/PlaceSearchBar.tsx#L25-L29`](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/places/PlaceSearchBar.tsx#L25-L29)

`formatJourneyDate` 함수가 `journeyUtils.ts`에 정의되어 있음에도, `PlaceSearchBar.tsx`에 **동일 로직이 인라인 중복 구현**되어 있습니다.

```typescript
// journeyUtils.ts와 PlaceSearchBar.tsx 양쪽에 동일 코드 존재
function formatJourneyDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}
```

**대체 방법 (라이브러리 미필요):** `PlaceSearchBar.tsx`의 인라인 함수를 삭제하고 `journeyUtils.ts`의 `formatJourneyDate`를 import하면 해결됩니다.

**심화 대체:** `date-fns` + `date-fns/locale/ko`

```bash
npm install date-fns
```
```typescript
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
format(new Date(dateStr), 'yyyy년 M월 d일', { locale: ko });
```

---

### 5. 디바운스 구현 (직접 setTimeout)
**파일:** [`src/components/sidebar/SearchOverlay.tsx#L131`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/sidebar/SearchOverlay.tsx#L131), [`src/features/places/PlaceSearchBar.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/places/PlaceSearchBar.tsx)

두 컴포넌트 모두 `useRef<ReturnType<typeof setTimeout> | null>(null)`로 디바운스를 직접 구현합니다.

**대체 라이브러리:** `use-debounce`

```bash
npm install use-debounce
```
```typescript
import { useDebounce } from 'use-debounce';
const [debouncedQuery] = useDebounce(searchQuery, 350);
useEffect(() => {
  runSearch(debouncedQuery);
}, [debouncedQuery]);
```

**이점:** 컴포넌트 언마운트 시 자동 정리, 타입 안전, 코드 단순화

---

## 🟡 우선순위 중간 — 직접 구현이지만 개선 가능한 항목

### 6. `usePanelDrag` hook (바텀시트 드래그)
**파일:** [`src/hooks/ui/usePanelDrag.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/hooks/ui/usePanelDrag.ts)

93줄로 직접 구현한 패널 드래그 로직 (고무줄 효과, 스냅 포인트, 확장/최소화 상태 관리).

**대체 라이브러리:** `vaul` (이미 설치됨!) 또는 `framer-motion`의 드래그 제스처

> [!IMPORTANT]
> `vaul`이 이미 프로젝트에 설치되어 있으며, `JourneyListSidebar`에서 `data-vaul-no-drag` attribute를 이미 사용 중입니다. `usePanelDrag`의 기능 대부분을 `vaul`의 Drawer로 통합할 수 있습니다.

```tsx
import { Drawer } from 'vaul';
<Drawer.Root snapPoints={['126px', '360px', 1]} activeSnapPoint={snap}>
  <Drawer.Content>...</Drawer.Content>
</Drawer.Root>
```

---

### 7. `useOverscrollDrawer` hook
**파일:** [`src/hooks/useOverscrollDrawer.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/hooks/useOverscrollDrawer.ts)

터치/휠 이벤트로 스크롤 과인 시 드로어 스냅 포인트를 변경하는 76줄의 커스텀 훅.

**대체 라이브러리:** `vaul`의 내장 overscroll 처리

`vaul`은 내부적으로 overscroll과 snap 제어를 통합 처리합니다. `vaul`로 완전히 마이그레이션하면 이 훅 자체가 불필요해집니다.

---

### 8. ✅ 로딩 스피너 SVG (반복 인라인)
**파일:** `SearchOverlay.tsx`, `JourneyListSidebar.tsx`, `JourneyPlayerHeader.tsx`, `PlaceSearchBar.tsx` 등

동일한 SVG 스피너가 여러 컴포넌트에 중복 인라인됩니다:

```tsx
// 동일 코드가 최소 4곳에 반복
<svg className="w-4 h-4 animate-spin text-blue-500" ...>
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
</svg>
```

**대체 방법:** `lucide-react`(이미 설치됨)의 `Loader2` 아이콘 사용

```tsx
import { Loader2 } from 'lucide-react';
<Loader2 className="w-4 h-4 animate-spin text-blue-500" />
```

또는 `src/components/ui/Spinner.tsx` 공통 컴포넌트 분리

---

### 9. 클릭 외부 감지 (handleClickOutside)
**파일:** [`src/components/MapHeaderOverlay.tsx#L14-L22`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/MapHeaderOverlay.tsx#L14-L22)

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setIsMenuOpen(false);
    }
  };
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

**대체 라이브러리:** `@uidotdev/usehooks`의 `useClickOutside` 또는 `react-use`의 `useClickAway`

```typescript
import { useClickOutside } from "@uidotdev/usehooks";
const ref = useClickOutside(() => setIsMenuOpen(false));
```

---

### 10. ✅ 인라인 SVG 아이콘 과다 사용
**파일:** `JourneyListSidebar.tsx`, `JourneyPlayerHeader.tsx`, `SearchOverlay.tsx`, `PlaybackBar.tsx` 등

`lucide-react`가 이미 설치되어 있음에도 대부분의 컴포넌트에서 SVG를 인라인으로 직접 작성합니다.

**예시 — 현재:**
```tsx
<svg xmlns="..." fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
</svg>
```

**예시 — 대체:**
```tsx
import { Check, ChevronLeft, Edit2, Play, Pause, SkipBack, SkipForward, Trash2, Plus, X, Search, Clock } from 'lucide-react';
<Check className="w-4 h-4" />
```

**대체 가능 아이콘 목록:**
| 현재 인라인 SVG | Lucide 대체 |
|---|---|
| 체크마크 (m4.5 12.75 6 6 9-13.5) | `Check` |
| 뒤로가기 화살표 | `ChevronLeft` |
| 편집 (연필) | `Pencil` / `Edit2` |
| 재생 버튼 | `Play` |
| 일시정지 | `Pause` |
| 이전 트랙 | `SkipBack` |
| 다음 트랙 | `SkipForward` |
| 삭제 (휴지통) | `Trash2` |
| 추가 (+) | `Plus` |
| 닫기 (X) | `X` |
| 검색 | `Search` |
| 시계 | `Clock` |
| 위치 핀 | `MapPin` |
| 사용자 프로필 | `User` |
| 로그아웃 | `LogOut` |
| 설정 | `Settings` |
| 드래그 핸들 (≡) | `GripVertical` |

---

### 11. `confirm()` / `alert()` 브라우저 네이티브 다이얼로그
**파일:** [`src/components/sidebar/JourneyListSidebar.tsx#L186`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/sidebar/JourneyListSidebar.tsx#L186), [`src/components/MapHeaderOverlay.tsx#L54`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/MapHeaderOverlay.tsx#L54)

```typescript
if (!confirm(`선택한 ${selectedIds.length}개의 여정을 삭제하시겠습니까?`)) return;
alert('여정 삭제에 실패했습니다.');
alert('설정 기능은 준비 중입니다.');
```

**대체 방법:** 이미 설치된 `@radix-ui/react-dialog` + `dialog.tsx` 컴포넌트 활용

커스텀 `ConfirmDialog` 컴포넌트를 만들면 디자인 일관성과 UX가 크게 향상됩니다.

---

## 🟢 우선순위 낮음 — 특수 목적이라 대체 필요성 낮음

### 12. 대중교통 경로 파싱 (`serverDirectionsService.ts`)
**파일:** [`src/lib/services/serverDirectionsService.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/services/serverDirectionsService.ts) (20KB)

ODsay API 응답 XML/JSON을 직접 파싱하는 로직. 한국 대중교통 특화 API이므로 범용 라이브러리로 대체 불가. **현재 구현 유지 권장.**

### 13. 지하철 실시간 도착 정보 파싱 (`subwayService.ts`)
**파일:** [`src/lib/subwayService.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/subwayService.ts) (511줄)

TAGO API, 서울시 실시간 API 파싱. 한국 전용 API이므로 대체 불가. **현재 구현 유지 권장.**

### 14. 카테고리 분류 함수 (`categoryUtils.ts`)
**파일:** [`src/lib/categoryUtils.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/categoryUtils.ts)

카카오 로컬 API의 한국어 카테고리 문자열을 내부 타입으로 매핑하는 로직. 서비스 도메인 특화로 **현재 구현 유지 권장.**

### 15. `AnimatedPolyline` 경로 애니메이션
**파일:** [`src/components/AnimatedPolyline.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/AnimatedPolyline.tsx)

`requestAnimationFrame` 기반의 경로 그리기 애니메이션. `react-naver-maps`와 강하게 결합되어 있어 범용 라이브러리 대체가 어려움. **현재 구현 유지 권장.**

### 16. 인증 보안 유틸 (`auth/security.ts`)
**파일:** [`src/lib/auth/security.ts`](file:///c:/Users/hitsz/Desktop/OnJourney/src/lib/auth/security.ts)

레이트 리밋, 비밀번호 검증 등 앱 특화 보안 로직. **현재 구현 유지 권장.**

---

## 📋 작업 우선순위 요약

| 우선순위 | 항목 | 라이브러리/방법 | 예상 공수 |
|---|---|---|---|
| ✅ ~~🔴 즉시~~ | ~~스피너 SVG 중복 제거~~ | `lucide-react`의 `Loader2` | ~~30분~~ **완료** |
| ✅ ~~🔴 즉시~~ | ~~인라인 SVG → Lucide 아이콘~~ | `lucide-react` (이미 설치됨) | ~~2시간~~ **완료** |
| ✅ ~~🔴 즉시~~ | ~~`formatJourneyDate` 중복 제거~~ | `journeyUtils.ts` import 통합 | ~~10분~~ **완료** |
| ✅ ~~🔴 즉시~~ | ~~Haversine 함수 중복 제거~~ | `naverMapRouteService`의 `calculateHaversineDistance` 통합 | ~~30분~~ **완료** |
| 🟡 단기 | `useMediaQuery` | `@uidotdev/usehooks` | 30분 |
| 🟡 단기 | `useDragScroll` | `react-indiana-drag-scroll` | 1시간 |
| 🟡 단기 | 디바운스 직접 구현 | `use-debounce` | 1시간 |
| 🟡 단기 | `handleClickOutside` | `@uidotdev/usehooks` useClickOutside | 30분 |
| 🟡 단기 | `confirm/alert` 대체 | Radix Dialog 커스텀 ConfirmDialog | 2시간 |
| 🟢 장기 | `usePanelDrag` + `useOverscrollDrawer` | `vaul` 통합 마이그레이션 | 1-2일 |
| 🟢 장기 | 날짜 포맷 | `date-fns` + `ko` locale | 1시간 |

---

## 💡 추가 설치 권장 라이브러리

```bash
# 유틸 훅 모음 (useMediaQuery, useClickOutside 등 커버)
npm install @uidotdev/usehooks

# 드래그 스크롤
npm install react-indiana-drag-scroll

# 디바운스
npm install use-debounce

# 지리 계산 (Haversine 등)
npm install geolib

# 날짜 포맷 (선택)
npm install date-fns
```

> [!NOTE]
> `lucide-react`는 이미 설치(`^1.21.0`)되어 있으나 프로젝트 전반에서 인라인 SVG를 사용합니다. **추가 설치 없이 즉시 활용 가능한 가장 임팩트 큰 개선 사항**입니다.
