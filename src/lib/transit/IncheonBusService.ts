import { RELIABILITY_SCORES } from '@/constants/transit';
import {
  ArrivalBusItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';
import {
  getTransitApiKey,
  getEncodedServiceKey,
  parseXmlOrJsonItems,
  safeNumber,
  safeString,
} from './transitUtils';

export class IncheonBusService {
  // 인천광역시_버스도착정보 공식 엔드포인트
  private static readonly API_URL =
    'https://apis.data.go.kr/6280000/busArrivalService/getAllRouteBusArrivalList';

  /**
   * 인천광역시 정류소별 전체 노선 버스 도착 정보 조회
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '인천 정류소'
  ): Promise<NormalizedRealtimeData> {
    const apiKey = getTransitApiKey('incheon');
    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '인천 버스 API 키가 설정되지 않았습니다.');
    }

    try {
      const cleanStationId = stationId.replace(/^(ICB|INB|IC|IN)/i, '').trim();
      const encodedKey = getEncodedServiceKey('incheon');

      const params = new URLSearchParams({
        bstopId: cleanStationId,
        pageNo: '1',
        numOfRows: '50',
        _type: 'json',
      });

      const requestUrl = `${this.API_URL}?serviceKey=${encodedKey}&${params.toString()}`;
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`인천 버스 API HTTP ${res.status}`);
      }

      const text = await res.text();
      const { items: itemsArray } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = safeString(
          item.ROUTENO ||
          item.routeno ||
          item.ROUTE_NO ||
          item.routeNo ||
          item.lineno ||
          item.lineNo,
          '인천버스'
        );

        // 도착 예정 시간 (초 단위)
        const arrivalSecondsRaw = safeNumber(
          item.ARRIVALESTIMATETIME ??
          item.arrivalestimatetime ??
          item.ARRIVETIME ??
          item.arrtime,
          0
        ) ?? 0;

        // 남은 정류장 수
        const restStopCount = safeNumber(
          item.REST_STOP_COUNT ??
          item.rest_stop_count ??
          item.ARRPREVSTATIONCNT ??
          item.arrprevstationcnt,
          0
        ) ?? 0;

        const routeId = item.ROUTEID || item.routeid || item.ROUTE_ID || item.routeId;
        const destination = safeString(
          item.DIR_END || item.dir_end || item.DESTINATION || item.destination,
          '종점 방향'
        );
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
            lineId: routeId ? safeString(routeId) : `INCHEON_${lineName}`,
            lineName,
            arrivedInSeconds: arrivalSecondsRaw,
            currentStationSequence: restStopCount > 0 ? restStopCount : undefined,
            busType,
            destination,
            vehicleId: plateNo ? safeString(plateNo) : undefined,
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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[IncheonBusService] API 호출 오류:', errMsg);
      return this.getFallbackData(
        stationId,
        stationName,
        `인천 버스 연동 에러: ${errMsg}`
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
