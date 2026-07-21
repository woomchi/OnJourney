# 🗺️ OnJourney 바텀 시트 UX/UI 개선 보고서
### *"네이티브 앱처럼 부드럽고 직관적이다" — 그 느낌을 만드는 디테일들*

---

> [!IMPORTANT]
> 이 보고서는 실제 [`CustomBottomSheet.tsx`](file:///c:/Users/hitsz/Desktop/OnJourney/src/components/common/CustomBottomSheet.tsx) 코드의 진단 결과를 기반으로 작성된 **실행 가능한 개선안**입니다. 현재 코드의 `dragElastic={0}`, `damping: 25 / stiffness: 200` 등의 수치가 직접 분석 대상입니다.

> [!WARNING]
> **프로젝트 핵심 제약 — "콘크리트 벽" 요구사항** ([`bottom_sheet_requirements.md §2`](file:///c:/Users/hitsz/Desktop/OnJourney/docs/pwa/bottom_sheet_requirements.md) 참조)  
> 바텀시트는 최소 높이 아래로 **단 1픽셀도 내려가지 않아야 합니다.** `dragElastic`의 `bottom` 값은 반드시 `0`으로 유지해야 하며, 아래 방향 bounce는 허용되지 않습니다.

---

## Part 1. 🔍 UX Insights — 퀄리티를 확 달라지게 할 핵심 3가지

---

### INSIGHT-1: 시트는 "덮개"가 아니라 "레이어"여야 한다 — 지도와의 유기적 호흡

**현재 문제**: 시트가 올라오면 지도가 그냥 가려집니다. 지도와 시트는 별개의 오브젝트처럼 느껴집니다.

**왜 이게 중요한가**:  
네이버 지도와 Apple Maps의 결정적 차이는 **지도가 시트에 "반응"한다**는 점입니다. 시트가 올라올수록 지도의 중심점이 위로 이동하여 마커가 항상 보이는 영역에 머눕니다. 이 단순한 동작 하나가 "지도 앱"과 "지도를 품은 앱"을 가르는 경험의 기준선입니다.

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
               - 지도는 완전히 숨겨짐
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

## Part 6. ✅ 실행 우선순위 — 잔여 TIER 분류 (모든 개선 완료)

> [!IMPORTANT]
> TIER 0~4의 모든 개선 제안 항목이 적용 완료 또는 제외 처리되었습니다.
> 현재 대기 중인 잔여 개선 과제는 존재하지 않습니다.

---

### ⚪ TIER 4: 장기/선택 — WOW 효과 (별도 스프린트)

| # | 적용 내용 | 비고 | 난이도 | 상태 |
|---|-----------|------|--------|------|
| - | **모든 TIER 4 개선 사항이 완료 또는 제외되었습니다** | - | - | - |

---

## 진행 현황 요약

```
개선 과제 완료율: 100% (잔여 과제 없음)
```

---

## 적합성 종합

```
남은 과제     :  없음
```

---

*보고서 작성 기준: 2026-07-20, 우선순위 진단 반영: 2026-07-21 | OnJourney PWA Bottom Sheet v1.x | Framer Motion 최적화 기준*
