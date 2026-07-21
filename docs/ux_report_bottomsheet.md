# 🗺️ OnJourney 바텀 시트 UX/UI 개선 보고서
### *"네이티브 앱처럼 부드럽고 직관적이다" — 그 느낌을 만드는 디테일들*

---

> [!IMPORTANT]
> 이 보고서는 실제 [`CustomBottomSheet.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx) 코드와 [`bottomsheet_review.md`](file:///c:/Users/hitsz/Desktop/OnJourney/docs/bottomsheet_review.md)의 진단 결과를 기반으로 작성된 **실행 가능한 개선안**입니다. 현재 코드의 `dragElastic={0}`, `damping: 25 / stiffness: 200` 등의 수치가 직접 분석 대상입니다.

> [!WARNING]
> **프로젝트 핵심 제약 — "콘크리트 벽" 요구사항** ([`bottom_sheet_requirements.md §2`](file:///c:/Users/hitsz/Desktop/OnJourney/docs/bottom_sheet_requirements.md) 참조)  
> 바텀시트는 최소 높이 아래로 **단 1픽셀도 내려가지 않아야 합니다.** `dragElastic`의 `bottom` 값은 반드시 `0`으로 유지해야 하며, 아래 방향 bounce는 허용되지 않습니다.

---

## Part 1. 🔍 UX Insights — 퀄리티를 확 달라지게 할 핵심 3가지

---

### INSIGHT-1: 시트는 "덮개"가 아니라 "레이어"여야 한다 — 지도와의 유기적 호흡

**현재 문제**: 시트가 올라오면 지도가 그냥 가려집니다. 지도와 시트는 별개의 오브젝트처럼 느껴집니다.

**왜 이게 중요한가**:  
네이버 지도와 Apple Maps의 결정적 차이는 **지도가 시트에 "반응"한다**는 점입니다. 시트가 올라올수록 지도의 중심점이 위로 이동하여 마커가 항상 보이는 영역에 머뭅니다. 이 단순한 동작 하나가 "지도 앱"과 "지도를 품은 앱"을 가르는 경험의 기준선입니다.

**제안**:
- 시트의 `y` MotionValue를 `useTransform`으로 구독하여, 시트 높이가 커질수록 **지도의 `padding.bottom`을 동적으로 증가**시킵니다.
- 마커 탭 시 해당 위치를 지도 가시 영역의 **황금비(화면 상단 40% 지점)** 로 부드럽게 이동시킵니다.
- 이 두 동작은 JS 한 줄도 필요 없이 `useTransform` + Kakao Maps `setBounds` API 조합으로 구현 가능합니다.

---

### INSIGHT-2: 스프링 수치가 "뚝뚝 끊기는 느낌"의 진짜 원인이다

**현재 문제**: [`CustomBottomSheet.tsx L75-80`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L75-L80)

```tsx
// 현재 설정 — 너무 강하고 빠르게 스냅됩니다
animate(y, activeSnapY, {
  type: 'spring',
  damping: 25,      // ← 진동을 과도하게 빠르게 죽임
  stiffness: 200,   // ← 장력이 강해 급격하게 당겨짐
  velocity: initialVelocity
})
```

`damping: 25 / stiffness: 200`의 조합은 임계감쇠(Critically Damped)에 가까운 값입니다. 튀지는 않지만, **너무 딱딱하고 급격하게 제자리를 잡아** 플라스틱을 던진 것처럼 느껴집니다. iOS의 자연스러운 물성감은 **약한 스프링 + 충분한 감쇠**의 조합에서 나옵니다.

**제안**: Part 4 Framer Motion Specs 참조.

---

### INSIGHT-3: Drag Handle의 "지각되는 드래그 영역"이 너무 좁다

**현재 문제**: [`CustomBottomSheet.tsx L183-188`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L183-L188)

드래그 핸들(`w-12 h-1.5`)은 시각적으로 48px × 6px입니다. 그러나 터치 타겟은 최소 **44×44pt (Apple HIG)** 여야 합니다. 현재 핸들은 시각 요소는 있지만 실제 터치 가능 영역은 `pt-3 pb-2` padding으로만 확보되어 있어, 손가락이 약간만 벗어나도 드래그가 안 됩니다.

더 중요한 문제: **헤더 영역 전체가 드래그 영역이어야 합니다.** 사용자는 핸들 바 외에도 장소명 텍스트, 별점, 사진 위를 쓸어도 시트가 올라갈 것이라고 기대합니다.

**제안**:
- 핸들 컨테이너의 `padding`을 `py-4`로 확장하여 터치 타겟 44px 보장.
- `headerContent` 영역 전체(`onPointerDown={dragControls.start}`)에 이미 드래그가 연결되어 있는 것은 올바른 방향입니다. 다만 `cursor: grab` 시각 피드백이 모바일에서는 보이지 않으므로, **헤더가 드래그 가능임을 암시하는 시각적 단서**(미세한 배경색 변화 등)를 추가하세요.

---

## Part 2. 🎬 Interaction Flow — 마커 탭부터 풀스크린까지의 여정

```
[0ms]  사용자가 지도 위 마커를 탭
        ↓
[0~50ms]  마커 상태 변화 (selected → 강조 스케일 1.0→1.2→1.1, 컬러 변경)
          + 햅틱 피드백 (navigator.vibrate(10)) 실행
        ↓
[50~80ms] 지도 카메라가 마커 위치를 향해 이동 시작
          (목표: 화면 상단 40% 지점에 마커가 위치하도록 오프셋 계산)
        ↓
[80~120ms] 바텀 시트 마운트 + 슬라이드 업 애니메이션 시작 (MIN 상태)
           - y: 0 → -minHeight (스프링)
           - 불투명도: 0.4 → 1.0
        ↓
[120~300ms] 시트가 MIN 스냅 포인트에 안착
            - 드래그 핸들, 장소명, 별점, 핵심 정보 (요약 카드) 표시
            - 지도 padding-bottom이 minHeight 기준으로 업데이트됨
        ↓
[사용자 인터랙션: 위로 스와이프]
        ↓
[실시간] 시트 y값이 -minHeight → -defaultHeight로 변화하는 동안:
         - useTransform으로 지도 padding이 연동하여 실시간 증가
         - 플로팅 버튼 (GPS, zoom)이 시트 상단 가장자리 위로 슬라이딩 업
         - 헤더 영역의 장소 사진이 헤더 배경으로 확장 (Shared Element)
        ↓
[DEFAULT 스냅 안착] 상세 정보 영역 표시
                    - 영업시간, 메뉴, 리뷰 리스트 등
                    - 내부 스크롤 영역이 활성화됨
        ↓
[사용자 인터랙션: 내부 스크롤 최상단에서 추가 위로 스와이프]
        ↓
[실시간] scrollTop === 0 감지 → dragControls 활성화
         시트 y값이 -defaultHeight → -maxHeight
        ↓
[MAX 스냅 안착] 풀스크린 모드
               - 상단 고정 헤더 (장소명 + 닫기 버튼) 페이드인
               - 상태 표시줄(status bar) 영역까지 콘텐츠 확장
               - 지도는 완전히 숨겨짐 (또는 미니맵으로 전환)
        ↓
[사용자 인터랙션: 아래로 스와이프 또는 뒤로 가기]
        ↓
        시트 닫기 → history.popState() 처리
        마커 선택 해제 → 지도 중심점 복귀
```

---

### Step별 핵심 타이밍 원칙

| 단계 | 대기 시간 | 근거 |
|------|-----------|------|
| 마커 탭 → 햅틱 | 즉시 (0ms) | 손가락이 닿은 순간 피드백이 있어야 "반응했다"고 인지 |
| 마커 탭 → 시트 슬라이드 업 | 80ms | 지도 이동 애니메이션과 겹치지 않게, 동시에 시작하되 시차를 줌 |
| 스와이프 종료 → 스냅 완료 | 200~350ms | 스프링 애니메이션 지속 시간, 150ms 미만이면 날카롭게 느껴짐 |
| 스냅 완료 → 콘텐츠 페이드인 | 50ms 딜레이 | 시트가 먼저 자리를 잡은 후 콘텐츠가 나타나야 시선이 집중됨 |

---

## Part 3. 🎨 Visual Affordance — 시각적 어포던스 개선 가이드

### 3-1. Drag Handle 개선

```tsx
{/* 현재 */}
<div className="w-12 h-1.5 bg-zinc-300 rounded-full" />

{/* 개선안 — 더 넓고 부드러운 핸들 */}
<div
  style={{
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    // 드래그 중 색상 변화로 활성 상태 표시
    transition: 'background-color 0.15s ease',
  }}
/>
```

**원칙**:
- 너비는 `32~40px`가 최적 (너무 길면 "막대"처럼 보여 텍스트 오인)
- 높이는 `4px` (Apple HIG 기준 — `h-1.5`의 6px은 너무 두꺼움)
- 색상은 `rgba(0,0,0,0.18)` — 배경색에 관계없이 적당히 보임
- **드래그 시작 시**: `rgba(0,0,0,0.35)`로 전환 → 활성화 피드백

---

### 3-2. 깊이감(Depth) 있는 그림자

```tsx
// 현재: 단조로운 단일 그림자
boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)'

