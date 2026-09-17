import { RELIABILITY_SCORES } from '@/constants/transit';
import { calculateHaversineDistanceMeter } from '@/lib/utils/geoUtils';
import {
  ArrivalBusItem,
  BusType,
  GyeonggiBusLocationItem,
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

export interface GyeonggiRouteItem {
  routeId: string;
  routeName: string;
  routeTypeCd?: number;
  routeTypeName?: string;
  startStationId?: string;
  startStationName?: string;
  endStationId?: string;
  endStationName?: string;
  adminName?: string;
  regionName?: string;
}

export interface GyeonggiRouteStationResult {
  routeId: string;
  stations: Array<{
    stationId: string;
    stationName: string;
    stationSeq: number;
    lat: number;
    lng: number;
    arsNo?: string;
    isTurningPoint?: boolean;
    regionName?: string;
    adminName?: string;
  }>;
  turningStationSeq?: number;
  turningStationName?: string;
}

// 24시간 LRU 캐시
const GYEONGGI_ROUTE_LIST_CACHE = new LruTtlCache<string, GyeonggiRouteItem[]>({
  maxSize: 300,
  defaultTtlMs: 24 * 60 * 60 * 1000,
});

const GYEONGGI_ROUTE_STATION_CACHE = new LruTtlCache<string, GyeonggiRouteStationResult>({
  maxSize: 300,
  defaultTtlMs: 24 * 60 * 60 * 1000,
});

export class GyeonggiBusService {
  private static readonly API_URL =
    'https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2';
  private static readonly BUS_POS_API_URL_V2 =
    'https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2';
  private static readonly BUS_POS_API_URL_V1 =
    'https://apis.data.go.kr/6410000/buslocationservice/getBusLocationList';
  private static readonly BUS_ROUTE_API_URL_V2 =
    'https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2';
  private static readonly BUS_ROUTE_STATION_API_URL_V2 =
    'https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteStationListv2';

  /**
   * GBIS routeTypeCd 및 버스 번호를 바탕으로 BusType 분류
   */
  private static parseGyeonggiBusType(routeTypeCd?: number | string, routeName?: string): BusType {
    const cd = Number(routeTypeCd);
    if (cd === 11 || cd === 12 || cd === 14 || cd === 21 || cd === 22) {
      return 'express'; // 직행좌석, 좌석, 광역급행(M), 농어촌직행/좌석
    }
    if (cd === 15) return 'limited'; // 따복/맞춤형
    if (cd === 16) return 'circulation'; // 순환형

    const name = String(routeName || '').toUpperCase().trim();
    if (name.startsWith('M') || name.startsWith('G') || name.startsWith('P')) {
      return 'express';
    }
    return 'normal';
  }

  /**
   * 경기도 버스 도착 정보 조회 (단일 9자리 정류소 ID 기준 신속 호출)
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '경기 정류소'
  ): Promise<NormalizedRealtimeData> {
    const apiKey = getTransitApiKey('gyeonggi');
    if (!apiKey) {
      return this.getMockData(stationId, stationName);
    }

    try {
      // 경기도 정류소 ID는 9자리 숫자 고유번호가 표준
      const cleanStationId = stationId.replace(/^GGB/i, '').trim();
      const pureNumeric = stationId.replace(/[^0-9]/g, '');
      const targetStationId = cleanStationId || pureNumeric || stationId.trim();

      if (!targetStationId) {
        return this.getMockData(stationId, stationName);
      }

      const encodedKey = getEncodedServiceKey('gyeonggi');
      const requestUrl = `${this.API_URL}?serviceKey=${encodedKey}&stationId=${encodeURIComponent(targetStationId)}&format=json`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(2000),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`경기도 버스 API HTTP ${res.status}`);
      }

      const text = await res.text();
      const { items: itemsArray } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const rawTime1 = item.predictTime1 ?? item.predictedTime1;
        const rawTime2 = item.predictTime2 ?? item.predictedTime2;
        const time1 = safeNumber(rawTime1, 0) ?? 0;
        const time2 = safeNumber(rawTime2, 0) ?? 0;
        const lineName = safeString(item.routeName || item.routeNo);
        const routeId = safeString(item.routeId || lineName || '버스');
        const destination = item.routeDestName ? safeString(item.routeDestName) : (item.stopName ? safeString(item.stopName) : undefined);
        const busType = this.parseGyeonggiBusType(item.routeTypeCd as number | string | undefined, lineName);
        const isExpress = busType === 'express';

        const parseRemainSeats = (val: unknown): number | undefined => {
          if (!isExpress) return undefined;
          const num = safeNumber(val);
          return num !== undefined && num >= 0 ? num : undefined;
        };

        const parseCrowdedStatus = (val: unknown): string | undefined => {
          const str = safeString(val);
          if (!str || str === '0') return undefined;
          if (str === '1') return '여유';
          if (str === '2') return '보통';
          if (str === '3') return '혼잡';
          if (str === '4') return '매우혼잡';
          return str;
        };

        const loc1 = safeNumber(item.locationNo1 ?? item.locationNumber1);
        const loc2 = safeNumber(item.locationNo2 ?? item.locationNumber2);
        const seats1 = parseRemainSeats(item.remainSeatCnt1);
        const seats2 = parseRemainSeats(item.remainSeatCnt2);
        const crowded1 = parseCrowdedStatus(item.crowded1);
        const crowded2 = parseCrowdedStatus(item.crowded2);

        if (time1 > 0) {
          nextArrivals.push({
            lineId: routeId,
            lineName: lineName || routeId,
            arrivedInSeconds: time1 * 60,
            currentStationSequence: loc1,
            busType,
            destination,
            remainSeats: seats1,
            crowded: crowded1,
          });
        }

        if (time2 > 0) {
          nextArrivals.push({
            lineId: `${routeId}_2`,
            lineName: lineName || routeId,
            arrivedInSeconds: time2 * 60,
            currentStationSequence: loc2,
            busType,
            destination,
            remainSeats: seats2,
            crowded: crowded2,
          });
        }
      }

      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId,
        stationName,
        nextArrivals,
        dataSource: 'gyeonggi',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.gyeonggi,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[GyeonggiBusService] API 호출 실패:', errMsg);
      const mock = this.getMockData(stationId, stationName);
      mock.errorMessage = `경기도 API 연동 에러: ${errMsg}`;
      mock.reliability = 0.5;
      return mock;
    }
  }

  /**
   * 경기도 실시간 버스 위치 목록 조회 (v2 getBusLocationListv2 우선 연동, v1 fallback)
   */
  public static async getBusLocationList(
    routeId: string
  ): Promise<GyeonggiBusLocationItem[] | null> {
    const apiKey = getTransitApiKey('gyeonggi');
    if (!apiKey || !routeId) {
      return null;
    }

    try {
      const cleanRouteId = routeId.replace(/^GGB/i, '').trim();
      const encodedKey = getEncodedServiceKey('gyeonggi');

      // 1. v2 공식 엔드포인트 호출
      const v2Url = `${this.BUS_POS_API_URL_V2}?serviceKey=${encodedKey}&routeId=${encodeURIComponent(cleanRouteId)}&format=json`;

      let response = await fetch(v2Url, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }).catch(() => null);

      // 2. v2 응답이 정상이 아니면 v1 엔드포인트로 Fallback
      if (!response || !response.ok) {
        const v1Url = `${this.BUS_POS_API_URL_V1}?serviceKey=${encodedKey}&routeId=${encodeURIComponent(cleanRouteId)}&format=json`;
        response = await fetch(v1Url, {
          method: 'GET',
          headers: { Accept: 'application/json, text/xml, */*' },
          signal: AbortSignal.timeout(3000),
          cache: 'no-store',
        }).catch(() => null);
      }

      if (!response || !response.ok) {
        return null;
      }

      const text = await response.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);
      if (items.length === 0) return null;

      return items.map((item) => {
        const remainSeats = safeNumber(item.remainSeatCnt);
        return {
          routeId: item.routeId ? safeString(item.routeId) : cleanRouteId,
          stationId: item.stationId ? safeString(item.stationId) : undefined,
          stationSeq: safeNumber(item.stationSeq ?? item.stationSequence),
          plateNo: item.plateNo ? safeString(item.plateNo) : undefined,
          remainSeatCnt: remainSeats !== undefined && remainSeats >= 0 ? remainSeats : undefined,
          plateType: safeNumber(item.plateType),
          lowPlate: safeNumber(item.lowPlate),
          endBus: safeNumber(item.endBus),
          density: safeNumber(item.density),
          vehId: item.vehId ? safeString(item.vehId) : undefined,
        };
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[GyeonggiBusService] 버스 위치 API 연동 실패:', errMsg);
      return null;
    }
  }

  /**
   * 경기도 버스 노선 목록 검색 (v2 getBusRouteListv2)
   */
  public static async getRouteList(
    keyword: string
  ): Promise<GyeonggiRouteItem[] | null> {
    const cleanKeyword = keyword.trim();
    if (!cleanKeyword) return null;

    const cached = GYEONGGI_ROUTE_LIST_CACHE.get(cleanKeyword);
    if (cached) return cached;

    const apiKey = getTransitApiKey('gyeonggi');
    if (!apiKey) return null;

    try {
      const encodedKey = getEncodedServiceKey('gyeonggi');
      const url = `${this.BUS_ROUTE_API_URL_V2}?serviceKey=${encodedKey}&keyword=${encodeURIComponent(cleanKeyword)}&format=json`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      }).catch(() => null);

      if (!response || !response.ok) {
        return null;
      }

      const text = await response.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);
      if (items.length === 0) return null;

      const result: GyeonggiRouteItem[] = items
        .map((item) => ({
          routeId: safeString(item.routeId),
          routeName: safeString(item.routeName || item.busRouteNm),
          routeTypeCd: safeNumber(item.routeTypeCd),
          routeTypeName: item.routeTypeName ? safeString(item.routeTypeName) : undefined,
          startStationId: item.startStationId ? safeString(item.startStationId) : undefined,
          startStationName: item.startStationName ? safeString(item.startStationName) : undefined,
          endStationId: item.endStationId ? safeString(item.endStationId) : undefined,
          endStationName: item.endStationName ? safeString(item.endStationName) : undefined,
          adminName: item.adminName ? safeString(item.adminName) : undefined,
          regionName: item.regionName ? safeString(item.regionName) : undefined,
        }))
        .filter((r) => r.routeId && r.routeName);

      if (result.length > 0) {
        GYEONGGI_ROUTE_LIST_CACHE.set(cleanKeyword, result);
      }

      return result.length > 0 ? result : null;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[GyeonggiBusService] 노선 검색 API 연동 실패:', errMsg);
      return null;
    }
  }

  /**
   * 단서(정류소명, 좌표, 목적지, 시군)를 바탕으로 동일 번호의 여러 노선 중 최적의 1개 노선 판별
   */
  public static async findBestRoute(params: {
    busNo: string;
    stationName?: string;
    destination?: string;
    headsign?: string;
    cityCode?: string;
    lat?: number;
    lng?: number;
  }): Promise<GyeonggiRouteItem | null> {
    const rawList = await this.getRouteList(params.busNo);
    if (!rawList || rawList.length === 0) return null;

    const cleanNo = params.busNo.trim();
    // 1단계: 노선 번호가 정확히 일치하는 후보들만 엄선
    let candidates = rawList.filter((r) => String(r.routeName).trim() === cleanNo);
    if (candidates.length === 0) {
      candidates = rawList.filter((r) => String(r.routeName).replace(/번$/, '').trim() === cleanNo);
    }
    if (candidates.length === 0) {
      candidates = rawList;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const cleanStation = params.stationName
      ? params.stationName.replace(/정류소$|정류장$|역$/, '').trim()
      : undefined;

    // 2단계: stationName이 있는 경우 경유 정류소 검증
    if (cleanStation) {
      const stationChecks = await Promise.all(
        candidates.map(async (c) => {
          const detail = await this.getRouteStationList(c.routeId).catch(() => null);
          if (!detail || !detail.stations) return { candidate: c, matched: false, minDist: Infinity };

          const matched = detail.stations.some((s) =>
            s.stationName.replace(/정류소$|정류장$|역$/, '').trim().includes(cleanStation) ||
            cleanStation.includes(s.stationName.replace(/정류소$|정류장$|역$/, '').trim())
          );

          let minDist = Infinity;
          if (params.lat && params.lng) {
            for (const st of detail.stations) {
              if (st.lat && st.lng) {
                const d = calculateHaversineDistanceMeter(params.lat, params.lng, st.lat, st.lng);
                if (d < minDist) minDist = d;
              }
            }
          }

          return { candidate: c, matched, minDist };
        })
      );

      // 2-1. 정류소명이 일치하는 노선 탐색
      const nameMatched = stationChecks.filter((item) => item.matched);
      if (nameMatched.length === 1) {
        return nameMatched[0].candidate;
      }
      if (nameMatched.length > 1) {
        nameMatched.sort((a, b) => a.minDist - b.minDist);
        return nameMatched[0].candidate;
      }

      // 2-2. 사용자 좌표 반경 3km 이내 정류소를 지나는 노선 탐색
      const nearMatched = stationChecks.filter((item) => item.minDist <= 3000);
      if (nearMatched.length > 0) {
        nearMatched.sort((a, b) => a.minDist - b.minDist);
        return nearMatched[0].candidate;
      }
    }

    // 3단계: destination / headsign 매칭
    const targetDest = (params.destination || params.headsign || '')
      .replace(/[\s\(\)\-_]/g, '')
      .toLowerCase();

    if (targetDest) {
      const destMatched = candidates.find((c) => {
        const start = (c.startStationName || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        const end = (c.endStationName || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
        return (
          (start && (targetDest.includes(start) || start.includes(targetDest))) ||
          (end && (targetDest.includes(end) || end.includes(targetDest)))
        );
      });
      if (destMatched) return destMatched;
    }

    // 4단계: cityCode 또는 지역명 매칭
    if (params.cityCode) {
      const codeMatch = candidates.find((c) => {
        const admin = c.adminName || '';
        const region = c.regionName || '';
        if (params.cityCode?.startsWith('3124') && (admin.includes('화성') || region.includes('화성'))) return true;
        if (params.cityCode?.startsWith('3101') && (admin.includes('수원') || region.includes('수원'))) return true;
        if (params.cityCode?.startsWith('3121') && (admin.includes('오산') || region.includes('오산'))) return true;
        if (params.cityCode?.startsWith('3119') && (admin.includes('용인') || region.includes('용인'))) return true;
        if (params.cityCode?.startsWith('3102') && (admin.includes('성남') || region.includes('성남'))) return true;
        return false;
      });
      if (codeMatch) return codeMatch;
    }

    return candidates[0];
  }

  /**
   * 경기도 버스 노선 경유 정류소 목록 조회 (v2 getBusRouteStationListv2)
   */
  public static async getRouteStationList(
    routeId: string
  ): Promise<GyeonggiRouteStationResult | null> {
    const cleanRouteId = routeId.replace(/^GGB/i, '').trim();
    if (!cleanRouteId) return null;

    const cached = GYEONGGI_ROUTE_STATION_CACHE.get(cleanRouteId);
    if (cached) return cached;

    const apiKey = getTransitApiKey('gyeonggi');
    if (!apiKey) return null;

    try {
      const encodedKey = getEncodedServiceKey('gyeonggi');
      const url = `${this.BUS_ROUTE_STATION_API_URL_V2}?serviceKey=${encodedKey}&routeId=${encodeURIComponent(cleanRouteId)}&format=json`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(4000),
        cache: 'no-store',
      }).catch(() => null);

      if (!response || !response.ok) {
        return null;
      }

      const text = await response.text();
      const { items, rawResponse } = parseXmlOrJsonItems<Record<string, unknown>>(text);
      if (items.length === 0) return null;

      // turnSeq 추출
      let rawTurnSeq: number | undefined;
      const resObj = (rawResponse?.response || rawResponse) as Record<string, unknown> | undefined;
      const msgBodyObj = resObj?.msgBody as Record<string, unknown> | undefined;
      if (msgBodyObj?.turnSeq !== undefined) {
        rawTurnSeq = safeNumber(msgBodyObj.turnSeq);
      }

      let turningStationSeq = rawTurnSeq;
      let turningStationName: string | undefined = undefined;

      const stations = items.map((item) => {
        const seq = safeNumber(item.stationSeq ?? item.stationSequence, 0) ?? 0;
        const isTurning = item.turnYn === 'Y' || (turningStationSeq !== undefined && seq === turningStationSeq);
        const name = safeString(item.stationName);

        if (isTurning && !turningStationName) {
          turningStationName = name;
          if (turningStationSeq === undefined) {
            turningStationSeq = seq;
          }
        }

        return {
          stationId: safeString(item.stationId),
          stationName: name,
          stationSeq: seq,
          lat: safeNumber(item.y ?? item.lat, 0) ?? 0,
          lng: safeNumber(item.x ?? item.lng, 0) ?? 0,
          arsNo: item.mobileNo ? safeString(item.mobileNo) : undefined,
          isTurningPoint: isTurning,
          regionName: item.regionName ? safeString(item.regionName) : undefined,
          adminName: item.adminName ? safeString(item.adminName) : undefined,
        };
      }).sort((a, b) => a.stationSeq - b.stationSeq);

      const result: GyeonggiRouteStationResult = {
        routeId: cleanRouteId,
        stations,
        turningStationSeq,
        turningStationName,
      };

      if (stations.length > 0) {
        GYEONGGI_ROUTE_STATION_CACHE.set(cleanRouteId, result);
      }

      return stations.length > 0 ? result : null;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[GyeonggiBusService] 노선 경유 정류소 조회 실패:', errMsg);
      return null;
    }
  }

  private static getMockData(
    stationId: string,
    stationName: string
  ): NormalizedRealtimeData {
    return {
      stationId,
      stationName,
      nextArrivals: [],
      dataSource: 'gyeonggi',
      lastUpdated: Date.now(),
      reliability: 0.0,
    };
  }
}
