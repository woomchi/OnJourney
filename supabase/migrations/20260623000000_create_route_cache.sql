CREATE TABLE IF NOT EXISTS route_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  origin_lat NUMERIC NOT NULL,
  origin_lng NUMERIC NOT NULL,
  dest_lat NUMERIC NOT NULL,
  dest_lng NUMERIC NOT NULL,
  route_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS route_cache_coords_idx ON route_cache(origin_lat, origin_lng, dest_lat, dest_lng);

-- TTL 적용을 위한 주기적인 정리 작업은 애플리케이션 레벨(조회 시 7일 경과 데이터 무시 및 덮어쓰기)에서 처리하거나 
-- pg_cron이 지원되는 환경에서 cron job으로 설정 가능합니다. 여기서는 애플리케이션 단에서 7일 지난 데이터를 갱신하도록 구성합니다.

-- RLS 설정 및 정책 추가
ALTER TABLE route_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select from route_cache" ON route_cache;
CREATE POLICY "Anyone can select from route_cache" ON route_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert into route_cache" ON route_cache;
CREATE POLICY "Anyone can insert into route_cache" ON route_cache FOR INSERT WITH CHECK (true);

