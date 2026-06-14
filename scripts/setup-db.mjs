import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const envPath = join(rootDir, '.env.local');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const sqlPath = join(rootDir, 'supabase', 'migrations', '20240614000000_create_journeys.sql');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(`
[오류] DATABASE_URL 환경 변수가 없습니다.

1. Supabase Dashboard → Project Settings → Database
2. "Connection string" → URI 탭에서 연결 문자열 복사
3. .env.local 파일에 아래 한 줄 추가:

   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

4. 다시 실행: npm run db:setup

── 또는 Supabase SQL Editor에서 직접 실행 ──
파일: supabase/migrations/20240614000000_create_journeys.sql
`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log('✓ journeys 테이블 및 RLS 정책이 설정되었습니다.');
  console.log('  브라우저를 새로고침한 뒤 여정 생성을 다시 시도해주세요.');
} catch (error) {
  console.error('[오류] DB 설정 실패:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}
