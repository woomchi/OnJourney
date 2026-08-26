import { XMLParser } from 'fast-xml-parser';
import { RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusType,
  GyeonggiApiResponse,
  GyeonggiBusItem,
  GyeonggiBusLocationApiResponse,
  GyeonggiBusLocationItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';

export class GyeonggiBusService {
  private static API_URL =
    'https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2';
  private static BUS_POS_API_URL_V2 =
    'https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2';
  private static BUS_POS_API_URL_V1 =
    'https://apis.data.go.kr/6410000/buslocationservice/getBusLocationList';

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
   * 경기도 버스 도착 정보 조회
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '경기 정류소'
  ): Promise<NormalizedRealtimeData> {
    const apiKey =
      process.env.GYEONGGI_BUS_API_KEY ||
      process.env.REAL_TIME_BUS_GYEONGGI_API_KEY;

    if (!apiKey) {
      return this.getMockData(stationId, stationName);
    }

    try {
      const cleanStationId = stationId.replace(/^GGB/i, '').trim();
      const pureNumeric = stationId.replace(/[^0-9]/g, '');
      const stationIdCandidates = Array.from(
        new Set([cleanStationId, pureNumeric, stationId.trim()].filter(Boolean))
      );
      const rawServiceKey = apiKey.includes('%') ? decodeURIComponent(apiKey.trim()) : apiKey.trim();
      const encodedServiceKey = encodeURIComponent(rawServiceKey);

      const fetchCandidate = async (candidateId: string): Promise<GyeonggiApiResponse | null> => {
        const requestUrl = `${this.API_URL}?serviceKey=${encodedServiceKey}&stationId=${encodeURIComponent(candidateId)}&format=json`;
        const res = await fetch(requestUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
          next: { revalidate: 20 },
        });
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as GyeonggiApiResponse | null;
      };

      const candidateResults = await Promise.allSettled(
        stationIdCandidates.map((cId) => fetchCandidate(cId))
      );

      let validJson: GyeonggiApiResponse | null = null;
      for (const result of candidateResults) {
        if (result.status === 'fulfilled' && result.value) {
          const json = result.value;
          const list = json.response?.msgBody?.busArrivalList || json.response?.body?.items;
          if (list && (Array.isArray(list) ? list.length > 0 : true)) {
            validJson = json;
            break;
          } else if (!validJson) {
            validJson = json;
          }
        }
      }

      if (!validJson || !validJson.response) {
        throw new Error('경기도 버스 API 유효 응답 없음');
      }

      const json = validJson as Record<string, any>;
      const rawList =
        json.response?.msgBody?.busArrivalList ||
        json.response?.body?.items?.busArrivalItem ||
        json.response?.body?.items ||
        [];

      const itemsArray: Record<string, any>[] = Array.isArray(rawList)
        ? rawList
        : rawList && typeof rawList === 'object'
        ? [rawList]
        : [];

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const rawTime1 = item.predictTime1 ?? item.predictedTime1;
        const rawTime2 = item.predictTime2 ?? item.predictedTime2;
        const time1 = rawTime1 !== undefined && rawTime1 !== '' ? Number(rawTime1) || 0 : 0;
        const time2 = rawTime2 !== undefined && rawTime2 !== '' ? Number(rawTime2) || 0 : 0;
        const lineName = String(item.routeName || item.routeNo || '').trim();
        const routeId = String(item.routeId || lineName || '버스');
        const destination = item.routeDestName || item.stopName || undefined;
        const busType = this.parseGyeonggiBusType(item.routeTypeCd, lineName);

        const isExpress = busType === 'express';

        const parseLocationNo = (val: unknown): number | undefined => {
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return !isNaN(num) ? num : undefined;
        };

        const parseRemainSeats = (val: unknown): number | undefined => {
          // 일반 시내버스는 좌석 예약제가 아니므로 항상 undefined 반환하여 '만석' 오표시 차단
          if (!isExpress) return undefined;
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return !isNaN(num) && num >= 0 ? num : undefined;
        };

        const parseCrowdedStatus = (val: unknown): string | undefined => {
          if (val === undefined || val === null || val === '') return undefined;
          const str = String(val).trim();
          if (str === '0') return undefined; // 정보 없음
          if (str === '1') return '여유';
          if (str === '2') return '보통';
          if (str === '3') return '혼잡';
          if (str === '4') return '매우혼잡';
          return str || undefined;
        };

        const loc1 = parseLocationNo(item.locationNo1 ?? item.locationNumber1);
        const loc2 = parseLocationNo(item.locationNo2 ?? item.locationNumber2);
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
      console.error('[GyeonggiBusService] API 호출 실패:', errMsg);
      const mock = this.getMockData(stationId, stationName);
      mock.errorMessage = `경기도 API 연동 에러: ${errMsg}`;
      mock.reliability = 0.5;
      return mock;
    }
  }

  /**
   * 경기도 실시간 버스 위치 목록 조회 (v2 getBusLocationListv2 우선 연동)
   */
  public static async getBusLocationList(
    routeId: string
  ): Promise<GyeonggiBusLocationItem[] | null> {
    const apiKey =
      process.env.GYEONGGI_BUS_API_KEY ||
      process.env.REAL_TIME_BUS_GYEONGGI_API_KEY;

    if (!apiKey || !routeId) {
      return null;
    }

    try {
      const cleanRouteId = routeId.replace(/^GGB/i, '').trim();
      const rawServiceKey = apiKey.includes('%') ? decodeURIComponent(apiKey.trim()) : apiKey.trim();
      const encodedServiceKey = encodeURIComponent(rawServiceKey);

      // 1. v2 공식 엔드포인트 호출
      const v2Url = `${this.BUS_POS_API_URL_V2}?serviceKey=${encodedServiceKey}&routeId=${encodeURIComponent(cleanRouteId)}&format=json`;

      let response = await fetch(v2Url, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }).catch(() => null);

      // 2. v2 응답이 정상이 아니면 v1 엔드포인트로 Fallback
      if (!response || !response.ok) {
        const v1Url = `${this.BUS_POS_API_URL_V1}?serviceKey=${encodedServiceKey}&routeId=${encodeURIComponent(cleanRouteId)}&format=json`;
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
      let rawList: unknown = null;

      // JSON 파싱 시도
      try {
        const json = JSON.parse(text) as Record<string, any>;
        rawList =
          json.response?.msgBody?.busLocationList ||
          json.response?.body?.items?.busLocationItem ||
          json.response?.body?.items ||
          json.msgBody?.busLocationList;
      } catch {
        // XML 파싱 Fallback
        const parser = new XMLParser();
        const xml = parser.parse(text) as Record<string, any>;
        rawList =
          xml.response?.msgBody?.busLocationList ||
          xml.response?.body?.items?.busLocationItem ||
          xml.response?.body?.items ||
          xml.msgBody?.busLocationList;
      }

      if (!rawList) {
        return null;
      }

      const itemsArray: Record<string, any>[] = Array.isArray(rawList)
        ? rawList
        : rawList && typeof rawList === 'object'
        ? [rawList as Record<string, any>]
        : [];

      return itemsArray.map((item) => {
        const parseRemainSeats = (val: unknown): number | undefined => {
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return !isNaN(num) ? num : undefined;
        };

        const parseSeq = (val: unknown): number | undefined => {
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return !isNaN(num) ? num : undefined;
        };

        return {
          routeId: item.routeId ? String(item.routeId) : cleanRouteId,
          stationId: item.stationId ? String(item.stationId) : undefined,
          stationSeq: parseSeq(item.stationSeq ?? item.stationSequence),
          plateNo: item.plateNo ? String(item.plateNo).trim() : undefined,
          remainSeatCnt: parseRemainSeats(item.remainSeatCnt),
          plateType: item.plateType !== undefined ? Number(item.plateType) : undefined,
          lowPlate: item.lowPlate !== undefined ? Number(item.lowPlate) : undefined,
          endBus: item.endBus !== undefined ? Number(item.endBus) : undefined,
          density: item.density !== undefined ? Number(item.density) : undefined,
          vehId: item.vehId ? String(item.vehId) : undefined,
        };
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[GyeonggiBusService] 버스 위치 API 연동 실패:', errMsg);
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
