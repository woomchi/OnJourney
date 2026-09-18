import { TAGO_CITY_CODES, RELIABILITY_SCORES } from '@/constants/transit';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';
import { LruTtlCache } from '@/lib/utils/lruCache';
import {
  getTransitApiKey,
  getEncodedServiceKey,
  parseXmlOrJsonItems,
  safeNumber,
  safeString,
} from './transitUtils';

export interface FetchTagoParams {
  cityCode?: string;
  region?: string;
  nodeId: string;
  stationName?: string;
  lat?: number;
  lng?: number;
}

// 정류소 검색 캐시 (stationId/nodeno -> TAGO nodeId & cityCode, 24시간 LRU 캐시, 최대 500개)
const NODE_ID_CACHE = new LruTtlCache<string, { nodeId: string; cityCode?: string }>({
  maxSize: 500,
  defaultTtlMs: 24 * 60 * 60 * 1000,
});

// 노선 검색 캐시 (cityCode_routeNo -> TAGO routeId(s), 24시간 LRU 캐시, 최대 500개)
const ROUTE_ID_CACHE = new LruTtlCache<string, { routeId: string; routeIds?: string[] }>({
  maxSize: 500,
  defaultTtlMs: 24 * 60 * 60 * 1000,
});

// 좌표 기반 정류소 역조회 인플라이트 중복 방지 맵 (동시 진입 시 동일 좌표 단일 호출 보장)
const IN_FLIGHT_COORDS_LOOKUPS = new Map<string, Promise<{ nodeId: string; cityCode?: string } | null>>();

export class TagoBusService {
  // 국토교통부 정류소별 도착예정정보 목록조회 서비스 공식 엔드포인트
  private static readonly API_URL =
    'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList';
  // 국토교통부 버스위치정보 목록조회 서비스 공식 엔드포인트
  private static readonly BUS_POS_API_URL =
    'https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList';
  // 국토교통부 버스노선정보조회 서비스 (BusRouteInfoInqireService) 공식 엔드포인트
  private static readonly SEARCH_ROUTE_NO_LIST_URL =
    'https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList';
  private static readonly ROUTE_THROUGH_STTN_URL =
    'https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList';
  // 국토교통부 정류소정보조회 서비스 (BusSttnInfoInqireService) 공식 엔드포인트
  private static readonly SEARCH_STTN_NO_LIST_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList';
  private static readonly SEARCH_CRDNT_PRXMT_STTN_LIST_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList';

  /**
   * 버스 번호나 노선 유형(routety)을 바탕으로 버스 타입 분류
   */
  private static parseBusType(routeNo: string, routety?: string): BusType {
    if (routety) {
      if (routety.includes('광역') || routety.includes('좌석')) return 'express';
      if (routety.includes('순환')) return 'circulation';
      if (routety.includes('제한')) return 'limited';
    }

    const numRoute = parseInt(routeNo.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numRoute)) {
      if (numRoute >= 100 && numRoute <= 299) return 'express';
      if (numRoute >= 300 && numRoute <= 899) return 'normal';
    }

