-- 1. PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. 전국 버스정류장 위치정보 테이블 생성
CREATE TABLE IF NOT EXISTS bus_stops (
    node_id VARCHAR(30) PRIMARY KEY,                    -- TAGO 공공 정류소 ID (예: DJB8001001, GGB200000001 등)
    node_nm VARCHAR(100) NOT NULL,                      -- 정류장 명칭
    lat DOUBLE PRECISION NOT NULL,                      -- WGS84 위도 (GPS_LATI)
    lng DOUBLE PRECISION NOT NULL,                      -- WGS84 경도 (GPS_LONG)
    ars_no VARCHAR(20),                                 -- 모바일단축번호 / ARS 번호
    city_cd VARCHAR(10) NOT NULL,                       -- TAGO 도시코드 (예: 31, 25 등)
    city_name VARCHAR(50),                              -- 지자체 도시명 (예: 경기도 수원시)
    admin_nm VARCHAR(50),                               -- 관리도시명 (예: 경기BIS)
    geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 인덱스 설정
CREATE INDEX IF NOT EXISTS idx_bus_stops_geom ON bus_stops USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_bus_stops_name ON bus_stops(node_nm);
CREATE INDEX IF NOT EXISTS idx_bus_stops_city_cd ON bus_stops(city_cd);
CREATE INDEX IF NOT EXISTS idx_bus_stops_ars_no ON bus_stops(ars_no);

-- 4. RLS 보안 설정 (누구나 읽기 허용)
ALTER TABLE bus_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 정류소 정보를 조회할 수 있습니다." 
    ON bus_stops FOR SELECT USING (true);

-- 5. 초고속 근접 정류소 탐색 함수 (PostGIS RPC)
CREATE OR REPLACE FUNCTION find_nearest_bus_stops(
    target_lat DOUBLE PRECISION,
    target_lng DOUBLE PRECISION,
    target_name TEXT DEFAULT NULL,
    radius_meters DOUBLE PRECISION DEFAULT 150.0,
    limit_count INT DEFAULT 5
)
RETURNS TABLE (
    node_id VARCHAR(30),
    node_nm VARCHAR(100),
    ars_no VARCHAR(20),
    city_cd VARCHAR(10),
    city_name VARCHAR(50),
    distance_meters DOUBLE PRECISION
) AS $$
DECLARE
    clean_target TEXT;
BEGIN
    clean_target := TRIM(COALESCE(target_name, ''));
    
    RETURN QUERY
    SELECT 
        b.node_id,
        b.node_nm,
        b.ars_no,
        b.city_cd,
        b.city_name,
        ST_Distance(b.geom::geography, ST_SetSRID(ST_MakePoint(target_lng, target_lat), 4326)::geography) AS distance_meters
    FROM bus_stops b
    WHERE ST_DWithin(b.geom::geography, ST_SetSRID(ST_MakePoint(target_lng, target_lat), 4326)::geography, radius_meters)
    ORDER BY 
        -- 정류장명 일치 우선 가중치 (완전일치 0, 부분일치 1, 미일치 2), 그 다음 거리순
        CASE 
            WHEN clean_target <> '' AND b.node_nm = clean_target THEN 0
            WHEN clean_target <> '' AND (b.node_nm ILIKE '%' || clean_target || '%' OR clean_target ILIKE '%' || b.node_nm || '%') THEN 1
            ELSE 2 
        END ASC,
        distance_meters ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;
