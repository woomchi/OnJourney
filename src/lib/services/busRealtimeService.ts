/**
 * @fileoverview 버스 실시간 도착 정보 서비스
 *
 * ODsay API로 정류소 ID를 조회한 뒤,
 * 경기도 API 또는 TAGO API에서 실시간 버스 도착 정보를 가져옵니다.
 *
 * 조회 전략:
 * - 경기도 노선(cityCode "31xxx") → 경기도 API 우선 → TAGO 병렬 Fallback
 * - 그 외 시도 → TAGO API 단독 조회
 */

import { XMLParser } from 'fast-xml-parser';
import { BusRealtimeQueryType } from '../validations/bus';
import { unstable_cache } from 'next/cache';
import type { BusArrival } from '@/types/journey';

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
 * 도시명 → TAGO cityCode 매핑 테이블.
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
}

/** ODsay 정류소 검색 결과의 단일 정류소 */
interface OdsayStation {
  cityName: string;
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
 * API 키가 유효한지 확인합니다 (미설정 또는 플레이스홀더 제외).
 */
function isValidApiKey(key: string | undefined): key is string {
  return Boolean(key && key !== API_KEY_PLACEHOLDER && key.trim() !== '');
}

/**
 * 예상 도착 시간과 남은 정류장 수로 '곧 도착' 여부를 판별합니다.
 */
function isApproaching(predictTimeMin: number, stationCount: number): boolean {
  return predictTimeMin <= APPROACHING_TIME_THRESHOLD_MIN || stationCount <= APPROACHING_STATION_THRESHOLD;
}

/**
 * 도착 상태 텍스트를 생성합니다.
 * @example buildStatusText(3, 5) → "3분 (5전)"
 * @example buildStatusText(1, 0) → "곧 도착"
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
 * TAGO API는 JSON/XML 양쪽으로 응답할 수 있습니다.
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

// ─── ODsay 캐시 래퍼 ──────────────────────────────────────────────────────────

/**
 * ODsay 정류소 검색을 수행하고 24시간 캐시합니다.
 * 정류소 데이터는 자주 변경되지 않아 장기 캐시가 적합합니다.
 */
const getCachedOdsayStationData = unstable_cache(
  async (stationName: string, apiKey: string, referer?: string) => {
    const url =
      `https://api.odsay.com/v1/api/searchStation` +
      `?lang=0&stationName=${encodeURIComponent(stationName)}&stationClass=1` +
      `&apiKey=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        Referer: referer || process.env.DOMAIN || 'http://localhost:3000',
      };
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store', headers });
      if (!res.ok) throw new Error(`ODsay 응답 오류: ${res.status}`);

      const data = await res.json() as { error?: unknown };
      if (data?.error) throw new Error('ODsay API 에러 응답');

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  ['odsay-station-search'],
  { revalidate: ODSAY_CACHE_TTL_SECONDS }
);

// ─── 경기도 API 조회 ──────────────────────────────────────────────────────────

/**
 * 경기도 버스 도착 정보 API에서 특정 노선의 도착 정보를 조회합니다.
 *
 * - 경기도 전용 API Key(`REAL_TIME_BUS_GYEONGGI_API_KEY`)를 사용합니다.
 * - 경기도 노선이 아니거나 키가 없으면 null을 반환합니다.
 *
 * @returns BusArrival 또는 조회 실패 시 null
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
 * TAGO 버스 도착 정보 API에서 특정 노선의 도착 정보를 조회합니다.
 *
 * - 경기도 정류소(`cityCode` "31xxx")는 nodeId에 "GGB" 접두사를 붙입니다.
 * - 노선 번호 부분 매칭으로 버스를 식별합니다.
 *
 * @returns BusArrival 또는 조회 실패 시 null
 */
async function fetchTagoArrival(
  busNo: string,
  stationName: string,
  localStationID: string,
  cityCode: string,
  tagoKey: string
): Promise<BusArrival | null> {
  try {
    // 경기도 노선은 nodeId에 "GGB" 접두사 필요
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

    // 노선 번호 부분 매칭 후 도착 시간 오름차순 정렬
    const matchedBuses = items
      .filter((it) => String(it.routeno).includes(busNo))
      .sort((a, b) => (a.arrtime ?? 0) - (b.arrtime ?? 0));

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

/**
 * API 키 없음 또는 정류소 미조회 시 반환하는 기본(정보 없음) 응답을 생성합니다.
 */
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
 *
 * 1. ODsay로 정류소 정보 조회 (도시명 + localStationID + busLocalBlID)
 * 2. 경기도 노선이면 경기도 API와 TAGO를 병렬 호출, 경기도 결과 우선
 * 3. 매칭 결과 없으면 '정보 없음' 응답 반환
 *
 * @param params.station 정류소명
 * @param params.busNo   버스 노선 번호
 * @param referer        ODsay API 호출 시 Referer 헤더 (CORS 허용 도메인)
 */
export async function fetchBusRealtime(
  params: BusRealtimeQueryType,
  referer?: string
): Promise<BusArrival & { isRealtime: boolean }> {
  const { station, busNo } = params;
  // "3번 버스", "3번" 등의 접미사 제거
  const targetBusNo = busNo.replace(/번\s*버스$/, '').replace(/번$/, '').trim();

  const odsayKey = process.env.ODSAY_API_KEY;
  const tagoKey = process.env.REAL_TIME_BUS_API_KEY;

  // ─ API 키 미설정 → 즉시 반환 ─
  if (!isValidApiKey(tagoKey) || !isValidApiKey(odsayKey)) {
    return buildNoInfoResult(targetBusNo, station, false);
  }

  // ─ ODsay 정류소 정보 조회 ─
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

  // 해당 버스 번호를 운행하는 정류소 우선 선택, 없으면 첫 번째 정류소 사용
  const matchedStation =
    stations.find((s) => s.businfo?.some((b) => String(b.busNo) === targetBusNo)) ??
    stations[0];

  const cityCode = CITY_CODE_MAP[matchedStation.cityName];
  if (!cityCode) {
    return buildNoInfoResult(targetBusNo, station, true);
  }

  const localStationID = String(matchedStation.localStationID);
  const matchedBusInfo = matchedStation.businfo?.find((b) => String(b.busNo) === targetBusNo);
  const busLocalBlID = matchedBusInfo ? String(matchedBusInfo.busLocalBlID) : null;

  // ─ 경기도 노선: 경기도 API와 TAGO 병렬 호출, 경기도 결과 우선 ─
  if (cityCode.startsWith('31')) {
    const [ggResult, tagoResult] = await Promise.all([
      fetchGyeonggiArrival(targetBusNo, station, localStationID, busLocalBlID),
      fetchTagoArrival(targetBusNo, station, localStationID, cityCode, tagoKey),
    ]);

    const result = ggResult ?? tagoResult;
    if (result) return { ...result, isRealtime: true };
  } else {
    // ─ 그 외 시도: TAGO 단독 조회 ─
    const tagoResult = await fetchTagoArrival(targetBusNo, station, localStationID, cityCode, tagoKey);
    if (tagoResult) return { ...tagoResult, isRealtime: true };
  }

  return buildNoInfoResult(targetBusNo, station, true);
}
