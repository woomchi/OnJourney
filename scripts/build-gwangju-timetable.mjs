/**
 * @fileoverview 광주 도시철도(1호선) 열차시각표 컴파일 스크립트
 *
 * 공공데이터 CSV(data/광주교통공사_열차 시간표 데이터_20221230.csv)를 파싱하여
 * 단일 초경량 압축 인메모리 데이터베이스(gwangju_subway_timetables.json.gz)로 빌드합니다.
 *
 * 실행: node scripts/build-gwangju-timetable.mjs
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────

function normalizeStationName(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\(.*?\)/g, '')   // 괄호 및 부역명 제거 (예: '김대중컨벤션센터(마륵)' -> '김대중컨벤션센터')
    .replace(/\d+$/g, '')       // 끝자리 숫자 제거
    .replace(/역$/g, '')        // 끝자리 '역' 제거
    .trim();
}

function toOperationalMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h = 0, m = 0] = timeStr.split(':').map(Number);
  const adjustedH = h < 5 ? h + 24 : h;
  return adjustedH * 60 + m;
}

const DAY_MAP = {
  '평일': 'WEEKDAY',
  '토요일': 'SATURDAY',
  '휴일': 'HOLIDAY',
  '명절': 'SPECIAL_HOLIDAY',
};

// ─── 메인 컴파일러 ────────────────────────────────────────────────────────────

async function buildGwangjuTimetables() {
  console.log('🚀 광주 도시철도 1호선 시각표 컴파일 시작...');

  const csvFile = path.join(ROOT_DIR, 'data', '광주교통공사_열차 시간표 데이터_20221230.csv');
  const outDir = path.join(ROOT_DIR, 'src', 'data', 'subway', 'timetables');
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(csvFile)) {
    throw new Error(`CSV 파일을 찾을 수 없습니다: ${csvFile}`);
  }

  const rawText = fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, '');
  const lines = rawText.trim().split(/\r?\n/);
  console.log(`📄 총 라인 수: ${lines.length} (헤더 1행 포함)`);

  const stationTimetables = {}; // Record<역명, Record<key, Item[]>>
  const stationLines = {};      // Record<역명, Set<lineId>>
  const line1Stations = new Set();

  function ensureStation(station) {
    if (!stationTimetables[station]) {
      stationTimetables[station] = {};
    }
    if (!stationLines[station]) {
      stationLines[station] = new Set();
    }
  }

  function addEntry(station, key, item) {
    ensureStation(station);
    if (!stationTimetables[station][key]) {
      stationTimetables[station][key] = [];
    }
    stationTimetables[station][key].push(item);
  }

  let skippedCount = 0;
  let parsedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    const parts = row.split(',');
    if (parts.length < 9) {
      skippedCount++;
      continue;
    }

    const rawDay = parts[0].trim();
    const dayType = DAY_MAP[rawDay];
    if (!dayType) {
      skippedCount++;
      continue;
    }

    const rawDir = parts[2].trim();
    // 1: 상행 (평동 방면), 2: 하행 (녹동/소태 방면)
    const direction = rawDir === '1' ? 'UP' : rawDir === '2' ? 'DOWN' : null;
    if (!direction) {
      skippedCount++;
      continue;
    }

    const time = parts[3].trim();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      skippedCount++;
      continue;
    }

    const rawEndName = parts[7].trim();
    const destination = normalizeStationName(rawEndName);

    const rawStName = parts[8].trim();
    const station = normalizeStationName(rawStName);
    if (!station) {
      skippedCount++;
      continue;
    }

    line1Stations.add(station);
    stationLines[station] = stationLines[station] || new Set();
    stationLines[station].add('1');

    const groupKey = `1_${direction}_${dayType}`;

    addEntry(station, groupKey, {
      t: time,
      d: destination,
      e: 0,
    });
    parsedCount++;
  }

  console.log(`✅ 파싱 완료: ${parsedCount.toLocaleString()}건 (스킵: ${skippedCount}건)`);

  // 3. 시간순 정렬, 중복 제거, 열차 식별자 번호 부여
  let totalSchedules = 0;
  for (const stn of Object.keys(stationTimetables)) {
    for (const [key, items] of Object.entries(stationTimetables[stn])) {
      // 시간순 정렬
      items.sort((a, b) => toOperationalMinutes(a.t) - toOperationalMinutes(b.t));

      // 중복 제거 (동일 시간 및 목적지)
      const seen = new Set();
      const uniqueItems = [];
      for (const item of items) {
        const sig = `${item.t}_${item.d}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          uniqueItems.push(item);
        }
      }

      // 열차 번호 부여 (예: 1_UP_WEEKDAY -> G1_UP_001)
      const parts = key.split('_');
      const dirTag = parts[1] || 'UP';
      const dayTag = parts[2] || 'WD';
      const dayAbbr = dayTag === 'WEEKDAY' ? 'W' : dayTag === 'SATURDAY' ? 'S' : dayTag === 'HOLIDAY' ? 'H' : 'M';

      const enriched = uniqueItems.map((item, idx) => ({
        no: `G1_${dirTag === 'UP' ? 'U' : 'D'}${dayAbbr}_${String(idx + 1).padStart(3, '0')}`,
        t: item.t,
        d: item.d,
        e: item.e,
      }));

      stationTimetables[stn][key] = enriched;
      totalSchedules += enriched.length;
    }
  }

  // 4. 최종 데이터베이스 직렬화
  const stationLinesObj = {};
  for (const [stn, linesSet] of Object.entries(stationLines)) {
    stationLinesObj[stn] = Array.from(linesSet);
  }

  const database = {
    meta: {
      updatedAt: '2022-12-30',
      compiledAt: new Date().toISOString(),
      totalStations: Object.keys(stationTimetables).length,
      lines: {
        '1': line1Stations.size,
      },
      stationLines: stationLinesObj,
    },
    data: stationTimetables,
  };

  const jsonStr = JSON.stringify(database);
  const gzBuf = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 });

  const jsonPath = path.join(outDir, 'gwangju_subway_timetables.json');
  const gzPath = path.join(outDir, 'gwangju_subway_timetables.json.gz');

  fs.writeFileSync(jsonPath, jsonStr, 'utf-8');
  fs.writeFileSync(gzPath, gzBuf);

  const jsonKb = (Buffer.byteLength(jsonStr, 'utf-8') / 1024).toFixed(1);
  const gzKb = (gzBuf.length / 1024).toFixed(1);

  console.log('\n======================================================');
  console.log('🎉 광주 도시철도 1호선 통합 시간표 빌드 완료!');
  console.log(`- 총 역 수: ${database.meta.totalStations}개 역`);
  console.log(`  * 1호선: ${database.meta.lines['1']}개 역 (녹동~평동)`);
  console.log(`- 총 스케줄 엔트리: ${totalSchedules.toLocaleString()}건`);
  console.log(`- 비압축 JSON: ${jsonPath} (${jsonKb} KB)`);
  console.log(`- Gzip 압축 DB: ${gzPath} (${gzKb} KB)`);
  console.log('======================================================\n');
}

buildGwangjuTimetables().catch((err) => {
  console.error('❌ 빌드 중 치명적 오류 발생:', err);
  process.exit(1);
});
