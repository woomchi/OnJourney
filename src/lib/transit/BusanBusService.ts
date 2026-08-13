import { RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusanApiResponse,
  BusanBusItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';

export class BusanBusService {
  // 부산광역시 정류소별 도착예정정보 목록조회 서비스 공식 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/6260000/BusanBstopInfoService/getBstopStopArrInfo';
  private static ALT_API_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/getBusStopArrivalList';

  /**
   * 부산광역시 버스 도착 정보 조회
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '부산 정류소'
  ): Promise<NormalizedRealtimeData> {
    const apiKey = process.env.REAL_TIME_BUS_BUSAN_API_KEY;

    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '부산 버스 API 키가 설정되지 않았습니다.');
    }

    try {
      const cleanStationId = stationId.replace(/^BSB/i, '').trim();
      const rawKey = apiKey.trim();
      let decodedKey = rawKey;
      try {
        decodedKey = decodeURIComponent(rawKey);
      } catch {
        decodedKey = rawKey;
      }

      const serviceKeyCandidates = Array.from(
        new Set([rawKey, encodeURIComponent(decodedKey), decodedKey])
      );

      let response: Response | null = null;
      let lastError: Error | null = null;

      for (const serviceKey of serviceKeyCandidates) {
        let requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&bstopid=${encodeURIComponent(cleanStationId)}&_type=json`;
        try {
          let res = await fetch(requestUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            next: { revalidate: 15 },
          });

          if (!res.ok) {
            requestUrl = `${this.ALT_API_URL}?serviceKey=${serviceKey}&bstopid=${encodeURIComponent(cleanStationId)}&_type=json`;
            res = await fetch(requestUrl, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              next: { revalidate: 15 },
            });
          }

          if (res.ok) {
            response = res;
            break;
          } else {
            lastError = new Error(`부산 버스 API HTTP ${res.status}`);
          }
        } catch (e: any) {
          lastError = e;
        }
      }

      if (!response || !response.ok) {
        return this.getFallbackData(
          stationId,
          stationName,
          `부산 버스 API 연동 안내: ${lastError?.message || '실시간 데이터 수신 불가'}`
        );
      }

      const json: BusanApiResponse = await response.json();
      const bodyItems = json.response?.body?.items;
      let itemsArray: BusanBusItem[] = [];

      if (bodyItems && typeof bodyItems === 'object') {
        const rawItems = bodyItems.item;
        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      }

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = String(item.lineNo || '버스');
        const min1 = Number(item.min1) || 0;
        const min2 = Number(item.min2) || 0;

        if (min1 > 0) {
          nextArrivals.push({
            lineId: item.lineId ? String(item.lineId) : `BUSAN_${lineName}`,
            lineName,
            arrivedInSeconds: min1 * 60,
            currentStationSequence: item.station1,
            busType: lineName.length >= 4 ? 'express' : 'normal',
            destination: '종점 방향',
          });
        }

        if (min2 > 0) {
          nextArrivals.push({
            lineId: item.lineId ? String(item.lineId) : `BUSAN_${lineName}_2`,
            lineName,
            arrivedInSeconds: min2 * 60,
            currentStationSequence: item.station2,
            busType: lineName.length >= 4 ? 'express' : 'normal',
            destination: '종점 방향',
          });
        }
      }

      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId,
        stationName,
        nextArrivals,
        dataSource: 'busan',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.busan,
      };
    } catch (error: any) {
      console.warn('[BusanBusService] API 호출 오류:', error?.message);
      return this.getFallbackData(stationId, stationName, `부산 버스 연동 에러: ${error?.message}`);
    }
  }

  /**
   * 부산 지역 Fallback 데이터 (가짜 하드코딩 노선 제거)
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
      dataSource: 'busan',
      lastUpdated: Date.now(),
      reliability: 0.0,
      errorMessage,
    };
  }
}
