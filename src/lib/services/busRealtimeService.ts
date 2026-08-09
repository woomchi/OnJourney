/**
 * @fileoverview 버스 실시간 도착 정보 서비스
 *
 * ODsay API(#14 searchStation, #1 searchBusLane, #24 searchCID)로 정류소 및 버스 노선 정보를 조회한 뒤,
 * 경기도 API 또는 TAGO API에서 실시간 버스 도착 정보를 가져옵니다.
 *
 * 주요 고도화:
 * - ODsay 동적 도시코드 파싱 및 CITY_CODE_MAP Fallback 연동
 * - 버스 노선 엄격 매칭 (Strict Matching)으로 유사 버스번호(예: 10번 vs 10-1번 vs 100번) 오매칭 완전 차단
 */

import { XMLParser } from 'fast-xml-parser';
import { BusRealtimeQueryType } from '../validations/bus';
import { unstable_cache } from 'next/cache';
import type { BusArrival } from '@/types/journey';
import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** ODsay 정류소 검색 API 캐시 TTL (24시간, 정류소 데이터는 거의 변경되지 않음) */
const ODSAY_CACHE_TTL_SECONDS = 60 * 60 * 24;

/** ODsay / 경기도 / TAGO API 호출 타임아웃 (밀리초) */
const FETCH_TIMEOUT_MS = 3_000;

/** 버스 도착 '곧 도착' 기준: 예상 시간 ≤ 2분 또는 남은 정류장 ≤ 1 */
const APPROACHING_TIME_THRESHOLD_MIN = 2;
const APPROACHING_STATION_THRESHOLD = 1;

/** 경기도 버스 정류소 ID 앞에 붙는 접두사 */
const GYEONGGI_NODE_PREFIX = 'GGB';

/** API 키 플레이스홀더 값 (미설정 판별) */
const API_KEY_PLACEHOLDER = 'PLACEHOLDER';

// ─── 도시 코드 매핑 ───────────────────────────────────────────────────────────

/**
 * 도시명 → TAGO cityCode 매핑 테이블 (Fallback용).
 * "31xxx" 접두사는 경기도 시군을 의미합니다.
 */
const CITY_CODE_MAP: Record<string, string> = {
  '서울': '11', '부산': '21', '대구': '22', '인천': '23', '광주': '24',
  '대전': '25', '울산': '26', '세종': '29',
  '수원': '31010', '성남': '31020', '의정부': '31030', '안양': '31040',
  '부천': '31050', '광명': '31060', '평택': '31070', '동두천': '31080',
  '안산': '31090', '고양': '31100', '과천': '31110', '구리': '31120',
  '남양주': '31130', '오산': '31140', '시흥': '31150', '군포': '31160',
  '의왕': '31170', '하남': '31180', '용인': '31190', '파주': '31200',
  '이천': '31210', '안성': '31220', '김포': '31230', '화성': '31240',
  '광주(경기)': '31250', '양주': '31260', '포천': '31270', '여주': '31280',
  '연천': '31350', '가평': '31370', '양평': '31380',
};

// ─── 로컬 타입 ────────────────────────────────────────────────────────────────

/** ODsay 정류소 검색 결과의 단일 노선 정보 */
interface OdsayBusInfo {
  busNo: string | number;
  busLocalBlID?: string | number;
  busID?: string | number;
  busCityCode?: number | string;
}

/** ODsay 정류소 검색 결과의 단일 정류소 */
interface OdsayStation {
  cityName: string;
  stationCityCode?: number | string;
  localStationID: string | number;
  businfo?: OdsayBusInfo[];
}

/** 경기도 버스 도착 API 단일 아이템 */
interface GyeonggiArrivalItem {
  routeId?: string | number;
  predictTime1?: string | number;
  locationNo1?: string | number;
  predictTime2?: string | number;
  locationNo2?: string | number;
}

/** TAGO 버스 도착 API 단일 아이템 */
interface TagoBusItem {
  routeno?: string | number;
  arrtime?: number;
  arrprevstationcnt?: number;
}

// ─── 내부 유틸리티 ────────────────────────────────────────────────────────────

