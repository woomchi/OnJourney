import { RELIABILITY_SCORES } from '@/constants/transit';
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
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

/** 부산 버스 노선 검색 메타데이터 */
export interface BusanRouteMeta {
  lineId: string;
  busNo: string;
  busType?: string;
  startPoint?: string;
  endPoint?: string;
}

/** 부산 버스 노선도 조회 파라미터 */
export interface FetchBusanBusLineParams {
  busNo: string;
  routeId?: string;
  busId?: string;
  stationId?: string;
  stationName?: string;
}

export class BusanBusService {
  // 부산광역시_버스정보시스템 BusanBIMS 공식 엔드포인트
  private static ARRIVAL_API_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/stopArrByBstopid';
  private static BUS_INFO_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/busInfo';
  private static BUS_LINE_DETAIL_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/busInfoByRouteId';

  // ─── 인메모리 캐시 ───────────────────────────────────────────────────────────
  // 노선 번호 -> lineId 캐시 (24시간)
  private static ROUTE_ID_CACHE = new LruTtlCache<string, BusanRouteMeta>({
    maxSize: 300,
    defaultTtlMs: 24 * 60 * 60 * 1000,
  });

  // 정적 노선 정류소 목록 캐시 (1시간)
  private static STATIONS_CACHE = new LruTtlCache<string, {
    stations: BusLineStation[];
    startStationName?: string;
    endStationName?: string;
    turningStationName?: string;
    turningStationSeq?: number;
    busType?: string;
  }>({
    maxSize: 100,
    defaultTtlMs: 60 * 60 * 1000,
  });

  // 실시간 버스 위치 캐시 (20초)
  private static REALTIME_POS_CACHE = new LruTtlCache<string, BusPosition[]>({
    maxSize: 100,
    defaultTtlMs: 20 * 1000,
  });

  /**
   * 부산 BIMS 버스 유형 표준화
   */
  private static parseBusType(rawType?: string, lineName?: string): BusType {
    const type = String(rawType || '').trim();
    if (type.includes('급행') || type.includes('좌석') || type.includes('직행')) return 'express';
    if (type.includes('마을') || type.includes('순환')) return 'circulation';
    if (type.includes('심야')) return 'express';
    if (lineName && lineName.length >= 4) return 'express';
    return 'normal';
  }

  /**
   * 부산 버스 테마 색상 산출
   */
  private static resolveBusColor(busType?: string): string {
    const type = String(busType || '').trim();
    if (type.includes('급행') || type.includes('좌석') || type.includes('직행')) return '#DC2626'; // 빨강
    if (type.includes('마을') || type.includes('순환')) return '#D97706'; // 주황/노랑
    return '#2563EB'; // 파랑 (일반 시내버스)
  }

