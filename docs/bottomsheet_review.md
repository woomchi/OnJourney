# CustomBottomSheet 코드 진단 보고서

> 진단 대상: [`CustomBottomSheet.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx), [`PlaceList.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/PlaceList.tsx), [`RouteGuidePanel.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/route/RouteGuidePanel.tsx), [`JourneySidebar.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx)

---

## 🔴 Critical Bugs (즉시 수정 필요)

### BUG-1: `useEffect` 의존성 배열 누락 → 스냅 무한 루프 / 싱크 실패

**파일**: [`CustomBottomSheet.tsx` L84-91](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L84-L91)

```tsx
// 현재 코드 - getTargetY가 의존성 배열에 없음
useEffect(() => {
  if (isOpen) {
    setActiveSnapY(getTargetY(initialSnap));  // ← 클로저 캡처 버그
  } else {
    setActiveSnapY(0);
    if (onClose) onClose();
  }
}, [isOpen, minHeight, defaultHeight, maxHeight, initialSnap]); // getTargetY 누락
```

`getTargetY`는 컴포넌트 내부에 인라인으로 정의된 함수이므로 매 렌더 시 새 참조가 생성됩니다. 
ESLint `exhaustive-deps` 규칙을 끄고 있어 이 버그가 숨겨져 있습니다.

**수정**:
```tsx
const getTargetY = useCallback((snapType: 'min' | 'default' | 'max') => {
  switch (snapType) {
    case 'min': return -minHeight;
    case 'max': return -maxHeight;
    default:    return -defaultHeight;
  }
}, [minHeight, maxHeight, defaultHeight]);
```

---

### BUG-2: `isOpen=false` 일 때 `dragConstraints.bottom = 0`이 아닌 값으로 잘못 적용

**파일**: [`CustomBottomSheet.tsx` L163-166](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L163-L166)

```tsx
dragConstraints={{
  top: -maxHeight,
  bottom: isOpen ? -minHeight : 0  // ← isOpen=false 시 bottom=0
}}
```

`isOpen=false`일 때 시트의 `y`는 0으로 애니메이션됩니다. 그런데 이 순간 `dragConstraints.bottom=0`이기 때문에, 사용자가 닫히는 도중의 시트를 아래로 드래그하면 `y > 0`으로 시트가 화면 아래로 완전히 내려가 버려 **레이아웃 공백**이 생깁니다.

**수정**: `bottom: -minHeight`로 고정하고, `isOpen=false` 상태의 드래그 자체를 `dragListener={false}` 외에 `pointerEvents: 'none'`으로 원천 차단하세요.

---

### BUG-3: `snap` 상태가 문자열/숫자 혼용 → 비교 실패로 스냅 타입 오분류

