import { RELIABILITY_SCORES, CACHE_TTL_SECONDS } from '@/constants/transit';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';
import {
  BusLinePositionsData,
  BusLineStation,
  BusPosition,
  BusPositionStage,
} from '@/types/journey';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';
import { LruTtlCache } from '@/lib/utils/lruCache';
import { getRedisCache, setRedisCache } from '@/lib/infrastructure/redisClient';
import { calculateHaversineDistanceMeter } from '@/lib/utils/geoUtils';
import { TagoBusService } from './TagoBusService';
import {
  getTransitApiKey,
  getEncodedServiceKey,
  parseXmlOrJsonItems,
  safeNumber,
  safeString,
} from './transitUtils';

/** 대구 버스 노선 메타데이터 */
export interface DaeguRouteMeta {
  routeId: string;
  routeNo: string;
  busType?: BusType;
  startStationName?: string;
  endStationName?: string;
}

/** 대구 버스 노선도 조회 파라미터 */
export interface FetchDaeguBusLineParams {
  busNo: string;
  routeId?: string;
  busId?: string;
  stationId?: string;
  stationName?: string;
  lat?: number;
  lng?: number;
}

export interface CachedDaeguRouteData {
  stations: BusLineStation[];
  startStationName?: string;
  endStationName?: string;
  turningStationName?: string;
  turningStationSeq?: number;
  busType?: string;
}

export class DaeguBusService {
  // 대구광역시_대구버스정보시스템 공공데이터포털 공식 엔드포인트
  private static readonly BASE_URL = 'https://apis.data.go.kr/6270000/dbmsapi02';

  // ─── 계층형 캐시 (L1 In-Memory LRU Cache) ──────────────────────────────────
  // 노선 번호 -> routeId 메타데이터 캐시 (L1: 24시간)
  private static readonly ROUTE_META_CACHE = new LruTtlCache<string, DaeguRouteMeta>({
    maxSize: 300,
    defaultTtlMs: 24 * 60 * 60 * 1000,
  });

  // 정적 노선 정류소 목록 캐시 (L1: 1시간)
  private static readonly STATIONS_CACHE = new LruTtlCache<string, CachedDaeguRouteData>({
    maxSize: 100,
    defaultTtlMs: 60 * 60 * 1000,
  });

  // 실시간 버스 위치 캐시 (L1: 15초)
  private static readonly REALTIME_POS_CACHE = new LruTtlCache<string, BusPosition[]>({
    maxSize: 100,
    defaultTtlMs: 15 * 1000,
  });

  // 정류소별 도착 정보 캐시 (L1: 20초)
  private static readonly ARRIVAL_CACHE = new LruTtlCache<string, NormalizedRealtimeData>({
    maxSize: 200,
    defaultTtlMs: 20 * 1000,
  });

  // ─── Redis L2 캐시 TTL 정의 (초 단위) ──────────────────────────────────────
  private static readonly REDIS_TTL = {
    ARRIVAL: 25,          // 도착 정보: 25초
    REALTIME_POS: 20,     // 차량 위치: 20초
    STATIC_ROUTE: 86400,  // 정적 노선 정류소 목록: 24시간 (API 호출 99% 절감)
    ROUTE_META: 86400,    // 노선 메타데이터: 24시간
  };

  /**
   * 대구 버스 유형 표준화 (급행/간선/지선/순환)
   */
  public static parseDaeguBusType(rawType?: string | number, routeNo?: string): BusType {
    const tp = String(rawType || '').trim().toLowerCase();
    const no = String(routeNo || '').trim();

    if (tp === '1' || no.includes('급행') || no.startsWith('급행')) return 'express';
    if (tp === '2' || /^[0-9]{3}$/.test(no)) return 'normal'; // 대구 3자리 번호는 간선버스
    if (
      tp === '3' ||
      no.includes('순환') ||
      no.startsWith('순환')
    ) {
      return 'circulation';
    }
    if (
      tp === '4' ||
      no.includes('지선') ||
      /^(동구|수성|북구|달서|달성|중구|남구|서구|군위)/.test(no)
    ) {
      return 'circulation';
    }

    return 'normal';
  }

