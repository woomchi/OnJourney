/**
 * @fileoverview 부산교통공사 열차시각표 조회 서비스 (trainTime/getTrainTime)
 *
 * 공공데이터포털 부산교통공사_부산도시철도 열차시각표 조회 서비스_GW(B551542)를 활용하여
 * 부산 도시철도 1~4호선의 시간표 기반 지하철 도착 정보를 제공합니다.
 *
 * 엔드포인트:
 * https://apis.data.go.kr/B551542/trainTime/getTrainTime
 */

import { XMLParser } from 'fast-xml-parser';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';
import type { SubwayArrival, SubwayTimetableEntry, SubwayLineStation } from '@/types/journey';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

/** 부산 도시철도 역 정보 인터페이스 */
export interface BusanStationMeta {
  scode: string;         // 역코드 (예: '95', '113', '119', '219')
  name: string;          // 표준 역명 (예: '부산역', '서면', '해운대')
  line: string;          // 호선 ('1', '2', '3', '4')
  apiSname?: string;     // API상 역명 (예: '부산', '서면(1)', '서면(2)')
}

/** 부산 도시철도 1~4호선 114개 역 사전 (역명 정규화 키 -> 메타 정보) */
export const BUSAN_SUBWAY_STATIONS: Record<string, BusanStationMeta> = {
  // ── 1호선 (95~134) ──
  '다대포해수욕장': { scode: '95', name: '다대포해수욕장', line: '1', apiSname: '다대포해수욕장' },
  '다대포항': { scode: '96', name: '다대포항', line: '1', apiSname: '다대포항' },
  '낫개': { scode: '97', name: '낫개', line: '1', apiSname: '낫개' },
  '신장림': { scode: '98', name: '신장림', line: '1', apiSname: '신장림' },
  '장림': { scode: '99', name: '장림', line: '1', apiSname: '장림' },
  '동매': { scode: '100', name: '동매', line: '1', apiSname: '동매' },
  '신평': { scode: '101', name: '신평', line: '1', apiSname: '신평' },
  '하단': { scode: '102', name: '하단', line: '1', apiSname: '하단' },
  '당리': { scode: '103', name: '당리', line: '1', apiSname: '당리' },
  '사하': { scode: '104', name: '사하', line: '1', apiSname: '사하' },
  '괴정': { scode: '105', name: '괴정', line: '1', apiSname: '괴정' },
  '대티': { scode: '106', name: '대티', line: '1', apiSname: '대티' },
  '서대신': { scode: '107', name: '서대신', line: '1', apiSname: '서대신' },
  '동대신': { scode: '108', name: '동대신', line: '1', apiSname: '동대신' },
  '토성': { scode: '109', name: '토성', line: '1', apiSname: '토성' },
  '자갈치': { scode: '110', name: '자갈치', line: '1', apiSname: '자갈치' },
  '남포': { scode: '111', name: '남포', line: '1', apiSname: '남포' },
  '중앙': { scode: '112', name: '중앙', line: '1', apiSname: '중앙' },
  '부산': { scode: '113', name: '부산역', line: '1', apiSname: '부산' },
  '부산역': { scode: '113', name: '부산역', line: '1', apiSname: '부산' },
  '초량': { scode: '114', name: '초량', line: '1', apiSname: '초량' },
  '부산진': { scode: '115', name: '부산진', line: '1', apiSname: '부산진' },
  '좌천': { scode: '116', name: '좌천', line: '1', apiSname: '좌천(1)' },
  '범일': { scode: '117', name: '범일', line: '1', apiSname: '범일' },
  '범내골': { scode: '118', name: '범내골', line: '1', apiSname: '범내골' },
  '서면_1': { scode: '119', name: '서면', line: '1', apiSname: '서면(1)' },
  '부전': { scode: '120', name: '부전', line: '1', apiSname: '부전' },
  '양정': { scode: '121', name: '양정', line: '1', apiSname: '양정' },
  '시청_부산': { scode: '122', name: '시청', line: '1', apiSname: '시청' },
  '연산_1': { scode: '123', name: '연산', line: '1', apiSname: '연산(1)' },
  '교대_부산': { scode: '124', name: '교대', line: '1', apiSname: '교대(1)' },
  '동래_1': { scode: '125', name: '동래', line: '1', apiSname: '동래(1)' },
  '명륜': { scode: '126', name: '명륜', line: '1', apiSname: '명륜' },
  '온천장': { scode: '127', name: '온천장', line: '1', apiSname: '온천장' },
  '부산대': { scode: '128', name: '부산대', line: '1', apiSname: '부산대' },
  '장전': { scode: '129', name: '장전', line: '1', apiSname: '장전' },
  '구서': { scode: '130', name: '구서', line: '1', apiSname: '구서' },
  '두실': { scode: '131', name: '두실', line: '1', apiSname: '두실' },
  '남산': { scode: '132', name: '남산', line: '1', apiSname: '남산' },
  '범어사': { scode: '133', name: '범어사', line: '1', apiSname: '범어사' },
  '노포': { scode: '134', name: '노포', line: '1', apiSname: '노포' },

  // ── 2호선 (201~243) ──
  '장산': { scode: '201', name: '장산', line: '2', apiSname: '장산' },
  '중동': { scode: '202', name: '중동', line: '2', apiSname: '중동' },
  '해운대': { scode: '203', name: '해운대', line: '2', apiSname: '해운대' },
  '동백': { scode: '204', name: '동백', line: '2', apiSname: '동백' },
  '벡스코': { scode: '205', name: '벡스코', line: '2', apiSname: '벡스코' },
  '센텀시티': { scode: '206', name: '센텀시티', line: '2', apiSname: '센텀시티' },
  '민락': { scode: '207', name: '민락', line: '2', apiSname: '민락' },
  '수영_2': { scode: '208', name: '수영', line: '2', apiSname: '수영(2)' },
  '광안': { scode: '209', name: '광안', line: '2', apiSname: '광안' },
  '금련산': { scode: '210', name: '금련산', line: '2', apiSname: '금련산' },
  '남천': { scode: '211', name: '남천', line: '2', apiSname: '남천' },
  '경성대부경대': { scode: '212', name: '경성대부경대', line: '2', apiSname: '경성대부경대' },
  '대연': { scode: '213', name: '대연', line: '2', apiSname: '대연' },
  '못골': { scode: '214', name: '못골', line: '2', apiSname: '못골' },
  '지게골': { scode: '215', name: '지게골', line: '2', apiSname: '지게골' },
  '문현': { scode: '216', name: '문현', line: '2', apiSname: '문현' },
  '국제금융센터부산은행': { scode: '217', name: '국제금융센터부산은행', line: '2', apiSname: '국제금융센터부산은행' },
  '전포': { scode: '218', name: '전포', line: '2', apiSname: '전포' },
  '서면_2': { scode: '219', name: '서면', line: '2', apiSname: '서면(2)' },
  '부암': { scode: '220', name: '부암', line: '2', apiSname: '부암' },
  '가야': { scode: '221', name: '가야', line: '2', apiSname: '가야' },
  '동의대': { scode: '222', name: '동의대', line: '2', apiSname: '동의대' },
  '개금': { scode: '223', name: '개금', line: '2', apiSname: '개금' },
  '냉정': { scode: '224', name: '냉정', line: '2', apiSname: '냉정' },
  '주례': { scode: '225', name: '주례', line: '2', apiSname: '주례' },
  '감전': { scode: '226', name: '감전', line: '2', apiSname: '감전' },
  '사상': { scode: '227', name: '사상', line: '2', apiSname: '사상(2)' },
  '덕포': { scode: '228', name: '덕포', line: '2', apiSname: '덕포' },
  '모덕': { scode: '229', name: '모덕', line: '2', apiSname: '모덕' },
  '모라': { scode: '230', name: '모라', line: '2', apiSname: '모라' },
  '구남': { scode: '231', name: '구남', line: '2', apiSname: '구남' },
  '구명': { scode: '232', name: '구명', line: '2', apiSname: '구명' },
  '덕천_2': { scode: '233', name: '덕천', line: '2', apiSname: '덕천(2)' },
  '수정': { scode: '234', name: '수정', line: '2', apiSname: '수정' },
  '화명': { scode: '235', name: '화명', line: '2', apiSname: '화명' },
  '율리': { scode: '236', name: '율리', line: '2', apiSname: '율리' },
  '동원': { scode: '237', name: '동원', line: '2', apiSname: '동원' },
  '금곡': { scode: '238', name: '금곡', line: '2', apiSname: '금곡' },
  '호포': { scode: '239', name: '호포', line: '2', apiSname: '호포' },
  '증산': { scode: '240', name: '증산', line: '2', apiSname: '증산' },
  '부산대양산캠퍼스': { scode: '241', name: '부산대양산캠퍼스', line: '2', apiSname: '부산대양산캠퍼스' },
  '남양산': { scode: '242', name: '남양산', line: '2', apiSname: '남양산' },
  '양산': { scode: '243', name: '양산', line: '2', apiSname: '양산' },

  // ── 3호선 (301~317) ──
  '수영_3': { scode: '301', name: '수영', line: '3', apiSname: '수영(3)' },
  '망미': { scode: '302', name: '망미', line: '3', apiSname: '망미' },
  '배산': { scode: '303', name: '배산', line: '3', apiSname: '배산' },
  '물만골': { scode: '304', name: '물만골', line: '3', apiSname: '물만골' },
  '연산_3': { scode: '305', name: '연산', line: '3', apiSname: '연산(3)' },
  '거제': { scode: '306', name: '거제', line: '3', apiSname: '거제' },
  '종합운동장': { scode: '307', name: '종합운동장', line: '3', apiSname: '종합운동장' },
  '사직': { scode: '308', name: '사직', line: '3', apiSname: '사직' },
  '미남_3': { scode: '309', name: '미남', line: '3', apiSname: '미남(3)' },
  '만덕': { scode: '310', name: '만덕', line: '3', apiSname: '만덕' },
  '남산정': { scode: '311', name: '남산정', line: '3', apiSname: '남산정' },
  '숙등': { scode: '312', name: '숙등', line: '3', apiSname: '숙등' },
  '덕천_3': { scode: '313', name: '덕천', line: '3', apiSname: '덕천(3)' },
  '구포': { scode: '314', name: '구포', line: '3', apiSname: '구포' },
  '강서구청': { scode: '315', name: '강서구청', line: '3', apiSname: '강서구청' },
  '체육공원': { scode: '316', name: '체육공원', line: '3', apiSname: '체육공원' },
  '대저': { scode: '317', name: '대저', line: '3', apiSname: '대저(3)' },

  // ── 4호선 (401~414) ──
  '미남_4': { scode: '401', name: '미남', line: '4', apiSname: '미남(4)' },
  '동래_4': { scode: '402', name: '동래', line: '4', apiSname: '동래(4)' },
  '수안': { scode: '403', name: '수안', line: '4', apiSname: '수안' },
  '낙민': { scode: '404', name: '낙민', line: '4', apiSname: '낙민' },
  '충렬사': { scode: '405', name: '충렬사', line: '4', apiSname: '충렬사' },
  '명장': { scode: '406', name: '명장', line: '4', apiSname: '명장' },
  '서동': { scode: '407', name: '서동', line: '4', apiSname: '서동' },
  '금사': { scode: '408', name: '금사', line: '4', apiSname: '금사' },
  '반여농산물시장': { scode: '409', name: '반여농산물시장', line: '4', apiSname: '반여농산물시장' },
  '석대': { scode: '410', name: '석대', line: '4', apiSname: '석대' },
  '영산대': { scode: '411', name: '영산대', line: '4', apiSname: '영산대' },
  '윗반송': { scode: '412', name: '윗반송', line: '4', apiSname: '윗반송' },
  '고촌': { scode: '413', name: '고촌', line: '4', apiSname: '고촌' },
  '안평': { scode: '414', name: '안평', line: '4', apiSname: '안평' },
};

