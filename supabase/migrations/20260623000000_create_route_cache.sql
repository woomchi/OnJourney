CREATE TABLE IF NOT EXISTS route_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  origin_lat NUMERIC NOT NULL,
  origin_lng NUMERIC NOT NULL,
  dest_lat NUMERIC NOT NULL,
  dest_lng NUMERIC NOT NULL,
  route_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT route_cache_coords_unique UNIQUE (origin_lat, origin_lng, dest_lat, dest_lng)
);

-- 인덱스 생성 (UNIQUE 제약조건으로 자동 생성되지만 기존 인덱스 명시 및 역호환 보장)
CREATE INDEX IF NOT EXISTS route_cache_created_at_idx ON route_cache(created_at);

-- RLS 설정 및 정책 추가
ALTER TABLE route_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select from route_cache" ON route_cache;
CREATE POLICY "Anyone can select from route_cache" ON route_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert into route_cache" ON route_cache;
CREATE POLICY "Anyone can insert into route_cache" ON route_cache FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update route_cache" ON route_cache;
CREATE POLICY "Anyone can update route_cache" ON route_cache FOR UPDATE USING (true) WITH CHECK (true);

-- PostgREST schema cache 갱신
NOTIFY pgrst, 'reload schema';

