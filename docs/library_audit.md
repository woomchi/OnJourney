# OnJourney 라이브러리 대체 가능 코드 전수 검사 보고서

> 작성일: 2026-07-12 · 최종 갱신: 2026-07-13  
> 프로젝트: `c:\Users\hitsz\Desktop\OnJourney`  
> 목적: 직접 구현된 컴포넌트 및 유틸리티 로직 중 기존/신규 라이브러리로 대체 가능한 항목 식별

---

## 현재 사용 중인 주요 라이브러리

| 라이브러리 | 버전 | 용도 |
|---|---|---|
| `@dnd-kit/*` | core 6, sortable 10 | 드래그&드롭 (여정 카드 정렬) |
| `@radix-ui/react-dialog` | 1.1 | 다이얼로그 Primitive |
| `@tanstack/react-query` | 5 | 서버 상태 관리 |
| `@uidotdev/usehooks` | - | `useClickAway` 등 유틸 훅 |
| `class-variance-authority` | 0.7 | 조건부 className 빌더 |
| `clsx` + `tailwind-merge` | - | className 병합 유틸 |
| `fast-xml-parser` | 5 | XML 파싱 (TAGO API 응답) |
| `idb-keyval` | 6 | IndexedDB 키-값 캐시 |
| `lucide-react` | 1.21 | 아이콘 |
| `react-indiana-drag-scroll` | - | 마우스 드래그 스크롤 |
| `react-naver-maps` | 0.2 | 네이버 지도 React 래퍼 |
| `use-debounce` | - | 검색 디바운스 |
| `vaul` | 1.1 | 모바일 바텀 드로어 |
| `zustand` | 5 | 클라이언트 전역 상태 관리 |
| `zustand/react/shallow` | - | 렌더 최적화 |

---

## ✅ 완료된 리팩토링

| 항목 | 방법 | 비고 |
|---|---|---|
| 스피너 SVG 중복 제거 | `lucide-react` `Loader2` | 공통 컴포넌트/아이콘으로 통합 |
| 인라인 SVG → Lucide 아이콘 | `lucide-react` | 프로젝트 전반 적용 |
| `formatJourneyDate` 중복 제거 | `journeyUtils.ts` import 통합 | 라이브러리 불필요 |
| Haversine 함수 중복 제거 | `naverMapRouteService.calculateHaversineDistance` 통합 | `geolib` 미도입 |
| `useMediaQuery` | SSR 안전 처리 추가 (직접 구현 유지) | `@uidotdev/usehooks` 미도입 |
| `useDragScroll` | `react-indiana-drag-scroll` | 훅 삭제, 컴포넌트 래퍼로 대체 |
| 디바운스 직접 구현 | `use-debounce` | `SearchOverlay`, `PlaceSearchBar` |
| `handleClickOutside` | `@uidotdev/usehooks` `useClickAway` | `MapHeaderOverlay` |
| `confirm()` / `alert()` | `DialogProvider` + Radix Dialog | `useDialog()` 훅으로 전역 대체 |
| 날짜 포맷 | `date-fns` | `formatJourneyDate` 적용 |
| `usePanelDrag` + `useOverscrollDrawer` | `vaul` | 커스텀 훅 제거, `Drawer` 컴포넌트로 통합 |

### `vaul` 통합 대체 상세 (2026-07-13 완료)

**수정 파일:**
- [`src/components/JourneySidebar.tsx`](../src/components/JourneySidebar.tsx)
- [`src/components/sidebar/JourneyListSidebar.tsx`](../src/components/sidebar/JourneyListSidebar.tsx)
- [`src/components/PlaceList.tsx`](../src/components/PlaceList.tsx)
- [`src/features/route/AlternativeRoutePanel.tsx`](../src/features/route/AlternativeRoutePanel.tsx)
- [`src/features/route/RouteGuidePanel.tsx`](../src/features/route/RouteGuidePanel.tsx)

**삭제 파일:**
- `src/hooks/ui/usePanelDrag.ts`
- `src/hooks/useOverscrollDrawer.ts`

```tsx
import { Drawer } from 'vaul';

<Drawer.Root snapPoints={['126px', '360px', 1]} activeSnapPoint={snap}>
  <Drawer.Content>...</Drawer.Content>
</Drawer.Root>
```

### `confirm/alert` 대체 상세 (2026-07-13 완료)

**추가 파일:** [`src/providers/DialogProvider.tsx`](../src/providers/DialogProvider.tsx)

```typescript
import { useDialog } from '@/providers/DialogProvider';

const { confirm, alert } = useDialog();

// 확인 다이얼로그 (삭제 등)
const ok = await confirm({
  message: '선택한 3개의 여정을 삭제하시겠습니까?',
  confirmLabel: '삭제',
  variant: 'destructive',
});

// 알림 다이얼로그
await alert('여정 삭제에 실패했습니다.');
```

**적용 파일:**
- `JourneyListSidebar.tsx` — 여정 삭제 확인/실패 알림
- `ActiveJourneySidebar.tsx` — 장소 삭제 확인, 저장/삭제 실패 알림
- `MapHeaderOverlay.tsx` — 설정 준비 중 알림
- `PlaceSearchBar.tsx` — 중복 장소/추가 실패 알림
- `MapArea.tsx` — GPS/나침반 권한 알림

---

## 🔲 남은 작업

### 🟢 장기

---

## 📋 작업 우선순위 요약

| 상태 | 항목 | 방법 |
|---|---|---|
| ✅ 완료 | 스피너/아이콘 SVG | `lucide-react` |
| ✅ 완료 | `formatJourneyDate` 중복 | `journeyUtils` import |
| ✅ 완료 | Haversine 중복 | `calculateHaversineDistance` 통합 |
| ✅ 완료 | `useMediaQuery` | SSR 안전 직접 구현 |
| ✅ 완료 | `useDragScroll` | `react-indiana-drag-scroll` |
| ✅ 완료 | 디바운스 | `use-debounce` |
| ✅ 완료 | 클릭 외부 감지 | `useClickAway` |
| ✅ 완료 | `confirm/alert` | `DialogProvider` + Radix Dialog |
| ✅ 완료 | 날짜 포맷 | `date-fns` 도입 |
| ✅ 완료 | `usePanelDrag` + `useOverscrollDrawer` | `vaul` 통합 |

> 모든 리팩토링 작업이 완료되었습니다. 향후 신규 기능 추가 시 이 문서를 기준으로 기존 생태계를 재활용하세요.