/**
 * 버스 번호 입력을 정규화합니다 ("번", "번 버스" 접미사 제거).
 */
function normalizeBusNo(rawBusNo: string): string {
  return rawBusNo
    .replace(/번\s*버스$/, '')
    .replace(/번$/, '')
    .trim();
}

/**
 * API 키가 유효한지 확인합니다 (미설정 또는 플레이스홀더 제외).
 */
function isValidApiKey(key: string | undefined): key is string {
  return Boolean(key && key !== API_KEY_PLACEHOLDER && key.trim() !== '');
}

/**
 * 도시명 및 ODsay 정류소 도시코드를 바탕으로 TAGO/경기도 도시코드를 결정합니다.
 */
function resolveCityCode(cityName: string, stationCityCode?: string | number): string | null {
  if (CITY_CODE_MAP[cityName]) {
    return CITY_CODE_MAP[cityName];
  }
  const cleanName = cityName.replace(/^(경기|강원|충북|충남|전북|전남|경북|경남)\s*/, '');
  if (CITY_CODE_MAP[cleanName]) {
    return CITY_CODE_MAP[cleanName];
  }
  if (stationCityCode) {
    const sCode = String(stationCityCode);
    if (sCode.length === 2 || sCode.length === 5) {
      return sCode;
    }
  }
  return null;
}

/**
 * 예상 도착 시간과 남은 정류장 수로 '곧 도착' 여부를 판별합니다.
 */
function isApproaching(predictTimeMin: number, stationCount: number): boolean {
  return predictTimeMin <= APPROACHING_TIME_THRESHOLD_MIN || stationCount <= APPROACHING_STATION_THRESHOLD;
}

/**
 * 도착 상태 텍스트를 생성합니다.
 */
function buildStatusText(predictTimeMin: number, stationCount: number): string {
  return isApproaching(predictTimeMin, stationCount)
    ? '곧 도착'
    : `${predictTimeMin}분 (${stationCount}전)`;
}

/**
 * 첫 번째·두 번째 버스 도착 정보를 BusArrival 객체로 조립합니다.
 */
function buildBusArrivalResult(
  busNo: string,
  stationName: string,
  first: { predictTimeMin: number; stationCount: number },
  second?: { predictTimeMin: number; stationCount: number }
): BusArrival {
  const isApp1 = isApproaching(first.predictTimeMin, first.stationCount);
  const isApp2 = second ? isApproaching(second.predictTimeMin, second.stationCount) : false;

  return {
    busNo,
    stationName,
    predictTime1: first.predictTimeMin,
    stationNum1: first.stationCount,
    predictTime2: second?.predictTimeMin ?? 0,
    stationNum2: second?.stationCount ?? 0,
    statusText1: buildStatusText(first.predictTimeMin, first.stationCount),
    statusText2:
      second && second.predictTimeMin > 0
        ? buildStatusText(second.predictTimeMin, second.stationCount)
        : '',
    isApproaching1: isApp1,
    isApproaching2: second && second.predictTimeMin > 0 ? isApp2 : false,
  };
}

/**
 * 응답 텍스트를 JSON 또는 XML로 파싱하여 리스트를 추출합니다.
 */
function parseListFromResponse<T>(
  text: string,
  jsonExtractor: (data: unknown) => unknown,
  xmlExtractor: (data: unknown) => unknown
): T[] {
  try {
    const data = JSON.parse(text) as unknown;
    const raw = jsonExtractor(data);
    if (Array.isArray(raw)) return raw as T[];
    if (raw != null) return [raw as T];
  } catch {
    const parser = new XMLParser();
    const xml = parser.parse(text) as unknown;
    const raw = xmlExtractor(xml);
    if (Array.isArray(raw)) return raw as T[];
    if (raw != null) return [raw as T];
  }
  return [];
}

/** ODsay 정류소 검색 API 캐시 TTL (7일, 604,800 초) */
const ODSAY_STATION_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

// ─── ODsay 캐시 래퍼 ──────────────────────────────────────────────────────────

/**
 * ODsay 정류소 검색API(#14 searchStation)를 수행하고 7일간 캐시합니다.
 */
