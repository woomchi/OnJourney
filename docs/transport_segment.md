# 대안 1: 이동 수단 다변화 및 세그먼트 기반 개별 선택 도입 (기획 확정안)

사용자 편의성을 극대화하기 위해 여정의 이동 수단 모드를 **대중교통 / 택시 / 자차** 3가지로 개편하고, 뚜벅이(대중교통/택시) 모드에서는 수단을 혼용할 수 있게 하며, 자차 모드에서는 차량 경로만을 노출하도록 프론트엔드 로직을 개편합니다.

## User Review Required

> [!WARNING]
> **DB 마이그레이션 확인 필요**
> 기존 생성된 여정 중 `transport_type`이 `walk`로 되어 있는 데이터가 있다면 이를 `public` 또는 `taxi`로 마이그레이션해야 할 수 있습니다. 
> Supabase DB 테이블(`journeys`)에 `transport_type` CHECK 제약 조건이나 ENUM이 걸려있는지 확인하여 필요시 SQL 마이그레이션 스크립트를 추가해야 합니다.

## Open Questions

> [!IMPORTANT]
> **택시 대안 경로 렌더링 방식**
> 현재 네이버 자동차 API(`directions/car`) 응답에 `taxiFare`가 포함되어 있습니다. 
> 택시 대안을 선택했을 때, 폴리라인 색상을 기존 자동차(주황색)와 다르게 (예: 노란색이나 검정색) 분리하여 보여줄까요? 아니면 기존 차량 경로 스타일을 그대로 따를까요?

## Proposed Changes

### 1. 타입 및 데이터 모델 업데이트
#### [MODIFY] [src/types/journey.ts](file:///C:/Users/hitsz/Desktop/OnJourney/src/types/journey.ts)
* `TransportType` 정의를 `'public' | 'car' | 'walk'`에서 `'public' | 'taxi' | 'car'`로 변경합니다.
* 기존 `walk` 타입으로 생성되던 일부 타입 종속성을 제거하거나 `public`/`taxi` 내부의 대안으로 편입시킵니다.

### 2. 여정 생성/수정 UI 개편
#### [MODIFY] [src/components/CreateJourneyModal.tsx](file:///C:/Users/hitsz/Desktop/OnJourney/src/components/CreateJourneyModal.tsx)
#### [MODIFY] [src/components/EditJourneyModal.tsx](file:///C:/Users/hitsz/Desktop/OnJourney/src/components/EditJourneyModal.tsx)
* 이동 수단 선택 라디오 버튼(또는 카드) 항목을 변경합니다.
  * **🚌 대중교통 우선 (뚜벅이 여행)**: 기본 `public`
  * **🚕 택시 우선 (편하게 이동)**: 신규 `taxi`
  * **🚗 자차/렌터카 (전 구간 운전)**: 기존 `car` (설명 보강)

### 3. 구간별 추천 수단 자동 선택 로직
#### [MODIFY] [src/stores/slices/journeyDataSlice.ts](file:///C:/Users/hitsz/Desktop/OnJourney/src/stores/slices/journeyDataSlice.ts)
* 장소가 새로 추가되어 구간(`selected_route`)이 자동 맵핑될 때, 여정의 `transport_type`에 따른 분기 처리 강화:
  * `public`: 기존처럼 대중교통 경로 중 최단 시간 경로를 자동 선택.
  * `taxi`: 차량(`car`) API 응답 중 택시 요금이 포함된 첫 번째 경로를 `type: 'taxi'`로 변환하여 자동 선택.
  * `car`: 기존처럼 차량 최적길 경로 자동 선택.

### 4. 대안 경로 패널 (AlternativeRoutePanel) 동적 필터링
#### [MODIFY] [src/features/route/AlternativeRoutePanel.tsx](file:///C:/Users/hitsz/Desktop/OnJourney/src/features/route/AlternativeRoutePanel.tsx)
* **자차(`car`) 여정인 경우**:
  * 탭 구성에서 '대중교통', '도보/자전거' 탭을 아예 숨깁니다.
  * 오직 `실시간 빠른길`, `실시간 최적길`, `무료도로` 등의 자동차(NCP Directions) 옵션만 노출합니다. (택시 요금 숨김, 톨게이트/주유비만 표시)
* **대중교통(`public`) / 택시(`taxi`) 여정인 경우**:
  * 모든 탭(대중교통, 택시, 도보/자전거)을 다 보여주어 사용자가 자유롭게 혼용할 수 있도록 지원합니다.
  * 택시 탭을 신설하여, 차량 API 응답을 기반으로 한 택시 전용 정보(택시 요금, 시간) 카드 UI를 렌더링합니다.

### 5. 문서 현행화
#### [MODIFY] [docs/web/datatable.md](file:///C:/Users/hitsz/Desktop/OnJourney/docs/web/datatable.md)
* `TransportType` ENUM 스펙 업데이트 반영.
#### [MODIFY] [docs/web/project_status.md](file:///C:/Users/hitsz/Desktop/OnJourney/docs/web/project_status.md)
* Phase 2 이동 수단 다변화(대안 1번) 스펙 반영 및 진행 상태 업데이트.

## Verification Plan

### Manual Verification
1. 여정 생성 모달에서 '택시' 옵션이 정상 노출되는지 확인.
2. '자차'로 여정을 생성하고 장소를 추가했을 때, 대안 패널(`AlternativeRoutePanel`)에서 대중교통 옵션이 차단되는지 확인.
3. '대중교통'으로 여정을 생성하고, 특정 구간만 '택시' 대안으로 덮어쓸 수 있는지 확인.
4. 구간별 폴리라인 색상과 지도 렌더링이 문제없이 그려지는지 검증.
