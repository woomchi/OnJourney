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

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const rawTime1 = item.predictTime1 ?? item.predictedTime1;
        const rawTime2 = item.predictTime2 ?? item.predictedTime2;
        const time1 = rawTime1 !== undefined && rawTime1 !== '' ? Number(rawTime1) || 0 : 0;
        const time2 = rawTime2 !== undefined && rawTime2 !== '' ? Number(rawTime2) || 0 : 0;
        const lineName = String(item.routeName || item.routeNo || '').trim();
        const routeId = String(item.routeId || lineName || '버스');

        const parseLocationNo = (val: any): number | undefined => {
          if (val === undefined || val === null || val === '') return undefined;
          const num = Number(val);
          return !isNaN(num) ? num : undefined;
        };

        const loc1 = parseLocationNo(item.locationNo1 ?? item.locationNumber1);
        const loc2 = parseLocationNo(item.locationNo2 ?? item.locationNumber2);

        if (time1 > 0) {
          nextArrivals.push({
            lineId: routeId,
            lineName: lineName || routeId,
            arrivedInSeconds: time1 * 60,
            currentStationSequence: loc1,
            busType: 'normal' as BusType,
            destination: item.stopName,
          });
        }

        if (time2 > 0) {
          nextArrivals.push({
            lineId: `${routeId}_2`,
            lineName: lineName || routeId,
            arrivedInSeconds: time2 * 60,
            currentStationSequence: loc2,
            busType: 'normal' as BusType,
            destination: item.stopName,
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
