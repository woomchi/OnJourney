import { RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

export class IncheonBusService {
  // 인천광역시_버스도착정보 공식 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/6280000/busArrivalService/getAllRouteBusArrivalList';

  /**
   * 인천광역시 정류소별 전체 노선 버스 도착 정보 조회
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '인천 정류소'
  ): Promise<NormalizedRealtimeData> {
    const apiKey =
      process.env.REAL_TIME_BUS_INCHEON_API_KEY ||
      process.env.REAL_TIME_BUS_API_KEY ||
      process.env.TAGO_API_KEY;

    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '인천 버스 API 키가 설정되지 않았습니다.');
    }

    try {
      const cleanStationId = stationId.replace(/^(ICB|INB|IC|IN)/i, '').trim();
      const serviceKey = apiKey.trim();

      const params = new URLSearchParams({
        serviceKey,
        bstopId: cleanStationId,
        pageNo: '1',
        numOfRows: '50',
        _type: 'json',
      });

      const requestUrl = `${this.API_URL}?${params.toString()}`;
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`인천 버스 API HTTP ${res.status}`);
      }

      const text = await res.text();
      let itemsArray: any[] = [];

      // 1) JSON 파싱 우선 시도
      try {
        const json = JSON.parse(text);
        const rawItems =
          json.response?.body?.items?.item ||
          json.response?.body?.items?.itemList ||
          json.response?.body?.itemList ||
          json.response?.msgBody?.itemList ||
          json.response?.body?.items;

        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      } catch {
        // 2) XML 파싱 시도
        try {
          const parsed = xmlParser.parse(text);
          const rawItems =
            parsed?.response?.body?.items?.item ||
            parsed?.response?.body?.items?.itemList ||
            parsed?.response?.body?.itemList ||
            parsed?.response?.msgBody?.itemList ||
            parsed?.response?.body?.items;

          if (Array.isArray(rawItems)) {
            itemsArray = rawItems;
          } else if (rawItems && typeof rawItems === 'object') {
            itemsArray = [rawItems];
          }
        } catch (xmlErr) {
          console.warn('[IncheonBusService] XML/JSON 파싱 실패:', xmlErr);
        }
      }

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = String(
          item.ROUTENO ||
          item.routeno ||
          item.ROUTE_NO ||
          item.routeNo ||
          item.lineno ||
          item.lineNo ||
          '인천버스'
        ).trim();

        // 도착 예정 시간 (초 단위)
        const arrivalSecondsRaw = Number(
          item.ARRIVALESTIMATETIME ??
          item.arrivalestimatetime ??
          item.ARRIVETIME ??
          item.arrtime ??
          0
        );

        // 남은 정류장 수
        const restStopCount = Number(
          item.REST_STOP_COUNT ??
          item.rest_stop_count ??
          item.ARRPREVSTATIONCNT ??
          item.arrprevstationcnt ??
          0
        );

        const routeId = item.ROUTEID || item.routeid || item.ROUTE_ID || item.routeId;
        const destination = item.DIR_END || item.dir_end || item.DESTINATION || item.destination || '종점 방향';
        const plateNo = item.BUS_NUM || item.bus_num || item.PLATENO || item.plateNo;

        if (arrivalSecondsRaw > 0) {
          // 간선, 지선, 광역 버스 등 간이 분류
          let busType: 'normal' | 'express' | 'circulation' = 'normal';
          if (lineName.startsWith('M') || lineName.length >= 4 || lineName.startsWith('9')) {
            busType = 'express';
          } else if (lineName.startsWith('순환') || lineName.includes('순환')) {
            busType = 'circulation';
          }

          nextArrivals.push({
            lineId: routeId ? String(routeId) : `INCHEON_${lineName}`,
            lineName,
            arrivedInSeconds: arrivalSecondsRaw,
            currentStationSequence: restStopCount > 0 ? restStopCount : undefined,
            busType,
            destination: String(destination),
            vehicleId: plateNo ? String(plateNo) : undefined,
          });
        }
      }

      // 도착 잔여 시간 오름차순 정렬
      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId,
        stationName,
        nextArrivals,
        dataSource: 'incheon',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.incheon,
      };
    } catch (error: any) {
      console.warn('[IncheonBusService] API 호출 오류:', error?.message);
      return this.getFallbackData(
        stationId,
        stationName,
        `인천 버스 연동 에러: ${error?.message}`
      );
    }
  }

  /**
   * 인천 지역 Fallback 데이터
   */
  private static getFallbackData(
    stationId: string,
    stationName: string,
    errorMessage?: string
  ): NormalizedRealtimeData {
    return {
      stationId,
      stationName,
      nextArrivals: [],
      dataSource: 'incheon',
      lastUpdated: Date.now(),
      reliability: 0.0,
      errorMessage,
    };
  }
}