/** 환승역 기본 호선 정의 (호선 미지정 시 1호선 또는 낮은 번호 우선) */
const TRANSFER_STATIONS: Record<string, string[]> = {
  '서면': ['119', '219'],
  '연산': ['123', '305'],
  '동래': ['125', '402'],
  '수영': ['208', '301'],
  '덕천': ['233', '313'],
  '미남': ['309', '401'],
};

/** 종착역 코드(endcode) -> 종착역명 매핑 */
export const BUSAN_ENDCODE_NAMES: Record<string, string> = {
  '95': '다대포해수욕장',
  '101': '신평',
  '134': '노포',
  '201': '장산',
  '219': '서면',
  '239': '호포',
  '243': '양산',
  '301': '수영',
  '317': '대저',
  '318': '대저',
  '401': '미남',
  '414': '안평',
  '415': '안평',
};

/** 부산 시각표 항목 인터페이스 */
export interface BusanTimetableItem {
  scode: string;
  sname: string;
  line: string;
  engname?: string;
  trainno: string;
  arrtime: string;      // HH:mm:ss
  dayType: string;      // '1': 평일, '2': 토요일, '3': 일요일/공휴일
  updown: string;       // '0': 기점방면(하행/상행), '1': 종점방면
  endcode: string;      // 종착역 코드
  destStation?: string; // 종착역명 (예: '노포', '다대포해수욕장')
}

