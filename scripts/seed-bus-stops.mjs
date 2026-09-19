import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const envPath = join(rootDir, '.env.local');

// 1. .env.local 로드
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

const csvPath = join(rootDir, 'data', '국토교통부_전국 버스정류장 위치정보_20251031.csv');
const isDryRun = process.argv.includes('--dry-run');
const batchSize = 1500;

if (!existsSync(csvPath)) {
  console.error('[오류] 버스 정류장 CSV 파일이 존재하지 않습니다:', csvPath);
  process.exit(1);
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

async function run() {
  console.log('🚀 [전국 버스 정류소 위치정보 시딩 시작]');
  console.log(`📁 CSV 파일 경로: ${csvPath}`);
  if (isDryRun) {
    console.log('🧪 [DRY-RUN 모드] 데이터베이스에 쓰지 않고 유효성만 검증합니다.');
  }

  console.log('📖 CSV 파일 디코딩 중 (EUC-KR)...');
  const buf = readFileSync(csvPath);
  const decoder = new TextDecoder('euc-kr');
  const text = decoder.decode(buf);
  const lines = text.split(/\r?\n/);
  console.log(`📊 전체 라인 수: ${lines.length.toLocaleString()}건`);

  const validRecords = [];
  let outOfBoundsCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    if (cols.length !== 9) continue;

    const [nodeId, nodeNm, latStr, lngStr, , arsNo, cityCd, cityName, adminNm] = cols;
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng) || lat < 33.0 || lat > 39.5 || lng < 124.0 || lng > 132.5) {
      outOfBoundsCount++;
      continue;
    }

    validRecords.push({
      node_id: nodeId,
      node_nm: nodeNm,
      lat,
      lng,
      ars_no: arsNo && arsNo !== '-' ? arsNo : null,
      city_cd: cityCd,
      city_name: cityName || null,
      admin_nm: adminNm || null,
    });
  }

  console.log(`✅ 유효 데이터 추출 완료: ${validRecords.length.toLocaleString()}건 (좌표 이상치 제외: ${outOfBoundsCount}건)`);

  if (isDryRun) {
    console.log('🎉 [DRY-RUN 완료] 정상적으로 시딩 준비가 완료되었습니다.');
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (databaseUrl) {
    console.log('🔗 PostgreSQL 직접 연결(DATABASE_URL)로 고속 배치 삽입을 시작합니다.');
    const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    const client = await pool.connect();

    try {
      let inserted = 0;
      const startTime = Date.now();

      for (let i = 0; i < validRecords.length; i += batchSize) {
        const chunk = validRecords.slice(i, i + batchSize);
        
        // 다중 행 INSERT 쿼리 빌드
        const valuePlaceholders = [];
        const params = [];
        let pIdx = 1;

        for (const row of chunk) {
          valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          params.push(row.node_id, row.node_nm, row.lat, row.lng, row.ars_no, row.city_cd, row.city_name, row.admin_nm);
        }

        const query = `
          INSERT INTO bus_stops (node_id, node_nm, lat, lng, ars_no, city_cd, city_name, admin_nm)
          VALUES ${valuePlaceholders.join(', ')}
          ON CONFLICT (node_id) DO UPDATE SET
            node_nm = EXCLUDED.node_nm,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            ars_no = EXCLUDED.ars_no,
            city_cd = EXCLUDED.city_cd,
            city_name = EXCLUDED.city_name,
            admin_nm = EXCLUDED.admin_nm;
        `;

        await client.query(query, params);
        inserted += chunk.length;

        const percent = ((inserted / validRecords.length) * 100).toFixed(1);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r진행률: ${percent}% (${inserted.toLocaleString()}/${validRecords.length.toLocaleString()}건) [${elapsedSec}s]`);
      }

      console.log('\n✨ [시딩 완료] 모든 버스 정류소가 성공적으로 데이터베이스에 저장되었습니다.');
    } finally {
      client.release();
      await pool.end();
    }
  } else if (supabaseUrl && serviceRoleKey) {
    console.log('🔗 Supabase REST API (Service Role)로 분할 삽입을 시작합니다.');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let inserted = 0;
    const startTime = Date.now();
    const restBatchSize = 1000;

    for (let i = 0; i < validRecords.length; i += restBatchSize) {
      const chunk = validRecords.slice(i, i + restBatchSize);
      const { error } = await supabase.from('bus_stops').upsert(chunk, { onConflict: 'node_id' });

      if (error) {
        console.error(`\n[오류] 배치 ${i} 삽입 실패:`, error.message);
        throw error;
      }

      inserted += chunk.length;
      const percent = ((inserted / validRecords.length) * 100).toFixed(1);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r진행률: ${percent}% (${inserted.toLocaleString()}/${validRecords.length.toLocaleString()}건) [${elapsedSec}s]`);
    }

    console.log('\n✨ [시딩 완료] Supabase에 모든 정류소가 성공적으로 저장되었습니다.');
  } else {
    console.error(`
[오류] 데이터베이스 연결 정보가 설정되지 않았습니다.
.env.local에 다음 중 하나를 설정해 주세요:
1. DATABASE_URL="postgresql://postgres.[REF]:[PW]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
2. NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY
`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n[치명적 오류]:', err);
  process.exit(1);
});
