import { TAGO_CITY_CODES, RELIABILITY_SCORES } from '@/constants/transitConstants';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
  TagoApiResponse,
  TagoBusItem,
} from '@/types/realtimeTransit';
import { generateTagoNodeIdCandidates } from '@/lib/utils/busRegionUtils';
import { calculateHaversineDistanceMeter } from '@/lib/utils/geoUtils';

export interface FetchTagoParams {
  cityCode?: string;
  region?: string;
  nodeId: string;
  stationName?: string;
  lat?: number;
  lng?: number;
}

// 정류소 검색 캐시 (stationId/nodeno -> TAGO nodeId & cityCode, 24시간 메모리 캐시)
const NODE_ID_CACHE = new Map<string, { nodeId: string; cityCode?: string; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class TagoBusService {
  // 국토교통부 정류소별 도착예정정보 목록조회 서비스 공식 엔드포인트
  private static API_URL =
    'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList';
  // 국토교통부 버스위치정보 목록조회 서비스 공식 엔드포인트
  private static BUS_POS_API_URL =
    'https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusPosList';
  // 국토교통부 정류소정보조회 서비스 (BusSttnInfoInqireService) 공식 엔드포인트
  private static SEARCH_STTN_NO_LIST_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList';
  private static SEARCH_CRDNT_PRXMT_STTN_LIST_URL =
    'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList';

  // 노드 변화 감지 및 GPS 하버사인 정밀 보정 캐시 (stationId -> { nodeord, gps, arrivedData, updatedAt })
  private static NODE_CHANGE_CACHE = new Map<
    string,
    {
      lastNodeOrdMap: Record<string, number>;
      lastGpsMap: Record<string, { lat: number; lng: number }>;
      arrivalData: NormalizedRealtimeData;
      updatedAt: number;
    }
  >();

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
   * 정류소 번호(ARS) 또는 정류소명으로 TAGO 표준 nodeId 검색 ([국토교통부(TAGO)_버스정류소정보] /getSttnNoList API 활용)
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
      const rawServiceKey = serviceKey.includes('%') ? decodeURIComponent(serviceKey) : serviceKey;
      const keyParam = encodeURIComponent(rawServiceKey);

      let searchUrl = '';
      const cleanStationName = stationName && stationName !== '정류소' 
        ? (stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName).trim()
        : undefined;

      // 1. 정류소 고유번호(nodeNo) 기반 조회 (/getSttnNoList - 필수 파라미터 pageNo=1, numOfRows=10 추가)
      if (pureNo && pureNo.length >= 4 && pureNo.length <= 6) {
        searchUrl = `${this.SEARCH_STTN_NO_LIST_URL}?serviceKey=${keyParam}&cityCode=${cityCode}&nodeNo=${encodeURIComponent(pureNo)}&pageNo=1&numOfRows=10&_type=json`;
      } else if (cleanStationName && cleanStationName.length >= 2) {
        // 2. 정류소명(nodeNm) 기반 조회 (/getSttnNoList - 필수 파라미터 pageNo=1, numOfRows=10 추가)
        searchUrl = `${this.SEARCH_STTN_NO_LIST_URL}?serviceKey=${keyParam}&cityCode=${cityCode}&nodeNm=${encodeURIComponent(cleanStationName)}&pageNo=1&numOfRows=10&_type=json`;
      }

      if (!searchUrl) return null;

      const res = await fetch(searchUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
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
        const foundCityCode = targetItem.citycode ? String(targetItem.citycode) : cityCode;
        NODE_ID_CACHE.set(cacheKey, {
          nodeId: foundNodeId,
          cityCode: foundCityCode,
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
   * GPS 좌표(lat, lng) 기반 근접 정류소 목록 조회 (/getCrdntPrxmtSttnList API 활용 - 전국 정류소 대상)
   */
  private static async lookupTagoNodeIdByCoords(
    lat: number,
    lng: number,
    stationName?: string,
    serviceKey?: string
  ): Promise<{ nodeId: string; cityCode?: string } | null> {
    if (!serviceKey || !lat || !lng) return null;
    const cacheKey = `coords_${lat.toFixed(4)}_${lng.toFixed(4)}_${stationName || ''}`;
    const cached = NODE_ID_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { nodeId: cached.nodeId, cityCode: cached.cityCode };
    }

    try {
      const rawServiceKey = serviceKey.includes('%') ? decodeURIComponent(serviceKey) : serviceKey;
      const keyParam = encodeURIComponent(rawServiceKey);

      // 좌표 기반 근접 정류소 API 호출 (/getCrdntPrxmtSttnList - 전국 어디든 좌표 기반 정류소 및 citycode 반환)
      const requestUrl = `${this.SEARCH_CRDNT_PRXMT_STTN_LIST_URL}?serviceKey=${keyParam}&gpsLati=${lat}&gpsLong=${lng}&pageNo=1&numOfRows=10&_type=json`;

      const res = await fetch(requestUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
        next: { revalidate: 86400 },
      });

      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const items = json?.response?.body?.items?.item;

      let targetItem: any = null;
      const cleanStationName = stationName && stationName !== '정류소' 
        ? (stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName).trim()
        : undefined;

      if (Array.isArray(items) && items.length > 0) {
        if (cleanStationName) {
          targetItem = items.find((it: any) => {
            const nName = String(it.nodenm || '').trim();
            return nName.includes(cleanStationName) || cleanStationName.includes(nName);
          }) || items[0];
        } else {
          targetItem = items[0];
        }
      } else if (items && typeof items === 'object') {
        targetItem = items;
      }

      if (targetItem?.nodeid) {
        const foundNodeId = String(targetItem.nodeid);
        const foundCityCode = targetItem.citycode ? String(targetItem.citycode) : undefined;
        NODE_ID_CACHE.set(cacheKey, {
          nodeId: foundNodeId,
          cityCode: foundCityCode,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return { nodeId: foundNodeId, cityCode: foundCityCode };
      }
    } catch (err) {
      console.warn('[TagoBusService] 좌표 기반 근접 정류소 조회 실패:', err);
    }

    return null;
  }

  /**
   * 국토교통부 TAGO 버스 도착 정보 조회 (전국 통합)
   */
  public static async getArrivalInfo({
    cityCode,
    region = 'seoul',
    nodeId,
    stationName = '정류소',
    lat,
    lng,
  }: FetchTagoParams): Promise<NormalizedRealtimeData> {
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
      const rawServiceKey = serviceKey.includes('%') ? decodeURIComponent(serviceKey) : serviceKey;
      const keyParam = encodeURIComponent(rawServiceKey);

      let resolvedCityCode =
        cityCode || TAGO_CITY_CODES[normalizedRegion] || '11';

      // 1단계: 생성된 후보군 병렬 조회
      const fetchCandidate = async (candidateId: string, overrideCityCode?: string): Promise<TagoApiResponse | null> => {
        const queryCityCode = overrideCityCode || resolvedCityCode;
        const requestUrl = `${this.API_URL}?serviceKey=${keyParam}&cityCode=${queryCityCode}&nodeId=${encodeURIComponent(candidateId)}&pageNo=1&numOfRows=50&_type=json`;
        const res = await fetch(requestUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
          next: { revalidate: 15 },
        });
        if (!res.ok) return null;
        return (await res.json().catch(() => null)) as TagoApiResponse | null;
      };

      let validJson: TagoApiResponse | null = null;

      // 0순위: GPS 좌표(lat, lng) 정보가 존재할 경우 /getCrdntPrxmtSttnList 로 좌표 기반 근접 정류소 nodeid 및 지자체 citycode 우선 추출
      if (lat && lng) {
        const coordsInfo = await this.lookupTagoNodeIdByCoords(lat, lng, stationName, serviceKey);
        if (coordsInfo?.nodeId) {
          const targetCityCode = coordsInfo.cityCode || resolvedCityCode;
          const coordsRes = await fetchCandidate(coordsInfo.nodeId, targetCityCode);
          if (coordsRes && (coordsRes.response?.body?.totalCount || 0) > 0) {
            validJson = coordsRes;
          }
        }
      }

      // 1순위: 지역별 기본 nodeId 후보군 생성 및 조회
      if (!validJson || (validJson.response?.body?.totalCount || 0) === 0) {
        const initialCandidates = generateTagoNodeIdCandidates(
          nodeId,
          normalizedRegion,
          resolvedCityCode
        );

        const candidateResults = await Promise.allSettled(
          initialCandidates.map((cand) => fetchCandidate(cand))
        );

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

        // 2순위: 후보군 결과가 0건인 경우 /getSttnNoList 동적 조회로 표준 nodeid 추출 시도
        if (!validJson || (validJson.response?.body?.totalCount || 0) === 0) {
          const foundNodeId = await this.lookupTagoNodeId(
            resolvedCityCode,
            nodeId,
            stationName,
            serviceKey
          );
          if (foundNodeId && !initialCandidates.includes(foundNodeId)) {
            const fallbackRes = await fetchCandidate(foundNodeId);
            if (fallbackRes && (fallbackRes.response?.body?.totalCount || 0) > 0) {
              validJson = fallbackRes;
            }
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

      const result: NormalizedRealtimeData = {
        stationId: nodeId,
        stationName,
        nextArrivals,
        dataSource: 'tago',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.tago,
      };

      // 노드 변화 감지 및 GPS 캐시 업데이트
      const nodeOrdMap: Record<string, number> = {};
      nextArrivals.forEach((it) => {
        if (it.lineId && typeof it.currentStationSequence === 'number') {
          nodeOrdMap[it.lineId] = it.currentStationSequence;
        }
      });

      const existingCache = this.NODE_CHANGE_CACHE.get(nodeId);
      this.NODE_CHANGE_CACHE.set(nodeId, {
        lastNodeOrdMap: nodeOrdMap,
        lastGpsMap: existingCache?.lastGpsMap || {},
        arrivalData: result,
        updatedAt: Date.now(),
      });

      return result;
    } catch (error: any) {
      console.warn('[TagoBusService] API 호출 폴백:', error?.message);
      const mock = this.getMockData(nodeId, stationName, region);
      mock.errorMessage = `TAGO API 연동 안내: ${error?.message || '실시간 정보를 불러올 수 없습니다.'}`;
      mock.reliability = 0.5;
      return mock;
    }
  }

  /**
   * 노선별 버스 실시간 위치 목록 조회 (/getRouteAcctoBusPosList API 활용)
   */
  public static async getBusLocationInfo(
    routeId: string,
    cityCode: string = '31190'
  ): Promise<Array<{ vehicleno?: string; nodeid?: string; nodenm?: string; nodeord?: number; gpslati?: number; gpslong?: number }> | null> {
    const apiKey = process.env.TAGO_API_KEY || process.env.REAL_TIME_BUS_TAGO_API_KEY;
    if (!apiKey || !routeId) return null;

    try {
      const serviceKey = apiKey.trim();
      const rawServiceKey = serviceKey.includes('%') ? decodeURIComponent(serviceKey) : serviceKey;
      const keyParam = encodeURIComponent(rawServiceKey);

      const requestUrl = `${this.BUS_POS_API_URL}?serviceKey=${keyParam}&cityCode=${cityCode}&routeId=${encodeURIComponent(routeId)}&pageNo=1&numOfRows=50&_type=json`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
        next: { revalidate: 15 },
      });

      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      const items = json?.response?.body?.items?.item;

      if (Array.isArray(items)) return items;
      if (items && typeof items === 'object') return [items];
      return null;
    } catch (err: any) {
      console.warn('[TagoBusService] 버스위치 API 연동 실패 (승인 미완료 또는 타임아웃):', err?.message);
      return null;
    }
  }

  /**
   * 노드 변화 감지 + GPS 하버사인 미터 거리 기반 스마트 초정밀 하이브리드 연동 함수
   * 15초 자동 갱신 시 버스 위치 API를 모니터링하여:
   * 1. 버스가 이전 정류장에 머물러 있으면 도착예정 API 호출을 건너뛰고 (트래픽 0% 추가)
   * 2. GPS 위경도 잔여 미터 거리 및 속도를 통해 ETA(도착예정시간 초)를 초정밀 차감/보정합니다.
   * 3. 버스가 다음 정류장으로 이동(nodeord 변경)했을 때만 도착예정 API를 핀포인트로 호출합니다.
   */
  public static async getArrivalInfoSmartNodeTrigger(params: FetchTagoParams): Promise<NormalizedRealtimeData> {
    const cached = this.NODE_CHANGE_CACHE.get(params.nodeId);
    const now = Date.now();

    // 1. 캐시가 없거나, 3분(180,000ms) 이상 지난 장기 정체 시에는 무조건 도착예정 API를 1회 갱신
    if (!cached || now - cached.updatedAt > 180_000 || !cached.arrivalData.nextArrivals.length) {
      return this.getArrivalInfo(params);
    }

    // 2. 관심 버스의 노선 ID 추출 및 버스위치 API 경량 호출 시도
    const firstBus = cached.arrivalData.nextArrivals[0];
    if (firstBus?.lineId) {
      const posItems = await this.getBusLocationInfo(firstBus.lineId, params.cityCode);
      if (posItems && posItems.length > 0) {
        // 관심 정류소 근처의 가장 가까운 버스 찾기
        const targetStationId = params.nodeId;
        const matchingBus = posItems.find((b) => b.nodeid === targetStationId) || posItems[0];

        if (matchingBus?.nodeord !== undefined) {
          const lastOrd = cached.lastNodeOrdMap[firstBus.lineId];

          // 노드가 변하지 않았으면 (버스가 아직 이전 정류장에 머무는 중) -> 도착예정 API 호출 스킵!
          if (lastOrd !== undefined && matchingBus.nodeord === lastOrd) {
            const elapsedSeconds = Math.max(1, Math.floor((now - cached.updatedAt) / 1000));
            
            // 💡 GPS 위경도 하버사인 미터 거리 및 실시간 속도 역산 보정
            let speedWeight = 1.0;
            if (params.lat && params.lng && matchingBus.gpslati && matchingBus.gpslong) {
              const busLat = Number(matchingBus.gpslati);
              const busLng = Number(matchingBus.gpslong);
              const prevGps = cached.lastGpsMap[firstBus.lineId];

              if (prevGps) {
                // 이전 패치(15초 전) 대비 이동 미터 거리 계산
                const movedMeter = calculateHaversineDistanceMeter(prevGps.lat, prevGps.lng, busLat, busLng);
                const speedMps = movedMeter / elapsedSeconds; // m/s 속도

                if (speedMps < 1.0) {
                  // 버스 정체 또는 신호 대기 중 (속도 1m/s 이하 = 3.6km/h 이하) -> 시간 차감 일시 홀드!
                  speedWeight = 0.2;
                } else if (speedMps > 15.0) {
                  // 버스 고속 원활 주행 (속도 15m/s 이상 = 54km/h 이상) -> 가속 차감
                  speedWeight = 1.3;
                }
              }

              // 현재 버스 GPS 좌표 기억
              cached.lastGpsMap[firstBus.lineId] = { lat: busLat, lng: busLng };
            }

            // GPS 하버사인 가중치가 적용된 초정밀 arrivedInSeconds 차감
            const adjustedArrivals = cached.arrivalData.nextArrivals.map((item) => {
              const deduction = Math.round(elapsedSeconds * speedWeight);
              return {
                ...item,
                arrivedInSeconds: Math.max(10, item.arrivedInSeconds - deduction),
              };
            });

            return {
              ...cached.arrivalData,
              nextArrivals: adjustedArrivals,
              lastUpdated: now,
            };
          }
        }
      }
    }

    // 3. 노드 변화가 감지되었거나 버스위치 API가 미승인/실패 상태인 경우 -> 도착예정 API 핀포인트 호출
    return this.getArrivalInfo(params);
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
