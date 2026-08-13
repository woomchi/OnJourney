import { RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  GyeonggiApiResponse,
  GyeonggiBusItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';

export class GyeonggiBusService {
  private static API_URL =
    'https://apis.data.go.kr/6410000/busstationservice/getBusArrivalInfoItem';

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
        const requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&stationId=${encodeURIComponent(stationId)}&format=json`;
        try {
          const res = await fetch(requestUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            next: { revalidate: 20 },
          });
          if (res.ok) {
            response = res;
            break;
          } else {
            lastError = new Error(`경기도 버스 API HTTP ${res.status}`);
          }
        } catch (e: any) {
          lastError = e;
        }
      }

      if (!response || !response.ok) {
        throw new Error(lastError?.message || '경기도 버스 API 호출 실패');
      }

      const json: GyeonggiApiResponse = await response.json();
      const bodyItems = json.response?.body?.items;
      let itemsArray: GyeonggiBusItem[] = [];
      if (Array.isArray(bodyItems)) {
        itemsArray = bodyItems;
      } else if (bodyItems && typeof bodyItems === 'object') {
        const rawBusItems =
          (bodyItems as any).busArrivalItem ||
          (bodyItems as any).busArrivalList ||
          bodyItems;
        if (Array.isArray(rawBusItems)) {
          itemsArray = rawBusItems;
        } else if (rawBusItems && typeof rawBusItems === 'object') {
          itemsArray = [rawBusItems];
        }
      }

      const nextArrivals: ArrivalBusItem[] = itemsArray.map((item) => {
        const time1 = Number(item.predictedTime1) || 0;
        const time2 = Number(item.predictedTime2) || 0;
        const arrivalSeconds =
          time1 > 0 ? time1 : time2 > 0 ? time2 : 0;

        return {
          lineId: item.routeId,
          lineName: item.routeName,
          arrivedInSeconds: arrivalSeconds,
          currentStationSequence:
            typeof item.locationNumber1 === 'number'
              ? item.locationNumber1
              : undefined,
          busType: 'normal',
          destination: item.stopName,
        };
      });

      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId,
        stationName,
        nextArrivals,
        dataSource: 'gyeonggi',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.gyeonggi,
      };
    } catch (error: any) {
      console.error('[GyeonggiBusService] API 호출 실패:', error?.message);
      const mock = this.getMockData(stationId, stationName);
      mock.errorMessage = `경기도 API 연동 에러: ${error?.message || '알 수 없는 오류'}`;
      mock.reliability = 0.5;
      return mock;
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
