import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the generated subway distance JSON directly
const subwayDistances = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/subway_distances.json'), 'utf-8')
);

// Mock implementation of the logic from subwayService.ts to run directly in Node.js
const graph = {};
subwayDistances.forEach((link) => {
  const from = link.from_station;
  const to = link.to_station;
  const time = link.travel_time_sec;

  if (!graph[from]) graph[from] = [];
  graph[from].push({ to, time });
});

const LINE1_SEQUENCE = [
  '서울', '남영', '용산', '노량진', '대방', '영등포', '신도림', '구로', 
  '가산디지털단지', '금천구청', '석수', '관악', '안양', '명학', '금정', 
  '군포', '당정', '의왕', '성균관대', '화서', '수원', '세류', '병점', 
  '세마', '오산대', '오산', '진위', '송탄', '서정리', '평택지제', '평택', 
  '성환', '직산', '두정', '천안'
];

function findMinTravelTime(start, target) {
  const startClean = start.replace(/역$/, '').trim();
  const targetClean = target.replace(/역$/, '').trim();

  if (startClean === targetClean) return 0;
  if (!graph[startClean] || !graph[targetClean]) return null;

  const dist = {};
  dist[startClean] = 0;

  const pq = [{ node: startClean, d: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const curr = pq.shift();

    if (curr.node === targetClean) return curr.d;
    if (curr.d > (dist[curr.node] ?? Infinity)) continue;

    const neighbors = graph[curr.node] || [];
    for (const edge of neighbors) {
      const nextDist = curr.d + edge.time;
      if (dist[edge.to] === undefined || nextDist < dist[edge.to]) {
        dist[edge.to] = nextDist;
        pq.push({ node: edge.to, d: nextDist });
      }
    }
  }

  return dist[targetClean] !== undefined ? dist[targetClean] : null;
}

function extractCurrentStation(arvlMsg2, targetStation, updnLine) {
  const cleanTarget = targetStation.replace(/역$/, '').trim();

  const parenMatch = arvlMsg2.match(/\(([^)]+)\)/);
  if (parenMatch) {
    return parenMatch[1].replace(/역$/, '').trim();
  }

  const suffixMatch = arvlMsg2.match(/^([가-힣a-zA-Z0-9]+)\s*(진입|도착|출발)$/);
  if (suffixMatch) {
    const station = suffixMatch[1].replace(/역$/, '').trim();
    if (station !== '전') return station;
  }

  if (arvlMsg2.includes('전역')) {
    const neighbors = (graph[cleanTarget] || []).map(edge => edge.to);
    if (neighbors.length > 0) {
      if (neighbors.length === 1) return neighbors[0];

      const targetIdx = LINE1_SEQUENCE.indexOf(cleanTarget);
      if (targetIdx !== -1) {
        const isUpLine = updnLine === '상행' || updnLine?.includes('상선') || updnLine?.includes('서울') || updnLine?.includes('청량리');
        const isDownLine = updnLine === '하행' || updnLine?.includes('하선') || updnLine?.includes('신창') || updnLine?.includes('천안') || updnLine?.includes('서동탄');

        if (isUpLine) {
          if (targetIdx + 1 < LINE1_SEQUENCE.length) return LINE1_SEQUENCE[targetIdx + 1];
        } else if (isDownLine) {
          if (targetIdx - 1 >= 0) return LINE1_SEQUENCE[targetIdx - 1];
        }
      }
      return neighbors[0];
    }
  }

  const koreanWords = arvlMsg2.match(/[가-힣]+/g) || [];
  for (const word of koreanWords) {
    const cleanWord = word.replace(/역$/, '').trim();
    if (graph[cleanWord] && cleanWord !== cleanTarget) {
      return cleanWord;
    }
  }

  return '';
}

function calculateSubwayETA(arvlMsg2, recptnDt, targetStation, updnLine) {
  const targetClean = targetStation.replace(/역$/, '').trim();
  const currentStation = extractCurrentStation(arvlMsg2, targetClean, updnLine);
  
  let rawTravelTimeSec = 0;
  let hasValidRoute = false;

  if (currentStation) {
    const routeTime = findMinTravelTime(currentStation, targetClean);
    if (routeTime !== null) {
      rawTravelTimeSec = routeTime;
      hasValidRoute = true;
    }
  }

  if (!hasValidRoute) {
    // Fallback based on remaining stations [N]
    const match = arvlMsg2.match(/\[(\d+)\]/);
    let stationsLeft = null;
    if (match) stationsLeft = parseInt(match[1], 10);
    else if (arvlMsg2.includes('전역')) stationsLeft = 1;
    else if (arvlMsg2.includes('진입') || arvlMsg2.includes('도착')) stationsLeft = 0;

    if (stationsLeft !== null) {
      rawTravelTimeSec = stationsLeft * 120;
      hasValidRoute = true;
    }
  }

  let timeDiffSec = 0;
  if (recptnDt) {
    const formattedDt = recptnDt.replace(' ', 'T');
    const receiptTime = new Date(formattedDt).getTime();
    const currentTime = new Date().getTime();
    if (!isNaN(receiptTime)) {
      timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1000));
    }
  }

  const isDirectlyAtTarget = arvlMsg2.includes(`${targetClean} 진입`) || 
                             arvlMsg2.includes(`${targetClean} 도착`) ||
                             arvlMsg2.includes(`${targetClean} 출발`);
                             
  const correctedRemainingSec = isDirectlyAtTarget ? 0 : Math.max(0, rawTravelTimeSec - timeDiffSec);

  if (correctedRemainingSec === 0 || arvlMsg2.includes('진입') || arvlMsg2.includes('도착') || arvlMsg2.includes('출발')) {
    const detail = arvlMsg2.includes('진입') ? '진입 중' : (arvlMsg2.includes('출발') ? '출발함' : '곧 도착');
    return { statusText: detail, minutesLeft: 0, isApproaching: true };
  }

  const minutesLeft = Math.ceil(correctedRemainingSec / 60);
  return {
    statusText: `약 ${minutesLeft}분 뒤 도착 예정`,
    minutesLeft,
    isApproaching: false,
    rawTravelTimeSec,
    timeDiffSec
  };
}