  /**
   * 대구 버스 테마 색상 산출
   */
  public static resolveBusColor(busType?: string, routeNo?: string): string {
    const bType = this.parseDaeguBusType(busType, routeNo);
    switch (bType) {
      case 'express':
        return '#DC2626'; // 빨강 (급행)
      case 'circulation':
        return routeNo?.includes('순환') ? '#D97706' : '#16A34A'; // 순환: 주황, 지선: 초록
      case 'normal':
      default:
        return '#2563EB'; // 파랑 (간선)
    }
  }

  /**
   * 1. 정류소별 실시간 버스 도착 정보 조회
   * - L1 LRU -> L2 Redis -> 대구시 API 순으로 조회하여 외부 API 호출 횟수를 최소화합니다.
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '정류소',
    destination?: string,
    headsign?: string,
    lat?: number,
    lng?: number
  ): Promise<NormalizedRealtimeData> {
    const cleanStationId = (stationId || '').replace(/^DGB/i, '').trim();
    const pureNumeric = (stationId || '').replace(/[^0-9]/g, '');
    let targetStopId = cleanStationId || pureNumeric || (stationId || '').trim();

    if (!targetStopId && (!lat || !lng)) {
      return this.getFallbackData(stationId, stationName, '정류소 식별 정보가 유효하지 않습니다.');
    }

    const apiKey = getTransitApiKey('daegu');
    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '대구 버스 API 키(BUS_DATA_API_KEY)가 설정되지 않았습니다.');
    }

    // 0. 가상 ID('auto' 등)이거나 숫자가 부족한 경우 TAGO 대구(22) 스마트 룩업
    const isSpecialId = !targetStopId || targetStopId === 'auto' || !/[0-9]/.test(targetStopId);
    if (isSpecialId) {
      if (lat && lng) {
        const lookedUp = await TagoBusService.lookupTagoNodeIdByCoords(lat, lng, stationName, apiKey);
        if (lookedUp?.nodeId) {
          targetStopId = lookedUp.nodeId.replace(/^DGB/i, '').replace(/[^0-9]/g, '');
        }
      }
      if (!targetStopId && stationName) {
        const lookedUp = await TagoBusService.lookupTagoNodeId('22', '', stationName, apiKey);
        if (lookedUp) {
          targetStopId = lookedUp.replace(/^DGB/i, '').replace(/[^0-9]/g, '');
        }
      }
    }

    if (!targetStopId) {
      return this.getFallbackData(stationId, stationName, '대구 버스 정류소 ID를 찾을 수 없습니다.');
    }

    const cacheKey = `daegu:arr:${targetStopId}`;

    // 1. L1 In-Memory 캐시 확인 (API 호출 0회)
    const l1Cached = this.ARRIVAL_CACHE.get(cacheKey);
    if (l1Cached) {
      return l1Cached;
    }

    // 2. L2 Upstash Redis 캐시 확인 (API 호출 0회)
    const redisKey = `transit:daegu:arr:${targetStopId}`;
    try {
      const l2Cached = await getRedisCache<NormalizedRealtimeData>(redisKey);
      if (l2Cached && l2Cached.nextArrivals.length > 0) {
        this.ARRIVAL_CACHE.set(cacheKey, l2Cached);
        return l2Cached;
      }
    } catch {
      // Redis 장애 시 안전하게 무시하고 API 호출 진행
    }

    // 3. 대구광역시 공식 API 호출 (3초 타임아웃 적용)
    try {
      const encodedKey = getEncodedServiceKey('daegu');
      // 대구 도착정보 오퍼레이션 (getRealtime 우선 시도)
      const requestUrl = `${this.BASE_URL}/getRealtime?serviceKey=${encodedKey}&bsId=${encodeURIComponent(targetStopId)}&_type=json`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }).catch(() => null);

      if (!res || !res.ok) {
        throw new Error(`대구 버스 API HTTP ${res?.status || 'Network Error'}`);
      }

      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of items) {
        const routeNo = safeString(item.routeNo || item.ROUTE_NO || item.routeno);
        if (!routeNo) continue;

        const routeId = safeString(item.routeId || item.ROUTE_ID || item.routeid || routeNo);
        const busType = this.parseDaeguBusType(safeString(item.routeType || item.ROUTE_TP), routeNo);

        // 도착 예정 시간 (분/초 단위 안전 변환)
        const rawArrv = safeNumber(item.arrvTime ?? item.ARRV_TIME ?? item.arrTime ?? item.predictTime, 0) ?? 0;
        const rawMin = safeNumber(item.arrvMin ?? item.ARRV_MIN ?? item.predictMin, 0) ?? 0;
        const arrvTimeSec = rawArrv > 0 ? rawArrv : (rawMin > 0 ? rawMin * 60 : 180);

        const remainStation = safeNumber(item.remainStation ?? item.REMAIN_STATION ?? item.remainStop ?? item.bsCnt, 0) ?? 0;

        nextArrivals.push({
          lineId: routeId,
          lineName: routeNo,
          arrivedInSeconds: arrvTimeSec,
          currentStationSequence: remainStation > 0 ? remainStation : undefined,
          busType,
          destination: safeString(item.destination || item.DESTINATION || item.destNm || '종점 방향'),
          vehicleId: item.vehicleNo ? safeString(item.vehicleNo || item.carno) : undefined,
        });
      }

      nextArrivals.sort((a, b) => a.arrivedInSeconds - b.arrivedInSeconds);

      const result: NormalizedRealtimeData = {
        stationId: targetStopId,
        stationName,
        nextArrivals,
        dataSource: 'daegu',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.daegu || 0.85,
      };

      // 캐시 저장 (L1 + L2)
      if (nextArrivals.length > 0) {
        this.ARRIVAL_CACHE.set(cacheKey, result);
        await setRedisCache(redisKey, result, this.REDIS_TTL.ARRIVAL).catch(() => {});
      }

      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[DaeguBusService] API 호출 오류 (TAGO Fallback으로 인계):', errMsg);
      return this.getFallbackData(targetStopId, stationName, `대구 버스 연동 에러: ${errMsg}`);
    }
  }

  /**
   * 2. 노선 번호(busNo) 기준 메타데이터 조회
   * - Redis 24시간 캐싱으로 최초 1회 이후 외부 호출 0회 보장
   */
  public static async getRouteInfoByBusNo(busNo: string): Promise<DaeguRouteMeta | null> {
    const cleanNo = cleanBusNumber(busNo);
    const cacheKey = `daegu:meta:${cleanNo}`;

    const l1Cached = this.ROUTE_META_CACHE.get(cleanNo);
    if (l1Cached) return l1Cached;

    const redisKey = `transit:daegu:meta:${cleanNo}`;
    try {
      const l2Cached = await getRedisCache<DaeguRouteMeta>(redisKey);
      if (l2Cached) {
        this.ROUTE_META_CACHE.set(cleanNo, l2Cached);
        return l2Cached;
      }
    } catch {}

    const apiKey = getTransitApiKey('daegu');
    if (!apiKey) return null;

    try {
      const encodedKey = getEncodedServiceKey('daegu');
      const url = `${this.BASE_URL}/getRouteByRouteNo?serviceKey=${encodedKey}&routeNo=${encodeURIComponent(cleanNo)}&_type=json`;

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }).catch(() => null);

