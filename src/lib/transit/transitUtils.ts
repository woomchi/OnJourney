import { XMLParser } from 'fast-xml-parser';

/**
 * 전국 버스 실시간 API 공통 XML 파서 싱글톤
 */
const sharedXmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

/**
 * 지역별 실시간 버스 API 인증키 조회 유틸리티
 * - 공공데이터포털 통합 키(BUS_DATA_API_KEY)를 1순위로 참조 (레거시 REAL_TIME_BUS_API_KEY Fallback)
 * - 각 지자체별/TAGO 레거시 환경변수를 순차적으로 Fallback 참조
 */
export function getTransitApiKey(region?: string): string {
  const primary = process.env.BUS_DATA_API_KEY || process.env.REAL_TIME_BUS_API_KEY;
  if (primary && primary.trim()) {
    return primary.trim().replace(/^["']|["']$/g, '');
  }

  const normalizedRegion = (region || '').toLowerCase();
  let candidate: string | undefined;

  switch (normalizedRegion) {
    case 'busan':
      candidate =
        process.env.REAL_TIME_BUS_BUSAN_API_KEY ||
        process.env.BUSAN_BUS_API_KEY ||
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;

    case 'incheon':
      candidate =
        process.env.REAL_TIME_BUS_INCHEON_API_KEY ||
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;

    case 'daejeon':
      candidate =
        process.env.REAL_TIME_BUS_DAEJEON_API_KEY ||
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;

    case 'daegu':
      candidate =
        process.env.REAL_TIME_BUS_DAEGU_API_KEY ||
        process.env.DAEGU_BUS_API_KEY ||
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;

    case 'gyeonggi':
      candidate =
        process.env.REAL_TIME_BUS_GYEONGGI_API_KEY ||
        process.env.GYEONGGI_BUS_API_KEY ||
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;

    default:
      candidate =
        process.env.REAL_TIME_BUS_TAGO_API_KEY ||
        process.env.TAGO_API_KEY ||
        process.env.DATA_GO_KR_API_KEY;
      break;
  }

  return (candidate || '').trim().replace(/^["']|["']$/g, '');
}

/**
 * URL 쿼리 파라미터로 안전하게 전달하기 위한 URL-Encoded serviceKey 생성
 */
export function getEncodedServiceKey(region?: string): string {
  const key = getTransitApiKey(region);
  if (!key) return '';
  const decoded = key.includes('%') ? decodeURIComponent(key) : key;
  return encodeURIComponent(decoded);
}

/**
 * 공공데이터포털 API의 다양한 XML/JSON 응답 구조에서 데이터 아이템 배열을 안전하게 추출
 */
export function parseXmlOrJsonItems<T = Record<string, unknown>>(
  text: string
): { items: T[]; rawResponse: Record<string, unknown> | null } {
  if (!text || !text.trim()) {
    return { items: [], rawResponse: null };
  }

  let root: Record<string, unknown> | null = null;

  // 1. JSON 파싱 우선 시도
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object') {
      root = json as Record<string, unknown>;
    }
  } catch {
    // 2. XML 파싱 Fallback
    try {
      const parsed = sharedXmlParser.parse(text);
      if (parsed && typeof parsed === 'object') {
        root = parsed as Record<string, unknown>;
      }
    } catch {
      root = null;
    }
  }

  if (!root) {
    return { items: [], rawResponse: null };
  }

  // response or ServiceResult 루트 탐색
  const res = (root.response || root.ServiceResult || root) as Record<string, unknown>;
  const msgBody = (res.msgBody || root.msgBody) as Record<string, unknown> | undefined;
  const body = (res.body || root.body) as Record<string, unknown> | undefined;

  const itemsObj = body?.items as Record<string, unknown> | undefined;

  // 다양한 엔드포인트별 아이템 경로 순차 탐색
  const candidates: unknown[] = [
    msgBody?.busArrivalList,
    msgBody?.busLocationList,
    msgBody?.busRouteList,
    msgBody?.busRouteStationList,
    msgBody?.itemList,
    itemsObj?.item,
    itemsObj?.itemList,
    itemsObj?.busArrivalItem,
    itemsObj?.busLocationItem,
    itemsObj?.busRouteList,
    itemsObj?.busRouteStationList,
    body?.itemList,
    body?.items,
    (res.items as Record<string, unknown> | undefined)?.item,
  ];

  let rawList: unknown = null;
  for (const c of candidates) {
    if (c !== undefined && c !== null) {
      rawList = c;
      break;
    }
  }

  let items: T[] = [];
  if (Array.isArray(rawList)) {
    items = rawList as T[];
  } else if (rawList && typeof rawList === 'object') {
    items = [rawList as T];
  }

  return { items, rawResponse: root };
}

/**
 * 안전한 숫자 파싱 헬퍼
 */
export function safeNumber(val: unknown, fallback?: number): number | undefined {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return !isNaN(num) ? num : fallback;
}

/**
 * 안전한 문자열 파싱 헬퍼
 */
export function safeString(val: unknown, fallback = ''): string {
  if (val === undefined || val === null) return fallback;
  return String(val).trim();
}
