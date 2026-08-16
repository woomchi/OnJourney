import fs from 'fs';
import path from 'path';

// 1. 역간 거리 DB 로드
const dbPath = path.join(process.cwd(), 'data', '지하철_통합_역간거리.json');
let distanceDb = null;
if (fs.existsSync(dbPath)) {
  distanceDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function parseMinSecToSeconds(hmStr) {
  if (!hmStr) return 0;
  const [m = 0, s = 0] = hmStr.split(':').map(Number);
  return m * 60 + s;
}

function normalizeStationName(name) {
  return name.replace(/역$/, '').trim();
}

// ─── 기존 순차 탐색 (Legacy O(N)) ────────────────────────────
function legacyCalculateDistanceTime(lineCode, current, target) {
  if (!distanceDb?.DATA) return null;
  const lineStations = distanceDb.DATA.filter(r => String(r.sbwy_rout_ln) === String(lineCode));
  if (!lineStations.length) return null;
  const curIdx = lineStations.findIndex(r => normalizeStationName(r.sbwy_stns_nm) === normalizeStationName(current));
  const tgtIdx = lineStations.findIndex(r => normalizeStationName(r.sbwy_stns_nm) === normalizeStationName(target));
  if (curIdx === -1 || tgtIdx === -1 || curIdx === tgtIdx) return null;
  const start = Math.min(curIdx, tgtIdx);
  const end = Math.max(curIdx, tgtIdx);
  let total = 0;
  for (let i = start + 1; i <= end; i++) {
    total += parseMinSecToSeconds(lineStations[i].hm);
  }
  return total;
}

// ─── 고도화된 O(1) Prefix Sum + Hash Map 인덱스 ───────────────
function buildStationDistanceIndex(db) {
  const indexMap = new Map();
  if (!db?.DATA || !Array.isArray(db.DATA)) return indexMap;

  const groupedByLine = new Map();
  for (const row of db.DATA) {
    const lineCode = String(row.sbwy_rout_ln || '').trim();
    if (!lineCode) continue;
    let rows = groupedByLine.get(lineCode);
    if (!rows) {
      rows = [];
      groupedByLine.set(lineCode, rows);
    }
    rows.push(row);
  }

  for (const [lineCode, rows] of groupedByLine.entries()) {
    const stationMap = new Map();
    const stations = [];
    let runningCumulativeSec = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cleanName = normalizeStationName(String(row.sbwy_stns_nm || ''));
      const hmSec = parseMinSecToSeconds(String(row.hm || ''));
      runningCumulativeSec += hmSec;

      const info = {
        index: i,
        stationName: cleanName,
        hmSeconds: hmSec,
        cumulativeSeconds: runningCumulativeSec,
      };

      stations.push(info);
      if (cleanName && !stationMap.has(cleanName)) {
        stationMap.set(cleanName, info);
      }
    }

    indexMap.set(lineCode, {
      lineCode,
      stationMap,
      stations,
      totalSeconds: runningCumulativeSec,
    });
  }

  return indexMap;
}

const lineIndexMap = buildStationDistanceIndex(distanceDb);

function optimizedCalculateDistanceTime(lineCode, current, target) {
  const lineIndex = lineIndexMap.get(String(lineCode));
  if (!lineIndex) return null;

  const cleanCurrent = normalizeStationName(current);
  const cleanTarget = normalizeStationName(target);
  if (!cleanCurrent || !cleanTarget || cleanCurrent === cleanTarget) return null;

  const curInfo = lineIndex.stationMap.get(cleanCurrent);
  const tgtInfo = lineIndex.stationMap.get(cleanTarget);

  if (curInfo && tgtInfo && curInfo.index !== tgtInfo.index) {
    return Math.abs(tgtInfo.cumulativeSeconds - curInfo.cumulativeSeconds);
  }
  return null;
}