/** 캐시 구조: scode -> 24시간 시각표 목록 */
interface TimetableCacheEntry {
  timestamp: number;
  data: BusanTimetableItem[];
}

const stationTimetableCache = new Map<string, TimetableCacheEntry>();
const CACHE_TTL_MS = 24 * 3600 * 1000; // 24시간

/**
 * 공공데이터포털 지하철 API 통합 인증키 획득
 * 1순위: SUBWAY_DATA_API_KEY (공공데이터포털 지하철 전용 통합 키)
 * 2순위: BUS_DATA_API_KEY (공공데이터포털 공통 키 Fallback)
 */
export function getPublicSubwayApiKey(): string {
  const env = process.env as Record<string, string | undefined>;
  const rawKey = (
    env.SUBWAY_DATA_API_KEY ||
    env.BUS_DATA_API_KEY ||
    env.REAL_TIME_BUS_API_KEY ||
    ''
  ).trim().replace(/^["']|["']$/g, '');

  if (!rawKey) return '';
  try {
    return rawKey.includes('%') ? decodeURIComponent(rawKey) : rawKey;
  } catch {
    return rawKey;
  }
}

/**
 * 부산 지하철 역인지 여부를 확인합니다.
 */
export function isBusanSubwayStation(stationName: string): boolean {
  const clean = stationName.replace(/역$/, '').trim();
  if (clean in BUSAN_SUBWAY_STATIONS) return true;
  if (clean in TRANSFER_STATIONS) return true;

  // 특수 표기 (서면_1, 시청_부산 등)
  return Object.values(BUSAN_SUBWAY_STATIONS).some(
    (meta) => meta.name === clean || meta.name === stationName
  );
}

/**
 * 역명과 호선으로 부산 지하철 역코드(scode)를 획득합니다.
 */
export function getBusanStationCode(stationName: string, subwayId?: string): string | null {
  const clean = stationName.replace(/역$/, '').trim();
  const cleanSubwayId = String(subwayId || '').trim();

  // 1. 호선 힌트 분석 (1, 2, 3, 4)
  let targetLine = '';
  if (cleanSubwayId.includes('1') || cleanSubwayId === '부산 1호선') targetLine = '1';
  else if (cleanSubwayId.includes('2') || cleanSubwayId === '부산 2호선') targetLine = '2';
  else if (cleanSubwayId.includes('3') || cleanSubwayId === '부산 3호선') targetLine = '3';
  else if (cleanSubwayId.includes('4') || cleanSubwayId === '부산 4호선') targetLine = '4';

  // 2. 환승역 처리
  if (clean in TRANSFER_STATIONS) {
    const codes = TRANSFER_STATIONS[clean];
    if (targetLine) {
      const match = codes.find((c) => {
        const found = Object.values(BUSAN_SUBWAY_STATIONS).find((meta) => meta.scode === c);
        return found?.line === targetLine;
      });
      if (match) return match;
    }
    return codes[0]; // 기본 1순위 코드
  }

  // 3. 단일역 직접 매핑
  const direct = BUSAN_SUBWAY_STATIONS[clean];
  if (direct) return direct.scode;

  // 4. 역명 일치 탐색
  const found = Object.values(BUSAN_SUBWAY_STATIONS).find((meta) => meta.name === clean);
  return found?.scode || null;
}

/**
 * 오늘 요일 타입 계산 (부산교통공사: '1'=평일, '2'=토요일, '3'=일요일/공휴일)
 */
export function getBusanDayType(date: Date): string {
  const day = date.getDay(); // 0: 일, 6: 토
  if (day === 0) return '3';
  if (day === 6) return '2';
  return '1';
}

/**
 * 시간 문자열("HH:mm:ss" 또는 "HH:mm")을 초로 변환
 */
function parseTimeToSeconds(timeStr: string): number {
  const str = String(timeStr || '').trim().replace(/:/g, '');
  if (!str) return 0;
  const h = parseInt(str.substring(0, 2), 10) || 0;
  const m = parseInt(str.substring(2, 4), 10) || 0;
  const s = str.length >= 6 ? parseInt(str.substring(4, 6), 10) || 0 : 0;
  return h * 3600 + m * 60 + s;
}

/**
 * 초를 "HH:mm" 포맷으로 변환
 */
function formatSecondsToTime(totalSec: number): string {
  const safe = (totalSec + 86400) % 86400;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 특정 역의 하루 전체 열차운행 시각표를 조회합니다 (1회 호출, 24시간 캐싱).
 */
export async function fetchBusanStationTimetable(scode: string): Promise<BusanTimetableItem[]> {
  const now = Date.now();
  const cached = stationTimetableCache.get(scode);
  if (cached && now - cached.timestamp < CACHE_TTL_MS && cached.data.length > 0) {
    return cached.data;
  }

  const apiKey = getPublicSubwayApiKey();
  if (!apiKey) {
    console.warn('[busanSubwayService] 부산 지하철 API 키 미설정');
    return [];
  }

  const qs = new URLSearchParams({
    serviceKey: apiKey,
    _type: 'json',
    scode: String(scode),
    numOfRows: '1200', // 하루치 전체 수신 (약 900~1,008행)
  }).toString();

  const url = `https://apis.data.go.kr/B551542/trainTime/getTrainTime?${qs}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    let rawList: any[] = [];

    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed);
      const raw = json.body?.items?.item || json.response?.body?.items?.item || [];
      rawList = Array.isArray(raw) ? raw : [raw];
    } else if (trimmed.startsWith('<')) {
      const parsed = xmlParser.parse(trimmed);
      const body = parsed?.response?.body || parsed?.body || parsed;
      const raw = body?.items?.item || body?.item || [];
      rawList = Array.isArray(raw) ? raw : [raw];
    }

    const items: BusanTimetableItem[] = [];
    for (const row of rawList) {
      if (!row || typeof row !== 'object') continue;
      const itemScode = String(row.scode ?? '').trim();
      const sname = String(row.sname ?? '').trim();
      const line = String(row.line ?? '').trim();
      const trainno = String(row.trainno ?? row.trainNo ?? '').trim();
      const arrtime = String(row.arrtime ?? row.arrTime ?? '').trim();
      const dayType = String(row.dayType ?? '1').trim();
      const updown = String(row.updown ?? '0').trim();
      const endcode = String(row.endcode ?? '').trim();

      if (arrtime) {
        items.push({
          scode: itemScode || scode,
          sname,
          line,
          engname: row.engname ? String(row.engname) : undefined,
          trainno: trainno || '부산열차',
          arrtime,
          dayType,
          updown,
          endcode,
          destStation: BUSAN_ENDCODE_NAMES[endcode] || (updown === '1' ? '종점' : '기점'),
        });
      }
    }

    if (items.length > 0) {
      stationTimetableCache.set(scode, {
        timestamp: now,
        data: items,
      });
    }

    return items;
  } catch (e) {
    console.warn(`[busanSubwayService] 역(${scode}) 시각표 조회 실패:`, e);
    return cached?.data || [];
  }
}

/**
 * 부산 지하철 역의 실시간/시간표 기반 도착 정보 조회 (SubwayArrival[] 반환)
 */
export async function fetchBusanSubwayArrivals(
  stationName: string,
  wayCode?: string,
  subwayId?: string
): Promise<SubwayArrival[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const scode = getBusanStationCode(cleanStation, subwayId);

  if (!scode) {
    return [];
  }

  const timetable = await fetchBusanStationTimetable(scode);
  if (!timetable || timetable.length === 0) {
    return [];
  }

  const now = new Date(timeOffsetManager.getSynchronizedNow());
  const currentDayType = getBusanDayType(now);
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  // 오늘 요일 필터링
  const todayItems = timetable.filter((item) => item.dayType === currentDayType);
  const activeItems = todayItems.length > 0 ? todayItems : timetable;

  // 방향 필터링 (wayCode 분석)
  // updown '0': 기점방면 (다대포, 장산, 수영, 미남)
  // updown '1': 종점방면 (노포, 양산, 대저, 안평)
  let targetUpdown: string | null = null;
  if (wayCode === '1' || wayCode === 'UP' || wayCode === '상행') {
    // 1호선: 노포(상행, '1'), 2~4호선: 장산/수영/미남(상행, '0')
    const sample = activeItems[0];
    targetUpdown = sample?.line === '1' ? '1' : '0';
  } else if (wayCode === '2' || wayCode === 'DOWN' || wayCode === '하행') {
    const sample = activeItems[0];
    targetUpdown = sample?.line === '1' ? '0' : '1';
  }

  // 상·하행 그룹별 다음 열차 계산
  const updownGroups: Record<string, BusanTimetableItem[]> = { '0': [], '1': [] };
  activeItems.forEach((item) => {
    if (updownGroups[item.updown]) {
      updownGroups[item.updown].push(item);
    }
  });

  const arrivals: SubwayArrival[] = [];

  const processGroup = (groupItems: BusanTimetableItem[], groupUpdown: string) => {
    if (targetUpdown !== null && groupUpdown !== targetUpdown) return;
    if (groupItems.length === 0) return;

    // 운행 시간순 정렬
    const sorted = groupItems
      .map((it) => ({
        ...it,
        seconds: parseTimeToSeconds(it.arrtime),
      }))
      .sort((a, b) => a.seconds - b.seconds);

    // 현재 시각 이후의 첫 열차들 탐색
    let upcoming = sorted.filter((it) => it.seconds >= currentSec - 30); // 30초 전 진입 포함

    // 만약 막차 이후라면 익일 첫차(새벽)로 래핑
    if (upcoming.length === 0 && sorted.length > 0) {
      upcoming = sorted.slice(0, 2);
    }

    const nextTrains = upcoming.slice(0, 2);

    nextTrains.forEach((train, idx) => {
      let diffSec = train.seconds - currentSec;
      if (diffSec < 0) {
        diffSec += 86400; // 익일
      }

      const minutesLeft = Math.max(0, Math.floor(diffSec / 60));
      const arrivalTime = formatSecondsToTime(train.seconds);
      const isApproaching = minutesLeft <= 1;
      const statusText =
        minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후 (${arrivalTime})`;

      const dest = train.destStation || (groupUpdown === '1' ? '종점' : '기점');
      const lineName = train.line ? `부산 ${train.line}호선` : '부산도시철도';
      const directionName = `${dest}행`;

      arrivals.push({
        subwayId: lineName,
        updnLine: directionName,
        trainNo: train.trainno || '부산열차',
        statnNm: cleanStation,
        arvlMsg2: statusText,
        recptnDt: '',
        statusText,
        minutesLeft,
        arrivalTime,
        isApproaching,
        isRealtime: false,
        destinationStationNm: dest,
        canBoard: true,
      });
    });
  };

  processGroup(updownGroups['0'], '0');
  processGroup(updownGroups['1'], '1');

  arrivals.sort((a, b) => a.minutesLeft - b.minutesLeft);
  return arrivals;
}

