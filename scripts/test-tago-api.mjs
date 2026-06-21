import fs from 'fs';
import path from 'url';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = fs.realpathSync(path.fileURLToPath(new URL('.', import.meta.url)));

// Manual parsing of .env.local for API Key
const envContent = fs.readFileSync(fs.realpathSync(__dirname + '/../.env.local'), 'utf-8');
const match = envContent.match(/REAL_TIME_BUS_API_KEY\s*=\s*["']?([^"'\r\n]+)/);
const apiKey = match ? match[1] : '';

// Inject the API key into process.env so the imported service can pick it up
process.env.REAL_TIME_BUS_API_KEY = apiKey;

// Copy functions from subwayService.ts to run directly in Node.js test environment
const LINE1_SEQUENCE = [
  '서울', '남영', '용산', '노량진', '대방', '영등포', '신도림', '구로', 
  '가산디지털단지', '금천구청', '석수', '관악', '안양', '명학', '금정', 
  '군포', '당정', '의왕', '성균관대', '화서', '수원', '세류', '병점', 
  '세마', '오산대', '오산', '진위', '송탄', '서정리', '평택지제', '평택', 
  '성환', '직산', '두정', '천안'
];

const stationIdCache = {};

function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

async function fetchStationId(stationName) {
  const cleanName = stationName.replace(/역$/, '').trim();
  if (stationIdCache[cleanName]) return stationIdCache[cleanName];

  if (!apiKey || apiKey === 'PLACEHOLDER') {
    throw new Error('TAGO API Key is placeholder/empty');
  }

  const url = `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnList?serviceKey=${apiKey}&pageNo=1&numOfRows=15&_type=json&stationName=${encodeURIComponent(cleanName)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  
  const data = await res.json();
  const items = data.response?.body?.items?.item;
  
  let stationId = '';
  if (Array.isArray(items)) {
    const matched = items.find((it) => String(it.subwayRouteName || '').includes('1호선'));
    stationId = matched ? matched.subwayStationId : items[0]?.subwayStationId;
  } else if (items) {
    stationId = items.subwayStationId;
  }

  if (stationId) {
    stationIdCache[cleanName] = stationId;
    return stationId;
  }
  throw new Error(`Station ID not found for: ${cleanName}`);
}

async function fetchScheduleTime(stationId, trainNo, upDownTypeCode, timeType) {
  const day = new Date().getDay();
  const dailyTypeCode = day === 0 ? '03' : (day === 6 ? '02' : '01');
  const url = `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnAcctoSchdulList?serviceKey=${apiKey}&pageNo=1&numOfRows=300&_type=json&subwayStationId=${stationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${upDownTypeCode}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  
  const data = await res.json();
  const items = data.response?.body?.items?.item;
  
  if (Array.isArray(items)) {
    const matched = items.find((it) => String(it.trainNo || '').trim() === String(trainNo).trim());
    if (matched) return matched[timeType] ? String(matched[timeType]) : null;
  } else if (items) {
    if (String(items.trainNo || '').trim() === String(trainNo).trim()) {
      return items[timeType] ? String(items[timeType]) : null;
    }
  }
  return null;
}

async function fetchDynamicTravelTimeSec(currentStation, targetStation, trainNo, updnLine) {
  try {
    const currentId = await fetchStationId(currentStation);
    const targetId = await fetchStationId(targetStation);

    const isUpLine = updnLine === '상행' || updnLine?.includes('상선') || updnLine?.includes('서울') || updnLine?.includes('청량리');
    const upDownTypeCode = isUpLine ? '1' : '2';

    const depTimeStr = await fetchScheduleTime(currentId, trainNo, upDownTypeCode, 'depTime');
    const arrTimeStr = await fetchScheduleTime(targetId, trainNo, upDownTypeCode, 'arrTime');

    if (depTimeStr && arrTimeStr) {
      const depSec = timeToSeconds(depTimeStr);
      const arrSec = timeToSeconds(arrTimeStr);
      let diffSec = arrSec - depSec;
      if (diffSec < 0) diffSec += 24 * 3600;
      return diffSec;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function extractCurrentStation(arvlMsg2, targetStation, updnLine) {
  const cleanTarget = targetStation.replace(/역$/, '').trim();
  const parenMatch = arvlMsg2.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].replace(/역$/, '').trim();

  const suffixMatch = arvlMsg2.match(/^([가-힣a-zA-Z0-9]+)\s*(진입|도착|출발)$/);
  if (suffixMatch && suffixMatch[1] !== '전') return suffixMatch[1].replace(/역$/, '').trim();

  if (arvlMsg2.includes('전역')) {
    const targetIdx = LINE1_SEQUENCE.indexOf(cleanTarget);
    if (targetIdx !== -1) {
      const isUpLine = updnLine === '상행' || updnLine?.includes('상선') || updnLine?.includes('서울') || updnLine?.includes('청량리');
      const isDownLine = updnLine === '하행' || updnLine?.includes('하선') || updnLine?.includes('신창') || updnLine?.includes('천안') || updnLine?.includes('서동탄');
      if (isUpLine && targetIdx + 1 < LINE1_SEQUENCE.length) return LINE1_SEQUENCE[targetIdx + 1];
      if (isDownLine && targetIdx - 1 >= 0) return LINE1_SEQUENCE[targetIdx - 1];
    }
  }
  return '';
}

function calculateFallbackTimeSec(currentStation, targetStation, arvlMsg2) {
  const cleanCurr = currentStation.replace(/역$/, '').trim();
  const cleanTarget = targetStation.replace(/역$/, '').trim();
  const idxCurr = LINE1_SEQUENCE.indexOf(cleanCurr);
  const idxTarget = LINE1_SEQUENCE.indexOf(cleanTarget);

  if (idxCurr !== -1 && idxTarget !== -1) {
    return Math.abs(idxTarget - idxCurr) * 120;
  }
  return 240;
}

async function calculateSubwayETADynamic(arvlMsg2, recptnDt, targetStation, trainNo, updnLine) {
  const targetClean = targetStation.replace(/역$/, '').trim();
  const currentStation = extractCurrentStation(arvlMsg2, targetClean, updnLine);
  
  let rawTravelTimeSec = 0;
  let hasValidTimetable = false;

  if (currentStation && trainNo) {
    const timetableSec = await fetchDynamicTravelTimeSec(currentStation, targetClean, trainNo, updnLine || '');
    if (timetableSec !== null && timetableSec > 0) {
      rawTravelTimeSec = timetableSec;
      hasValidTimetable = true;
    }
  }

  if (!hasValidTimetable) {
    rawTravelTimeSec = calculateFallbackTimeSec(currentStation, targetClean, arvlMsg2);
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
    return { statusText: detail, minutesLeft: 0, isApproaching: true, hasValidTimetable };
  }

  const minutesLeft = Math.ceil(correctedRemainingSec / 60);
  return {
    statusText: `약 ${minutesLeft}분 뒤 도착 예정`,
    minutesLeft,
    isApproaching: false,
    rawTravelTimeSec,
    timeDiffSec,
    hasValidTimetable
  };
}

// =================== RUN TESTS ===================

async function runTests() {
  console.log('Starting Dynamic Subway ETA tests...\n');

  // Test Case 1: Dynamic timetable and fallback check
  console.log('Test 1: Normal call (Should use dynamic timetable if API is active, otherwise fallback)');
  const time1 = await fetchDynamicTravelTimeSec('송탄', '병점', '1903', '하행');
  console.log(`  Dynamic time 송탄 -> 병점 (Train 1903): ${time1 !== null ? `${time1}s` : 'Null (API error or key registry mismatch)'}`);

  // Test Case 2: Verification of Fallback Logic
  console.log('\nTest 2: Fallback trigger testing');
  // Pass an invalid train number to force fallback calculation
  const etaRes = await calculateSubwayETADynamic('[5]번째 전역 (송탄)', null, '병점', 'INVALID_TRAIN_9999', '하행');
  console.log(`  Input message: "[5]번째 전역 (송탄)", Target: "병점", Train: "INVALID_TRAIN_9999"`);
  console.log(`  Timetable valid: ${etaRes.hasValidTimetable} (Expected: false)`);
  console.log(`  Calculated fallback travel time: ${etaRes.rawTravelTimeSec} seconds`);
  console.log(`  Estimated Minutes: ${etaRes.minutesLeft} mins`);
  
  // 송탄 (27번째 인덱스) - 병점 (22번째 인덱스) => 차이 = 5 역 => 5 * 120 = 600초 => Math.ceil(600 / 60) = 10분
  if (etaRes.hasValidTimetable === false && etaRes.minutesLeft === 10) {
    console.log('  [PASS] Test 2 passed.');
  } else {
    console.error(`  [FAIL] Test 2 failed. Expected 10 mins, got ${etaRes.minutesLeft} mins.`);
  }

  // Test Case 3: Drift latency correction with fallback
  console.log('\nTest 3: Drift Compensation (Simulated 3-minute lag)');
  // Set receipt time as 3 minutes (180 seconds) before now local time
  const receiptTime = new Date(Date.now() - 180 * 1000);
  const y = receiptTime.getFullYear();
  const m = String(receiptTime.getMonth() + 1).padStart(2, '0');
  const d = String(receiptTime.getDate()).padStart(2, '0');
  const h = String(receiptTime.getHours()).padStart(2, '0');
  const min = String(receiptTime.getMinutes()).padStart(2, '0');
  const s = String(receiptTime.getSeconds()).padStart(2, '0');
  const receiptTimeStr = `${y}-${m}-${d} ${h}:${min}:${s}`;

  const etaResDrift = await calculateSubwayETADynamic('[5]번째 전역 (송탄)', receiptTimeStr, '병점', 'INVALID_TRAIN_9999', '하행');
  console.log(`  Receipt time: ${receiptTimeStr}`);
  console.log(`  Cumulative time (raw): ${etaResDrift.rawTravelTimeSec} seconds`);
  console.log(`  Drift latency: ${etaResDrift.timeDiffSec} seconds`);
  console.log(`  Corrected minutes left: ${etaResDrift.minutesLeft} minutes`);
  console.log(`  Status Text: "${etaResDrift.statusText}"`);

  // 600s (raw) - 180s (drift) = 420s => Math.ceil(420 / 60) = 7 minutes
  if (etaResDrift.minutesLeft === 7) {
    console.log('  [PASS] Test 3 passed.');
  } else {
    console.error(`  [FAIL] Test 3 failed. Expected 7, got ${etaResDrift.minutesLeft}`);
  }

  console.log('\nAll tests executed.');
}

runTests();
