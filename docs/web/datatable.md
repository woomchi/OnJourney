# On-Journey Database Schema & Data Structure (MVP)

본 문서는 실행(Execution) 중심의 다중 경유지 경로 최적화 서비스 '온저니(On-Journey)'의 Supabase 데이터베이스 스키마 및 프론트엔드 데이터 구조 정의서입니다. AI 바이브 코딩 시 데이터 흐름의 기준점(Ground Truth)으로 사용합니다.

> 마지막 업데이트: 2026-06-21

---

## 1. Architecture Philosophy (설계 철학)
* **배열 기반 순서 보존:** 장소의 순서 제어를 위해 테이블을 쪼개는 대신, PostgreSQL의 `JSONB` 배열 구조를 채택합니다. 배열의 인덱스(Index)가 곧 방문 순서가 되므로 드래그 앤 드롭 시 정렬 인덱스 재계산 오버헤드를 없애고 프론트엔드-백엔드 간 동기화를 단순화합니다.
* **실행(Execution) 중심 추적:** 여정의 계획에 그치지 않고 실제 이동 단계를 추적하기 위해 `current_step` 인덱스를 활용하여 '현재 이동 중인 구간'을 명확히 정의합니다.
* **경로 선택 상태 인라인 보존:** 각 장소의 `selected_route` 필드를 통해 사용자가 선택한 이동 경로 대안(대중교통/차량/도보)을 장소 데이터에 직접 인라인 저장하여 별도 테이블 없이 DB 동기화를 수행합니다.

---

## 2. Supabase DDL (SQL Script)

Supabase SQL Editor에 그대로 복사하여 실행할 수 있는 테이블 생성 및 보안(RLS) 설정 스크립트입니다.

```sql
-- 1. 여정 마스터 및 장소 통합 테이블 생성
CREATE TABLE journeys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,                                    -- 여정 이름
    transport_type TEXT NOT NULL DEFAULT 'public',          -- 기본 이동 수단 ('public': 대중교통 / 'car': 차량 / 'walk': 도보)
    journey_date DATE NOT NULL,                             -- 여정 날짜
    
    -- 장소 리스트를 순서가 보존되는 JSONB 배열로 통째로 저장
    -- 구조: Array<{id: string, place_name: string, address: string, category: string, lat: number, lng: number, selected_route?: SelectedRoute}>
    places JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- 실행(Execution) 모드를 위한 현재 이동 구간 인덱스 (0부터 시작)
    current_step INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. 자동 업데이트 타임스탬프 트리거 설정
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_journeys_modtime
    BEFORE UPDATE ON journeys
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

-- 3. RLS (Row Level Security) 보안 설정
ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자는 자신의 여정만 조회할 수 있습니다." 
    ON journeys FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "사용자는 자신의 여정을 생성할 수 있습니다." 
    ON journeys FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "사용자는 자신의 여정을 수정할 수 있습니다." 
    ON journeys FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "사용자는 자신의 여정을 삭제할 수 있습니다." 
    ON journeys FOR DELETE USING (auth.uid() = user_id);
```

---

# 컬럼 규격
```json
[
  { "id": "12709706-375546-0", "place_name": "서울역 (출발지)", "address": "서울특별시 중구 한강대로 405", "category": "교통편 > 기차역 > KTX역", "lat": 37.5546, "lng": 126.9706 },
  { "id": "12709753-375599-1", "place_name": "숭례문 (경유지)", "address": "서울특별시 중구 세종대로 40", "category": "문화재 > 성 > 대문", "lat": 37.5599, "lng": 126.9753, "selected_route": { "destId": "12709882-375511-2", "id": "public-0", "type": "public", "name": "1호선", "duration": 5, "fare": 1350, "isFareEstimated": false, "isIntercity": false, "steps": [...], "pathPoints": [...] } },
  { "id": "12709882-375511-2", "place_name": "남산서울타워 (목적지)", "address": "서울특별시 용산구 남산공원길 105", "category": "여행 > 관광명소 > 전망대", "lat": 37.5511, "lng": 126.9882 }
]
```

---

# 타입 정의 (`src/types/journey.ts`)