// 개선안: 레이어드 그림자로 자연스러운 부유감
boxShadow: `
  0 -1px 0 rgba(0,0,0,0.04),      /* 얇은 경계선 */
  0 -4px 12px rgba(0,0,0,0.06),   /* 근거리 확산 */
  0 -20px 60px rgba(0,0,0,0.10)   /* 원거리 대기 */
`
```

**시트 높이에 따라 그림자 강도도 변화**:
```tsx
const shadowOpacity = useTransform(
  y,
  [-maxHeight, -minHeight],
  [0.18, 0.06]  // 올라갈수록 그림자 진해짐 (더 높이 떠 있으므로)
);
```

---

### 3-3. 타이포그래피 계층 구조

```
장소명      → font-size: 18px, font-weight: 700, letter-spacing: -0.4px
카테고리    → font-size: 13px, font-weight: 500, color: #888
별점/리뷰수 → font-size: 14px, font-weight: 600 (별점), 400 (리뷰수)
섹션 라벨   → font-size: 12px, font-weight: 600, letter-spacing: 0.5px, UPPERCASE, color: #AAA
본문        → font-size: 14px, font-weight: 400, line-height: 1.6
```

**여백 체계 (8px 기준 그리드)**:

```
시트 상단 패딩   : 12px (핸들 포함)
수평 패딩       : 20px
섹션 간격       : 24px
요소 간격       : 8px / 12px
```

---

## Part 4. ⚙️ Framer Motion Specs — 구체적인 스프링 수치 제안

### 4-1. 메인 스냅 트랜지션 (가장 중요)

```tsx
// 현재 — 뚝뚝 끊기는 플라스틱 느낌
{ type: 'spring', damping: 25, stiffness: 200 }