**파일**: [`JourneySidebar.tsx` L333-335](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx#L333-L335), [`RouteGuidePanel.tsx` L575-577](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/route/RouteGuidePanel.tsx#L575-L577)

```tsx
// JourneySidebar.tsx
let currentSnapType: 'min' | 'default' | 'max' = 'default';
if (snap === minSnapPx || snap === `${minSnapPx}px`) currentSnapType = 'min';
else if (snap === 1 || snap === '1') currentSnapType = 'max';
```

```tsx
// PlaceList.tsx (handleTouchEnd)
const minSnap = activeJourney ? '133px' : '62px';
if (drawerSnapPoint === minSnap || drawerSnapPoint === parseInt(minSnap, 10)) currentSnap = 'min';
```

`snap` 상태가 `number | string | null` 타입으로 정의되어 있고, `setSnap(1)` (숫자)과 `setSnap('1')` (문자열)이 혼재합니다. 비교 로직이 여러 파일에 중복 산재되어 있어, 한 파일에서 `setSnap(1)`로 설정한 뒤 다른 파일의 `=== '1'` 비교에서 `false`가 되는 상황이 발생할 수 있습니다.

**수정**: 스냅 상태를 `'min' | 'default' | 'max'` 열거형으로 통일하고, 픽셀 값 계산은 Zustand store나 상위 컴포넌트에서 파생하세요.

---

## 🟠 High-Priority Issues (중요 개선사항)

### ISSUE-1: `dragMomentum={false}` + `dragElastic={0}` → 관성/탄성 완전 차단으로 부자연스러운 UX

**파일**: [`CustomBottomSheet.tsx` L161-162](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L161-L162)

```tsx
dragElastic={0}      // 경계선에서 탄성 없음 → 막히는 느낌
dragMomentum={false} // 관성 없음 → 드래그 후 즉시 멈추는 느낌
```

`dragMomentum=false`는 맞는 선택(스냅 제어를 직접 하기 위함)이지만, `dragElastic={0}`는 maxHeight/minHeight 경계 도달 시 전혀 반응이 없어 **고무줄 효과를 기대하는 iOS 사용자에게 앱이 멈춘 것처럼** 느껴집니다.

**수정**: 경계 도달 시 미세한 탄성(0.05~0.1)을 부여하여 "이 이상은 못 가"라는 햅틱 피드백을 시각적으로 구현:
```tsx
dragElastic={{ top: 0.05, bottom: 0 }}  // 위 경계에서만 약간의 탄성
```

---

### ISSUE-2: Scroll vs Drag 전파 차단 불완전 — `Framer Motion`의 `dragListener=false` + `touch` 이벤트 혼용

**파일**: [`PlaceList.tsx` L140-153](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/PlaceList.tsx#L140-L153), [`RouteGuidePanel.tsx` L133-165](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/route/RouteGuidePanel.tsx#L133-L165)

`PlaceList`는 `handleTouchMove`에서 **항상 무조건** `e.stopPropagation()`을 호출합니다:
```tsx
const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
  // 스크롤 중 터치 이동 이벤트가 바텀 시트로 전파되어 시트가 움직이는 것 항상 차단
  e.stopPropagation();  // ← 방향 무관하게 항상 차단
};
```

반면 `RouteGuidePanel`은 `scrollTop`을 보고 방향을 판단하여 조건부로 차단합니다. 두 파일이 서로 다른 전략을 씁니다.

**PlaceList의 문제**: `stopPropagation`만으로는 Framer Motion의 Pointer 이벤트 리스너를 막을 수 없습니다. `dragListener=false`로 인해 `dragControls.start(e)`를 명시적으로 호출할 때만 드래그가 시작되므로, 현재 구조에서 `stopPropagation`은 사실상 불필요합니다. 그러나 **`passive: false`인 native touch 이벤트가 아닌 React 합성 이벤트**이기 때문에 브라우저의 기본 스크롤 동작을 막지는 못합니다.

**진짜 문제**: 내부 스크롤 영역의 `overscroll-behavior: none` (CSS `overscroll-y-none`) 설정이 잘 적용되어 있어 브라우저 체인 스크롤 자체는 막혀 있지만, **`touchStartScrollTop === 0`인 상태에서 아래로 스와이프 시 바텀시트가 내려가야 하는 RouteGuidePanel의 로직**이 `PlaceList`에는 없습니다.

> PlaceList에서 최상단에서 아래로 드래그 → 시트가 내려가는 동작이 `handlePointerDown`의 `!isScrollable` 조건에만 의존하여, **스크롤 가능한 리스트에서는 절대로 드래그로 시트를 내릴 수 없습니다.**

---

### ISSUE-3: `initialSnap` prop 변경 시 시트 위치 미동기화

**파일**: [`CustomBottomSheet.tsx` L84-91](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L84-L91)

`useEffect`는 `isOpen`이 `true`인 상태에서 `initialSnap`이 바뀌어도 `setActiveSnapY`를 호출합니다. 이는 의도된 것이지만, 외부(`JourneySidebar`)에서 `initialSnap={currentSnapType}`을 내려줄 때 사용자가 이미 다른 스냅 포인트로 이동한 상태라면 **사용자 위치가 강제로 초기화**됩니다.

`initialSnap`은 "초기값"이어야 하며, 이후 변경은 무시해야 합니다. 현재 구조는 "제어 컴포넌트"처럼 동작하여 예측 불가능합니다.

**수정**: 최초 마운트 시에만 초기 스냅을 설정:
```tsx
const isInitializedRef = useRef(false);
useEffect(() => {
  if (isOpen && !isInitializedRef.current) {
    setActiveSnapY(getTargetY(initialSnap));
    isInitializedRef.current = true;
  } else if (!isOpen) {
    isInitializedRef.current = false;
    setActiveSnapY(0);
    onClose?.();
  }
}, [isOpen]); // initialSnap은 의도적으로 제외
```

---

### ISSUE-4: `onClose` 콜백이 `useEffect` 안에서 호출 — 클로저 스테일 위험

**파일**: [`CustomBottomSheet.tsx` L84-91](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L84-L91)

```tsx
useEffect(() => {
  if (isOpen) { ... } else {
    setActiveSnapY(0);
    if (onClose) onClose(); // ← onClose가 의존성 배열에 없음
  }
}, [isOpen, minHeight, defaultHeight, maxHeight, initialSnap]); // onClose 누락!
```

`onClose`가 의존성 배열에 없어 스테일 클로저를 참조합니다. `useRef`로 래핑하거나 의존성 배열에 추가하세요.

---

### ISSUE-5: `windowHeight` 초기값 0 → SSR Hydration Mismatch 및 시트 위치 0px

**파일**: [`JourneySidebar.tsx` L223-231](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx#L223-L231), [`RouteGuidePanel.tsx` L53-62](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/route/RouteGuidePanel.tsx#L53-L62)

```tsx
const [windowHeight, setWindowHeight] = useState(0); // ← SSR에서 항상 0
// ...
maxHeight={windowHeight - 16} // ← 첫 렌더 시 maxHeight = -16
```

SSR에서 `windowHeight=0`이므로 `maxHeight=-16`이 됩니다. `mounted` 가드(`if (!mounted) return ...`)가 있지만, 이 가드는 `JourneySidebar`에만 있고 `RouteGuidePanel`에는 없습니다.

**수정**: `dvh` 단위를 활용하거나, `useLayoutEffect` + `100dvh` 기반으로 처리:
```tsx
const [windowHeight, setWindowHeight] = useState(() =>
  typeof window !== 'undefined' ? window.innerHeight : 812 // 안전한 폴백값
);
```

---

## 🟡 Medium-Priority Issues

### ISSUE-6: iOS Safari `overscroll/bounce`로 인한 시트 들뜸 — `body` 레벨 처리 부재

**파일**: [`CustomBottomSheet.tsx` L156-178](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L156-L178)

시트 자체의 내부 스크롤 영역에 `overscroll-y-none`이 적용되어 있지만, 바텀 시트 **외부의 body 레벨 스크롤**을 막지 않습니다. iOS Safari에서 주소창이 숨겨지는 타이밍에 `window.innerHeight`가 변하면 시트가 덜컥 튑니다.

**수정**:
```tsx
// CustomBottomSheet 마운트/언마운트 시 body 스크롤 잠금
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed'; // iOS bounce 완전 차단
    document.body.style.width = '100%';
  }
  return () => {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
  };
}, [isOpen]);
```

> [!WARNING]
> `position: fixed`는 스크롤 위치를 초기화시킵니다. `scrollY`를 저장/복원하는 로직과 함께 사용하세요.

---

### ISSUE-7: Safe Area Insets 미처리 — iOS 홈 인디케이터 겹침

**파일**: [`CustomBottomSheet.tsx` L167-178](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L167-L178)

시트의 `bottom`과 `height`에 `env(safe-area-inset-bottom)` 처리가 전혀 없습니다. iPhone의 홈 인디케이터(34px)가 시트 최하단 콘텐츠를 가립니다.

**수정**:
```css
/* globals.css */
.bottom-sheet-container {
  padding-bottom: env(safe-area-inset-bottom);
  /* 또는 */
  padding-bottom: max(env(safe-area-inset-bottom), 16px);
}
```
```tsx
// 또는 inline style
style={{
  paddingBottom: 'env(safe-area-inset-bottom)',
}}
```
또한 `maxHeight={windowHeight - 16}`에서 16px 대신 `safe-area-inset-top`을 고려하세요.

---

### ISSUE-8: `viewport` 단위 미적용 — 모바일 브라우저 주소창 동적 변화 미대응

**파일**: [`JourneySidebar.tsx` L228](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx#L228)

`window.innerHeight`는 모바일 브라우저 주소창이 사라질 때마다 변합니다. `resize` 이벤트로 추적하지만, 이 이벤트는 throttle 없이 바로 `setWindowHeight`를 호출하여 **매 스크롤마다 리렌더를 유발**합니다.

**수정**: CSS `100dvh` 단위 (Dynamic Viewport Height)를 사용하면 JS 없이도 정확한 뷰포트 높이를 얻습니다:
```tsx
// maxHeight 계산
const maxHeight = `calc(100dvh - 16px)`;
// 이를 CSS 변수로 전달
style={{ '--max-height': maxHeight }}
```
단, `dvh`를 지원하지 않는 구형 브라우저 폴백으로 `100vh`도 함께 선언하세요.

---

### ISSUE-9: History API 미통합 — 안드로이드 백버튼 처리 없음

현재 코드 어디에도 `history.pushState` / `popstate` 이벤트 핸들링이 없습니다. 안드로이드에서 물리 백버튼을 누르면 시트가 닫히는 것이 아니라 **페이지 자체가 뒤로 이동**합니다.

**수정**:
```tsx
// CustomBottomSheet 내부 또는 사용처
useEffect(() => {
  if (!isOpen) return;
  // 시트가 열릴 때 히스토리 스택에 더미 항목 추가
  history.pushState({ bottomSheet: true }, '');

  const handlePopState = (e: PopStateEvent) => {
    if (e.state?.bottomSheet) {
      onClose?.(); // 백버튼 → 시트 닫기
    }
  };
  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}, [isOpen, onClose]);
```

---

### ISSUE-10: `dnd-kit` + `framer-motion` 드래그 충돌 — `PointerSensor` 이벤트 경쟁

**파일**: [`PlaceList.tsx` L294-306](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/PlaceList.tsx#L294-L306)

`dnd-kit`의 `PointerSensor`와 Framer Motion의 `dragControls`가 동시에 `pointerdown` 이벤트를 수신합니다. 편집 모드에서 아이템을 드래그할 때 **시트 자체가 같이 움직이는 버그**가 발생할 수 있습니다.

현재 `PointerSensor`의 `activationConstraint: { distance: 8 }`이 어느 정도 방어하지만, `TouchSensor`의 `delay: 200`과 바텀시트의 즉시 드래그 시작 간 경쟁 조건이 존재합니다.

**수정**: 드래그 중인 dnd-kit 아이템이 있을 때 `dragControls.start`를 호출하지 않도록 `isDragging` ref로 가드:
```tsx
const isDndDragging = useRef(false);
// DndContext의 onDragStart에서 isDndDragging.current = true
// onDragEnd에서 isDndDragging.current = false

const handlePointerDown = (e) => {
  if (isDndDragging.current) return; // dnd 드래그 중엔 시트 드래그 금지
  // ...
};
```

---

## 🟢 코드 품질 개선

### QUALITY-1: `snap` 상태와 `drawerSnapPoint` 스토어의 양방향 동기화 — 무한 루프 위험

**파일**: [`JourneySidebar.tsx` L211-217](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx#L211-L217)

```tsx
// snap → store
useEffect(() => {
  setDrawerSnapPoint(snap);
}, [snap, ...]);

// store → snap (외부 변경 시)
useEffect(() => {
  if (drawerSnapPoint !== snap) setSnap(drawerSnapPoint);
}, [drawerSnapPoint]);
```

두 `useEffect`가 서로를 트리거하는 순환 의존성 구조입니다. `PlaceList`가 `setDrawerSnapPoint`를 직접 호출 → `JourneySidebar`의 두 번째 `useEffect` 실행 → `setSnap` → 첫 번째 `useEffect` 실행 → `setDrawerSnapPoint` 재호출... 

현재는 값이 같으면 React state 업데이트가 bailout되어 루프를 피하지만, 타입 불일치(`'360px'` vs `360`) 시 실제 무한 루프가 발생할 수 있습니다.

**수정**: 단방향 데이터 흐름으로 리팩토링. `snap`을 Zustand store로 이전하고, 모든 변경을 store action으로 처리하세요.

---

### QUALITY-2: `useBottomSheet` context 오용 — `dragControls` 외부 노출

**파일**: [`CustomBottomSheet.tsx` L19-25](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L19-L25)

`dragControls`를 context로 노출하여 자식이 `dragControls.start(e)`를 직접 호출하는 구조입니다. 이 패턴은 바텀 시트의 드래그 핸들을 외부에서 임의로 만들 수 있어 유연하지만, **내부 스크롤 컨테이너가 실수로 dragControls를 활성화하면 디버깅이 매우 어렵습니다**.

`PlaceList`의 `handlePointerDown`이 정확히 이 안티패턴에 해당합니다. 내부 컨텐츠 영역 전체에 `onPointerDown={handlePointerDown}`을 붙이고 그 안에서 `bottomSheet.dragControls.start(e)`를 호출합니다.

---

## 요약 표

| # | 심각도 | 파일 | 문제 | 권장 조치 |
|---|--------|------|------|-----------|
| BUG-1 | 🔴 | CustomBottomSheet | `getTargetY` 의존성 누락 | `useCallback` 적용 |
| BUG-2 | 🔴 | CustomBottomSheet | 닫히는 도중 드래그 시 시트 사라짐 | `bottom: -minHeight` 고정 |
| BUG-3 | 🔴 | JourneySidebar/PlaceList | snap 타입 혼용 비교 오류 | 열거형으로 통일 |
| ISSUE-1 | 🟠 | CustomBottomSheet | 경계에서 탄성 없어 막히는 느낌 | `dragElastic={{ top: 0.05 }}` |
| ISSUE-2 | 🟠 | PlaceList | 스크롤 가능 리스트에서 시트 드래그 불가 | 최상단 오버스크롤 핸들링 추가 |
| ISSUE-3 | 🟠 | CustomBottomSheet | `initialSnap` 변경 시 사용자 위치 초기화 | 최초 마운트 시에만 초기화 |
| ISSUE-4 | 🟠 | CustomBottomSheet | `onClose` 스테일 클로저 | 의존성 배열에 추가 |
| ISSUE-5 | 🟠 | JourneySidebar/RouteGuidePanel | `windowHeight=0` SSR 오류 | 안전한 초기값 또는 `dvh` |
| ISSUE-6 | 🟡 | CustomBottomSheet | iOS bounce로 시트 들뜸 | `body` overflow/position 잠금 |
| ISSUE-7 | 🟡 | CustomBottomSheet | Safe Area Inset 미처리 | `env(safe-area-inset-bottom)` |
| ISSUE-8 | 🟡 | JourneySidebar | 주소창 변화 시 resize 무throttle | `100dvh` CSS 단위 사용 |
| ISSUE-9 | 🟡 | 전체 | 안드로이드 백버튼 History API 미통합 | `pushState` + `popstate` 핸들러 |
| ISSUE-10 | 🟡 | PlaceList | dnd-kit과 framer-motion 이벤트 경쟁 | `isDndDragging` ref 가드 |
| QUALITY-1 | 🟢 | JourneySidebar | snap ↔ store 양방향 동기화 루프 위험 | Zustand로 단일화 |
| QUALITY-2 | 🟢 | PlaceList | dragControls 외부 노출 안티패턴 | 드래그 핸들 컴포넌트화 |