/**
 * 노선도 뷰어용 역별 다음 시각표 조회 (SubwayTimetableEntry[] 반환)
 */
export async function fetchBusanStationUpcomingTimetable(
  stationName: string,
  subwayId?: string,
  count: number = 6
): Promise<SubwayTimetableEntry[]> {
  const cleanStation = stationName.replace(/역$/, '').trim();
  const scode = getBusanStationCode(cleanStation, subwayId);
  if (!scode) return [];

  const timetable = await fetchBusanStationTimetable(scode);
  if (!timetable || timetable.length === 0) return [];

  const now = new Date(timeOffsetManager.getSynchronizedNow());
  const currentDayType = getBusanDayType(now);
  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const todayItems = timetable.filter((item) => item.dayType === currentDayType);
  const activeItems = todayItems.length > 0 ? todayItems : timetable;

  const sorted = activeItems
    .map((it) => ({
      ...it,
      seconds: parseTimeToSeconds(it.arrtime),
    }))
    .sort((a, b) => a.seconds - b.seconds);

  let upcoming = sorted.filter((it) => it.seconds >= currentSec - 60);
  if (upcoming.length === 0) {
    upcoming = sorted.map((it) => ({
      ...it,
      seconds: it.seconds + 86400,
    }));
  }

  return upcoming.slice(0, count).map((train, idx) => {
    const diffSec = train.seconds - currentSec;
    const minutesLeft = Math.max(0, Math.floor(diffSec / 60));
    const depTimeStr = formatSecondsToTime(train.seconds);
    const dest = train.destStation || '종착';
    const isDown = train.updown === '1';

    return {
      trainNo: train.trainno || `부산-${train.line}-${idx + 1}`,
      depTime: depTimeStr,
      destStation: dest,
      drctType: isDown ? '2' : '1',
      directionName: `${dest} 방면 (${isDown ? '하행' : '상행'})`,
      minutesLeft,
      statusText: minutesLeft === 0 ? '곧 도착' : `${minutesLeft}분 후`,
      isUpcoming: idx === 0,
    };
  });
}

