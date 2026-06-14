# On-Journey Database Schema & Data Structure (MVP)

본 문서는 실행(Execution) 중심의 다중 경유지 경로 최적화 서비스 '온저니(On-Journey)'의 Supabase 데이터베이스 스키마 및 프론트엔드 데이터 구조 정의서입니다. AI 바이브 코딩 시 데이터 흐름의 기준점(Ground Truth)으로 사용합니다.

---

## 1. Architecture Philosophy (설계 철학)
* **배열 기반 순서 보존:** 장소의 순서 제어를 위해 테이블을 쪼개는 대신, PostgreSQL의 `JSONB` 배열 구조를 채택합니다. 배열의 인덱스(Index)가 곧 방문 순서가 되므로 드래그 앤 드롭 시 정렬 인덱스 재계산 오버헤드를 없애고 프론트엔드-백엔드 간 동기화를 단순화합니다.
* **실행(Execution) 중심 추적:** 여정의 계획에 그치지 않고 실제 이동 단계를 추적하기 위해 `current_step` 인덱스를 활용하여 '현재 이동 중인 구간'을 명확히 정의합니다.

---

## 2. Supabase DDL (SQL Script)

Supabase SQL Editor에 그대로 복사하여 실행할 수 있는 테이블 생성 및 보안(RLS) 설정 스크립트입니다.

```sql
-- 1. 여정 마스터 및 장소 통합 테이블 생성
CREATE TABLE journeys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,                                    -- 여정 이름
    transport_type TEXT NOT NULL DEFAULT 'public',          -- 기본 이동 수단 ('public': 대중교통 / 'car': 차량)
    journey_date DATE NOT NULL,                             -- 여정 날짜
    
    -- 장소 리스트를 순서가 보존되는 JSONB 배열로 통째로 저장
    -- 구조: Array<{place_name: string, lat: number, lng: number}>
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

--

# 컬럼 규격
[
  { "place_name": "서울역 (출발지)", "lat": 37.5546, "lng": 126.9706 },
  { "place_name": "숭례문 (경유지)", "lat": 37.5599, "lng": 126.9753 },
  { "place_name": "남산서울타워 (목적지)", "lat": 37.5511, "lng": 126.9882 }
]

# 조합 규격
export interface Place {
  place_name: string;
  lat: number;
  lng: number;
}

export interface Journey {
  id: string;
  user_id: string;
  title: string;
  transport_type: 'public' | 'car';
  journey_date: string;
  places: Place[];       // JSONB가 파싱되어 가벼운 객체 배열로 매핑됨
  current_step: number;  // 현재 유저가 진행 중인 구간 인덱스 (0이면 places[0] -> places[1] 이동 중)
  created_at: string;
  updated_at: string;
}