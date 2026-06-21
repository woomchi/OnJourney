// Live memory caches to optimize API performance and prevent duplicate network hits
const stationIdCache: Record<string, string> = {};



/**
 * Gets the TAGO API key from environment variables
 */
function getTagoApiKey(): string {
  return process.env.REAL_TIME_BUS_API_KEY || '';
}

/**
 * Helper to translate time "HH:mm:ss" or "HH:mm" or "HHMMSS" to absolute seconds
 */
function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  if (!timeStr.includes(':') && timeStr.length >= 6) {
    const h = parseInt(timeStr.substring(0, 2), 10);
    const m = parseInt(timeStr.substring(2, 4), 10);
    const s = parseInt(timeStr.substring(4, 6), 10);
    return h * 3600 + m * 60 + s;
  }
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Fetch Station ID from TAGO SubwayInfo API using Station Name
 */
export async function fetchStationId(stationName: string): Promise<string> {
  const cleanName = stationName.replace(/역$/, '').trim();
  
  if (stationIdCache[cleanName]) {
    return stationIdCache[cleanName];
  }

  const apiKey = getTagoApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER') {
    throw new Error('TAGO API Key is not configured');
  }

  const url = `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnList?serviceKey=${apiKey}&pageNo=1&numOfRows=15&_type=json&stationName=${encodeURIComponent(cleanName)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    
    const data = await res.json();
    const items = data.response?.body?.items?.item;
    
    let stationId = '';
    if (Array.isArray(items)) {
      // Prioritize 1호선 if multiple matches are found (e.g. "시청역")
      const matched = items.find((it: any) => String(it.subwayRouteName || '').includes('1호선'));
      stationId = matched ? matched.subwayStationId : items[0]?.subwayStationId;
    } else if (items) {
      stationId = items.subwayStationId;
    }

    if (stationId) {
      stationIdCache[cleanName] = stationId;
      return stationId;
    }
    
    throw new Error(`Station ID not found for: ${cleanName}`);
  } catch (err) {
    console.warn(`[subway] Failed to fetch station ID for ${cleanName}:`, err);
    throw err;
  }
}

/**
 * Fetch schedule for station and extract time for a specific train number
 */
async function fetchScheduleTime(
  stationId: string,
  trainNo: string,
  upDownTypeCode: string,
  timeType: 'depTime' | 'arrTime'
): Promise<string | null> {
  const apiKey = getTagoApiKey();
  
  // Decide dailyTypeCode based on day of week: 01 (weekday), 02 (Sat), 03 (Sun/Holiday)
  const day = new Date().getDay();
  const dailyTypeCode = day === 0 ? '03' : (day === 6 ? '02' : '01');

  const url = `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnAcctoSchdulList?serviceKey=${apiKey}&pageNo=1&numOfRows=300&_type=json&subwayStationId=${stationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${upDownTypeCode}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    
    const data = await res.json();
    const items = data.response?.body?.items?.item;
    
    if (Array.isArray(items)) {
      // String match the train number (e.g. "1903")
      const matched = items.find((it: any) => String(it.trainNo || '').trim() === String(trainNo).trim());
      if (matched) {
        return matched[timeType] ? String(matched[timeType]) : null;
      }
    } else if (items) {
      if (String(items.trainNo || '').trim() === String(trainNo).trim()) {
        return items[timeType] ? String(items[timeType]) : null;
      }
    }
    return null;
  } catch (err) {
    console.warn(`[subway] Failed to fetch schedule for ${stationId} / Train ${trainNo}:`, err);
    return null;
  }
}

/**
 * Fetch dynamic travel time between current station and target station via TAGO Timetables
 */
