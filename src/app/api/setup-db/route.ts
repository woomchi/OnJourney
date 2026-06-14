import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import pg from 'pg';

const SETUP_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20240614000000_create_journeys.sql'),
  'utf8',
);

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      {
        error: 'DATABASE_URL이 설정되지 않았습니다.',
        hint: 'Supabase Dashboard → Database → Connection string을 .env.local에 추가하세요.',
      },
      { status: 500 },
    );
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(SETUP_SQL);
    return NextResponse.json({ success: true, message: 'journeys 테이블이 생성되었습니다.' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'DB 설정 실패' },
      { status: 500 },
    );
  } finally {
    await client.end();
  }
}