/**
 * 부산 도시철도 특정 호선(1~4호선)의 전체 정차역 순서 목록을 반환합니다 (노선도 뷰용).
 */
export function getBusanLineStations(lineOrSubwayId: string): SubwayLineStation[] {
  const clean = String(lineOrSubwayId || '').trim();
  let targetLine = '1';
  if (clean.includes('4')) targetLine = '4';
  else if (clean.includes('3')) targetLine = '3';
  else if (clean.includes('2')) targetLine = '2';
  else targetLine = '1';

  // 고유한 scode별로 대표 역 추출
  const uniqueStationsByScode = new Map<string, BusanStationMeta>();
  for (const meta of Object.values(BUSAN_SUBWAY_STATIONS)) {
    if (meta.line === targetLine && !uniqueStationsByScode.has(meta.scode)) {
      uniqueStationsByScode.set(meta.scode, meta);
    }
  }

  // scode 숫자 기준 오름차순 정렬 (기점 -> 종점)
  const sorted = Array.from(uniqueStationsByScode.values()).sort(
    (a, b) => parseInt(a.scode, 10) - parseInt(b.scode, 10)
  );

  return sorted.map((meta, idx) => ({
    index: idx,
    stationName: meta.name.endsWith('역') ? meta.name : `${meta.name}역`,
  }));
}