export async function fetchDynamicTravelTimeSec(
  currentStation: string,
  targetStation: string,
  trainNo: string,
  updnLine: string
): Promise<number | null> {
  try {
    const currentId = await fetchStationId(currentStation);
    const targetId = await fetchStationId(targetStation);

    const isUpLine = updnLine === '상행' || updnLine?.includes('상선') || updnLine?.includes('서울') || updnLine?.includes('청량리');
    const upDownTypeCode = isUpLine ? '1' : '2';

    // Fetch departure time of the train at the current station
    const depTimeStr = await fetchScheduleTime(currentId, trainNo, upDownTypeCode, 'depTime');
    // Fetch arrival time of the train at the target station
    const arrTimeStr = await fetchScheduleTime(targetId, trainNo, upDownTypeCode, 'arrTime');

    if (depTimeStr && arrTimeStr) {
      const depSec = timeToSeconds(depTimeStr);
      const arrSec = timeToSeconds(arrTimeStr);
      let diffSec = arrSec - depSec;
      
      // Correct for midnight rollover
      if (diffSec < 0) {
        diffSec += 24 * 3600;
      }
      return diffSec;
    }
    return null;
  } catch (e) {
    // console.warn(`[subway] Dynamic timetable match failed for ${currentStation} -> ${targetStation} (Train ${trainNo}):`, e);
    return null;
  }
}

// Memory Cache for Static Timetables (Map)
const timetableCache = new Map<string, { expires: number; schedule: any[] }>();

/**
 * Fetch and Cache the full day's timetable for a station and direction.
 * Prevents hammering the TAGO API and avoids constant 500 errors.
 */
