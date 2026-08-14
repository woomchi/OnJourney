import { RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusType,
  GyeonggiApiResponse,
  GyeonggiBusItem,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';

export class GyeonggiBusService {
  private static API_URL =
    'https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2';

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
      const stationIdCandidates = Array.from(new Set([cleanStationId, stationId.trim()]));
      const serviceKey = apiKey.trim();

      const fetchCandidate = async (candidateId: string): Promise<GyeonggiApiResponse | null> => {
        const requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&stationId=${encodeURIComponent(candidateId)}&format=json`;
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
          if (json.response?.body?.items) {
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

      const json: any = validJson;
      const rawList =
        json.response?.msgBody?.busArrivalList ||
        json.response?.body?.items?.busArrivalItem ||
        json.response?.body?.items ||
        [];

      const itemsArray: any[] = Array.isArray(rawList)
        ? rawList
        : rawList && typeof rawList === 'object'
        ? [rawList]
        : [];

      const nextArrivals: ArrivalBusItem[] = itemsArray
        .map((item) => {
          const time1 = Number(item.predictTime1 ?? item.predictedTime1) || 0;
          const time2 = Number(item.predictTime2 ?? item.predictedTime2) || 0;
          // time1, time2는 '분(minute)' 단위이므로 초 단위(* 60) 변환
          const arrivalSeconds = time1 > 0 ? time1 * 60 : time2 > 0 ? time2 * 60 : 0;
          const lineName = String(item.routeName || item.routeNo || '버스');

          return {
            lineId: String(item.routeId || lineName),
            lineName,
            arrivedInSeconds: arrivalSeconds,
            currentStationSequence:
              typeof item.locationNo1 === 'number'
                ? item.locationNo1
                : typeof item.locationNumber1 === 'number'
                ? item.locationNumber1
                : undefined,
            busType: 'normal' as BusType,
            destination: item.stopName,
          };
        })
        .filter((item) => item.arrivedInSeconds > 0);

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