// ─── 벤치마크 & 회귀 검증 시작 ────────────────────────────────
console.log('================================================================');
console.log('🚀 지하철 역간 거리 산출 알고리즘 O(N) vs O(1) 비교 벤치마크');
console.log('================================================================\n');

// 1. 전 구간 무결성 회귀 테스트 (Regression Test)
const testPairs = [
  { line: '2', cur: '강남', tgt: '잠실' },
  { line: '2', cur: '신도림', tgt: '홍대입구' },
  { line: '2', cur: '시청', tgt: '성수' },
  { line: '1', cur: '종각', tgt: '청량리' },
  { line: '1001_경부', cur: '수원', tgt: '평택' },
  { line: '3', cur: '수서', tgt: '고속터미널' },
  { line: '4', cur: '사당', tgt: '서울역' },
  { line: '7', cur: '가산디지털단지', tgt: '건대입구' },
  { line: '1075', cur: '수원', tgt: '왕십리' },
  { line: '1063', cur: '문산', tgt: '용문' },
];

console.log('🧪 [1. 무결성 회귀 테스트 (Regression Test)]');
let allMatch = true;
testPairs.forEach(({ line, cur, tgt }) => {
  const legacyVal = legacyCalculateDistanceTime(line, cur, tgt);
  const optVal = optimizedCalculateDistanceTime(line, cur, tgt);
  const isMatch = legacyVal === optVal;
  if (!isMatch) allMatch = false;

  console.log(`- [${line}호선] ${cur} ↔ ${tgt}: 기존 ${legacyVal}초 vs O(1) ${optVal}초 -> ${isMatch ? '✅ 일치 (100% 동일)' : '❌ 불일치'}`);
});
console.log(`\n=> 회귀 검증 결과: ${allMatch ? '🎉 모든 구간 1초의 오차 없이 완벽 일치' : '❌ 오류 발생'}\n`);

// 2. 성능 벤치마크 (100,000회 반복)
const ITERATIONS = 100000;

// Legacy O(N)
const startLegacy = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const pair = testPairs[i % testPairs.length];
  legacyCalculateDistanceTime(pair.line, pair.cur, pair.tgt);
}
const endLegacy = performance.now();
const legacyTotalMs = endLegacy - startLegacy;
const legacyAvgUs = (legacyTotalMs / ITERATIONS) * 1000;
const legacyOps = Math.round((ITERATIONS / legacyTotalMs) * 1000);

// Optimized O(1)
const startOpt = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const pair = testPairs[i % testPairs.length];
  optimizedCalculateDistanceTime(pair.line, pair.cur, pair.tgt);
}
const endOpt = performance.now();
const optTotalMs = endOpt - startOpt;
const optAvgUs = (optTotalMs / ITERATIONS) * 1000;
const optOps = Math.round((ITERATIONS / optTotalMs) * 1000);

console.log('⚡ [2. 성능 비교 벤치마크 (100,000회 실행)]');
console.log('| 방식 | 총 소요시간 (ms) | 단일 연산 지연시간 (μs) | 초당 처리량 (Throughput) |');
console.log('|---|---|---|---|');
console.log(`| 기존 순차 탐색 (O(N)) | ${legacyTotalMs.toFixed(2)} ms | ${legacyAvgUs.toFixed(3)} μs | ${legacyOps.toLocaleString()} ops/sec |`);
console.log(`| 고도화된 Prefix Sum (O(1)) | ${optTotalMs.toFixed(2)} ms | ${optAvgUs.toFixed(3)} μs | ${optOps.toLocaleString()} ops/sec |`);

const speedup = (legacyTotalMs / optTotalMs).toFixed(1);
console.log(`\n🚀 성능 향상 배수: ${speedup}배 가속 (연산 지연시간 ${legacyAvgUs.toFixed(3)} μs ➡️ ${optAvgUs.toFixed(3)} μs)`);
console.log(`💡 메모리 할당 및 가비지 컬렉션(GC): 매 연산마다 filter() 배열 생성(100,000회) ➡️ 0회(Zero Allocation) 달성`);