// =================== RUN TESTS ===================

console.log('Starting Subway ETA algorithm tests...\n');

// Test Case 1: Distance graph path calculation
const distSongtanToByeongjeom = findMinTravelTime('송탄', '병점');
console.log('Test 1: Distance between 송탄 -> 병점 (km * 90s)');
console.log(`  Expected path distance: 15.6km * 90s = 1404s (23.4 minutes)`);
console.log(`  Calculated: ${distSongtanToByeongjeom}s (${(distSongtanToByeongjeom / 60).toFixed(1)} mins)`);
if (distSongtanToByeongjeom === 1404) {
  console.log('  [PASS] Test 1 passed.');
} else {
  console.error('  [FAIL] Test 1 failed.');
}
console.log('');

// Test Case 2: Station Extraction
console.log('Test 2: Station Extraction');
const st1 = extractCurrentStation('[5]번째 전역 (송탄)', '병점역', '하행');
console.log(`  Input: "[5]번째 전역 (송탄)", Target: "병점역" -> Extracted: "${st1}"`);
if (st1 === '송탄') console.log('  [PASS] Case 2.1 passed.');
else console.error('  [FAIL] Case 2.1 failed.');

const st2 = extractCurrentStation('병점 진입', '병점', '하행');
console.log(`  Input: "병점 진입", Target: "병점" -> Extracted: "${st2}"`);
if (st2 === '병점') console.log('  [PASS] Case 2.2 passed.');
else console.error('  [FAIL] Case 2.2 failed.');

const st3 = extractCurrentStation('전역 도착', '병점', '하행'); // 수원 -> 세류 -> 병점 (downbound: prev of 병점 is 세류)
console.log(`  Input: "전역 도착", Target: "병점", Dir: "하행" -> Extracted (Prev Station): "${st3}"`);
if (st3 === '세류') console.log('  [PASS] Case 2.3 passed.');
else console.error('  [FAIL] Case 2.3 failed.');

const st4 = extractCurrentStation('전역 도착', '병점', '상행'); // 천안 -> 세마 -> 병점 (upbound: prev of 병점 is 세마)
console.log(`  Input: "전역 도착", Target: "병점", Dir: "상행" -> Extracted (Prev Station): "${st4}"`);
if (st4 === '세마') console.log('  [PASS] Case 2.4 passed.');
else console.error('  [FAIL] Case 2.4 failed.');
console.log('');

// Test Case 3: Live ETA drift compensation
console.log('Test 3: Drift Compensation (Simulated 2-minute lag)');
// Generate a proper local date format YYYY-MM-DD HH:mm:ss to avoid UTC timezone offset issues
const receiptTime = new Date(Date.now() - 120 * 1000);
const y = receiptTime.getFullYear();
const m = String(receiptTime.getMonth() + 1).padStart(2, '0');
const d = String(receiptTime.getDate()).padStart(2, '0');
const h = String(receiptTime.getHours()).padStart(2, '0');
const min = String(receiptTime.getMinutes()).padStart(2, '0');
const s = String(receiptTime.getSeconds()).padStart(2, '0');
const receiptTimeStr = `${y}-${m}-${d} ${h}:${min}:${s}`;

const etaRes = calculateSubwayETA('[5]번째 전역 (송탄)', receiptTimeStr, '병점', '하행');
console.log(`  Receipt time: ${receiptTimeStr}`);
console.log(`  Cumulative time (raw): ${etaRes.rawTravelTimeSec} seconds`);
console.log(`  Drift latency: ${etaRes.timeDiffSec} seconds`);
console.log(`  Corrected minutes left: ${etaRes.minutesLeft} minutes`);
console.log(`  Status Text: "${etaRes.statusText}"`);

// 1404s (raw) - 120s (drift) = 1284s -> Math.ceil(1284 / 60) = 22 minutes
if (etaRes.minutesLeft === 22) {
  console.log('  [PASS] Test 3 passed.');
} else {
  console.error(`  [FAIL] Test 3 failed (Expected 22, got ${etaRes.minutesLeft}).`);
}
console.log('\nAll tests executed.');