```typescript
// ─── 경로 안내 관련 타입 ───

export interface DirectionStep {
  type: 'walk' | 'subway' | 'bus' | 'car' | 'train' | 'expressbus';
  name: string;
  duration: number;       // 소요시간 (분)
  color?: string;         // 노선 색상 (예: '#0052A4')
  pathPoints?: { lat: number; lng: number }[];
  startName?: string;     // 탑승 정류장/역명
  endName?: string;       // 하차 정류장/역명
  headsign?: string;      // 열차 행선지 (기차 노선용)
  wayCode?: number;       // 상행/하행 코드 (지하철 실시간 조회용)
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
}

export interface RouteGuideNode {
  instructions: string;   // 안내 텍스트 (예: '우회전', '직진 200m')
  distance: number;       // 거리 (m)
  duration: number;       // 소요시간 (ms)
}

export interface SelectedRoute {
  destId: string;          // 목적지 place.id
  id: string;              // 대안 아이디 (public-0, car-trafast, taxi, walk 등)
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;        // 소요시간 (분)
  fare: number;            // 요금 (원)
  taxiFare?: number;       // 택시 요금 (원)
  distance?: number;       // 주행 거리 (km)
  isFareEstimated?: boolean; // 요금 추정 여부 (장거리 노선 등)
  isIntercity?: boolean;     // 기차/시외 구간 포함 여부
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
}

// ─── 장소 & 여정 타입 ───

export interface Place {
  id: string;              // 고유 식별자 (nanoid 또는 mapx-mapy-idx 조합 등)
  place_name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  selected_route?: SelectedRoute;  // 사용자가 선택한 다음 장소까지의 이동 경로
}

export type TransportType = 'public' | 'car' | 'walk';

export interface Journey {
  id: string;
  user_id?: string;
  title: string;
  transport_type: TransportType;
  journey_date: string;
  places: Place[];           // JSONB가 파싱되어 가벼운 객체 배열로 매핑됨
  current_step: number;      // 현재 유저가 진행 중인 구간 인덱스 (0이면 places[0] -> places[1] 이동 중)
  created_at?: string;
  updated_at?: string;
}

export interface CreateJourneyInput {
  title: string;
  transport_type: TransportType;
  journey_date: string;
}

// ─── API 응답 타입 ───

export interface DirectionResult {
  id: string;
  type: 'public' | 'car' | 'taxi' | 'walk' | 'bicycle' | 'kickboard';
  name: string;
  duration: number;        // 소요시간 (분)
  fare: number;            // 요금 (원)
  taxiFare?: number;       // 택시 요금 (원)
  distance?: number;       // 주행 거리 (km)
  isFareEstimated?: boolean; // 요금 추정 여부
  isIntercity?: boolean;     // 기차/시외 구간 포함 여부
  steps: DirectionStep[];
  pathPoints: { lat: number; lng: number }[];
  guide?: RouteGuideNode[];
}

export interface DirectionsApiResponse {
  public: DirectionResult[];  // 대중교통 대안 경로 목록
  car: DirectionResult[];     // 차량 대안 경로 목록
  walk: DirectionResult[];    // 도보/자전거/킥보드 대안 경로 목록
}

// ─── UI 상태 타입 ───

export interface LatLngBoundsLiteral {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

export interface FocusedSegment {
  originId: string;   // 출발 장소 ID
  destId: string;     // 도착 장소 ID
}

export interface FocusedStep {
  originId: string;
  destId: string;
  stepIndex: number;  // 해당 세그먼트 내 step 인덱스
  subType?: 'start' | 'end' | 'dest';  // 탑승/하차/도착지 세부 포커스 타입
}

// ─── 실시간 교통 정보 타입 ───

export interface SubwayArrival {
  subwayId: string;         // 지하철 노선 코드 (예: '1001')
  updnLine: string;         // 상행/하행 (예: '상행', '하행')
  trainNo: string;          // 열차 번호
  statnNm: string;          // 역명
  arvlMsg2: string;         // 도착 메시지 원문 (예: '서울역 진입', '[2]전역 출발')
  recptnDt: string;         // 수신 시각
  statusText: string;       // 가공된 상태 텍스트 (예: '3분 [2전역]')
  minutesLeft: number;      // 도착 예상 분
  arrivalTime: string;      // 도착 예상 시각 (HH:mm)
  isApproaching: boolean;   // 곧 도착 여부
  isRealtime?: boolean;     // 실시간 데이터 여부 (false면 시간표 기반)
}

export interface BusArrival {
  busNo: string;            // 버스 번호
  stationName: string;      // 정류소명
  predictTime1: number;     // 첫 번째 버스 도착 예정 시간 (분)
  stationNum1: number;      // 첫 번째 버스 남은 정류소 수
  predictTime2?: number;    // 두 번째 버스 도착 예정 시간 (분)
  stationNum2?: number;     // 두 번째 버스 남은 정류소 수
  statusText1: string;      // 첫 번째 버스 상태 텍스트
  statusText2?: string;     // 두 번째 버스 상태 텍스트
  isApproaching1: boolean;  // 첫 번째 버스 곧 도착 여부
  isApproaching2?: boolean; // 두 번째 버스 곧 도착 여부
}
```