const getCachedOdsayStationData = unstable_cache(
  async (stationName: string, apiKey: string, _referer?: string) => {
    return await OdsayAdapter.fetchSearchStation(stationName, '1', apiKey);
  },
  ['odsay-station-search-v1'],
  { revalidate: ODSAY_STATION_CACHE_TTL_SECONDS }
);

// ─── 경기도 API 조회 ──────────────────────────────────────────────────────────

/**
 * 경기도 버스 도착 정보 API에서 특정 노선의 도착 정보를 조회합니다.
 */
async function fetchGyeonggiArrival(
  busNo: string,
  stationName: string,
  localStationID: string,
  busLocalBlID: string | null
): Promise<BusArrival | null> {
  const ggApiKey = process.env.REAL_TIME_BUS_GYEONGGI_API_KEY;
  if (!isValidApiKey(ggApiKey) || !busLocalBlID) return null;

  try {
    const ggUrl =
      `https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2` +
      `?serviceKey=${encodeURIComponent(ggApiKey)}&stationId=${localStationID}&format=json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(ggUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const text = await res.text();
    const arrList = parseListFromResponse<GyeonggiArrivalItem>(
      text,
      (d) => (d as { response?: { msgBody?: { busArrivalList?: unknown } } }).response?.msgBody?.busArrivalList,
      (d) => (d as { response?: { msgBody?: { busArrivalList?: unknown } } }).response?.msgBody?.busArrivalList
    );

    const matched = arrList.find(
      (it) => String(it.routeId) === String(busLocalBlID)
    );
    if (!matched) return null;

    const pTime1 = matched.predictTime1 ? Number(matched.predictTime1) : 0;
    const loc1 = matched.locationNo1 ? Number(matched.locationNo1) : 0;
    if (pTime1 <= 0) return null;

    const pTime2 = matched.predictTime2 ? Number(matched.predictTime2) : 0;
    const loc2 = matched.locationNo2 ? Number(matched.locationNo2) : 0;

    return buildBusArrivalResult(
      busNo,
      stationName,
      { predictTimeMin: pTime1, stationCount: loc1 },
      pTime2 > 0 ? { predictTimeMin: pTime2, stationCount: loc2 } : undefined
    );
  } catch (e) {
    console.error('[busRealtimeService] 경기도 API 오류:', e);
    return null;
  }
}

// ─── TAGO API 조회 ────────────────────────────────────────────────────────────

/**
 * TAGO 버스 도착 정보 API에서 특정 노선의 도착 정보를 조회합니다 (노선 번호 엄격 매칭 적용).
 */
async function fetchTagoArrival(
  busNo: string,
  stationName: string,
  localStationID: string,
  cityCode: string,
  tagoKey: string
): Promise<BusArrival | null> {
  try {
    const isGyeonggi = cityCode.startsWith('31');
    const nodeId =
      isGyeonggi && /^\d+$/.test(localStationID)
        ? `${GYEONGGI_NODE_PREFIX}${localStationID}`
        : localStationID;

    const tagoUrl =
      `http://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList` +
      `?serviceKey=${tagoKey}&cityCode=${cityCode}&nodeId=${nodeId}` +
      `&_type=json&numOfRows=100&pageNo=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(tagoUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const text = await res.text();
    const items = parseListFromResponse<TagoBusItem>(
      text,
      (d) => (d as { response?: { body?: { items?: { item?: unknown } } } }).response?.body?.items?.item,
      (d) => (d as { response?: { body?: { items?: { item?: unknown } } } }).response?.body?.items?.item
    );

    const targetClean = busNo.trim();
    // 1단계: 완전 일치 (Strict Equals) 검증으로 "10"과 "10-1", "100" 오매칭 차단
    let matchedBuses = items.filter((it) => String(it.routeno || '').trim() === targetClean);

    // 2단계: 마을버스 접두어 등 보완 매칭
    if (matchedBuses.length === 0) {
      matchedBuses = items.filter((it) => {
        const rNo = String(it.routeno || '').trim();
        return rNo === targetClean || rNo === `마을${targetClean}` || rNo === `${targetClean}번`;
      });
    }

    matchedBuses.sort((a, b) => (a.arrtime ?? 0) - (b.arrtime ?? 0));

    if (matchedBuses.length === 0) return null;

    const [firstBus, secondBus] = matchedBuses;
    const pTime1 = Math.ceil((firstBus.arrtime ?? 0) / 60);
    const loc1 = firstBus.arrprevstationcnt ?? 0;

    const second =
      secondBus
        ? {
            predictTimeMin: Math.ceil((secondBus.arrtime ?? 0) / 60),
            stationCount: secondBus.arrprevstationcnt ?? 0,
          }
        : undefined;

    return buildBusArrivalResult(
      busNo,
      stationName,
      { predictTimeMin: pTime1, stationCount: loc1 },
      second
    );
  } catch (e) {
    console.error('[busRealtimeService] TAGO API 오류:', e);
    return null;
  }
}

// ─── 미설정 응답 빌더 ─────────────────────────────────────────────────────────

function buildNoInfoResult(busNo: string, stationName: string, isRealtime: boolean): BusArrival & { isRealtime: boolean } {
  return {
    busNo,
    stationName,
    predictTime1: 0,
    stationNum1: 0,
    predictTime2: 0,
    stationNum2: 0,
    statusText1: isRealtime ? '정보 없음' : '정보 없음 (API 키 누락)',
    statusText2: '',
    isApproaching1: false,
    isApproaching2: false,
    isRealtime,
  };
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 정류소명과 버스 번호로 실시간 버스 도착 정보를 조회합니다.
 */
export async function fetchBusRealtime(
  params: BusRealtimeQueryType,
  referer?: string
): Promise<BusArrival & { isRealtime: boolean }> {
  const { station, busNo } = params;
  const targetBusNo = normalizeBusNo(busNo);

  const odsayKey = process.env.ODSAY_API_KEY;
  const tagoKey = process.env.REAL_TIME_BUS_API_KEY;

  if (!isValidApiKey(tagoKey) || !isValidApiKey(odsayKey)) {
    return buildNoInfoResult(targetBusNo, station, false);
  }

  type OdsayResult = { result?: { station?: OdsayStation[] } };
  let odsayData: OdsayResult | null = null;
  try {
    odsayData = (await getCachedOdsayStationData(station, odsayKey, referer)) as OdsayResult;
  } catch (e) {
    console.error('[busRealtimeService] ODsay 캐시 조회 오류:', e);
  }

  const stations: OdsayStation[] = odsayData?.result?.station ?? [];
  if (stations.length === 0) {
    return buildNoInfoResult(targetBusNo, station, true);
  }

  // 엄격 매칭(===) 우선 탐색 후 포함 매칭 보완
  const matchedStation =
    stations.find((s) => s.businfo?.some((b) => String(b.busNo).trim() === targetBusNo)) ??
    stations.find((s) => s.businfo?.some((b) => String(b.busNo).includes(targetBusNo))) ??
    stations[0];

  const cityCode = resolveCityCode(matchedStation.cityName, matchedStation.stationCityCode);
  if (!cityCode) {
    return buildNoInfoResult(targetBusNo, station, true);
  }

  const localStationID = String(matchedStation.localStationID);
  const matchedBusInfo =
    matchedStation.businfo?.find((b) => String(b.busNo).trim() === targetBusNo) ??
    matchedStation.businfo?.find((b) => String(b.busNo).includes(targetBusNo));
  const busLocalBlID = matchedBusInfo ? String(matchedBusInfo.busLocalBlID) : null;

  if (cityCode.startsWith('31')) {
    const [ggResult, tagoResult] = await Promise.all([
      fetchGyeonggiArrival(targetBusNo, station, localStationID, busLocalBlID),
      fetchTagoArrival(targetBusNo, station, localStationID, cityCode, tagoKey),
    ]);

    const result = ggResult ?? tagoResult;
    if (result) return { ...result, isRealtime: true };
  } else {
    const tagoResult = await fetchTagoArrival(targetBusNo, station, localStationID, cityCode, tagoKey);
    if (tagoResult) return { ...tagoResult, isRealtime: true };
  }

  return buildNoInfoResult(targetBusNo, station, true);
}