  /**
   * 부산광역시 버스 도착 정보 조회 (stopArrByBstopid)
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
      const rawKey = apiKey.includes('%') ? decodeURIComponent(apiKey) : apiKey;
      const serviceKey = encodeURIComponent(rawKey);

      const requestUrl = `${this.ARRIVAL_API_URL}?serviceKey=${serviceKey}&bstopid=${encodeURIComponent(cleanStationId)}`;
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
        const lineId = item.lineid ? String(item.lineid) : item.lineId ? String(item.lineId) : `BUSAN_${lineName}`;
        const busType = this.parseBusType(item.bustype, lineName);

        if (min1 > 0) {
          nextArrivals.push({
            lineId,
            lineName,
            arrivedInSeconds: min1 * 60,
            currentStationSequence: item.station1 !== undefined ? Number(item.station1) : undefined,
            busType,
            destination: '종점 방향',
            vehicleId: item.carno1 ? String(item.carno1).trim() : undefined,
          });
        }

        if (min2 > 0) {
          nextArrivals.push({
            lineId,
            lineName,
            arrivedInSeconds: min2 * 60,
            currentStationSequence: item.station2 !== undefined ? Number(item.station2) : undefined,
            busType,
            destination: '종점 방향',
            vehicleId: item.carno2 ? String(item.carno2).trim() : undefined,
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
   * 노선 번호(busNo)로 부산 BIMS 고유 lineId 및 메타데이터 검색 (busInfo)
   */
  public static async getRouteInfoByBusNo(busNo: string): Promise<BusanRouteMeta | null> {
    const cleanNo = cleanBusNumber(busNo);
    const cached = this.ROUTE_ID_CACHE.get(cleanNo);
    if (cached) {
      return cached;
    }

    const apiKey = process.env.REAL_TIME_BUS_BUSAN_API_KEY;
    if (!apiKey) return null;

    try {
      const rawKey = apiKey.includes('%') ? decodeURIComponent(apiKey) : apiKey;
      const serviceKey = encodeURIComponent(rawKey);
      const url = `${this.BUS_INFO_URL}?serviceKey=${serviceKey}&lineno=${encodeURIComponent(cleanNo)}`;

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const text = await res.text();
      const parsed = xmlParser.parse(text);
      const rawItems = parsed?.response?.body?.items?.item;

      let items: any[] = [];
      if (Array.isArray(rawItems)) {
        items = rawItems;
      } else if (rawItems && typeof rawItems === 'object') {
        items = [rawItems];
      }

      if (items.length === 0) return null;

      // 1순위: buslinenum과 cleanNo 완전 일치
      let matched = items.find((it) => cleanBusNumber(String(it.buslinenum || '')) === cleanNo);
      if (!matched) {
        matched = items[0];
      }

      if (!matched?.lineid) return null;

      const meta: BusanRouteMeta = {
        lineId: String(matched.lineid).trim(),
        busNo: String(matched.buslinenum || cleanNo).trim(),
        busType: matched.bustype ? String(matched.bustype).trim() : undefined,
        startPoint: matched.startpoint ? String(matched.startpoint).trim() : undefined,
        endPoint: matched.endpoint ? String(matched.endpoint).trim() : undefined,
      };

      this.ROUTE_ID_CACHE.set(cleanNo, meta);
      return meta;
    } catch (err: any) {
      console.warn('[BusanBusService] busInfo 조회 실패:', err?.message);
      return null;
    }
  }

  /**
   * 부산 버스 전체 노선 정류소 목록 및 실시간 버스 위치 통합 조회 (busInfoByRouteId)
   */
  public static async getBusLinePositions(
    params: FetchBusanBusLineParams
  ): Promise<BusLinePositionsData | null> {
    const apiKey = process.env.REAL_TIME_BUS_BUSAN_API_KEY;
    if (!apiKey) return null;

    const rawBusNo = params.busNo.trim();
    const cleanNo = cleanBusNumber(rawBusNo);

    // 1. 부산 BIMS lineId 결정
    let lineId = '';
    const rawRouteId = String(params.routeId || '').trim();
    const rawBusId = String(params.busId || '').trim();

    if (/^52[0-9A-Za-z]{8}$/.test(rawRouteId) || (rawRouteId.startsWith('52') && rawRouteId.length >= 9)) {
      lineId = rawRouteId;
    } else if (/^52[0-9A-Za-z]{8}$/.test(rawBusId) || (rawBusId.startsWith('52') && rawBusId.length >= 9)) {
      lineId = rawBusId;
    } else {
      const meta = await this.getRouteInfoByBusNo(cleanNo);
      if (meta?.lineId) {
        lineId = meta.lineId;
      }
    }

    if (!lineId) {
      return null;
    }

    try {
      const rawKey = apiKey.includes('%') ? decodeURIComponent(apiKey) : apiKey;
      const serviceKey = encodeURIComponent(rawKey);
      const url = `${this.BUS_LINE_DETAIL_URL}?serviceKey=${serviceKey}&lineid=${encodeURIComponent(lineId)}`;

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`부산 BIMS busInfoByRouteId HTTP ${res.status}`);
      }

      const text = await res.text();
      const parsed = xmlParser.parse(text);
      const rawItems = parsed?.response?.body?.items?.item;

      let items: any[] = [];
      if (Array.isArray(rawItems)) {
        items = rawItems;
      } else if (rawItems && typeof rawItems === 'object') {
        items = [rawItems];
      }

      if (items.length === 0) {
        return null;
      }

