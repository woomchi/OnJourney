-- On-Journey: journeys 테이블에 공개 공유(is_public) 컬럼 추가 및 RLS 정책 확장

-- 1. is_public 컬럼 추가 (기본값 false)
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- 2. RLS 정책 업데이트: 본인 소유이거나 is_public = true인 경우 SELECT 허용
DROP POLICY IF EXISTS "사용자는 자신의 여정만 조회할 수 있습니다." ON journeys;
DROP POLICY IF EXISTS "여정 SELECT 정책" ON journeys;

CREATE POLICY "여정 SELECT 정책"
    ON journeys FOR SELECT
    USING (auth.uid() = user_id OR is_public = true);

-- PostgREST schema cache 갱신
NOTIFY pgrst, 'reload schema';
