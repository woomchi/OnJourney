-- On-Journey: journeys 테이블 및 RLS 설정 (idempotent)

CREATE TABLE IF NOT EXISTS journeys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    transport_type TEXT NOT NULL DEFAULT 'public',
    journey_date DATE NOT NULL,
    places JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_step INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_journeys_modtime ON journeys;
CREATE TRIGGER update_journeys_modtime
    BEFORE UPDATE ON journeys
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();

ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "사용자는 자신의 여정만 조회할 수 있습니다." ON journeys;
CREATE POLICY "사용자는 자신의 여정만 조회할 수 있습니다."
    ON journeys FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 여정을 생성할 수 있습니다." ON journeys;
CREATE POLICY "사용자는 자신의 여정을 생성할 수 있습니다."
    ON journeys FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 여정을 수정할 수 있습니다." ON journeys;
CREATE POLICY "사용자는 자신의 여정을 수정할 수 있습니다."
    ON journeys FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "사용자는 자신의 여정을 삭제할 수 있습니다." ON journeys;
CREATE POLICY "사용자는 자신의 여정을 삭제할 수 있습니다."
    ON journeys FOR DELETE USING (auth.uid() = user_id);

-- PostgREST schema cache 갱신
NOTIFY pgrst, 'reload schema';
