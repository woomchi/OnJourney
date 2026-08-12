# 네이버 지도 API v3 렌더링 최적 성능 활용 가이드

> **대상**: On-Journey 프로젝트의 다중 길찾기 지도 최적화  
> **기술 스택**: Next.js 15, TypeScript, react-naver-maps, Zustand  
> **초점**: 코드가 아닌 "활용 방식, 아키텍처 패턴, 최적화 전략"

---

## 목차

1. [네이버 지도 렌더링 아키텍처 이해](#네이버-지도-렌더링-아키텍처-이해)
2. [렌더링 성능 병목 분석](#렌더링-성능-병목-분석)
3. [마커 최적화 패턴](#마커-최적화-패턴)
4. [도형(오버레이) 최적화](#도형오버레이-최적화)
5. [레이어 관리 전략](#레이어-관리-전략)
6. [줌 레벨별 렌더링 관리](#줌-레벨별-렌더링-관리)
7. [메모리 관리 패턴](#메모리-관리-패턴)
8. [이벤트 처리 최적화](#이벤트-처리-최적화)
9. [상태 관리와 렌더링 동기화](#상태-관리와-렌더링-동기화)
10. [모바일 환경 최적화](#모바일-환경-최적화)
11. [데이터 시각화 최적화](#데이터-시각화-최적화)
12. [성능 모니터링 및 측정](#성능-모니터링-및-측정)
13. [On-Journey 프로젝트 적용 전략](#on-journey-프로젝트-적용-전략)

---

## 네이버 지도 렌더링 아키텍처 이해

### 네이버 지도 렌더링 스택

네이버 지도는 **3계층 렌더링 시스템**으로 구성됩니다:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│              (react-naver-maps, 상태 관리)                   │
├─────────────────────────────────────────────────────────────┤
│                   Map API Layer                              │
│     (naver.maps.Map, 마커, 오버레이, 레이어 관리)            │
├─────────────────────────────────────────────────────────────┤
│              Native Rendering Layer                          │
│      (DOM, Canvas, CSS3 Transform, WebGL GL 모듈)            │
├─────────────────────────────────────────────────────────────┤
│                 Browser Rendering                            │
│         (Compositing, Rasterization, Display)                │
└─────────────────────────────────────────────────────────────┘
```

### 각 계층의 역할과 성능 특성

#### 1. Application Layer (React 상태 관리)

**역할**:
- Zustand 상태 업데이트
- react-naver-maps 컴포넌트 리렌더링
- Props 전달 및 Effect 트리거

**성능 특성**:
- **병목 1**: 불필요한 리렌더링 → 지도 객체 접근 overhead
- **병목 2**: 대량 상태 업데이트 → 배치 처리 부재
- **최적화 전략**: 지도 상태와 UI 상태 분리, 선택적 구독 (Zustand selector)

#### 2. Map API Layer (naver.maps)

**역할**:
- 마커, 오버레이 객체 생성/관리
- 좌표 변환, 투영 계산
- 이벤트 바인딩 및 리스너 관리
- 타일 로딩 및 렌더링 큐 관리

**성능 특성**:
- **병목 1**: 대량 오버레이 동시 생성 → API 호출 누적
- **병목 2**: 빈번한 옵션 변경 → 불필요한 리렌더링 트리거
- **병목 3**: 이벤트 리스너 누적 → 메모리 누수
- **최적화 전략**: 배치 생성, 선택적 업데이트, 리스너 정리

#### 3. Native Rendering Layer

**역할**:
- 지도 타일 렌더링 (256x256 이미지 조합)
- 오버레이 DOM/Canvas 렌더링
- CSS3 Transform으로 이동/회전/스케일
- WebGL 가속 (GL 모듈 사용 시)

**성능 특성**:
- **병목 1**: 타일 전환 시 페이드 인 효과 → tileDuration 누적
- **병목 2**: 대량 DOM 오버레이 → 레이아웃 리플로우
- **병목 3**: Canvas 기반 오버레이 자주 그리기 → CPU 사용률 증가
- **최적화 전략**: 타일 캐싱, 오버레이 배치 렌더링, Canvas 최소화

---

## 렌더링 성능 병목 분석

### On-Journey에서 발생 가능한 병목 시나리오

#### Scenario 1: "여러 장소를 거쳐 경로 표시"

```
사용자 입력: 경로 A → B → C → D → E (5개 지점)

렌더링 작업:
1. 5개 마커 생성 (각각 아이콘 로드)
2. 4개 경로선(Polyline) 그리기 (각 경로마다 수십~수백 개의 좌표점)
3. 경로 위 화살표 오버레이 추가 (DirectionalStripes)
4. 정보 창 표시
5. 줌 자동 조정 (fitBounds)

성능 영향:
- 마커 아이콘 로드 지연 (이미지 요청 5개)
- Polyline 좌표 계산 overhead (특히 상세 경로)
- 화살표 배치 계산 (DirectionalStripes 최적화 중요)
- 줌 애니메이션 중 프레임 드롭 가능
```

**해결 방향**:
- 마커 아이콘 **사전 로드** (스프라이트 이미지 활용)
- Polyline **좌표 단순화** (RDP 알고리즘으로 불필요한 점 제거)
- 화살표 **줌 레벨별 표시** (Z15 이상에서만 표시)
- fitBounds 애니메이션 **선택적 적용** (사용자 선택)

---

#### Scenario 2: "실시간 검색 결과 마커 100+ 개 표시"

```
사용자 입력: "카페" 검색 → 100개 결과

렌더링 작업:
1. 마커 100개 생성 → 100개 아이콘 로드 요청
2. 마커 클릭 이벤트 리스너 100개 등록
3. 각 마커에 정보 창 바인딩
4. 지도 이동 시 보이는 영역 마커만 표시 (viewport filtering)

성능 영향:
- 아이콘 이미지 요청 병렬화 → 대역폭 부하
- 리스너 메모리 누적 → GC 압박
- 마커 렌더링 시간 선형증가 O(n)
- 모바일에서 프레임 드롭 가능
```

**해결 방향**:
- **마커 클러스터링** (줌 레벨 10 이상에서는 클러스터로 묶기)
- **Viewport-based 렌더링** (화면에 보이는 마커만 생성)
- **이미지 스프라이트화** (아이콘 URL 통합)
- **지연 로딩** (스크롤 시 필요한 마커만 로드)

---

#### Scenario 3: "경로 위 교통정보/우회로 오버레이"

```
사용자 입력: 경로 표시 후 교통정보 레이어 활성화

렌더링 작업:
1. Traffic Layer 활성화 (기본 제공 레이어)
2. 경로 위에 실시간 교통 상태 표시 (Polyline 색상 변경)
3. 우회로 Polygon 표시
4. 구간별 소요시간 정보 창

성능 영향:
- 레이어 추가 시 서버 요청 (타일 다시 로드)
- Polyline 색상 변경 → 재렌더링 트리거
- Polygon 대량 생성 → 메모리 누적
- 실시간 데이터 업데이트 시 깜빡임 발생
```

**해결 방향**:
- **레이어 사전 준비** (필요 전에 미리 로드, 숨김 상태 유지)
- **Polyline 분절화** (구간별로 나누어 색상 다르게)
- **Polygon 재사용** (제거 후 재생성 대신 스타일만 변경)
- **업데이트 배치 처리** (50ms 단위로 모아서 한 번에 반영)

---

### 일반적인 성능 지표

| 지표 | 목표 | 위험 신호 |
|------|------|----------|
| **초기 로딩 시간** | < 2초 | > 3초 |
| **마커 50개 생성** | < 200ms | > 500ms |
| **줌/팬 애니메이션 FPS** | 60 FPS | < 30 FPS |
| **메모리 사용량** | < 100MB | > 150MB |
| **이벤트 응답성** | < 100ms | > 300ms |
| **지도 스크롤 부드러움** | 60 FPS | < 30 FPS |

---

## 마커 최적화 패턴

### Pattern 1: 마커 풀 (Marker Pool) 패턴

**개념**: 마커를 미리 생성해두고 재사용하는 객체 풀 패턴

**활용 상황**:
- 마커가 동적으로 추가/제거되는 경우 (검색, 필터링)
- 마커 개수가 고정적이거나 범위가 정해진 경우 (상위 50개 등)
- 모바일 환경에서 메모리 효율이 중요한 경우

**작동 원리**:

```
초기화 단계:
  Pool = [marker1, marker2, marker3, ..., marker50]
  Active = []
  Inactive = [marker1~marker50]

사용 단계 (마커 10개 필요):
  Active = [marker1, marker2, ..., marker10]
  Inactive = [marker11~marker50]
  
  marker1.setPosition(위치1)
  marker1.setMap(map)
  ...

해제 단계 (마커 제거):
  marker1.setMap(null)
  Inactive = [..., marker1]
```

**장점**:
- 생성/삭제 오버헤드 제거
- 메모리 할당 예측 가능
- 메모리 단편화 방지

**단점**:
- 사전 메모리 예약 필요
- 최대 마커 수 제한
- 복잡도 증가

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 검색 결과 마커 (상위 50개)
- 경로 지점 마커 (최대 10개)

---

### Pattern 2: 지연 로딩 (Lazy Loading) 마커

**개념**: 마커를 즉시 생성하지 않고, 실제로 필요할 때 생성

**활용 상황**:
- 매우 많은 마커 (100+)
- 사용자가 일부 마커만 상호작용 (클릭, 마우스오버)
- 첫 로딩 시간이 중요한 경우 (모바일)

**작동 원리**:

```
사용자 검색 "카페" → 200개 결과

Initial State:
  Database: [result1, result2, ..., result200]
  Rendered Markers: [] (비어있음)
  Visible Range: viewport 영역

User Action 1: "카페" 검색 후 지도 화면에 보이는 영역
  Rendered Markers: [result1~result25] (25개만 생성)
  
User Action 2: 지도 스크롤 (새로운 영역으로 이동)
  Previous Markers: [result1~result25] 유지 또는 제거
  New Markers: [result26~result50] 추가 생성
  
User Action 3: 마커 상세정보 요청 (click)
  해당 마커의 정보 창만 API 호출로 가져오기
```

**장점**:
- 초기 로딩 매우 빠름
- 메모리 사용 최소화
- 화면에 필요한 것만 렌더링

**단점**:
- 스크롤 시 약간의 지연 (마커 생성)
- 구현 복잡도 높음
- viewport 계산 필요

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 검색 결과 마커 200+ 개 표시
- 실시간 교통 마커 (경로 주변)

---

### Pattern 3: 마커 클러스터링 (Clustering)

**개념**: 줌 레벨에 따라 마커를 그룹화하여 표시

**활용 상황**:
- 밀집된 지역에 많은 마커 (도심 카페)
- 전국 단위 검색 (줌 아웃 시)
- 모바일에서 터치 대상 크기 확보 필요

**작동 원리**:

```
Zoom Level 10 (넓은 범위):
  [마커 100개] → [클러스터 5개] (각각 20개씩 묶음)
  표시: 숫자 배지 "20", "18", "22" ...

Zoom Level 15 (중간 범위):
  [마커 100개] → [클러스터 20개] (각각 5개씩)
  표시: 숫자 배지 "5", "6", "4" ...

Zoom Level 17 (상세 범위):
  [마커 100개] → [마커 100개] (클러스터 해제)
  표시: 개별 마커 아이콘
```

**클러스터링 알고리즘 선택**:

| 알고리즘 | 특징 | 성능 | 복잡도 |
|---------|------|------|--------|
| **Grid-based** | 그리드 셀별 묶음 | 빠름 | 낮음 |
| **Distance-based** | 거리 기준 병합 | 중간 | 중간 |
| **Hierarchical** | 계층적 병합 | 느림 | 높음 |

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 전국 검색 결과 표시 (zoom < 12)
- 실시간 지점 밀집 지역 표시

---

### Pattern 4: 아이콘 스프라이팅 (Icon Spriting)

**개념**: 여러 마커 아이콘을 하나의 이미지로 통합하여 로드

**활용 상황**:
- 마커 아이콘 종류가 많은 경우 (카페, 레스토랑, 주차장, 지하철 등)
- 아이콘 이미지 요청 수를 줄여야 하는 경우
- 모바일 환경에서 네트워크 최적화

**작동 원리**:

```
전통 방식 (비최적화):
  마커 1: "cafe.png" 요청
  마커 2: "restaurant.png" 요청
  마커 3: "parking.png" 요청
  마커 4: "subway.png" 요청
  → 총 4개 HTTP 요청

스프라이팅 방식 (최적화):
  마커 1, 2, 3, 4: "icons-sprite.png" 요청
  각 마커는 sprite 내의 다른 영역을 offset으로 지정
  → 총 1개 HTTP 요청 + offset 계산
```

**스프라이트 이미지 구성**:

```
icons-sprite.png (512x256)
┌──────────┬──────────┬──────────┬──────────┐
│  카페    │ 레스토랑 │ 주차장   │ 지하철   │
│ 0,0      │ 128,0    │ 256,0    │ 384,0    │
│ 128x128  │ 128x128  │ 128x128  │ 128x128  │
└──────────┴──────────┴──────────┴──────────┘
```

**장점**:
- HTTP 요청 1개 (n개에서 1개로 감소)
- 이미지 캐싱 효율 증가
- 로딩 시간 단축

**단점**:
- 스프라이트 생성 도구 필요
- offset 계산 오버헤드
- 아이콘 변경 시 전체 sprite 재생성

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 카테고리별 아이콘 (카페, 역, 주차장 등)
- 경로 지점 번호 표시 (1번, 2번, 3번 ...)

---

### Pattern 5: 마커 아이콘 최적화 (Format 선택)

**세 가지 아이콘 포맷 비교**:

| 포맷 | 로딩 시간 | 메모리 | 커스터마이징 | 권장 용도 |
|------|----------|--------|------------|---------|
| **이미지 (PNG/SVG)** | 중간 | 중간 | 낮음 | 고정 아이콘 |
| **HTML (DOM)** | 높음 | 높음 | 높음 | 동적 배지 |
| **심벌 (SVG Path)** | 낮음 | 낮음 | 중간 | 단순 도형 |

**활용 상황별 선택**:

```
마커 1: 카페 아이콘 (고정)
  → 이미지 포맷 추천 (정적, 로딩 1회)

마커 2: 거리 정보 배지 (동적: "100m", "500m" ...)
  → 심벌 포맷 추천 (텍스트 생성 가능)
  
마커 3: 평점 별 표시 (동적, 복잡 UI)
  → HTML 포맷 (하지만 성능 영향 주의)

마커 4: 기본 위치 표시 (단순 원형)
  → 심벌 포맷 (가벼움)
```

**성능 최적화 팁**:
- **이미지**: WebP 포맷 사용 (크기 30% 감소)
- **HTML**: 최소한의 DOM 요소 (간단한 구조만)
- **심벌**: CSS 복잡도 낮추기 (단순 shape만)

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 카테고리 아이콘 (이미지)
- 경로 순번 (심벌: 숫자)
- 거리 정보 (심벌 또는 간단한 텍스트)

---

## 도형(오버레이) 최적화

### Pattern 1: Polyline 좌표 단순화 (Simplification)

**개념**: 경로의 불필요한 중간점을 제거하여 렌더링 성능 향상

**활용 상황**:
- 경로 API에서 받은 상세한 좌표 (수백~수천 개)
- 줌 아웃 상태에서 모든 좌표가 필요 없음
- 모바일 환경에서 CPU 사용률 감소 필요

**좌표 단순화 알고리즘**:

| 알고리즘 | 설명 | 성능 | 정확도 |
|---------|------|------|--------|
| **RDP (Ramer-Douglas-Peucker)** | 거리 기반 점 제거 | 중간 | 높음 |
| **Visvalingam-Whyatt** | 삼각형 면적 기반 | 빠름 | 높음 |
| **Uniform Spacing** | 일정 거리 기준 제거 | 매우 빠름 | 중간 |

**작동 원리 (RDP 예시)**:

```
원본 경로: [P0, P1, P2, P3, P4, P5, P6, P7, P8, P9] (10개)
임계값: 50m (줌 레벨 15 기준)

RDP 알고리즘:
1. P0-P9 직선까지의 거리 계산
2. 임계값 초과 점 제거
3. 각 세그먼트에 재귀 적용

결과: [P0, P3, P6, P9] (4개로 단순화, 60% 감소)

시각적 영향:
  원본: 매끈한 경로 (정확하지만 무거움)
  단순화: 거의 구분 안 됨 (가벼움)
```

**줌 레벨별 단순화 정책**:

```
Zoom ≤ 10 (전국 지도):
  좌표 단순화: 임계값 500m
  마커 표시: 시작점, 끝점만
  
Zoom 11-14 (광역권):
  좌표 단순화: 임계값 100m
  마커 표시: 주요 경로점만 (5-10개)
  
Zoom 15-16 (도시):
  좌표 단순화: 임계값 20m
  마커 표시: 모든 경로점
  
Zoom ≥ 17 (거리 수준):
  좌표 단순화: 임계값 5m
  마커 표시: 모든 경로점 + 화살표
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 경로선 렌더링 최적화
- DirectionalStripes 화살표 배치점 감소

---

### Pattern 2: Polyline 분절화 (Segmentation)

**개념**: 하나의 긴 Polyline을 구간별로 나누어 관리

**활용 상황**:
- 교통 상태에 따라 색상이 달라지는 경로 (빨강-노랑-초록)
- 구간별 소요시간 정보 표시
- 특정 구간만 하이라이트 필요

**작동 원리**:

```
기존 방식 (비효율적):
  경로 선: [P0, P1, P2, ..., P100]
  색상: 전체 빨강
  
  → 색상 변경 필요 시: 전체 Polyline 삭제 → 재생성

최적화 방식 (분절화):
  경로 선 1: [P0, P1, ..., P30] (빨강, 통행 정체)
  경로 선 2: [P30, P31, ..., P70] (노랑, 서서히 진행)
  경로 선 3: [P70, P71, ..., P100] (초록, 원활)
  
  → 색상 변경 필요 시: 해당 선만 업데이트
```

**분절화 조건**:

```
트래픽 기반:
  - 빨강: 소요시간 > 15분
  - 노랑: 소요시간 5-15분
  - 초록: 소요시간 < 5분

이동 수단 기반:
  - 버스: 파랑
  - 지하철: 빨강
  - 도보: 회색

거리 기반:
  - 500m마다 분절
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 실시간 교통 상태 반영
- 이동 수단 변화점 표시
- 경로 구간별 정보 표시

---

### Pattern 3: Polygon 재사용 (Reuse)

**개념**: Polygon을 삭제하고 재생성하는 대신 스타일만 변경

**활용 상황**:
- 우회로 Polygon (자주 표시/숨김)
- 도시 경계 Polygon (색상만 변경)
- 영역 구분 (hover 시 하이라이트)

**작동 원리**:

```
비효율적 방식:
  1. Polygon 생성 (polygon1)
  2. Polygon 삭제 (polygon1.setMap(null))
  3. Polygon 재생성 (polygon2)
  
  → 메모리 할당/해제 오버헤드

효율적 방식:
  1. Polygon 생성 (polygon1, 초기 색상: 파랑)
  2. 숨기기: polygon1.setVisible(false)
  3. 색상 변경: polygon1.setFillColor('red')
  4. 보이기: polygon1.setVisible(true)
  
  → Polygon 객체는 유지, 스타일만 변경
```

**관리 전략**:

```
Polygon 생성 (초기화):
  - 우회로 polygon: 생성, 숨김 상태 유지
  - 경계 polygon: 생성, 투명도 0.1로 유지

Polygon 활성화:
  - setVisible(true)
  - 필요 시 색상 변경만 적용

Polygon 비활성화:
  - setVisible(false) (완전 삭제 하지 않음)
  - 다음 사용을 위해 메모리 유지
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 우회로 표시/숨김 토글
- 지역별 경계 표시

---

### Pattern 4: Circle 밀도 기반 렌더링

**개념**: 관심 지점(POI) 반경을 나타낼 때 줌 레벨에 따라 선택적 표시

**활용 상황**:
- 각 지점의 서빙 지역 표시 (반경 500m, 1km)
- 주차 가능 영역 표시
- 배달 가능 지역 표시

**작동 원리**:

```
데이터 구조:
  POI = [
    {name: "카페1", position: [37.5, 126.9], radius: 500},
    {name: "카페2", position: [37.6, 127.0], radius: 500},
    ... (100개)
  ]

렌더링 결정:
  Zoom ≤ 12: Circle 표시 안 함 (너무 많으면 복잡함)
  Zoom 13-14: 일부 Circle만 표시 (간격이 넓은 것만)
  Zoom ≥ 15: 모든 Circle 표시 (충분히 상세)

구현:
  calculateCircleVisibility(zoom, pois) {
    if (zoom < 13) return [];
    if (zoom < 15) return filterByDensity(pois, threshold);
    return pois;
  }
```

**밀도 필터링**:

```
간격 계산:
  각 POI 간 최소 거리 > 1km이면 모두 표시
  그 외에는 1km마다 1개만 표시
  
결과:
  Zoom 13: 밀집 지역은 Circle 10개 → 1개로 감소
  Zoom 15: 모든 Circle 100개 표시
```

**On-Journey 적용 가능성**: ⭐⭐⭐
- 서빙 지역 표시 (카페, 배달점)
- 할인 쿠폰 적용 지역

---

## 레이어 관리 전략

### Pattern 1: 레이어 생명주기 관리 (Layer Lifecycle)

**개념**: 레이어를 생성, 활성화, 비활성화, 정리하는 체계적 프로세스

**활용 상황**:
- 기본 제공 레이어 (교통, 자전거, 지적도 등) 활성화/비활성화
- 사용자 정의 레이어 추가/제거
- 메모리 관리 필요

**생명주기 단계**:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  1. INIT (초기화)                                   │
│     └─ 레이어 객체 생성, 옵션 설정                 │
│     └─ 내부 리소스 할당 (텍스처, 버퍼)            │
│                  ↓                                  │
│  2. LOADED (로드됨)                                │
│     └─ API 호출 완료, 데이터 수신                  │
│     └─ 캐시 적용 대기                              │
│                  ↓                                  │
│  3. ACTIVE (활성화)                                │
│     └─ map.layers.add(layer) 또는 setVisible(true) │
│     └─ 지도에 렌더링 시작                          │
│                  ↓                                  │
│  4. IDLE (유휴)                                    │
│     └─ 사용자 상호작용 없음                        │
│     └─ 백그라운드 업데이트 실행                    │
│                  ↓                                  │
│  5. INACTIVE (비활성화)                            │
│     └─ map.layers.remove(layer) 또는 setVisible(false) │
│     └─ 렌더링 중지, 메모리 유지                    │
│                  ↓                                  │
│  6. DESTROYED (삭제됨)                             │
│     └─ 메모리 완전 해제                           │
│     └─ 재생성 필요 시 1번부터 시작                │
│                                                    │
└─────────────────────────────────────────────────────┘
```

**상태 관리 전략**:

```
기본 제공 레이어 (Traffic, Bicycle, ...):
  생명주기: INIT → LOADED → [ACTIVE ↔ INACTIVE] → (DESTROYED 안 함)
  특징: 한 번만 생성, 토글만 수행
  
사용자 정의 레이어:
  생명주기: INIT → LOADED → ACTIVE → DESTROYED
  특징: 필요시 생성, 사용 후 완전 삭제
```

**메모리 누수 방지**:

```
잘못된 방식:
  layer.setVisible(false)  // 비활성화만 함
  → 레이어 메모리는 계속 유지
  → 시간이 지남에 따라 메모리 누적

올바른 방식:
  map.layers.remove('trafficLayer')  // 완전 제거
  → 다음 사용 시 다시 생성 (또는 재활성화)
  → 필요 없을 때는 메모리 해제
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 교통정보 레이어 (사용자 토글)
- 자전거 도로 레이어 (조건부 표시)

---

### Pattern 2: 레이어 우선순위 스택 (Layer Stack)

**개념**: 여러 레이어의 표시 순서를 관리하는 Z-index 체계

**활용 상황**:
- 여러 데이터 레이어 동시 표시
- 일부 레이어가 다른 레이어를 가림
- 대화형 선택에 따라 순서 변경

**레이어 스택 구조**:

```
Z 높음 (위에 표시)
  ↑
  │  [사용자 정의 레이어 3] (Z: 10)
  │  [사용자 정의 레이어 2] (Z: 8)
  │  [Traffic Layer]       (Z: 5)
  │  [Bicycle Layer]       (Z: 4)
  │  [지도 타일]           (Z: 0)
  ↓
Z 낮음 (아래에 표시)
```

**Z-index 할당 전략**:

```
0-10: 지도 기본 타일 및 기본 레이어
11-20: 사용자 검색 결과 (마커, Polyline)
21-30: 실시간 데이터 (교통, 우회로)
31-40: 사용자 상호작용 (선택됨, hover)
41-50: UI 오버레이 (정보 창, 팝업)
```

**동적 우선순위 변경**:

```
초기 상태:
  TrafficLayer (활성화)
  경로선 (활성화)
  마커 (활성화)

사용자 액션: "경로 강조"
  → 경로선 Z-index 상향 (다른 레이어 위에 표시)

사용자 액션: "교통정보 강조"
  → TrafficLayer Z-index 상향
```

**On-Journey 적용 가능성**: ⭐⭐⭐
- 경로 우선순위 조정
- 교통정보 vs 경로 표시 순서

---

## 줌 레벨별 렌더링 관리

### Pattern 1: 줌 레벨 임계값 기반 렌더링

**개념**: 각 오버레이/레이어를 줌 레벨 범위로 제한하여 표시

**활용 상황**:
- 상세한 마커는 줌인 시만 표시
- 넓은 범위 데이터는 줌아웃 시만 표시
- 성능 최적화 (불필요한 렌더링 방지)

**줌 레벨 분류체계**:

```
Zoom 5-8 (광역권, 수백 km):
  표시: 광역 경로, 지역 클러스터
  숨김: 상세 마커, 도형, 교통정보
  
Zoom 9-12 (도시, 수십 km):
  표시: 도시 경로, 도시 클러스터
  숨김: 거리 수준 마커
  
Zoom 13-14 (광역 시, ~10km):
  표시: 경로, 주요 마커, 교통정보 (일부)
  숨김: 세부 정보
  
Zoom 15-16 (동네, ~1km):
  표시: 모든 마커, 경로 화살표, 교통정보
  
Zoom 17+ (거리, ~100m):
  표시: 모든 세부 정보, 이름, 거리 표시
```

**구현 전략**:

```
각 오버레이에 줌 범위 속성 정의:
  마커 = {
    position: [37.5, 126.9],
    minZoom: 15,  // Zoom 15 이상에서만 표시
    maxZoom: 20,
    showLabel: false
  }
  
줌 레벨 변경 시:
  event.addListener(map, 'zoom_changed', (zoom) => {
    overlays.forEach(overlay => {
      if (zoom >= overlay.minZoom && zoom <= overlay.maxZoom) {
        overlay.show()
      } else {
        overlay.hide()
      }
    })
  })
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- DirectionalStripes 화살표 (Z16+ 표시)
- 경로 수치 정보 (Z15+ 표시)
- 마커 라벨 (Z16+ 표시)

---

### Pattern 2: 줌 레벨별 데이터 정밀도 (LOD - Level of Detail)

**개념**: 줌 레벨에 따라 다른 정밀도의 데이터를 로드

**활용 상황**:
- 경로 데이터 (광역은 단순, 상세는 복잡)
- 지점 데이터 (광역은 요약, 상세는 전체)
- 타일맵 (광역은 저해상도, 상세는 고해상도)

**작동 원리**:

```
경로 데이터 예시:

서울 → 부산 전체 경로:
  Zoom 8 (경로 간단히):
    좌표: [P0, P5, P10, P15] (20개 중 4개)
    정보: 출발지, 도착지, 총 시간
    
  Zoom 12 (경로 중간):
    좌표: [P0, P2, P5, P8, P10, ...] (20개 중 10개)
    정보: + 주요 도시 경유점
    
  Zoom 15 (경로 상세):
    좌표: [P0, P1, P2, ..., P20] (모든 좌표)
    정보: + 턴별 거리, 소요시간

성능 영향:
  Zoom 8: Polyline 렌더링 빠름 (점 4개)
  Zoom 12: 적당한 성능 (점 10개)
  Zoom 15: 상세하지만 무거움 (점 20개)
```

**API 호출 최적화**:

```
기본 전략: 한 번에 고정밀도 데이터 로드
  경로 API 호출 1회 → 모든 좌표 수신
  → 메모리 사용 높음

최적화 전략: 줌 레벨별 점진적 로드 (Progressive Loading)
  경로 API 호출 1회 → 기본 경로 수신
  user zoom >= 15 → 추가 API 호출 → 상세 좌표 수신
  → 초기 로딩 빠름, 필요시 상세 정보
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 경로 좌표 정밀도 조정
- Polyline 단순화 (줌 레벨별)

---

## 메모리 관리 패턴

### Pattern 1: 객체 생명주기 추적 (Lifecycle Tracking)

**개념**: 생성된 모든 지도 객체를 추적하여 메모리 누수 방지

**활용 상황**:
- 대량의 마커/오버레이 생성/삭제
- 장시간 앱 실행 (메모리 누적 가능)
- 모바일 환경 (메모리 제한)

**객체 레지스트리 패턴**:

```
객체 생성 시:
  marker = new naver.maps.Marker({...})
  Registry.add('marker', id, marker)
  
  polyline = new naver.maps.Polyline({...})
  Registry.add('polyline', id, polyline)

객체 확인:
  totalMarkers = Registry.count('marker')
  console.log(`활성 마커: ${totalMarkers}`)

객체 정리:
  Registry.getAll('marker').forEach(marker => {
    if (shouldRemove(marker)) {
      marker.setMap(null)
      Registry.remove('marker', markerId)
    }
  })

메모리 리포트:
  Registry.report()
  // 마커: 50개, Polyline: 10개, 메모리: 15MB
```

**메모리 한계 설정**:

```
Max Markers: 500개
  → 초과 시 오래된 마커 자동 정리

Max Polylines: 100개
  → 초과 시 경고, 사용자 선택으로 정리

Max Total Memory: 150MB (모바일 80MB)
  → 초과 시 가장 오래된 객체부터 정리
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 마커 개수 제한 (검색 결과)
- Polyline 개수 제한 (경로 히스토리)

---

### Pattern 2: 약한 참조 (Weak Reference) 기반 캐싱

**개념**: 메모리가 부족할 때 자동으로 해제되는 캐시 사용

**활용 상황**:
- 아이콘 이미지 캐싱
- 정보 창 정보 캐싱
- API 응답 캐싱

**작동 원리**:

```
강한 참조 (Strong Reference - 문제):
  iconCache = {
    'cafe.png': image1,
    'restaurant.png': image2,
    ...
  }
  → 메모리 부족 시에도 해제 안 됨
  → 메모리 누수 가능성 높음

약한 참조 (Weak Reference - 최적화):
  iconCache = WeakMap {
    'cafe.png' → image1,  (참조: 약함)
    'restaurant.png' → image2,
    ...
  }
  → 메모리 부족 시 자동 해제
  → GC가 필요 없는 이미지 자동 정리
```

**캐싱 전략**:

```
요청 1: 아이콘 "cafe.png" 로드
  → 캐시 미스
  → 이미지 로드, WeakMap에 저장
  
요청 2: 동일 아이콘 "cafe.png" 필요
  → 캐시 히트 (WeakMap에서 반환)
  
메모리 부족 상황:
  → GC 실행
  → 다른 객체로 참조되지 않는 이미지 자동 해제
  
요청 3: 아이콘 "cafe.png" 필요
  → 캐시 미스 (GC로 삭제됨)
  → 이미지 재로드
```

**On-Journey 적용 가능성**: ⭐⭐⭐
- 마커 아이콘 캐싱
- 정보 창 데이터 캐싱

---

### Pattern 3: 메모리 풀 재사용 (Object Pool Reuse)

**개념**: 객체를 완전히 삭제하지 않고 풀에서 재사용

**활용 상황**:
- 자주 생성/삭제되는 객체 (검색 결과 마커)
- GC 압박 줄이기 필요
- 예측 가능한 메모리 사용

**작동 원리**:

```
풀 초기화 (시작):
  MarkerPool = [
    {id: 1, status: 'available'},
    {id: 2, status: 'available'},
    ...
    {id: 50, status: 'available'}
  ]

마커 요청 (사용):
  marker = MarkerPool.acquire()  // 풀에서 객체 가져오기
  marker.setPosition(new_position)
  marker.setMap(map)
  marker.status = 'in-use'

마커 해제 (반환):
  marker.setMap(null)
  MarkerPool.release(marker)
  marker.status = 'available'  // 풀로 반환

메모리 상태:
  생성된 객체: 항상 50개 (고정)
  활성 객체: 0-50개 (가변)
  할당/해제 오버헤드: 없음 (재사용)
```

**풀 크기 결정**:

```
기본 크기: 50개
  → 일반적인 검색 결과 (상위 50개)

피크 크기: 200개 (메모리 여유 시)
  → 최대 예상 마커 개수

메모리 절약 모드: 30개 (모바일)
  → 메모리 제약 있는 환경
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 검색 결과 마커 풀 (상위 50개)
- 정보 창 풀 (동시 5개만 표시)

---

## 이벤트 처리 최적화

### Pattern 1: 이벤트 위임 (Event Delegation)

**개념**: 자식 요소의 이벤트를 부모가 처리하여 리스너 개수 감소

**활용 상황**:
- 마커 100+ 개에 대한 클릭 이벤트
- 리스너 개수 최소화 필요
- 메모리 효율성 중요

**작동 원리 (마커 클릭)**:

```
비효율적 방식 (리스너 100개):
  markers.forEach(marker => {
    marker.addListener('click', () => {
      handleMarkerClick(marker)
    })
  })
  → 100개 리스너 = 높은 메모리 사용

효율적 방식 (리스너 1개, 위임):
  map.addListener('click', (e) => {
    // e.target이 marker인지 확인
    if (isMarker(e.target)) {
      handleMarkerClick(e.target)
    }
  })
  → 1개 리스너 = 낮은 메모리 사용
```

**이벤트 위임 구현**:

```
중앙 이벤트 핸들러:
  map.addListener('click', (e) => {
    const targetType = identify(e.target)
    
    switch(targetType) {
      case 'marker':
        handleMarkerClick(e.target)
        break
      case 'polyline':
        handlePolylineClick(e.target)
        break
      case 'polygon':
        handlePolygonClick(e.target)
        break
      default:
        handleMapClick(e.coord)
    }
  })

이점:
  - 리스너 개수: 100개 → 1개 (99%↓)
  - 메모리 사용: 높음 → 낮음
  - 코드 유지보수: 분산 → 중앙집중화
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 마커 클릭 처리 (100+ 마커)
- 도형 클릭 처리 (Polyline, Polygon)

---

### Pattern 2: 이벤트 배칭 (Event Batching)

**개념**: 빈번한 이벤트를 모아서 한 번에 처리

**활용 상황**:
- 빠른 속도로 발생하는 이벤트 (mousemove, scroll)
- 각 이벤트 처리 비용 높은 경우 (지도 렌더링)
- 성능 저하 방지

**작동 원리**:

```
이벤트 흐름:
  mousemove 1 → mousemove 2 → mousemove 3 → mousemove 4 → ...
  (60Hz 모니터: 16ms마다 발생)

비효율적 처리 (각각 처리):
  mousemove 1: 지도 업데이트 (16ms)
  mousemove 2: 지도 업데이트 (16ms)
  mousemove 3: 지도 업데이트 (16ms)
  → 초당 60회 업데이트 (CPU 과부하)

효율적 처리 (배칭):
  mousemove 1: 큐에 추가
  mousemove 2: 큐에 추가
  mousemove 3: 큐에 추가
  
  50ms 후 배치 처리:
    큐: [mousemove 1, 2, 3]
    → 최종 좌표만 한 번에 업데이트
  
  → 초당 20회 업데이트 (CPU 부하 60% 감소)
```

**배칭 구현 전략**:

```
디바운싱 (Debouncing): 마지막 이벤트 후 대기
  마우스 움직임 멈춘 후 300ms 후 처리
  → 정확도 높음, 지연 있음

쓰로틀링 (Throttling): 일정 시간 간격으로만 처리
  50ms마다 한 번만 처리
  → 실시간성 높음, 처리량 일정
  
요청 큐잉 (Request Queuing): 대기열에서 주기적 처리
  모든 이벤트를 큐에 추가
  requestAnimationFrame으로 프레임마다 처리
  → 최적 성능 (FPS에 동기화)
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 마우스 이동 시 마커 하이라이트
- 지도 드래그 중 오버레이 업데이트
- 검색 입력 시 자동완성 (입력 배칭)

---

### Pattern 3: 이벤트 리스너 정리 (Cleanup)

**개념**: 불필요해진 이벤트 리스너를 명시적으로 제거

**활용 상황**:
- 컴포넌트 언마운트 시
- 모달/팝업 닫을 시
- 기능 전환 시

**메모리 누수 시나리오**:

```
문제 상황:
  1. 마커 100개에 클릭 리스너 등록
  2. 사용자가 다른 화면으로 이동
  3. 마커는 제거되었지만 리스너는 여전히 메모리에 존재
  4. 시간이 지남에 따라 메모리 누적
  
메모리 변화:
  초기: 20MB
  1번 방문: 35MB (리스너 100개 등록)
  1번 이동: 35MB (리스너 정리 안 됨)
  2번 방문: 50MB (추가 리스너 100개 등록)
  ... (계속 누적)
```

**리스너 정리 전략**:

```
방법 1: 개별 정리
  naver.maps.Event.removeListener(marker, 'click', handler)

방법 2: 일괄 정리
  naver.maps.Event.removeListener(marker)  // 모든 리스너 제거

방법 3: 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // cleanup
      markers.forEach(marker => {
        marker.setMap(null)
        naver.maps.Event.removeListener(marker)
      })
    }
  }, [])
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 화면 전환 시 리스너 정리
- 마커/오버레이 제거 시 리스너 정리

---

## 상태 관리와 렌더링 동기화

### Pattern 1: 지도 상태와 UI 상태 분리

**개념**: 지도 객체 상태와 React 상태를 명확히 분리하여 관리

**활용 상황**:
- Zustand와 네이버 지도 API의 상태 충돌
- 불필요한 리렌더링 방지
- 상태 동기화 오류 방지

**상태 분류**:

```
┌─────────────────────────────────────────────────────┐
│                   Application State                 │
│              (Zustand, React State)                 │
├─────────────────────────────────────────────────────┤
│  - 선택된 마커 ID                                   │
│  - 현재 검색어                                      │
│  - UI 모달 표시 여부                               │
│  - 플로팅 카드 데이터                              │
└─────────────────────────────────────────────────────┘
                          ↕ (동기화)
┌─────────────────────────────────────────────────────┐
│                   Map Internal State                │
│              (naver.maps API)                       │
├─────────────────────────────────────────────────────┤
│  - 지도 중심 좌표                                   │
│  - 줌 레벨                                         │
│  - 활성 오버레이 목록                              │
│  - 현재 지도 타입                                  │
└─────────────────────────────────────────────────────┘
```

**동기화 전략**:

```
방향 1: Application → Map
  사용자 액션: 마커 선택
  → Zustand: selectedMarkerId = "marker_1"
  → useEffect: marker.setPosition() 호출
  → Map 중심 자동 변경

방향 2: Map → Application
  사용자 액션: 지도 드래그
  → Map zoom_changed 이벤트 발생
  → Event handler: Zustand 업데이트
  → UI 재렌더링 (줌 정보 표시)

방향 3: 양방향 동기화 (주의)
  문제: 무한 루프 가능
  해결: 이벤트 소스 추적, 필요한 경우만 동기화
```

**주의사항**:

```
안티패턴 (무한 루프):
  1. Zustand: center = [37.5, 126.9]
  2. useEffect: map.setCenter(center)
  3. Map: center_changed 이벤트
  4. Event handler: Zustand center 업데이트
  5. → 다시 2번으로 돌아감 (무한 루프)

올바른 패턴:
  1. 사용자 액션만 Zustand에 반영
  2. Zustand 변경 시 Map 업데이트
  3. Map 자동 변경은 Zustand 업데이트 안 함
  4. → 한 방향 흐름 유지
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 경로 지점 선택 (Zustand) → 지도 이동 (Map)
- 지도 줌/팬 (Map) → UI 업데이트 (Zustand 선택적)

---

### Pattern 2: 선택적 구독 (Selective Subscription)

**개념**: 필요한 상태만 구독하여 불필요한 리렌더링 방지

**활용 상황**:
- Zustand 상태의 일부만 사용하는 컴포넌트
- 대량의 상태 변경이 불필요한 리렌더링 트리거
- 성능 최적화 필요

**작동 원리**:

```
전체 상태 구독 (비효율적):
  const { 
    markers,          // 사용함
    routes,           // 미사용
    userProfile,      // 미사용
    settings,         // 미사용
    trafficLayer      // 미사용
  } = useJourneyStore()
  
  문제:
    trafficLayer 업데이트 → 컴포넌트 리렌더링
    markers 미사용 → 불필요한 리렌더링

선택적 구독 (효율적):
  const markers = useJourneyStore(state => state.markers)
  
  이점:
    markers만 변경될 때만 리렌더링
    다른 상태 변경 무시
```

**구현 예시**:

```
Zustand Store:
  const useJourneyStore = create(set => ({
    markers: [],
    routes: [],
    selectedMarker: null,
    ...
  }))

컴포넌트 1: 마커 리스트 표시
  const markers = useJourneyStore(state => state.markers)
  // markers만 구독, 변경 시만 리렌더링

컴포넌트 2: 선택된 마커 정보
  const selectedMarker = useJourneyStore(
    state => state.selectedMarker
  )
  // selectedMarker만 구독

컴포넌트 3: 경로 표시
  const routes = useJourneyStore(state => state.routes)
  // routes만 구독
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- PlaceList: markers만 구독
- RouteInfo: selectedRoute만 구독
- TrafficLayer: trafficLayer만 구독

---

## 모바일 환경 최적화

### Pattern 1: 터치 이벤트 최적화

**개념**: 모바일 터치 이벤트를 마우스 이벤트와 다르게 처리

**활용 상황**:
- 모바일 디바이스에서 지도 상호작용
- 터치와 마우스 이벤트 동시 처리
- 제스처 인식 (핀치, 롱탭 등)

**터치 이벤트 특성**:

```
터치 이벤트 (모바일):
  tap: 손가락으로 빠르게 누르고 떼기
  longtap: 1초 이상 누르기
  doubletap: 빠르게 두 번 누르기
  pinch: 두 손가락으로 모으기/펼치기
  
마우스 이벤트 (PC):
  click: 마우스 클릭
  dblclick: 더블 클릭
  wheel: 스크롤
  
혼합 환경 (태블릿):
  터치와 마우스 동시 지원
  → 이벤트 중복 처리 가능성
```

**이벤트 통일 전략**:

```
방법 1: 터치만 사용
  if (isTouch) {
    addListener('tap', ...)
    addListener('longtap', ...)
  } else {
    addListener('click', ...)
  }

방법 2: 통합 핸들러
  addListener('click', handler)      // PC
  addListener('tap', handler)        // 모바일
  // 같은 handler로 처리

방법 3: 이벤트 정규화
  const handleTap = (e) => {
    // PC click, 모바일 tap 모두 처리
  }
```

**터치 최적화 팁**:

```
1. 터치 대상 크기
   최소 44x44px (터치하기 쉬운 크기)
   → 마커는 보통 32x32px (너무 작음)
   → 히트영역 확대 (hitArea)

2. 터치 지연
   300ms 지연 (더블탭 판단 대기)
   → 즉시 응답 필요 시 설정으로 비활성화

3. 터치 피드백
   기본 피드백 (브라우저) 비활성화
   → 커스텀 하이라이트 추가 (UX 향상)
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 마커 터치 확대 영역 설정
- 롱탭 (longtap) 콘텍스트 메뉴

---

### Pattern 2: 모바일 메모리 관리

**개념**: 모바일의 제한된 메모리 환경에 맞춘 최적화

**활용 상황**:
- Android/iOS 저사양 기기
- 백그라운드 프로세스로 메모리 점유
- 배터리 소모 최소화

**메모리 제약**:

```
데스크톱:
  RAM: 8GB+
  지도 메모리: 100-200MB 허용
  
모바일 (고사양):
  RAM: 4-8GB
  지도 메모리: 50-80MB 허용
  
모바일 (저사양):
  RAM: 1-2GB
  지도 메모리: 20-30MB 허용
```

**모바일 최적화 전략**:

```
1. 마커 개수 제한
   PC: 500개 (풀 크기)
   모바일: 100개 (풀 크기 1/5)
   
   → Viewport 기반 렌더링 필수
   → 화면에 보이는 마커만 생성

2. 오버레이 단순화
   PC: 모든 Polyline, Polygon 표시
   모바일: 주요 경로만, 도형 색상 최소화
   
   → 줌 레벨에 따라 정밀도 조정

3. 레이어 비활성화
   PC: 모든 레이어 활성화 옵션
   모바일: 기본 비활성화, 사용자 선택 시만 활성화
   
   → TrafficLayer, StreetLayer 기본 OFF

4. 이미지 최적화
   PC: 원본 이미지
   모바일: WebP, 압축 이미지
   
   → 아이콘 파일 크기 30-50% 감소
```

**배터리 최적화**:

```
1. 프레임 레이트 제어
   PC: 60 FPS
   모바일: 30 FPS (필요시)
   
   → requestAnimationFrame 활용

2. 이벤트 트로틀링
   mousemove 배칭: 50ms 간격
   → 이벤트 처리 횟수 60% 감소

3. GPS 위치 업데이트
   배경: 10초 간격
   포그라운드: 1초 간격 (필요시)
   
   → 배터리 소모 최소화
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐⭐
- 모바일 마커 풀 크기 50-100개로 제한
- Viewport 기반 마커 렌더링 필수
- 모바일에서는 교통정보 레이어 기본 OFF

---

## 데이터 시각화 최적화

### Pattern 1: HeatMap 최적화

**개념**: 대량의 데이터를 열 지도로 시각화할 때 성능 관리

**활용 상황**:
- 1000+ 데이터 포인트 표시
- 실시간 데이터 업데이트
- 밀도 기반 분석 필요

**HeatMap 성능 관리**:

```
데이터 입력 방식:

방식 1: 전체 데이터 한 번에 입력 (비효율)
  heatmap.setData([
    {lat: 37.5, lng: 126.9, weight: 100},
    {lat: 37.6, lng: 127.0, weight: 150},
    ... (1000개)
  ])
  
  → 생성 시간: 500ms+
  → 메모리 사용: 높음
  → 업데이트 시 전체 재계산

방식 2: 점진적 추가 (개선)
  const addData = (data) => {
    currentData.push(data)
    if (currentData.length % 100 === 0) {
      heatmap.setData(currentData)  // 100개마다 업데이트
    }
  }
  
  → 시간 분산
  → UI 응답성 향상

방식 3: 샘플링 (최적)
  const sampledData = data.filter((_, i) => i % 10 === 0)
  heatmap.setData(sampledData)  // 10% 데이터만
  
  → 생성 시간: 50ms
  → 시각적 차이: 미미
  → 메모리: 1/10 감소
```

**줌 레벨별 데이터 단순화**:

```
Zoom ≤ 10:
  샘플링: 1000개 → 100개 (10%)
  반경: 100px (큰 반경)

Zoom 11-14:
  샘플링: 1000개 → 300개 (30%)
  반경: 50px

Zoom ≥ 15:
  샘플링: 1000개 → 1000개 (100%)
  반경: 20px
```

**On-Journey 적용 가능성**: ⭐⭐⭐
- 검색 결과 밀도 시각화
- 실시간 교통정보 열 지도

---

### Pattern 2: DotMap 성능 최적화

**개념**: 점 지도 렌더링 시 대량의 포인트 처리

**활용 상황**:
- 개별 데이터 포인트 표시 필요
- HeatMap보다 정밀한 표현
- 1000+ 포인트 표시

**성능 최적화**:

```
렌더링 방식:

Canvas 기반 (HeatMap):
  - 매우 빠름 (1000+ 포인트 처리)
  - 개별 포인트 상호작용 불가
  - 색상/크기 일관성

DOM 기반 (개별 마커):
  - 느림 (100+ 포인트에서 문제)
  - 개별 상호작용 가능
  - 높은 유연성

혼합 방식 (권장):
  Zoom ≤ 13: DotMap/HeatMap (Canvas)
  Zoom ≥ 14: 개별 마커로 전환
```

**메모리 효율화**:

```
비효율적:
  dotmap.setData(1000개 포인트)
  + 개별 마커 표시
  → 메모리: 높음, 성능: 낮음

효율적:
  데이터 1000개 분류:
  - Zoom ≤ 13: DotMap만 표시
  - Zoom ≥ 14: DotMap 숨김, 마커 표시 (상위 100개)
  
  → 메모리: 낮음, 성능: 높음
```

**On-Journey 적용 가능성**: ⭐⭐⭐
- 검색 결과 밀도 표시
- 필터링된 결과 시각화

---

## 성능 모니터링 및 측정

### Pattern 1: 성능 지표 수집 (Performance Metrics)

**개념**: 지도 렌더링 성능을 실시간으로 측정

**주요 지표**:

| 지표 | 측정 방법 | 목표 | 의미 |
|------|---------|------|------|
| **FCP** | 첫 콘텐츠 렌더링 | < 1s | 지도 첫 표시 |
| **LCP** | 큰 콘텐츠 렌더링 | < 2.5s | 마커/오버레이 준비 |
| **FPS** | 프레임율 | 60 FPS | 스무드한 스크롤 |
| **Memory** | 메모리 사용량 | < 100MB | 메모리 누수 확인 |
| **Event Latency** | 이벤트 응답 시간 | < 100ms | 반응성 |

**측정 구현**:

```
프레임율 (FPS) 측정:
  let frameCount = 0
  let lastTime = performance.now()
  
  const measureFPS = () => {
    frameCount++
    const now = performance.now()
    if (now - lastTime >= 1000) {
      console.log(`FPS: ${frameCount}`)
      frameCount = 0
      lastTime = now
    }
    requestAnimationFrame(measureFPS)
  }

메모리 사용량 측정:
  if (performance.memory) {
    const used = performance.memory.usedJSHeapSize / 1048576
    console.log(`메모리: ${used.toFixed(2)}MB`)
  }

이벤트 응답 시간:
  const start = performance.now()
  handleMarkerClick()
  const elapsed = performance.now() - start
  console.log(`응답 시간: ${elapsed.toFixed(2)}ms`)
```

**성능 임계값 설정**:

```
Green Zone (정상):
  FPS: 50-60
  Memory: < 80MB
  Event Latency: < 50ms

Yellow Zone (주의):
  FPS: 30-50 (낮음 감지)
  Memory: 80-120MB (증가 추세)
  Event Latency: 50-100ms

Red Zone (문제):
  FPS: < 30 (프레임 드롭 감지)
  Memory: > 120MB (메모리 누수)
  Event Latency: > 100ms (반응성 저하)
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- 실시간 성능 모니터링
- 병목 지점 자동 감지

---

### Pattern 2: 성능 프로파일링 (Profiling)

**개념**: 성능 병목을 찾기 위해 각 부분의 실행 시간 측정

**프로파일링 대상**:

```
마커 생성:
  - 마커 객체 생성 시간
  - 아이콘 로드 시간
  - 리스너 등록 시간
  - 총 시간 (sum)

Polyline 렌더링:
  - 좌표 계산 시간
  - DOM 업데이트 시간
  - 렌더링 대기 시간
  - 총 시간 (sum)

이벤트 처리:
  - 이벤트 감지 시간
  - 핸들러 실행 시간
  - 상태 업데이트 시간
  - 리렌더링 시간
```

**측정 방법**:

```
Console 기반 측정:
  console.time('marker-create')
  // 마커 생성 코드
  console.timeEnd('marker-create')
  // 출력: marker-create: 45.23ms

Chrome DevTools:
  - Performance 탭: 전체 실행 시간 측정
  - Rendering 탭: 레이아웃, 페인트 감지
  - Memory 탭: 메모리 누수 확인

Custom 측정:
  function profileMarkerCreation(count) {
    const start = performance.now()
    
    for (let i = 0; i < count; i++) {
      new naver.maps.Marker({...})
    }
    
    const elapsed = performance.now() - start
    console.log(`${count}개 마커 생성: ${elapsed}ms (${(elapsed/count).toFixed(2)}ms/개)`)
  }
```

**On-Journey 적용 가능성**: ⭐⭐⭐⭐
- DirectionalStripes 화살표 배치 프로파일링
- 검색 결과 마커 생성 성능 측정

---

## On-Journey 프로젝트 적용 전략

### 우선순위별 최적화 로드맵

#### Phase 1: 긴급 개선 (1주)

**목표**: 현재 성능 병목 제거

**적용 항목**:

1. **마커 클러스터링** (⭐⭐⭐⭐⭐)
   - 검색 결과 100+ 마커 → 클러스터 그룹화
   - Zoom 12 이하에서 클러스터 표시
   - 메모리 30% 감소 예상

2. **Polyline 좌표 단순화** (⭐⭐⭐⭐⭐)
   - 경로 API 응답 → RDP 알고리즘으로 단순화
   - Zoom 레벨별 임계값 조정
   - 렌더링 성능 50% 향상 예상

3. **마커 아이콘 스프라이팅** (⭐⭐⭐⭐⭐)
   - 카테고리 아이콘 → 하나의 sprite 이미지
   - HTTP 요청 5개 → 1개 감소
   - 초기 로딩 시간 40% 감소 예상

4. **이벤트 리스너 정리** (⭐⭐⭐⭐)
   - 화면 전환 시 모든 리스너 명시적 제거
   - 메모리 누수 방지

**예상 효과**:
- FPS: 30-40 → 50-60
- 메모리: 120MB → 80MB
- 초기 로딩: 3초 → 1.5초

---

#### Phase 2: 기능 최적화 (2주)

**목표**: 사용자 경험 개선

**적용 항목**:

1. **Viewport 기반 렌더링** (⭐⭐⭐⭐⭐)
   - 화면에 보이는 마커만 생성
   - 스크롤 시 동적 로드
   - 메모리 사용 50% 감소

2. **DirectionalStripes 줌 최적화** (⭐⭐⭐⭐)
   - Z16 이상에서만 화살표 표시
   - 줌 레벨별 화살표 간격 조정
   - 렌더링 성능 30% 향상

3. **Polyline 분절화** (⭐⭐⭐⭐)
   - 교통 상태별 색상 구분 (빨강-노랑-초록)
   - 실시간 업데이트 성능 개선

4. **선택적 구독** (⭐⭐⭐⭐⭐)
   - Zustand selector로 필요한 상태만 구독
   - 불필요한 리렌더링 제거
   - CPU 사용률 20% 감소

**예상 효과**:
- 메모리: 80MB → 50MB (모바일)
- 반응성: 100ms → 50ms
- 부드러운 스크롤: FPS 유지

---

#### Phase 3: 고급 최적화 (3주)

**목표**: 극도의 성능 달성

**적용 항목**:

1. **마커 풀 재사용** (⭐⭐⭐⭐)
   - 마커 객체 50개 풀 생성
   - 검색 결과 마커 로테이션 사용
   - GC 압박 제거

2. **이벤트 위임** (⭐⭐⭐⭐)
   - 100+ 마커 클릭 → 1개 리스너로 처리
   - 리스너 메모리 99% 감소

3. **데이터 시각화 최적화** (⭐⭐⭐)
   - HeatMap/DotMap 샘플링
   - Zoom 레벨별 데이터 정밀도 조정

4. **모바일 특화 최적화** (⭐⭐⭐⭐)
   - 마커 풀 크기 30-50개 (모바일)
   - Viewport 기반 렌더링 필수
   - 배터리 최적화 (프레임 레이트 조절)

**예상 효과**:
- 메모리: 50MB → 30MB (모바일)
- 초기 로딩: 1.5초 → 0.8초
- 60 FPS 안정적 유지

---

### 적용 체크리스트

```
□ Phase 1: 긴급 개선
  □ 마커 클러스터링 구현
  □ Polyline 좌표 단순화 (RDP)
  □ 아이콘 스프라이팅
  □ 이벤트 리스너 정리
  
□ Phase 2: 기능 최적화
  □ Viewport 기반 렌더링
  □ DirectionalStripes 줌 최적화
  □ Polyline 분절화 (교통색상)
  □ Zustand 선택적 구독
  
□ Phase 3: 고급 최적화
  □ 마커 풀 관리
  □ 이벤트 위임
  □ 데이터 시각화 샘플링
  □ 모바일 특화 최적화

□ 성능 모니터링
  □ FPS 측정 (Chrome DevTools)
  □ 메모리 사용량 추적
  □ 이벤트 응답 시간 측정
  □ 병목 지점 프로파일링
```

---

### Native 앱 (Kotlin) 개발 시 주의사항

네이버 지도 Android SDK와 Web API의 차이:

```
개념적 차이:
  Web: CPU 기반 JavaScript
  Native: GPU 최적화, 하드웨어 가속

성능 특성:
  Web: CPU 병목 (마커 100개 문제)
  Native: GPU 가속 (마커 1000개 가능)

최적화 전략 전환:
  Web: 마커 수 제한, 클러스터링 필수
  Native: 마커 수 제약 적음, 렌더링 성능 우선

메모리 관리:
  Web: Zustand, React 메모리 관리
  Native: Kotlin, Android 메모리 관리
  
  → Native가 더 엄격한 메모리 제어 가능
```

**권장 아키텍처**:

```
Web (On-Journey PWA):
  - 경로 100개까지만 허용
  - 마커 클러스터링 필수
  - Viewport 렌더링 필수

Native (On-Journey Android):
  - 경로 제한 없음
  - 마커 개수 증가 가능
  - 더 높은 렌더링 품질
  - 배터리 최적화 중요
```

---

## 결론 및 최종 권고

### 핵심 원칙 5가지

1. **선택적 렌더링**: 필요한 것만 그린다
   - Viewport 필터링
   - 줌 레벨별 조건부 표시
   - 데이터 샘플링

2. **배치 처리**: 개별이 아닌 묶음으로 처리
   - 마커 풀 재사용
   - 이벤트 배칭
   - 좌표 일괄 업데이트

3. **메모리 절약**: 불필요한 할당 피하기
   - 객체 재사용
   - 명시적 정리 (cleanup)
   - 약한 참조 활용

4. **상태 분리**: 지도와 UI 상태 명확히
   - Zustand + Map API 선택적 동기화
   - 무한 루프 방지
   - 단방향 데이터 흐름

5. **점진적 최적화**: 측정하고 개선하기
   - FPS 모니터링
   - 메모리 추적
   - 병목 프로파일링
   - 단계별 개선 (Phase 1-3)

---

*이 가이드는 On-Journey 프로젝트의 성능 최적화를 위해 작성되었으며, Web (PWA/Next.js)과 Native (Kotlin) 앱 개발 모두에 적용 가능합니다.*

---

## 부록: 참고 자료

- **네이버 지도 API v3**: https://navermaps.github.io/maps.js.ncp/docs/
- **Chrome DevTools Performance**: https://developer.chrome.com/docs/devtools/performance/
- **Web Vitals**: https://web.dev/vitals/
- **Zustand**: https://github.com/pmndrs/zustand
- **React Performance**: https://react.dev/learn/render-and-commit
