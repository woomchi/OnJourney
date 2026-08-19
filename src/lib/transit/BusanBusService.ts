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

export class BusanBusService {
  // 부산광역시_버스정보시스템 BusanBIMS 공식 정류소별 도착예정정보 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/stopArrByBstopid';

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
      const serviceKey = apiKey.trim();

      const requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&bstopid=${encodeURIComponent(cleanStationId)}`;
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`부산 버스 API HTTP ${res.status}`);
      }

      const text = await res.text();
      let itemsArray: any[] = [];

      try {
        const parsed = xmlParser.parse(text);
        const rawItems = parsed?.response?.body?.items?.item;
        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      } catch {
        // XML 파싱 실패 시 JSON 시도
        const json = JSON.parse(text);
        const rawItems = json.response?.body?.items?.item || json.response?.body?.items;
        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      }

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = String(item.lineno || item.lineNo || '버스');
        const min1 = Number(item.min1) || 0;
        const min2 = Number(item.min2) || 0;

        if (min1 > 0) {
          nextArrivals.push({
            lineId: item.lineid ? String(item.lineid) : item.lineId ? String(item.lineId) : `BUSAN_${lineName}`,
            lineName,
            arrivedInSeconds: min1 * 60,
            currentStationSequence: item.station1 !== undefined ? Number(item.station1) : undefined,
            busType: lineName.length >= 4 ? 'express' : 'normal',
            destination: '종점 방향',
          });
        }

        if (min2 > 0) {
          nextArrivals.push({
            lineId: item.lineid ? String(item.lineid) : item.lineId ? String(item.lineId) : `BUSAN_${lineName}_2`,
            lineName,
            arrivedInSeconds: min2 * 60,
            currentStationSequence: item.station2 !== undefined ? Number(item.station2) : undefined,
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