export async function fetchAndCacheTimetable(stationName: string, updnLine: string) {
  const cleanName = stationName.replace(/역$/, '').trim();
  const isUpLine = updnLine === '상행' || updnLine?.includes('상선') || updnLine?.includes('내선') || updnLine?.includes('서울') || updnLine?.includes('청량리');
  const upDownTypeCode = isUpLine ? '1' : '2';
  
  const cacheKey = `${cleanName}_${upDownTypeCode}`;
  const now = Date.now();

  const cached = timetableCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.schedule;
  }

  const apiKey = getTagoApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER') return [];

  try {
    const stationId = await fetchStationId(cleanName);
    const day = new Date().getDay();
    const dailyTypeCode = day === 0 ? '03' : (day === 6 ? '02' : '01');

    const url = `http://apis.data.go.kr/1613000/SubwaySttnInfoService/getsubwaySttnAcctoSchdulList?serviceKey=${apiKey}&pageNo=1&numOfRows=500&_type=json&subwayStationId=${stationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${upDownTypeCode}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    const items = data.response?.body?.items?.item;
    
    let schedule: any[] = [];
    if (Array.isArray(items)) schedule = items;
    else if (items) schedule = [items];

    // Cache successfully fetched timetable for 3 hours
    timetableCache.set(cacheKey, {
      expires: now + 3 * 3600 * 1000,
      schedule
    });
    return schedule;
  } catch (err) {
    // console.warn(`[subway] Failed to fetch static timetable for ${cleanName}:`, err);
    // On 500 Error, cache an empty array for 5 minutes to prevent hammering the server
    timetableCache.set(cacheKey, {
      expires: now + 5 * 60 * 1000,
      schedule: []
    });
    return [];
  }
}

/**
 * Calculate the next upcoming train from the statically cached timetable
 */
export async function calculateNextTrainFromTimetable(stationName: string, updnLine: string) {
  const schedule = await fetchAndCacheTimetable(stationName, updnLine);
  if (!schedule || schedule.length === 0) return null;

  const now = new Date();
  const currentTotalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const upcoming = schedule.filter(it => {
    if (!it.arrTime && !it.depTime) return false;
    const sec = timeToSeconds(String(it.arrTime || it.depTime));
    return sec >= currentTotalSec;
  });

  upcoming.sort((a, b) => timeToSeconds(String(a.arrTime || a.depTime)) - timeToSeconds(String(b.arrTime || b.depTime)));

  if (upcoming.length > 0) {
    const next = upcoming[0];
    const targetSec = timeToSeconds(String(next.arrTime || next.depTime));
    const diffSec = targetSec - currentTotalSec;

    const minutesLeft = Math.ceil(diffSec / 60);
    const h = Math.floor(targetSec / 3600);
    const m = Math.floor((targetSec % 3600) / 60);
    const arrivalTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    return {
      trainNo: next.trainNo,
      endSubwayStationNm: next.endSubwayStationNm,
      minutesLeft,
      arrivalTime,
      statusText: `[시간표] ${next.endSubwayStationNm}행 (${arrivalTime})`,
      isApproaching: false
    };
  }
  return null;
}

/**
 * Extracts current station from live text
 */
export function extractCurrentStation(arvlMsg2: string, targetStation: string, updnLine?: string): string {
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

  return '';
}

/**
 * Extracts remaining station count from live text
 */
export function extractRemainingStations(arvlMsg2: string): number | null {
  const match = arvlMsg2.match(/\[(\d+)\]/);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (arvlMsg2.includes('전역')) {
    return 1;
  }
  if (arvlMsg2.includes('진입') || arvlMsg2.includes('도착')) {
    return 0;
  }
  return null;
}

/**
 * Fallback station count calculator
 */
export function calculateFallbackTimeSec(
  currentStation: string,
  targetStation: string,
  arvlMsg2: string
): number {
  // Parse station bracket if not in main sequence
  const fallbackStations = extractRemainingStations(arvlMsg2);
  if (fallbackStations !== null) {
    return fallbackStations * 120;
  }

  return 240; // Default to 4 minutes fallback
}

/**
 * Calculates live subway ETA dynamically
 */
export async function calculateSubwayETADynamic(
  arvlMsg2: string,
  recptnDt: string,
  targetStation: string,
  trainNo: string,
  updnLine?: string,
  barvlDt?: number
): Promise<{
  statusText: string;
  minutesLeft: number;
  arrivalTime: string;
  isApproaching: boolean;
}> {
  const targetClean = targetStation.replace(/역$/, '').trim();

  // 1. 대상 역에 직접 진입/도착/출발 중인 경우
  const isDirectlyAtTarget = arvlMsg2.includes(`${targetClean} 진입`) || 
                             arvlMsg2.includes(`${targetClean} 도착`) ||
                             arvlMsg2.includes(`${targetClean} 출발`);

  if (isDirectlyAtTarget) {
    const detail = arvlMsg2.includes(`${targetClean} 출발`) ? '출발함' : '곧 도착';
    return {
      statusText: detail,
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: true
    };
  }

  // 2. 초 단위 실시간 도착 예정 시간(barvlDt)이 있는 경우 (서울시 관할 노선)
  if (barvlDt && barvlDt > 0) {
    let timeDiffSec = 0;
    if (recptnDt) {
      try {
        const receiptTime = new Date(recptnDt.replace(' ', 'T')).getTime();
        const currentTime = new Date().getTime();
        if (!isNaN(receiptTime)) timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1000));
      } catch (e) {}
    }
    const correctedRemainingSec = Math.max(0, barvlDt - timeDiffSec);
    
    if (correctedRemainingSec === 0) {
      return {
        statusText: arvlMsg2,
        minutesLeft: 1,
        arrivalTime: '',
        isApproaching: true
      };
    }

    const minutesLeft = Math.ceil(correctedRemainingSec / 60);
    const now = new Date();
    const arrivalDate = new Date(now.getTime() + correctedRemainingSec * 1000);
    const hours = String(arrivalDate.getHours()).padStart(2, '0');
    const mins = String(arrivalDate.getMinutes()).padStart(2, '0');
    const arrivalTime = `${hours}:${mins}`;

    return {
      statusText: `약 ${minutesLeft}분 뒤 도착 예정 (${arrivalTime})`,
      minutesLeft,
      arrivalTime,
      isApproaching: minutesLeft <= 1
    };
  }

  // 3. 코레일 관할 노선 등 초 단위 시간(barvlDt)이 없는 경우
  // 일괄적으로 시간표 계산을 하지 않고 순수 실시간 정보(arvlMsg2)만 텍스트로 노출
  const fallbackStations = extractRemainingStations(arvlMsg2);
  const minutesLeft = fallbackStations !== null ? Math.max(1, fallbackStations * 2) : 99; // 정렬용 임시 분 계산

  return {
    statusText: arvlMsg2,
    minutesLeft,
    arrivalTime: '',
    isApproaching: fallbackStations !== null && fallbackStations <= 1
  };
}
