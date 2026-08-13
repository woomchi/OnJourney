import { TAGO_CITY_CODES, RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
  TagoApiResponse,
  TagoBusItem,
} from '@/types/realtimeTransit';

export interface FetchTagoParams {
  cityCode?: string;
  region?: string;
  nodeId: string;
  stationName?: string;
}

export class TagoBusService {
  // 국토교통부 정류소별 도착예정정보 목록조회 서비스 공식 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList';
  private static ALT_API_URL =
    'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList';

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
   * 국토교통부 TAGO 버스 도착 정보 조회
   */
  public static async getArrivalInfo({
    cityCode,
    region = 'seoul',
    nodeId,
    stationName = '정류소',
  }: FetchTagoParams): Promise<NormalizedRealtimeData> {
    const resolvedCityCode =
      cityCode || TAGO_CITY_CODES[region.toLowerCase()] || '11';
    const apiKey =
      process.env.TAGO_API_KEY || process.env.REAL_TIME_BUS_TAGO_API_KEY;

    // API 키가 없거나 미설정된 경우 Mock 데이터 폴백
    if (!apiKey) {
      console.warn(
        '[TagoBusService] TAGO API 키가 설정되지 않아 빈 데이터를 반환합니다.'
      );
      return this.getMockData(nodeId, stationName, region);
    }

    try {
      let resolvedNodeId = nodeId.trim();
      const normalizedRegion = region.toLowerCase();

      // 부산 정류소 수치형 ID 수신 시 BSB 접두사 자동 보완
      if ((normalizedRegion === 'busan' || normalizedRegion === '부산') && /^\d{6,}$/.test(resolvedNodeId)) {
        resolvedNodeId = `BSB${resolvedNodeId}`;
      }

      const nodeIdCandidates = Array.from(
        new Set([resolvedNodeId, resolvedNodeId.replace(/^BSB/i, '')])
      );

      const rawKey = apiKey.trim();
      let decodedKey = rawKey;
      try {
        decodedKey = decodeURIComponent(rawKey);
      } catch {
        decodedKey = rawKey;
      }

      // 공공데이터 API 서비스키 호환 후보 (인코딩/디코딩 키 순차 시도)
      const serviceKeyCandidates = Array.from(
        new Set([rawKey, encodeURIComponent(decodedKey), decodedKey])
      );

      let response: Response | null = null;
      let lastError: Error | null = null;

      for (const serviceKey of serviceKeyCandidates) {
        for (const candidateNodeId of nodeIdCandidates) {
          const requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&cityCode=${resolvedCityCode}&nodeId=${encodeURIComponent(candidateNodeId)}&_type=json`;

          try {
            const res = await fetch(requestUrl, {
              method: 'GET',
              headers: { Accept: 'application/json' },
              next: { revalidate: 15 },
            });

            if (res.ok) {
              const jsonCheck = await res.clone().json().catch(() => null);
              const totalCount = jsonCheck?.response?.body?.totalCount || 0;
              if (totalCount > 0) {
                response = res;
                break;
              } else if (!response) {
                response = res; // 빈 응답이라도 200이면 일단 보관
              }
            } else if (res.status === 400) {
              lastError = new Error(`TAGO API HTTP 400 Bad Request`);
            } else {
              lastError = new Error(`TAGO API HTTP ${res.status}`);
            }
          } catch (e: any) {
            lastError = e;
          }
        }
        if (response && response.ok) break;
      }

      if (!response || !response.ok) {
        console.warn(
          `[TagoBusService] TAGO API 연동 실패 (정류소 ID: ${resolvedNodeId}): ${lastError?.message}. Mock 데이터로 전환합니다.`
        );
        const mock = this.getMockData(resolvedNodeId, stationName, region);
        mock.reliability = 0.4;
        return mock;
      }

      const json: TagoApiResponse = await response.json();
      const bodyItems = json.response?.body?.items;
      
      let itemsArray: TagoBusItem[] = [];
      if (bodyItems && typeof bodyItems === 'object') {
        const rawItems = (bodyItems as any).item;
        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      }

      const nextArrivals: ArrivalBusItem[] = itemsArray.map((item) => ({
        lineId: item.routeid,
        lineName: String(item.routeno),
        arrivedInSeconds: Number(item.arrtime) || 0,
        currentStationSequence: item.arrprevstationcnt,
        busType: this.parseBusType(String(item.routeno), item.routety),
      }));

      // 도착 예정 시간 기준 오름차순 정렬
      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId: resolvedNodeId,
        stationName,
        nextArrivals,
        dataSource: 'tago',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.tago,
      };
    } catch (error: any) {
      console.warn('[TagoBusService] API 호출 폴백:', error?.message);
      const mock = this.getMockData(nodeId, stationName, region);
      mock.errorMessage = `TAGO API 연동 안내: ${error?.message || '실시간 정보를 불러올 수 없습니다.'}`;
      mock.reliability = 0.5;
      return mock;
    }
  }

  /**
   * 개발/테스트용 Mock 데이터 생성 (가짜 하드코딩 노선 배제)
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