    return 'normal';
  }

  /**
   * 정류소 번호(ARS) 또는 정류소명으로 TAGO 표준 nodeId 검색
   */
  public static async lookupTagoNodeId(
    cityCode: string,
    stationId: string,
    stationName?: string,
    serviceKey?: string
  ): Promise<string | null> {
    const effectiveKey = serviceKey || getTransitApiKey('tago');
    if (!effectiveKey) return null;

    const cacheKey = `${cityCode}_${stationId}_${stationName || ''}`;
    const cached = NODE_ID_CACHE.get(cacheKey);
    if (cached) {
      return cached.nodeId;
    }

    try {
      const pureNo = stationId.replace(/[^0-9]/g, '');
      const encodedKey = getEncodedServiceKey('tago');

      let cleanStationName: string | undefined = undefined;
      if (stationName && stationName !== '정류소') {
        let name = stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName;
        name = name.replace(/\([^)]*\)/g, '').trim();
        name = name.replace(/\s*\d+번출구$/, '').trim();
        name = name.replace(/\s*(본원|정문|후문|동문|서문|동광장|서광장|대덕캠퍼스|보운캠퍼스)$/, '').trim();
        if (name.length >= 2) {
          cleanStationName = name;
        }
      }

      const executeQuery = async (queryParam: string): Promise<string | null> => {
        const searchUrl = `${this.SEARCH_STTN_NO_LIST_URL}?serviceKey=${encodedKey}&cityCode=${cityCode}&${queryParam}&pageNo=1&numOfRows=10&_type=json`;
        try {
          const res = await fetch(searchUrl, {
            headers: { Accept: 'application/json, text/xml, */*' },
            signal: AbortSignal.timeout(3500),
            next: { revalidate: 86400 },
          });
          if (!res.ok) return null;
          const text = await res.text();
          const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

          let targetItem: Record<string, unknown> | null = null;
          if (items.length > 0) {
            if (pureNo) {
              targetItem = items.find((it) => String(it.nodeno || '').replace(/[^0-9]/g, '') === pureNo) || items[0];
            } else {
              targetItem = items[0];
            }
          }

          if (targetItem?.nodeid) {
            const foundNodeId = safeString(targetItem.nodeid);
            const foundCityCode = targetItem.citycode ? safeString(targetItem.citycode) : cityCode;
            NODE_ID_CACHE.set(cacheKey, {
              nodeId: foundNodeId,
              cityCode: foundCityCode,
            });
            return foundNodeId;
          }
        } catch {
          // ignore query error
        }
        return null;
      };

      // 1. 정류소 고유번호(nodeNo) 기반 1차 시도
      if (pureNo && pureNo.length >= 4 && pureNo.length <= 8) {
        const foundByNo = await executeQuery(`nodeNo=${encodeURIComponent(pureNo)}`);
        if (foundByNo) return foundByNo;
      }

      // 2. 정류소명(nodeNm) 기반 2차 Fallback 시도
      if (cleanStationName && cleanStationName.length >= 2) {
        const foundByName = await executeQuery(`nodeNm=${encodeURIComponent(cleanStationName)}`);
        if (foundByName) return foundByName;
      }
    } catch {
      // ignore lookup error
    }

    return null;
  }

  /**
   * 노선 번호(routeNo) 및 도시코드(cityCode)로 국토교통부 표준 routeId 조회
   */
  public static async lookupTagoRouteId(
    cityCode: string,
    routeNo: string
  ): Promise<string | null> {
    const routeIds = await this.lookupTagoRouteIds(cityCode, routeNo);
    return routeIds.length > 0 ? routeIds[0] : null;
  }

  /**
   * 노선 번호(routeNo)에 해당하는 상행/하행 모든 TAGO routeId 목록 조회
   */
  public static async lookupTagoRouteIds(
    cityCode: string,
    routeNo: string
  ): Promise<string[]> {
    const apiKey = getTransitApiKey('tago');
    if (!apiKey || !routeNo) return [];

    const cleanNo = routeNo.trim();
    const cacheKey = `multi_${cityCode}_${cleanNo}`;
    const cached = ROUTE_ID_CACHE.get(cacheKey);
    if (cached) {
      return cached.routeIds || [cached.routeId];
    }

    try {
      const encodedKey = getEncodedServiceKey('tago');
      const requestUrl = `${this.SEARCH_ROUTE_NO_LIST_URL}?serviceKey=${encodedKey}&cityCode=${cityCode}&routeNo=${encodeURIComponent(cleanNo)}&pageNo=1&numOfRows=20&_type=json`;

      const res = await fetch(requestUrl, {
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(2500),
        next: { revalidate: 86400 },
      });

      if (!res.ok) return [];
      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const foundRouteIds: string[] = [];

      if (items.length > 0) {
        for (const it of items) {
          const itRouteNo = safeString(it.routeno);
          if (itRouteNo === cleanNo && it.routeid) {
            const rId = safeString(it.routeid);
            if (!foundRouteIds.includes(rId)) {
              foundRouteIds.push(rId);
            }
          }
        }
        if (foundRouteIds.length === 0 && items[0]?.routeid) {
          foundRouteIds.push(safeString(items[0].routeid));
        }
      }

      if (foundRouteIds.length > 0) {
        ROUTE_ID_CACHE.set(cacheKey, {
          routeId: foundRouteIds[0],
          routeIds: foundRouteIds,
        });
        return foundRouteIds;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[TagoBusService] TAGO multi-routeId 룩업 실패:', errMsg);
    }

    return [];
  }

  /**
   * 국토교통부(TAGO) 노선별 경유 정류소 목록 조회 (/getRouteAcctoThrghSttnList)
   */
  public static async getRouteThroughStations(
    cityCode: string,
    routeId: string
  ): Promise<{
    stations: Array<{
      stationId: string;
      stationName: string;
      stationSeq: number;
      lat: number;
      lng: number;
      arsNo?: string;
      updowncd?: string | number;
    }>;
    turningStationSeq?: number;
    turningStationName?: string;
  } | null> {
    const apiKey = getTransitApiKey('tago');
    if (!apiKey || !routeId) return null;

    try {
      const encodedKey = getEncodedServiceKey('tago');
      const cleanRouteId = routeId.trim();

      const requestUrl = `${this.ROUTE_THROUGH_STTN_URL}?serviceKey=${encodedKey}&cityCode=${encodeURIComponent(cityCode)}&routeId=${encodeURIComponent(cleanRouteId)}&pageNo=1&numOfRows=300&_type=json`;

      const res = await fetch(requestUrl, {
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return null;
      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);
      if (items.length === 0) return null;

      // nodeord 기준 오름차순 정렬
      items.sort((a, b) => (safeNumber(a.nodeord, 0) ?? 0) - (safeNumber(b.nodeord, 0) ?? 0));

      let turningStationSeq: number | undefined;
      let turningStationName: string | undefined;

      // updowncd 변화 지점(0 -> 1 등)을 탐지하여 회차점 계산
      for (let i = 0; i < items.length - 1; i++) {
        const curr = items[i];
        const next = items[i + 1];
        if (
          curr.updowncd !== undefined &&
          next.updowncd !== undefined &&
          String(curr.updowncd) !== String(next.updowncd)
        ) {
          turningStationSeq = safeNumber(curr.nodeord, i + 1);
          turningStationName = safeString(curr.nodenm);
          break;
        }
      }

      const stations = items.map((st, idx) => ({
        stationId: safeString(st.nodeid, `sttn_${idx + 1}`),
        stationName: safeString(st.nodenm),
        stationSeq: safeNumber(st.nodeord, idx + 1) ?? (idx + 1),
        lat: safeNumber(st.gpslati, 0) ?? 0,
        lng: safeNumber(st.gpslong, 0) ?? 0,
        arsNo: st.nodeno ? safeString(st.nodeno) : undefined,
        updowncd: st.updowncd as string | number | undefined,
      }));

      return {
        stations,
        turningStationSeq: turningStationSeq || Math.ceil(stations.length / 2),
        turningStationName,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[TagoBusService] getRouteThroughStations 실패:', errMsg);
      return null;
    }
  }

  /**
   * GPS 좌표(lat, lng) 기반 근접 정류소 목록 조회 (/getCrdntPrxmtSttnList)
   */
  public static async lookupTagoNodeIdByCoords(
    lat: number,
    lng: number,
    stationName?: string,
    serviceKey?: string
  ): Promise<{ nodeId: string; cityCode?: string } | null> {
    const effectiveKey = serviceKey || getTransitApiKey('tago');
    if (!effectiveKey || !lat || !lng) return null;

    const cacheKey = `coords_${lat.toFixed(4)}_${lng.toFixed(4)}_${stationName || ''}`;
    const cached = NODE_ID_CACHE.get(cacheKey);
    if (cached) {
      return { nodeId: cached.nodeId, cityCode: cached.cityCode };
    }

    const inFlight = IN_FLIGHT_COORDS_LOOKUPS.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const lookupPromise = (async () => {
      try {
        const encodedKey = getEncodedServiceKey('tago');
        const requestUrl = `${this.SEARCH_CRDNT_PRXMT_STTN_LIST_URL}?serviceKey=${encodedKey}&gpsLati=${lat}&gpsLong=${lng}&pageNo=1&numOfRows=10&_type=json`;

        const res = await fetch(requestUrl, {
          headers: { Accept: 'application/json, text/xml, */*' },
          signal: AbortSignal.timeout(3500),
          next: { revalidate: 86400 },
        });

        if (!res.ok) return null;
        const text = await res.text();
        const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

        let targetItem: Record<string, unknown> | null = null;
        const cleanStationName = stationName && stationName !== '정류소'
          ? (stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName).trim()
          : undefined;

        if (items.length > 0) {
          if (cleanStationName) {
            targetItem = items.find((it) => {
              const nName = safeString(it.nodenm);
              return nName.includes(cleanStationName) || cleanStationName.includes(nName);
            }) || items[0];
          } else {
            targetItem = items[0];
          }
        }

        if (targetItem?.nodeid) {
          const foundNodeId = safeString(targetItem.nodeid);
          const foundCityCode = targetItem.citycode ? safeString(targetItem.citycode) : undefined;
          const result = { nodeId: foundNodeId, cityCode: foundCityCode };
          NODE_ID_CACHE.set(cacheKey, result);
          return result;
        }
      } catch (err: unknown) {
        console.warn('[TagoBusService] nodeId 좌표 역조회 실패:', err);
      } finally {
        IN_FLIGHT_COORDS_LOOKUPS.delete(cacheKey);
      }
      return null;
    })();

    IN_FLIGHT_COORDS_LOOKUPS.set(cacheKey, lookupPromise);
    return lookupPromise;
  }

  /**
   * 국토교통부 TAGO 버스 도착 정보 조회 (전국 통합, 초고속 최적화)
   */
  public static async getArrivalInfo({
    cityCode,
    region = 'seoul',
    nodeId,
    stationName = '정류소',
    lat,
    lng,
  }: FetchTagoParams): Promise<NormalizedRealtimeData> {
    const apiKey = getTransitApiKey('tago');
    if (!apiKey) {
      return this.getMockData(nodeId, stationName, region);
    }

    try {
      const normalizedRegion = region.toLowerCase();
      const encodedKey = getEncodedServiceKey('tago');
      const resolvedCityCode = cityCode || TAGO_CITY_CODES[normalizedRegion] || '11';

      // 단일 정류소 도착 정보 호출 헬퍼
      const fetchArrival = async (candidateId: string, overrideCityCode?: string) => {
        const queryCityCode = overrideCityCode || resolvedCityCode;
        const requestUrl = `${this.API_URL}?serviceKey=${encodedKey}&cityCode=${queryCityCode}&nodeId=${encodeURIComponent(candidateId)}&pageNo=1&numOfRows=50&_type=json`;
        const res = await fetch(requestUrl, {
          method: 'GET',
          headers: { Accept: 'application/json, text/xml, */*' },
          signal: AbortSignal.timeout(3500),
          cache: 'no-store',
        }).catch(() => null);

        if (!res || !res.ok) return null;
        const text = await res.text();
        return parseXmlOrJsonItems<Record<string, unknown>>(text);
      };

      let parsedResult: { items: Record<string, unknown>[] } | null = null;
      let effectiveNodeId = nodeId;

      const isAutoOrNonNumeric = !nodeId || nodeId === 'auto' || nodeId === 'none' || !/[0-9]/.test(nodeId);

      // 1. 가상 정류소 또는 비숫자 ID인 경우 좌표 역조회 우선 실행
      if (isAutoOrNonNumeric && lat && lng) {
        const coordsInfo = await this.lookupTagoNodeIdByCoords(lat, lng, stationName, apiKey);
        if (coordsInfo?.nodeId) {
          effectiveNodeId = coordsInfo.nodeId;
          const res = await fetchArrival(coordsInfo.nodeId, coordsInfo.cityCode || resolvedCityCode);
          if (res && res.items.length > 0) {
            parsedResult = res;
          }
        }
      }

      // 2. 일반 숫자 ID 직접 조회
      if (!parsedResult && !isAutoOrNonNumeric) {
        const cleanNodeId = nodeId.trim();
        const res = await fetchArrival(cleanNodeId);
        if (res && res.items.length > 0) {
          parsedResult = res;
        } else {
          // 순수 숫자 변환 후 재시도
          const pureNumeric = cleanNodeId.replace(/[^0-9]/g, '');
          if (pureNumeric && pureNumeric !== cleanNodeId) {
            const pureRes = await fetchArrival(pureNumeric);
            if (pureRes && pureRes.items.length > 0) {
              parsedResult = pureRes;
              effectiveNodeId = pureNumeric;
            }
          }
        }
      }

      // 3. Fallback: 결과가 없고 좌표가 제공된 경우 근접 정류소 조회
      if (!parsedResult && lat && lng) {
        const coordsInfo = await this.lookupTagoNodeIdByCoords(lat, lng, stationName, apiKey);
        if (coordsInfo?.nodeId && coordsInfo.nodeId !== effectiveNodeId) {
          const res = await fetchArrival(coordsInfo.nodeId, coordsInfo.cityCode || resolvedCityCode);
          if (res && res.items.length > 0) {
            parsedResult = res;
            effectiveNodeId = coordsInfo.nodeId;
          }
        }
      }

      // 4. Fallback: 여전히 없으면 nodeNo 또는 nodeNm으로 TAGO 표준 nodeId 룩업
      if (!parsedResult) {
        const resolvedNodeId = await this.lookupTagoNodeId(
          resolvedCityCode,
          nodeId,
          stationName,
          apiKey
        );
        if (resolvedNodeId && resolvedNodeId !== effectiveNodeId) {
          const res = await fetchArrival(resolvedNodeId);
          if (res && res.items.length > 0) {
            parsedResult = res;
            effectiveNodeId = resolvedNodeId;
          }
        }
      }

      if (!parsedResult || parsedResult.items.length === 0) {
        const mock = this.getMockData(nodeId, stationName, region);
        mock.reliability = 0.4;
        return mock;
      }

      const nextArrivals: ArrivalBusItem[] = parsedResult.items
        .map((item) => {
          const rawRouteNo = item.routeno !== undefined && item.routeno !== null ? String(item.routeno).trim() : '';
          const routeId = item.routeid ? safeString(item.routeid) : undefined;
          const lineName = rawRouteNo || routeId || '버스';
          let arrivalSeconds = safeNumber(item.arrtime, 0) ?? 0;
          let isWaiting = false;
          let plannedDepartureTime: string | undefined;

          // 지자체에서 TAGO로 HHMM 시각 코드(예: 1720 = 17시 20분 출발)를 전달하는 경우 보정
          if (arrivalSeconds >= 1000 && arrivalSeconds <= 2400) {
            const hh = Math.floor(arrivalSeconds / 100);
            const mm = arrivalSeconds % 100;
            if (hh >= 0 && hh <= 24 && mm >= 0 && mm < 60) {
              isWaiting = true;
              plannedDepartureTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
              const now = new Date();
              const target = new Date();
              target.setHours(hh, mm, 0, 0);

              let diffMs = target.getTime() - now.getTime();
              if (diffMs < -12 * 60 * 60 * 1000) {
                diffMs += 24 * 60 * 60 * 1000;
              }
              const diffSec = Math.round(diffMs / 1000);
              arrivalSeconds = diffSec > 0 ? diffSec : 45;
            }
          }

          return {
            lineId: routeId,
            lineName,
            arrivedInSeconds: arrivalSeconds,
            currentStationSequence: safeNumber(item.arrprevstationcnt),
            busType: this.parseBusType(lineName, item.routety as string | undefined),
            isWaiting,
            plannedDepartureTime,
          };
        })
        .filter((item) => {
          if (item.arrivedInSeconds <= 0) return false;
          if (item.currentStationSequence !== undefined && item.currentStationSequence === 0 && item.arrivedInSeconds <= 60 && !item.isWaiting) {
            return false;
          }
          return true;
        });

      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId: effectiveNodeId || nodeId,
        stationName,
        nextArrivals,
        dataSource: 'tago',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.tago,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[TagoBusService] API 호출 실패:', errMsg);
      const mock = this.getMockData(nodeId, stationName, region);
      mock.errorMessage = `TAGO API 연동 에러: ${errMsg}`;
      mock.reliability = 0.5;
      return mock;
    }
  }

  /**
   * 노선별 버스 실시간 위치 목록 조회 (/getRouteAcctoBusLcList API 활용)
   */
  public static async getBusLocationInfo(
    routeId: string,
    cityCode?: string
  ): Promise<Array<{ vehicleno?: string; nodeid?: string; nodenm?: string; nodeord?: number; gpslati?: number; gpslong?: number }> | null> {
    const apiKey = getTransitApiKey('tago');
    if (!apiKey || !routeId) return null;

    try {
      const rawRouteId = String(routeId).trim();
      let effectiveCityCode = cityCode ? String(cityCode).trim() : '';

      const upperRouteId = rawRouteId.toUpperCase();
      if (upperRouteId.startsWith('DJB')) {
        effectiveCityCode = '25';
      } else if (upperRouteId.startsWith('BSB')) {
        effectiveCityCode = '21';
      } else if (upperRouteId.startsWith('DGB')) {
        effectiveCityCode = '22';
      } else if (upperRouteId.startsWith('ICB') || upperRouteId.startsWith('INB')) {
        effectiveCityCode = '23';
      } else if (upperRouteId.startsWith('GJB')) {
        effectiveCityCode = '24';
      } else if (upperRouteId.startsWith('USB')) {
        effectiveCityCode = '26';
      } else if (upperRouteId.startsWith('SJB')) {
        effectiveCityCode = '12';
      } else if (upperRouteId.startsWith('GGB')) {
        if (!effectiveCityCode || !effectiveCityCode.startsWith('31')) {
          effectiveCityCode = '31';
        }
      }

      if (!effectiveCityCode) {
        effectiveCityCode = '31';
      }

      let normalizedRouteId = rawRouteId;
      if (/^[0-9]+$/.test(rawRouteId)) {
        if (effectiveCityCode === '25') normalizedRouteId = `DJB${rawRouteId}`;
        else if (effectiveCityCode === '21') normalizedRouteId = `BSB${rawRouteId}`;
        else if (effectiveCityCode === '22') normalizedRouteId = `DGB${rawRouteId}`;
        else if (effectiveCityCode === '23') normalizedRouteId = `ICB${rawRouteId}`;
        else if (effectiveCityCode === '24') normalizedRouteId = `GJB${rawRouteId}`;
        else if (effectiveCityCode === '26') normalizedRouteId = `USB${rawRouteId}`;
        else if (effectiveCityCode === '12') normalizedRouteId = `SJB${rawRouteId}`;
        else if (effectiveCityCode.startsWith('31')) normalizedRouteId = `GGB${rawRouteId}`;
      }

      const encodedKey = getEncodedServiceKey('tago');
      const requestUrl = `${this.BUS_POS_API_URL}?serviceKey=${encodedKey}&cityCode=${effectiveCityCode}&routeId=${encodeURIComponent(normalizedRouteId)}&pageNo=1&numOfRows=50&_type=json`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);
      if (items.length === 0) return null;

      return items.map((it) => ({
        vehicleno: it.vehicleno ? safeString(it.vehicleno) : undefined,
        nodeid: it.nodeid ? safeString(it.nodeid) : undefined,
        nodenm: it.nodenm ? safeString(it.nodenm) : undefined,
        nodeord: safeNumber(it.nodeord),
        gpslati: safeNumber(it.gpslati),
        gpslong: safeNumber(it.gpslong),
      }));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[TagoBusService] 버스위치 API 연동 실패:', errMsg);
      return null;
    }
  }

  /**
   * 상행/하행 복수 routeId에 대해 동시 병렬 실시간 버스 위치 목록 조회
   */
  public static async getBusLocationInfoMulti(
    routeIds: string[],
    cityCode?: string
  ): Promise<Array<{ vehicleno?: string; nodeid?: string; nodenm?: string; nodeord?: number; gpslati?: number; gpslong?: number; routeId?: string; directionIdx?: number }>> {
    if (!routeIds || routeIds.length === 0) return [];

    const results = await Promise.allSettled(
      routeIds.map((rId, idx) =>
        this.getBusLocationInfo(rId, cityCode).then((posList) => ({
          posList,
          routeId: rId,
          directionIdx: idx,
        }))
      )
    );

    const mergedPositions: Array<{
      vehicleno?: string;
      nodeid?: string;
      nodenm?: string;
      nodeord?: number;
      gpslati?: number;
      gpslong?: number;
      routeId?: string;
      directionIdx?: number;
    }> = [];

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.posList && res.value.posList.length > 0) {
        for (const item of res.value.posList) {
          mergedPositions.push({
            ...item,
            routeId: res.value.routeId,
            directionIdx: res.value.directionIdx,
          });
        }
      }
    }

    return mergedPositions;
  }

  /**
   * 실시간 도착 정보 조회 트리거 (불필요한 가상 감산/버스위치 이중 조회를 제거하고 최적의 도착 정보 API 직접 호출)
   */
  public static async getArrivalInfoSmartNodeTrigger(params: FetchTagoParams): Promise<NormalizedRealtimeData> {
    return this.getArrivalInfo(params);
  }

  /**
   * Mock 데이터 생성
   */
  private static getMockData(
    stationId: string,
    stationName: string,
    region: string
  ): NormalizedRealtimeData {
    return {
      stationId,
      stationName,
      nextArrivals: [],
      dataSource: 'tago',
      lastUpdated: Date.now(),
      reliability: 0.0,
    };
  }
}