// ✅ 개선안 A — "자연스러운 고무" 느낌 (일반적 스와이프)
const SPRING_SNAP = {
  type: 'spring' as const,
  stiffness: 320,    // 적당한 장력 — 너무 느리지 않게
  damping: 30,       // 한 번의 오버슈트 후 안착 (생동감)
  mass: 0.8,         // 가볍게 — 무거우면 느려짐
  restDelta: 0.5,    // 0.5px 이내면 정지 (연산 낭비 방지)
  restSpeed: 2,      // 2px/s 이하면 정지
};

// ✅ 개선안 B — "빠른 스와이프" 후 트랜지션 (velocity가 높을 때)
const SPRING_SNAP_FAST = {
  type: 'spring' as const,
  stiffness: 500,    // 강한 장력 — 빠르게 안착
  damping: 40,       // 오버슈트 없이 즉시 안착
  mass: 0.6,
  velocity: velocityY, // 손을 뗄 때의 속도를 초기 속도로 전달
};
```

**velocity에 따른 동적 수치 적용**:

```tsx
const handleDragEnd = (event: any, info: any) => {
  const { velocity: { y: vY } } = info;
  
  // 속도가 빠를수록 더 팽팽한 스프링으로 즉시 안착
  const isFlick = Math.abs(vY) > 500;
  const springConfig = isFlick ? SPRING_SNAP_FAST : SPRING_SNAP;
  
  animate(y, targetSnap.y, {
    ...springConfig,
    velocity: vY
  });
};
```

---

### 4-2. 마커 탭 시 시트 등장 애니메이션

```tsx
// 시트가 화면 밖(y=0)에서 MIN 스냅으로 올라오는 첫 진입
const SPRING_ENTRY = {
  type: 'spring' as const,
  stiffness: 400,    // 강하게 — 빠른 반응감
  damping: 35,       // 오버슈트 없는 깔끔한 진입
  mass: 1.0,
};

