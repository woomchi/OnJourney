# OnJourney 장소 검색 엔진 통합 설계서 v3

> **이전 문서 통합:** `searchFilteringEngine.md` + `travel_search_algorithm_v2.md`
> **설계 방향 전환:** 카테고리 사전 필터링(Drop) 방식 → **범용 수집 + 동적 카테고리 필터링** 방식

---

## 1. 설계 철학: 지도 서비스 수준의 검색 엔진

네이버 지도, 카카오 지도와 동급의 검색 성능을 기반으로, OnJourney 서비스 특유의 여행 맥락 정보를 추가 레이어로 제공한다.

| 기존 접근 (v1/v2) | 신규 접근 (v3) |
| :--- | :--- |
| 여행 외 카테고리(부동산, 학교 등)를 서버에서 사전 제거 | **모든 카테고리를 수집**하고, 서비스 카테고리 태그만 부여 |
| 검색 결과가 제한적 → 랜드마크·특수 상호 누락 위험 | **검색어 커버리지 100% 보장** → 검색 결과 0건 위험 제거 |
| 카테고리 필터 = 검색 범위 축소 | **카테고리 필터 = 검색 후 UI 분류 도구** |

### 결과 우선순위 원칙 (유지)

1. **완전 일치:** 장소명이 검색어와 동일한 경우 최우선
2. **의도 기반 매칭:** 검색어 접미사(역, 카페, 병원 등)와 카테고리가 부합하는 경우
3. **부분 매칭:** 장소명에 검색어 포함
4. **거리 감쇠:** 사용자 이동 수단 및 지역 밀집도 기반 가우시안 거리 페널티
5. **내부 인기도:** 서비스 내 찜/방문 빈도 기반 보정

---

## 2. 전체 파이프라인 (v3)

```
[사용자 검색어 입력]
        |
Phase 1: 쿼리 분석 - 지명 분리, 의도 패턴 감지, 명시적 지역 판별
        |
Phase 2: 범용 멀티 파이프라인 수집
  Pipeline A: accuracy 정렬 + 전국 범위 → 랜드마크 완전일치 보장
  Pipeline B: distance 정렬 + 현위치 반경 → 주변 탐색 최적화
  → 중복 제거 후 합산 (최대 60개 후보)
        |
Phase 3: 서비스 카테고리 태깅 [핵심 변경]
  - 제거(Drop) 없이 모든 결과 유지
  - category_group_code → 서비스 태그 매핑
  - 매핑 불가 항목 → 'etc' 태그 부여 (탈락 없음)
        |
Phase 4: 복합 스코어링 및 정렬
  S_match + S_pattern + S_cat + S_dist + S_pop → 상위 20개 선정
        |
Phase 5: API 응답 (serviceCategory 태그 포함하여 전체 반환)
        |
Phase 6: 클라이언트 동적 카테고리 필터링
  칩: [전체] [관광] [음식점] [카페] [숙소] [교통] [편의시설] [기타]
  서버 재호출 없이 클라이언트 메모리 필터링 + 지도 마커 동기화
```

---

## 3. Phase 2: 멀티 파이프라인 수집 상세

### Pipeline A — 정확도/랜드마크 보장형

- **정렬:** `sort=accuracy`
- **범위:** 위경도 없이 전국 검색 (또는 매우 넓은 반경)
- **목적:** "수원역", "부산역", "인천공항" 등 명칭이 완벽히 일치하는 랜드마크가 결과셋에 반드시 포함되도록 보장
- **요청:** 1~2페이지 (최대 30개)

### Pipeline B — 중심 좌표 주변 탐색형

- **정렬:** `sort=distance`
- **범위:** 현재 지도 중심 좌표(x, y) + 반경(radius)
- **목적:** 지도 현재 화면 기준의 실제 주변 장소를 수집
- **요청:** 1~2페이지 (최대 30개)

### 병합 전략

1. 두 파이프라인 결과를 합산 (최대 60개)
2. `id` 기준 중복 제거
3. Pipeline A 결과가 중복 시 우선 유지 (랜드마크 보존)

---

## 4. Phase 3: 서비스 카테고리 태깅 (핵심 변경점)

v2에서 `S_cat = 0.0`이면 결과를 탈락시키던 방식을 **태깅 방식으로 전환**한다.

### 카테고리 태그 매핑표

| 서비스 태그 | 카카오 category_group_code | S_cat 점수 | 설명 |
| :--- | :--- | :--- | :--- |
| `attraction` | `AT4`, `CT1` | 1.0 | 관광명소, 문화시설 |
| `accommodation` | `AD5` | 1.0 | 숙박 |
| `restaurant` | `FD6` | 0.8 | 음식점 |
| `cafe` | `CE7` | 0.8 | 카페/디저트 |
| `transit` | `SW8`, `PO3` (일부) | 0.8 | 교통 |
| `parking` | `PK6` | 0.5 | 주차장 |
| `convenience` | `CS2`, `PM9`, `MT1`, `OL7` | 0.5 | 편의시설 |
| `etc` | 나머지 전부 (`AG2`, `SC4`, 미분류 등) | **0.2** | 기타 (**탈락 없음**) |