      // 2. 전체 정류소 목록 구성
      const stations: BusLineStation[] = [];
      let turningSeq = -1;
      let turningName = '';

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const stationSeq = Number(it.bstopidx ?? i + 1);
        const stationName = String(it.bstopnm || `정류소 ${i + 1}`).trim();
        const stationId = String(it.nodeid || it.bstopidx || i + 1).trim();
        const arsNo = it.arsno ? String(it.arsno).trim() : undefined;
        const isTurning = it.rpoint === 1 || it.rpoint === '1';

        if (isTurning && turningSeq === -1) {
          turningSeq = stationSeq;
          turningName = stationName;
        }

        stations.push({
          stationId,
          stationName,
          stationSeq,
          arsNo,
          lat: it.lat ? Number(it.lat) : 0,
          lng: it.lin ? Number(it.lin) : 0, // 부산 BIMS의 경도 필드는 lin
          isTurningPoint: isTurning,
          edgePoints: null,
        });
      }

      // 회차점이 명시되지 않은 경우 중간 지점으로 추정
      const effectiveTurningSeq = turningSeq !== -1 ? turningSeq : Math.ceil(stations.length / 2);
      const effectiveTurningName = turningName || stations[effectiveTurningSeq - 1]?.stationName;

      // 3. 실시간 운행 버스 위치 추출
      const positions: BusPosition[] = [];
      const seenVehicles = new Set<string>();

      for (const it of items) {
        const carno = it.carno ? String(it.carno).trim() : '';
        if (!carno || seenVehicles.has(carno)) continue;
        seenVehicles.add(carno);

        const nodeord = it.bstopidx !== undefined ? Number(it.bstopidx) : undefined;
        const nodeid = it.nodeid ? String(it.nodeid).trim() : undefined;
        const nodenm = it.bstopnm ? String(it.bstopnm).trim() : undefined;
        const gpslati = it.lat !== undefined ? Number(it.lat) : undefined;
        const gpslong = it.lin !== undefined ? Number(it.lin) : undefined;

        // 부산 BIMS direction: 1 (순방향/상행), 2 (역방향/하행), 3 (회차지 부근)
        const rawDir = it.direction !== undefined ? Number(it.direction) : undefined;
        let finalDir: '0' | '1' = '0';
        if (rawDir === 2) {
          finalDir = '1';
        } else if (rawDir === 1) {
          finalDir = '0';
        } else if (nodeord !== undefined) {
          finalDir = nodeord >= effectiveTurningSeq ? '1' : '0';
        }

        // 부산 BIMS nodekn: 0: 정류소 정차, 3: 출발 및 주행
        const nodekn = it.nodekn !== undefined ? Number(it.nodekn) : 0;
        let stage: BusPositionStage = 'at_station';
        let progressRate = 0.0;

        if (nodekn === 3) {
          stage = 'departed';
          progressRate = 0.33;
        } else {
          stage = 'at_station';
          progressRate = 0.0;
        }

        positions.push({
          vehicleno: carno,
          nodeid,
          nodenm,
          nodeord,
          direction: finalDir,
          gpslati,
          gpslong,
          stage,
          progressRate,
        });
      }

      // 첫 번째 아이템의 노선 유형 및 기종점
      const sampleItem = items[0];
      const busType = this.parseBusType(sampleItem?.bustype, cleanNo);
      const busColor = this.resolveBusColor(sampleItem?.bustype);

      const result: BusLinePositionsData = {
        busNo: cleanNo,
        busId: lineId,
        routeId: lineId,
        busType,
        busColor,
        startStationName: stations[0]?.stationName,
        endStationName: stations[stations.length - 1]?.stationName,
        turningStationName: effectiveTurningName,
        turningStationSeq: effectiveTurningSeq,
        stations,
        positions,
        timestamp: Date.now(),
      };

      // 캐시 저장
      this.STATIONS_CACHE.set(lineId, {
        stations,
        startStationName: result.startStationName,
        endStationName: result.endStationName,
        turningStationName: effectiveTurningName,
        turningStationSeq: effectiveTurningSeq,
        busType,
      });
      this.REALTIME_POS_CACHE.set(`realtime:${lineId}`, positions);

      return result;
    } catch (err: any) {
      console.warn('[BusanBusService] getBusLinePositions 실패:', err?.message);
      return null;
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