      if (!res || !res.ok) return null;
      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      if (items.length === 0) return null;

      let matched = items.find((it) => cleanBusNumber(safeString(it.routeNo || it.ROUTE_NO)) === cleanNo);
      if (!matched) matched = items[0];

      const routeId = safeString(matched.routeId || matched.ROUTE_ID || matched.routeid || cleanNo);
      const meta: DaeguRouteMeta = {
        routeId,
        routeNo: safeString(matched.routeNo || matched.ROUTE_NO || cleanNo),
        busType: this.parseDaeguBusType(safeString(matched.routeType || matched.ROUTE_TP), cleanNo),
        startStationName: safeString(matched.startStationName || matched.START_STATION),
        endStationName: safeString(matched.endStationName || matched.END_STATION),
      };

      this.ROUTE_META_CACHE.set(cleanNo, meta);
      await setRedisCache(redisKey, meta, this.REDIS_TTL.ROUTE_META).catch(() => {});
      return meta;
    } catch (err) {
      console.warn('[DaeguBusService] getRouteByRouteNo 실패:', err);
      return null;
    }
  }

  /**
   * 3. 대구 버스 노선 뷰 정류소 목록 및 실시간 버스 위치 통합 조회
   * - 정적 정류소 목록: L2 Redis 24시간 캐시 적용 (API 호출 0회)
   * - 실시간 차량 위치: 온디맨드 15~20초 단위 캐시 적용
   */
  public static async getBusLinePositions(
    params: FetchDaeguBusLineParams
  ): Promise<BusLinePositionsData | null> {
    const rawBusNo = params.busNo.trim();
    const cleanNo = cleanBusNumber(rawBusNo);

    // 1. 노선 식별자 결정
    let targetRouteId = params.routeId?.trim() || '';
    if (!targetRouteId) {
      const meta = await this.getRouteInfoByBusNo(cleanNo);
      targetRouteId = meta?.routeId || cleanNo;
    }

    // 2. 정적 노선 정류소 목록 조회 (Redis 24시간 캐시 우선)
    const routeCacheKey = `daegu:route:${cleanNo}`;
    const redisRouteKey = `transit:daegu:route:${cleanNo}`;

    let routeData = this.STATIONS_CACHE.get(routeCacheKey);
    if (!routeData) {
      try {
        const l2Cached = await getRedisCache<CachedDaeguRouteData>(redisRouteKey);
        if (l2Cached && l2Cached.stations.length > 0) {
          routeData = l2Cached;
          this.STATIONS_CACHE.set(routeCacheKey, l2Cached);
        }
      } catch {}
    }

    // 캐시 미스 시 대구 공식 API에서 노선 정류소 목록 1회 패치
    if (!routeData) {
      const apiKey = getTransitApiKey('daegu');
      if (apiKey) {
        try {
          const encodedKey = getEncodedServiceKey('daegu');
          const stUrl = `${this.BASE_URL}/getRouteStationList?serviceKey=${encodedKey}&routeId=${encodeURIComponent(targetRouteId)}&_type=json`;

          const res = await fetch(stUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(4000),
            cache: 'no-store',
          }).catch(() => null);

          if (res && res.ok) {
            const text = await res.text();
            const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

            if (items.length > 0) {
              const stations: BusLineStation[] = items.map((it, idx) => ({
                stationId: safeString(it.stationId || it.BS_ID || it.bsId || `st_${idx}`),
                stationName: safeString(it.stationName || it.BS_NM || it.bsNm || '정류소'),
                stationSeq: safeNumber(it.stationSeq || it.STATION_SEQ || it.seq, idx + 1) ?? (idx + 1),
                lat: safeNumber(it.lat || it.GPS_Y || it.gpsY, 0) ?? 0,
                lng: safeNumber(it.lng || it.GPS_X || it.gpsX, 0) ?? 0,
                arsNo: safeString(it.arsId || it.ARS_ID || it.arsNo) || undefined,
                isTurningPoint: Boolean(it.isTurningPoint || it.TURN_YN === 'Y'),
              }));

              // 앵커 좌표 사전 계산 (출발 33%, 진입 66%)
              for (let i = 0; i < stations.length - 1; i++) {
                const cur = stations[i];
                const nxt = stations[i + 1];
                if (cur.lat && cur.lng && nxt.lat && nxt.lng) {
                  cur.edgePoints = {
                    departurePoint: {
                      lat: cur.lat + (nxt.lat - cur.lat) * 0.33,
                      lng: cur.lng + (nxt.lng - cur.lng) * 0.33,
                      ratio: 0.33,
                    },
                    approachingPoint: {
                      lat: cur.lat + (nxt.lat - cur.lat) * 0.66,
                      lng: cur.lng + (nxt.lng - cur.lng) * 0.66,
                      ratio: 0.66,
                    },
                  };
                }
              }

              let turningSt = stations.find((st) => st.isTurningPoint);
              // 순환선이거나 회차점 플래그가 누락된 경우 중간 정류소를 회차점으로 지정하여 탭 분할 지원
              if (!turningSt && stations.length > 2) {
                const midIdx = Math.floor(stations.length / 2);
                turningSt = stations[midIdx];
              }

              routeData = {
                stations,
                startStationName: stations[0]?.stationName,
                endStationName: stations[stations.length - 1]?.stationName,
                turningStationName: turningSt?.stationName,
                turningStationSeq: turningSt?.stationSeq,
                busType: this.parseDaeguBusType(undefined, rawBusNo),
              };

              this.STATIONS_CACHE.set(routeCacheKey, routeData);
              await setRedisCache(redisRouteKey, routeData, this.REDIS_TTL.STATIC_ROUTE).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('[DaeguBusService] 노선 정류소 목록 조회 실패:', err);
        }
      }
    }

    if (!routeData || routeData.stations.length === 0) {
      return null;
    }

    // 3. 실시간 버스 위치 목록 조회 (L1: 15초, L2: 20초)
    const posCacheKey = `daegu:pos:${cleanNo}`;
    let positions: BusPosition[] | undefined = this.REALTIME_POS_CACHE.get(posCacheKey);

    if (!positions) {
      const apiKey = getTransitApiKey('daegu');
      if (apiKey) {
        try {
          const encodedKey = getEncodedServiceKey('daegu');
          const posUrl = `${this.BASE_URL}/getBusPosByRtid?serviceKey=${encodedKey}&routeId=${encodeURIComponent(targetRouteId)}&_type=json`;

          const res = await fetch(posUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
            cache: 'no-store',
          }).catch(() => null);

          if (res && res.ok) {
            const text = await res.text();
            const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

            const parsedPositions: BusPosition[] = items.map((it) => {
              const seq = safeNumber(it.stationSeq || it.STATION_SEQ || it.seq, 0);
              const stId = safeString(it.stationId || it.BS_ID || it.bsId);
              const plate = safeString(it.vehicleno || it.PLATE_NO || it.carno || it.vehicleNo);
              const isLow = safeString(it.lowPlate || it.LOW_PLATE || it.lowBus) === '1';

              // 해당 시퀀스 정류소 탐색
              const st = routeData?.stations.find((s) => s.stationSeq === seq || s.stationId === stId);

              return {
                vehicleno: plate || `veh_${seq}`,
                nodeid: stId || st?.stationId,
                nodenm: st?.stationName || '운행 중',
                nodeord: seq,
                lowplate: isLow,
                stage: 'at_station' as BusPositionStage,
                gpslati: st?.lat,
                gpslong: st?.lng,
              };
            });

            positions = parsedPositions;
            this.REALTIME_POS_CACHE.set(posCacheKey, parsedPositions);
          }
        } catch (err) {
          console.warn('[DaeguBusService] 실시간 버스 위치 조회 실패:', err);
        }
      }
    }

    return {
      busNo: rawBusNo || cleanNo,
      routeId: targetRouteId,
      stations: routeData.stations,
      positions: positions || [],
      busType: routeData.busType,
      busColor: this.resolveBusColor(routeData.busType, rawBusNo),
      startStationName: routeData.startStationName,
      endStationName: routeData.endStationName,
      turningStationName: routeData.turningStationName,
      turningStationSeq: routeData.turningStationSeq,
      timestamp: Date.now(),
    };
  }

  /**
   * 안전 폴백 데이터 생성 (빈 결과 표준 규격)
   */
  private static getFallbackData(
    stationId: string,
    stationName: string,
    message?: string
  ): NormalizedRealtimeData {
    return {
      stationId,
      stationName,
      nextArrivals: [],
      dataSource: 'daegu',
      lastUpdated: Date.now(),
      reliability: 0.1,
      errorMessage: message,
    };
  }
}