> `etc` 태그는 결과를 제거하지 않는다. S_cat 점수만 낮게 부여되어 순위 후순위로 밀릴 뿐이다.

---

## 5. Phase 4: 복합 스코어링 공식

**일반 키워드 검색 시:**
```
S_total = (S_match x 0.40) + (S_cat x 0.25) + (S_dist x 0.25) + (S_pop x 0.10)
```

**패턴 감지 검색 시 (예: "망포역", "홍대 카페"):**
```
S_total = (S_match x 0.40) + (S_pattern x 0.25) + (S_cat x 0.15) + (S_dist x 0.10) + (S_pop x 0.10)
```

### 각 점수 설명

- **S_match (0.0~1.0):** 장소명에 검색어 포함 시 1.0 / 카테고리명에 포함 시 0.6 / 없음 0.1
- **S_pattern (0.0~1.0):** 의도 패턴(역, 카페, 병원 등)과 카테고리 부합도
- **S_cat (0.2~1.0):** 위 카테고리 태그별 기준 적용 (최소 0.2, 탈락 없음)
- **S_dist (0.0~1.0):** Gaussian Decay `e^(-d^2 / (2 * scale^2))`
  - 도보: `scale=1.0`, 차량 도심: `scale=3.0`, 차량 외곽: `scale=7.0`
- **S_pop (0.0~1.0):** 서비스 내 여정 등록 빈도 정규화 + 관광명소 Cold Start 보정(+0.3)

---

## 6. Phase 6: 클라이언트 동적 카테고리 필터링 UI

### 카테고리 칩 구성

```
[전체] [관광명소] [음식점] [카페] [숙소] [교통] [편의시설] [기타]
```

### 동작 방식

1. 검색 시 서버로부터 전체 결과(최대 20개)를 받아 클라이언트 상태에 저장
2. 유저가 카테고리 칩 클릭 시 **서버 재호출 없이** 클라이언트 메모리에서 즉시 필터링
3. 필터링 결과가 지도 마커와 목록 패널에 동기화
4. `[전체]` 클릭 시 초기 전체 결과 복원

### UI 위치 설계

- 검색 결과 드롭다운 상단: 가로 스크롤 가능한 칩 배열
- 지도 검색 모드(SearchMode): 지도 상단 고정형 칩 바 형태

---

## 7. API 인터페이스 변경 사항

### Request (변경 없음)
```
GET /api/places?query=...&lat=...&lng=...&transport_type=car
```

### Response (serviceCategory 필드 신규 추가)

```typescript
type ServiceCategoryTag =
  | 'attraction'
  | 'accommodation'
  | 'restaurant'
  | 'cafe'
  | 'transit'
  | 'parking'
  | 'convenience'
  | 'etc';

interface PlaceResult {
  id: string;
  place_name: string;
  address: string;
  category: string;                    // 카카오 원본 category_name (유지)
  category_group_code?: string;
  serviceCategory: ServiceCategoryTag; // 신규: 서비스 카테고리 태그
  lat: number;
  lng: number;
  score?: number;
}
```

---

## 8. 검증 시나리오

- [ ] **"부산역" 검색:** Pipeline A로 전국 기준 부산역이 결과에 포함되며 최상위 점수를 받는가?
- [ ] **"망포동 감성 카페" 검색:** `cafe` 태그를 가진 결과가 상위에 오르는가?
- [ ] **"부동산" 관련 장소 검색:** 결과에 포함되되(제거 없음) `etc` 태그로 순위 후순위에 위치하는가?
- [ ] **카테고리 칩 필터링:** 칩 클릭 시 서버 재호출 없이 즉각 필터링이 동작하는가?
- [ ] **[전체] 칩:** 클릭 시 전체 결과가 복원되는가?
- [ ] **거리 감쇠 역전 확인:** 10km 밖 완전일치보다 500m 내 의도 매칭 장소가 상위에 오는가?

---

## 9. 구현 레이어별 변경 사항 요약

| 레이어 | 파일 | 변경 내용 |
| :--- | :--- | :--- |
| 타입 정의 | `src/types/journey.ts` | `ServiceCategoryTag` 타입 신규, `PlaceResult`에 `serviceCategory` 필드 추가 |
| 백엔드 서비스 | `src/lib/services/placesService.ts` | Pipeline A/B 이중 수집, `getServiceCategoryTag` 함수 추가, S_cat 최솟값 0.2 |
| 클라이언트 훅 | `src/features/places/usePlaceSearch.ts` | `activeCategory` 상태, `filteredResults` 파생 상태 추가 |
| UI 컴포넌트 | `src/features/places/PlaceSearchBar.tsx` | 카테고리 칩 UI 추가, 클라이언트 필터링 상태 연결 |
| 검증 스키마 | `src/lib/validations/places.ts` | 변경 없음 |

---

*최종 갱신: 2026-08-06 | OnJourney — searchFilteringEngine.md + travel_search_algorithm_v2.md 통합본*
