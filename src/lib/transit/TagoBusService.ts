import { TAGO_CITY_CODES, RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
  TagoApiResponse,
  TagoBusItem,
} from '@/types/realtimeTransit';
import { generateTagoNodeIdCandidates } from '@/lib/utils/busRegionUtils';

export interface FetchTagoParams {
  cityCode?: string;
  region?: string;
  nodeId: string;
  stationName?: string;
}

// 정류소 검색 캐시 (stationId/nodeno -> TAGO nodeId, 24시간 메모리 캐시)
const NODE_ID_CACHE = new Map<string, { nodeId: string; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class TagoBusService {
  // 국토교통부 정류소별 도착예정정보 목록조회 서비스 공식 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList';
  // 국토교통부 정류소정보조회 서비스 (정류소번호/명 검색)
  private static SEARCH_STTN_NO_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoSearch';
  private static SEARCH_STTN_NM_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNmSearch';

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
   * 정류소 번호(ARS) 또는 정류소명으로 TAGO 표준 nodeId 검색
   */
  private static async lookupTagoNodeId(
    cityCode: string,
    stationId: string,
    stationName?: string,
    serviceKey?: string
  ): Promise<string | null> {
    if (!serviceKey) return null;
    const cacheKey = `${cityCode}_${stationId}_${stationName || ''}`;
    const cached = NODE_ID_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.nodeId;
    }

    try {
      const pureNo = stationId.replace(/[^0-9]/g, '');
      let searchUrl = '';

      // 1. 5자리 정류소 번호(ARS) 검색 시도
      if (pureNo && pureNo.length >= 4 && pureNo.length <= 6) {
        searchUrl = `${this.SEARCH_STTN_NO_URL}?serviceKey=${serviceKey}&cityCode=${cityCode}&nodeNo=${encodeURIComponent(pureNo)}&_type=json`;
      } else if (stationName && stationName !== '정류소' && stationName.length >= 2) {
        // 2. 정류소명 검색 시도
        searchUrl = `${this.SEARCH_STTN_NM_URL}?serviceKey=${serviceKey}&cityCode=${cityCode}&nodeNm=${encodeURIComponent(stationName)}&_type=json`;
      }

      if (!searchUrl) return null;

      const res = await fetch(searchUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2000),
        next: { revalidate: 86400 },
      });

      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const items = json?.response?.body?.items?.item;
      let targetItem: any = null;

      if (Array.isArray(items) && items.length > 0) {
        if (pureNo) {
          targetItem = items.find((it: any) => String(it.nodeno || '').replace(/[^0-9]/g, '') === pureNo) || items[0];
        } else {
          targetItem = items[0];
        }
      } else if (items && typeof items === 'object') {
        targetItem = items;
      }

      if (targetItem?.nodeid) {
        const foundNodeId = String(targetItem.nodeid);
        NODE_ID_CACHE.set(cacheKey, {
          nodeId: foundNodeId,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return foundNodeId;
      }
    } catch {
      // ignore lookup error
    }

    return null;
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
      const normalizedRegion = region.toLowerCase();
      const serviceKey = apiKey.trim();

      // 지역별 기본 nodeId 후보군 생성
      const initialCandidates = generateTagoNodeIdCandidates(
        nodeId,
        normalizedRegion,
        resolvedCityCode
      );

      // 1단계: 생성된 후보군 병렬 조회 (Promise.allSettled)
      const fetchCandidate = async (candidateId: string): Promise<TagoApiResponse | null> => {
        const requestUrl = `${this.API_URL}?serviceKey=${serviceKey}&cityCode=${resolvedCityCode}&nodeId=${encodeURIComponent(candidateId)}&_type=json`;
        const res = await fetch(requestUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
          next: { revalidate: 15 },
        });
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as TagoApiResponse | null;
      };

      const candidateResults = await Promise.allSettled(
        initialCandidates.map((cand) => fetchCandidate(cand))
      );

      let validJson: TagoApiResponse | null = null;

      for (const result of candidateResults) {
        if (result.status === 'fulfilled' && result.value) {
          const json = result.value;
          const totalCount = json.response?.body?.totalCount || 0;
          if (totalCount > 0) {
            validJson = json;
            break;
          } else if (!validJson) {
            validJson = json;
          }
        }
      }

      if (!validJson || !validJson.response) {
        console.warn(
          `[TagoBusService] TAGO API 연동 결과 없음 (정류소 ID: ${nodeId}). Mock 데이터로 전환합니다.`
        );
        const mock = this.getMockData(nodeId, stationName, region);
        mock.reliability = 0.4;
        return mock;
      }

      const bodyItems = validJson.response.body?.items;
      
      let itemsArray: TagoBusItem[] = [];
      if (bodyItems && typeof bodyItems === 'object') {
        const rawItems = (bodyItems as any).item;

        if (Array.isArray(rawItems)) {
          itemsArray = rawItems;
        } else if (rawItems && typeof rawItems === 'object') {
          itemsArray = [rawItems];
        }
      }

      const nextArrivals: ArrivalBusItem[] = itemsArray
        .map((item) => ({
          lineId: item.routeid,
          lineName: String(item.routeno),
          arrivedInSeconds: Number(item.arrtime) || 0,
          currentStationSequence: item.arrprevstationcnt,
          busType: this.parseBusType(String(item.routeno), item.routety),
        }))
        .filter((item) => {
          if (item.arrivedInSeconds <= 0) return false;
          // 남은 정류장이 0개인데 60초 이하로 넘어오는 비정상 기본값 필터링
          if (item.currentStationSequence !== undefined && item.currentStationSequence === 0 && item.arrivedInSeconds <= 60) {
            return false;
          }
          return true;
        });

      // 도착 예정 시간 기준 오름차순 정렬
      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      return {
        stationId: nodeId,
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
