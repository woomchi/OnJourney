import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

const migrationsDir = join(rootDir, 'supabase', 'migrations');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(`
[오류] DATABASE_URL 환경 변수가 없습니다.

1. Supabase Dashboard → Project Settings → Database
2. "Connection string" → URI 탭에서 연결 문자열 복사
3. .env.local 파일에 아래 한 줄 추가:

   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

4. 다시 실행: npm run db:setup

── 또는 Supabase SQL Editor에서 아래 마이그레이션 파일들을 순서대로 직접 실행 ──
${
  existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => `  - supabase/migrations/${f}`)
        .join('\n')
    : '  - supabase/migrations/*.sql'
}
`);
  process.exit(1);
}

if (!existsSync(migrationsDir)) {
  console.error('[오류] migrations 디렉토리를 찾을 수 없습니다:', migrationsDir);
  process.exit(1);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (migrationFiles.length === 0) {
  console.log('[알림] 실행할 마이그레이션 파일이 없습니다.');
  process.exit(0);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('🔗 데이터베이스에 연결되었습니다.');
  console.log(`🚀 총 ${migrationFiles.length}개의 마이그레이션을 순차 적용합니다...\n`);

  for (const file of migrationFiles) {
    const filePath = join(migrationsDir, file);
    const sql = readFileSync(filePath, 'utf8');
    
    console.log(`⏳ 실행 중: ${file}`);
    await client.query(sql);
    console.log(`✓ 완료: ${file}`);
  }

  console.log('\n✨ 모든 DB 마이그레이션 및 RLS 정책이 성공적으로 동기화되었습니다.');
} catch (error) {
  console.error('\n[오류] DB 마이그레이션 적용 실패:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}