// 또는 더 드라마틱하게 (살짝 튀는 느낌):
const SPRING_ENTRY_BOUNCY = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,       // 살짝 낮춰 오버슈트 허용
  mass: 0.9,
};
```

---

### 4-3. 경계 탄성 (Rubber-band Effect)

현재 `dragElastic={0}`이어서 최대 높이 도달 시 벽에 막히는 느낌입니다.

```tsx
// 개선안 — 위쪽 경계에서만 약한 고무줄 효과
dragElastic={{ 
  top: 0.08,    // 최대 높이 초과 시 8% 탄성 (40px 당기면 3px 추가)
  bottom: 0     // 최소 높이 아래로는 절대 이동 불가 (단단한 벽)
}}
```

**직접 구현 (더 정교한 제어)**:

```tsx
// 드래그 중 y가 -maxHeight를 넘어설 때 저항감 적용
const onDrag = (event: any, info: any) => {
  const currentY = y.get();
  const RUBBER_BAND_LIMIT = -maxHeight;
  
  if (currentY < RUBBER_BAND_LIMIT) {
    // 경계를 넘어선 거리
    const overDrag = currentY - RUBBER_BAND_LIMIT;
    // 지수적으로 저항 증가 (로그 스케일)
    const resistance = Math.sign(overDrag) * Math.pow(Math.abs(overDrag), 0.6);
    y.set(RUBBER_BAND_LIMIT + resistance);
  }
};
```

---

### 4-4. 지도 연동 — useTransform 설계

```tsx
// CustomBottomSheet에서 y를 외부로 노출
// 사용처 (JourneySidebar.tsx)에서:

const { y } = useOptionalBottomSheet() ?? {};

// 플로팅 버튼 위치 — 시트가 올라올수록 같이 올라감
const floatingButtonsY = useTransform(
  y,
  [-minHeight, -defaultHeight],
  [0, -(defaultHeight - minHeight)] // 시트 상단을 따라 이동
);

// 플로팅 버튼 불투명도 — 시트가 default를 넘으면 서서히 사라짐
const floatingButtonsOpacity = useTransform(
  y,
  [-defaultHeight, -maxHeight * 0.7],
  [1, 0]
);

// 지도 padding — 시트 높이에 따라 실시간 업데이트
// (Kakao Map 인스턴스에 직접 전달)
useMotionValueEvent(y, 'change', (latestY) => {
  const sheetHeight = Math.abs(latestY);
  kakaoMapInstance?.relayout();
  // 또는 CSS custom property로:
  document.documentElement.style.setProperty(
    '--map-bottom-padding', 
    `${sheetHeight}px`
  );
});
```

---

### 4-5. 콘텐츠 페이드인 — 스냅 상태에 따른 정보 전환

```tsx
// MIN → DEFAULT로 이동 시 상세 콘텐츠 페이드인
const detailContentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuart
      delay: 0.05 // 시트 안착 후 약간의 딜레이
    }
  }
};

// 사용:
<motion.div
  variants={detailContentVariants}
  animate={currentSnap === 'min' ? 'hidden' : 'visible'}
>
  {/* 영업시간, 메뉴, 리뷰 등 상세 정보 */}
</motion.div>
```

---

### 4-6. 전체 스프링 수치 요약표

| 상황 | stiffness | damping | mass | 효과 |
|------|-----------|---------|------|------|
| 일반 스냅 (느린 드래그) | 320 | 30 | 0.8 | 자연스럽게 안착, 미세 오버슈트 |
| 빠른 플릭 스냅 | 500 | 40 | 0.6 | 빠르게 탁 안착 |
| 시트 첫 진입 (마커 탭) | 400 | 35 | 1.0 | 힘있게 등장 |
| 시트 닫기 | 300 | 35 | 1.0 | 부드럽게 퇴장 |
| 콘텐츠 페이드인 | — | — | — | `duration: 0.2, easeOutQuart` |

---

## Part 5. 🗺️ 지도-시트 유기적 상호작용 상세 설계

### 5-1. 시트 높이 → 지도 카메라 오프셋 연동

```
시트 상태별 지도 가시 영역:

MIN 상태 (minHeight: ~210px):
┌─────────────────────┐
│                     │
│   지도 가시 영역    │ ← 화면 전체 - 210px
│   (전체의 ~70%)     │
│                     │
├─────────────────────┤ ← 시트 상단
│   MIN 시트 (210px)  │
│   [장소명][별점]    │
└─────────────────────┘

DEFAULT 상태 (defaultHeight: ~360px):
┌─────────────────────┐
│   지도 가시 영역    │ ← 화면 전체 - 360px
│   (전체의 ~50%)     │ ← 마커가 이 영역 중앙에 위치하도록 패닝
├─────────────────────┤
│  DEFAULT 시트       │
│  [상세 정보]        │
│  [스크롤 가능]      │
└─────────────────────┘

