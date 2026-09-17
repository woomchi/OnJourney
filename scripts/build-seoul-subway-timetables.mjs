import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';

const CSV_PATH = path.join(process.cwd(), 'data', '서울교통공사_도시철도열차운행시각표(250930).csv');
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'data', 'subway', 'timetables');
const GZ_OUTPUT_PATH = path.join(OUTPUT_DIR, 'seoul_subway_timetables.json.gz');
const JSON_OUTPUT_PATH = path.join(OUTPUT_DIR, 'seoul_subway_timetables.json');

// 이전 분할 파일 디렉터리 (정리용)
const OLD_STATIONS_DIR = path.join(OUTPUT_DIR, 'seoul');

/**
 * 시간 문자열("HH:mm:ss" 또는 "HH:mm")을 자정(05:00 시작) 기준 운행 분으로 변환
 */
function toOperationalMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const hour = parts[0] || 0;
  const min = parts[1] || 0;
  const adjustedHour = hour < 5 ? hour + 24 : hour;
  return adjustedHour * 60 + min;
}

async function buildSeoulTimetables() {
  console.log('🚀 서울교통공사 열차운행시각표 단일 해시테이블 데이터베이스 구축 시작...');
  console.log(`- 소스 파일: ${CSV_PATH}`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ 소스 CSV 파일을 찾을 수 없습니다: ${CSV_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  const stationsMap = new Map();
  const stationLinesMap = new Map();

  for await (const line of rl) {
    if (lineCount === 0) {
      lineCount++;
      continue;
    }
    lineCount++;

    const parts = line.replace(/^\uFEFF/, '').split(',');
    if (parts.length < 12) continue;

    const lineNum = parts[1].replace(/"/g, '').trim();
    const stationName = parts[3].replace(/"/g, '').trim();
    const weekTag = parts[4].replace(/"/g, '').trim();
    if (weekTag !== 'DAY' && weekTag !== 'SAT' && weekTag !== 'END') continue;

    const inoutTag = parts[5].replace(/"/g, '').trim();
    if (!inoutTag) continue;

    const gubhang = parts[6].replace(/"/g, '').trim() === '1' ? 1 : 0;
    const trainNo = parts[7].replace(/"/g, '').trim();
    const stt = parts[8].replace(/"/g, '').trim();
    const edt = parts[9].replace(/"/g, '').trim();
    const dest = parts[11].replace(/"/g, '').trim();

    const rawTime = edt || stt;
    if (!rawTime) continue;
    const timeFormatted = rawTime.substring(0, 5);

    if (!stationsMap.has(stationName)) {
      stationsMap.set(stationName, {});
      stationLinesMap.set(stationName, new Set());
    }

    const stnData = stationsMap.get(stationName);
    const lineKey = `${lineNum}_${weekTag}_${inoutTag}`;
    if (!stnData[lineKey]) {
      stnData[lineKey] = [];
    }

    const exists = stnData[lineKey].some((item) => item.no === trainNo);
    if (!exists) {
      stnData[lineKey].push({
        no: trainNo,
        t: timeFormatted,
        d: dest,
        e: gubhang,
      });
    }

    stationLinesMap.get(stationName).add(lineNum);

    if (lineCount % 100000 === 0) {
      console.log(`  .. ${lineCount.toLocaleString()}행 처리 중..`);
    }
  }

  console.log(`✅ 총 ${lineCount.toLocaleString()}행 파싱 완료! (${stationsMap.size}개 역 발견)`);
  console.log('🔄 열차 시각 순차 정렬 및 해시테이블 직렬화 진행 중...');

  const stationIndexMeta = {};
  const dataObject = {};

  for (const [stnName, lineGroups] of stationsMap.entries()) {
    for (const groupKey of Object.keys(lineGroups)) {
      lineGroups[groupKey].sort((a, b) => {
        return toOperationalMinutes(a.t) - toOperationalMinutes(b.t);
      });
    }

    dataObject[stnName] = lineGroups;
    stationIndexMeta[stnName] = Array.from(stationLinesMap.get(stnName) || []).sort();
  }

  const unifiedDatabase = {
    meta: {
      updatedAt: new Date().toISOString(),
      totalStations: stationsMap.size,
      stationLines: stationIndexMeta,
    },
    data: dataObject,
  };

  const jsonString = JSON.stringify(unifiedDatabase);
  console.log(`📦 직렬화 완료 (비압축 JSON 크기: ${(jsonString.length / (1024 * 1024)).toFixed(2)} MB)`);

  // 1. 고효율 Gzip 단일 압축 데이터베이스 저장 (~1.46 MB)
  const gzippedBuffer = zlib.gzipSync(jsonString, { level: 9 });
  fs.writeFileSync(GZ_OUTPUT_PATH, gzippedBuffer);
  console.log(`🗜️ 단일 압축 DB 생성 완료: ${(gzippedBuffer.length / (1024 * 1024)).toFixed(2)} MB (${GZ_OUTPUT_PATH})`);

  // 2. 불필요한 비압축 JSON 파일 제거
  if (fs.existsSync(JSON_OUTPUT_PATH)) {
    fs.unlinkSync(JSON_OUTPUT_PATH);
  }

  // 3. 기존 수백 개로 쪼개졌던 임시 폴더 삭제 (정리)
  if (fs.existsSync(OLD_STATIONS_DIR)) {
    console.log('🧹 기존 405개 분할 파일 폴더(src/data/subway/timetables/seoul) 정리 중...');
    fs.rmSync(OLD_STATIONS_DIR, { recursive: true, force: true });
  }

  console.log(`🎉 데이터베이스 구축 완료: ${GZ_OUTPUT_PATH}`);
}

buildSeoulTimetables().catch((err) => {
  console.error('❌ ETL 실패:', err);
  process.exit(1);
});