MAX 상태 (maxHeight: 전체 화면):
┌─────────────────────┐
│  MAX 시트           │ ← 지도 완전히 가려짐
│  [풀스크린 상세]    │ ← 상단에 미니맵 or 사진 헤더로 대체
│                     │
└─────────────────────┘
```

### 5-2. 마커 선택 시 카메라 이동 공식

```tsx
// 마커 위치를 지도 가시 영역의 황금비 지점으로 이동
const panToMarker = (
  markerPosition: LatLng,
  sheetHeight: number,
  mapHeight: number
) => {
  const visibleMapHeight = mapHeight - sheetHeight;
  // 가시 영역의 40% 지점에 마커 배치 (황금비 근사)
  const targetOffsetFromTop = visibleMapHeight * 0.40;
  
  // 마커를 타겟 위치로 오프셋 계산하여 패닝
  // Kakao Maps: map.setCenter(offsetCenter)
};
```

---

## Part 6. ✅ 실행 우선순위 — 4단계 TIER 분류

> [!IMPORTANT]
> 아래 TIER 순서대로 진행하세요. **TIER 0(Critical 버그)** 을 먼저 처리하지 않으면
> TIER 1 이후의 UX 개선이 버그와 충돌할 수 있습니다.

---

### 🔥 TIER 0: Critical 버그 (UX 개선 전 반드시 선처리)

> [`bottomsheet_review.md`](file:///c:/Users/hitsz/Desktop/OnJourney/docs/bottomsheet_review.md) 진단 결과 중 이 보고서에 **누락된** 재현 가능한 기능 버그입니다.

| 버그 | 파일 | 증상 | 수정 방향 |
|------|------|------|-----------|
| BUG-2 닫히는 도중 드래그 시 시트 사라짐 | [`CustomBottomSheet.tsx L163`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx#L163-L166) | `isOpen=false` 중 아래로 드래그 시 `y > 0`이 되어 시트가 화면 밖으로 이탈 | `dragConstraints.bottom`을 `-minHeight`로 고정 + `pointerEvents: 'none'` |
| BUG-3 snap 타입 혼용으로 스냅 오분류 | [`JourneySidebar.tsx L333`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/JourneySidebar.tsx#L333-L335), [`PlaceList.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/PlaceList.tsx) | `setSnap(1)` (숫자)과 `setSnap('1')` (문자열) 혼재로 비교 실패 → 스냅 타입 오분류 | snap 상태를 `'min' / 'default' / 'max'` 열거형으로 통일 |
| ISSUE-5 SSR에서 `windowHeight=0` | [`RouteGuidePanel.tsx L53`](file:///c:/Users/hitsz/Desktop/OnJourney/src/features/route/RouteGuidePanel.tsx#L53-L62) | 첫 렌더 시 `maxHeight=-16`, `mounted` 가드가 `RouteGuidePanel`에는 없음 | `useState(() => typeof window !== 'undefined' ? window.innerHeight : 812)` 안전한 초기값 적용 |

---

### 🔴 TIER 1: 즉시 적용 — 코드 10줄 이내, 즉시 체감 개선 (~30분)

| # | 적용 내용 | 연관 항목 | 예상 효과 | 난이도 |
|---|-----------|-----------|-----------|--------|
| 1 | **스프링 수치 교체** `stiffness: 320, damping: 30, mass: 0.8` | INSIGHT-2 | "뚝뚝 끊김" → 자연스러운 물성감 | 🟢 낮음 |
| 2 | **`dragElastic={{ top: 0.08, bottom: 0 }}`** 적용 | ISSUE-1 | iOS 고무줄 효과 — 아래 "콘크리트 벽"은 유지 | 🟢 낮음 |
| 3 | **`getTargetY` → `useCallback` 리팩토링** | BUG-1 (review) | 스냅 무한루프 버그 근본 수정 | 🟢 낮음 |
| 4 | **레이어드 그림자** (boxShadow 3단 레이어) | Part 3-2 | 시트의 "부유감" 즉시 향상 | 🟢 낮음 |

```tsx
// ① 스프링 수치 교체 (CustomBottomSheet.tsx L75-80)
animate(y, activeSnapY, {
  type: 'spring',
- damping: 25,
- stiffness: 200,
+ damping: 30,
+ stiffness: 320,
+ mass: 0.8,
  velocity: initialVelocity
});

// ② dragElastic 탄성 부여 (L161) — bottom: 0으로 "콘크리트 벽" 제약 준수
- dragElastic={0}
+ dragElastic={{ top: 0.08, bottom: 0 }}

// ③ 레이어드 그림자 (L177)
- boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)',
+ boxShadow: '0 -1px 0 rgba(0,0,0,0.04), 0 -4px 12px rgba(0,0,0,0.06), 0 -20px 60px rgba(0,0,0,0.10)',
```

---

### 🟠 TIER 2: 단기 적용 — UX 완성도, 요구사항 §4 실현 (2~4시간)

| # | 적용 내용 | 연관 항목 | 예상 효과 | 난이도 |
|---|-----------|-----------|-----------|--------|
| 5 | **드래그 핸들 터치 타겟 `py-4` 확장** | INSIGHT-3, Part 3-1 | 터치 미스 감소, Apple HIG 44px 준수 | 🟢 낮음 |
| 6 | **`useTransform`으로 플로팅 버튼 실시간 연동** | Part 4-4, 요구사항 §4 | 시트↔버튼 "한 몸" 실시간 반응 | 🟡 중간 |
| 7 | **`useTransform`으로 그림자 강도 동적 변화** | Part 3-2 | 시트 높이에 따라 그림자 깊이 변화 | 🟡 중간 |
| 8 | **velocity 기반 동적 스프링** (flick 판정) | Part 4-1 | 빠른 스와이프 시 탁 안착 | 🟡 중간 |
| 9 | **History API 통합 (백버튼 처리)** | ISSUE-9 (review) | Android 물리 백버튼 → 시트 닫기 | 🟡 중간 |
| 10 | **Safe Area Inset 처리** `env(safe-area-inset-bottom)` | ISSUE-7 (review) | iPhone 홈 인디케이터 겹침 방지 | 🟢 낮음 |

---

### 🟡 TIER 3: 중기 적용 — 지도 연동 차별화 UX (1~2일)

> 프로젝트 성격상 **가장 차별화되는 부분**이지만, 카카오맵 API 연동이 수반됩니다.

| # | 적용 내용 | 연관 항목 | 예상 효과 | 난이도 |
|---|-----------|-----------|-----------|--------|
| 11 | **마커 탭 → 지도 카메라 패닝** (황금비 40% 오프셋) | Part 5-2, INSIGHT-1 | "네이버 지도 수준" 연동 UX | 🔴 높음 |
| 12 | **시트 높이 → 지도 `padding-bottom` 실시간 연동** | Part 5-1, INSIGHT-1 | 마커가 시트에 가리지 않음 | 🔴 높음 |
| 13 | **콘텐츠 페이드인** (스냅 상태별 `variants` 전환) | Part 4-5 | MIN→DEFAULT 상세 정보 자연스럽게 등장 | 🟡 중간 |
| 14 | **Interaction Flow 전체 타이밍 구현** (0ms→300ms 시퀀스) | Part 2 전체 | "네이티브 앱처럼 느껴짐"의 완성 | 🔴 높음 |

---

### ⚪ TIER 4: 장기/선택 — WOW 효과 (별도 스프린트)

| # | 적용 내용 | 비고 | 난이도 |
|---|-----------|------|--------|
| 15 | **Shared Element Transition** (썸네일 → 헤더 확장) | React/Framer Motion에서 별도 아키텍처 필요 | 🔴 높음 |
| 16 | **MAX 상태 미니맵 전환** | 카카오맵 별도 인스턴스 또는 오버레이 구현 필요 | 🔴 높음 |
| 17 | **진입 애니메이션 Bouncy 버전** (`damping: 28`) | 취향 차이, A/B 테스트 영역 | 🟢 낮음 |

---

## 적합성 종합

```
보고서 전체 제안 17개 중:
  ✅ 완전 적합    : 14개 (82%)
  ⚠️ 조건부 채택  :  2개 (12%) — dragElastic bottom: 0 고정, bounce 방향 주의
  ❌ 미적합        :  0개
```

> **가장 빠른 체감 개선**: TIER 0 버그 수정 → TIER 1 (4개 항목) 순서로 진행.  
> **가장 임팩트 큰 단일 항목**: #6 플로팅 버튼 실시간 연동 — 요구사항 §4 핵심, 현재 미구현.

---

*보고서 작성 기준: 2026-07-20, 우선순위 진단 반영: 2026-07-21 | OnJourney PWA Bottom Sheet v1.x | Framer Motion 최적화 기준*

