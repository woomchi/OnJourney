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
import {
  getTransitApiKey,
  getEncodedServiceKey,
  parseXmlOrJsonItems,
  safeNumber,
  safeString,
} from './transitUtils';

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
  private static readonly ARRIVAL_API_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/stopArrByBstopid';
  private static readonly BUS_INFO_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/busInfo';
  private static readonly BUS_LINE_DETAIL_URL =
    'https://apis.data.go.kr/6260000/BusanBIMS/busInfoByRouteId';

  // ─── 인메모리 캐시 ───────────────────────────────────────────────────────────
  // 노선 번호 -> lineId 캐시 (24시간)
  private static readonly ROUTE_ID_CACHE = new LruTtlCache<string, BusanRouteMeta>({
    maxSize: 300,
    defaultTtlMs: 24 * 60 * 60 * 1000,
  });

  // 정적 노선 정류소 목록 캐시 (1시간)
  private static readonly STATIONS_CACHE = new LruTtlCache<string, {
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
  private static readonly REALTIME_POS_CACHE = new LruTtlCache<string, BusPosition[]>({
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
    const apiKey = getTransitApiKey('busan');
    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '부산 버스 API 키가 설정되지 않았습니다.');
    }

    try {
      const cleanStationId = stationId.replace(/^BSB/i, '').trim();
      const encodedKey = getEncodedServiceKey('busan');

      const requestUrl = `${this.ARRIVAL_API_URL}?serviceKey=${encodedKey}&bstopid=${encodeURIComponent(cleanStationId)}`;
      const res = await fetch(requestUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`부산 버스 API HTTP ${res.status}`);
      }

      const text = await res.text();
      const { items: itemsArray } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = safeString(item.lineno || item.lineNo, '버스');
        const min1 = safeNumber(item.min1, 0) ?? 0;
        const min2 = safeNumber(item.min2, 0) ?? 0;
        const lineId = item.lineid ? safeString(item.lineid) : item.lineId ? safeString(item.lineId) : `BUSAN_${lineName}`;
        const busType = this.parseBusType(item.bustype as string | undefined, lineName);

        if (min1 > 0) {
          nextArrivals.push({
            lineId,
            lineName,
            arrivedInSeconds: min1 * 60,
            currentStationSequence: safeNumber(item.station1),
            busType,
            destination: '종점 방향',
            vehicleId: item.carno1 ? safeString(item.carno1) : undefined,
          });
        }

        if (min2 > 0) {
          nextArrivals.push({
            lineId,
            lineName,
            arrivedInSeconds: min2 * 60,
            currentStationSequence: safeNumber(item.station2),
            busType,
            destination: '종점 방향',
            vehicleId: item.carno2 ? safeString(item.carno2) : undefined,
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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[BusanBusService] API 호출 오류:', errMsg);
      return this.getFallbackData(stationId, stationName, `부산 버스 연동 에러: ${errMsg}`);
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

    const apiKey = getTransitApiKey('busan');
    if (!apiKey) return null;

    try {
      const encodedKey = getEncodedServiceKey('busan');
      const url = `${this.BUS_INFO_URL}?serviceKey=${encodedKey}&lineno=${encodeURIComponent(cleanNo)}`;

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      if (items.length === 0) return null;

      // 1순위: buslinenum과 cleanNo 완전 일치
      let matched = items.find((it) => cleanBusNumber(safeString(it.buslinenum)) === cleanNo);
      if (!matched) {
        matched = items[0];
      }

      if (!matched?.lineid) return null;

      const meta: BusanRouteMeta = {
        lineId: safeString(matched.lineid),
        busNo: safeString(matched.buslinenum || cleanNo),
        busType: matched.bustype ? safeString(matched.bustype) : undefined,
        startPoint: matched.startpoint ? safeString(matched.startpoint) : undefined,
        endPoint: matched.endpoint ? safeString(matched.endpoint) : undefined,
      };

      this.ROUTE_ID_CACHE.set(cleanNo, meta);
      return meta;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[BusanBusService] busInfo 조회 실패:', errMsg);
      return null;
    }
  }

  /**
   * 부산 버스 전체 노선 정류소 목록 및 실시간 버스 위치 통합 조회 (busInfoByRouteId)
   */
  public static async getBusLinePositions(
    params: FetchBusanBusLineParams
  ): Promise<BusLinePositionsData | null> {
    const apiKey = getTransitApiKey('busan');
    if (!apiKey) return null;

    const rawBusNo = params.busNo.trim();
    const cleanNo = cleanBusNumber(rawBusNo);

    // 1. 부산 BIMS lineId 결정
    let lineId = '';
    const rawRouteId = String(params.routeId || '').trim();
    const rawBusId = String(params.busId || '').trim();

    const meta = await this.getRouteInfoByBusNo(cleanNo);

    if (/^52[0-9A-Za-z]{8}$/.test(rawRouteId) || (rawRouteId.startsWith('52') && rawRouteId.length >= 9)) {
      lineId = rawRouteId;
    } else if (/^52[0-9A-Za-z]{8}$/.test(rawBusId) || (rawBusId.startsWith('52') && rawBusId.length >= 9)) {
      lineId = rawBusId;
    } else if (meta?.lineId) {
      lineId = meta.lineId;
    }

    if (!lineId) {
      return null;
    }

    try {
      const encodedKey = getEncodedServiceKey('busan');
      const url = `${this.BUS_LINE_DETAIL_URL}?serviceKey=${encodedKey}&lineid=${encodeURIComponent(lineId)}`;

      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`부산 BIMS busInfoByRouteId HTTP ${res.status}`);
      }

      const text = await res.text();
      const { items } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      if (items.length === 0) {
        return null;
      }

      // 2. 전체 정류소 목록 구성
      const stations: BusLineStation[] = [];
      let turningSeq = -1;
      let turningName = '';

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const stationSeq = safeNumber(it.bstopidx, i + 1) ?? (i + 1);
        const stationName = safeString(it.bstopnm, `정류소 ${i + 1}`);
        const stationId = safeString(it.bstopid || it.nodeid || it.bstopidx || i + 1);
        const arsNo = it.arsno ? safeString(it.arsno) : undefined;
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
          lat: safeNumber(it.lat, 0) ?? 0,
          lng: safeNumber(it.lin, 0) ?? 0, // 부산 BIMS의 경도 필드는 lin
          isTurningPoint: isTurning,
          edgePoints: null,
        });
      }

      let effectiveTurningSeq = turningSeq !== -1 ? turningSeq : Math.ceil(stations.length / 2);
      let effectiveTurningName = turningName || stations[effectiveTurningSeq - 1]?.stationName;

      // 💡 [BIMS 원본 데이터 오류 보정]
      // 부산 307번 등에서 rpoint가 공항 순환 구간(예: 상방마을)에 잘못 찍혀 공식 종점(김해공항)과 불일치하는 경우
      if (meta?.endPoint) {
        const normEndPoint = meta.endPoint.replace(/[\s\(\)\-_]/g, '');
        if (
          normEndPoint &&
          effectiveTurningName &&
          !effectiveTurningName.includes(normEndPoint) &&
          !normEndPoint.includes(effectiveTurningName)
        ) {
          const endPointMatchIdx = stations.findIndex(
            (st) => st.stationName.includes(normEndPoint) || normEndPoint.includes(st.stationName)
          );
          if (endPointMatchIdx !== -1) {
            effectiveTurningSeq = stations[endPointMatchIdx].stationSeq;
            effectiveTurningName = stations[endPointMatchIdx].stationName;
          } else {
            effectiveTurningName = meta.endPoint;
          }
        }
      }

      // 3. 실시간 운행 버스 위치 추출
      const positions: BusPosition[] = [];
      const seenVehicles = new Set<string>();

      for (const it of items) {
        const carno = safeString(it.carno);
        if (!carno || seenVehicles.has(carno)) continue;
        seenVehicles.add(carno);

        const nodeord = safeNumber(it.bstopidx);
        const nodeid = it.nodeid ? safeString(it.nodeid) : undefined;
        const nodenm = it.bstopnm ? safeString(it.bstopnm) : undefined;
        const gpslati = safeNumber(it.lat);
        const gpslong = safeNumber(it.lin);

        const rawDir = safeNumber(it.direction);
        let finalDir: '0' | '1' = '0';
        if (rawDir === 2) {
          finalDir = '1';
        } else if (rawDir === 1) {
          finalDir = '0';
        } else if (nodeord !== undefined) {
          finalDir = nodeord >= effectiveTurningSeq ? '1' : '0';
        }

        const nodekn = safeNumber(it.nodekn, 0);
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

      const sampleItem = items[0];
      const busType = this.parseBusType(sampleItem?.bustype as string | undefined, cleanNo);
      const busColor = this.resolveBusColor(sampleItem?.bustype as string | undefined);

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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
      console.warn('[BusanBusService] getBusLinePositions 실패:', errMsg);
      return null;
    }
  }

  /**
   * 부산 버스 노선(busNo)의 경유 정류소 목록에서 정류소명(stationName) 또는 좌표(lat, lng)와 일치하는 정류소 탐색
   */
  public static async findStationInRoute(
    busNo: string,
    stationName?: string,
    lat?: number,
    lng?: number
  ): Promise<{ stationId: string; stationName: string; arsNo?: string } | null> {
    if (!busNo) return null;
    const cleanNo = cleanBusNumber(busNo);
    const lineData = await this.getBusLinePositions({ busNo: cleanNo });
    if (!lineData || !lineData.stations || lineData.stations.length === 0) {
      return null;
    }

    const { stations } = lineData;
    const cleanTargetName = stationName
      ? stationName.replace(/정류소$|정류장$|역$/, '').replace(/\([^)]*\)/g, '').trim()
      : '';

    // 1. 정류소명 일치 후보군 필터링
    let candidates = stations;
    if (cleanTargetName) {
      const exactMatches = stations.filter((st) => {
        const cleanStName = st.stationName.replace(/정류소$|정류장$|역$/, '').replace(/\([^)]*\)/g, '').trim();
        return cleanStName === cleanTargetName;
      });

      if (exactMatches.length > 0) {
        candidates = exactMatches;
      } else {
        const partialMatches = stations.filter((st) => {
          const cleanStName = st.stationName.replace(/정류소$|정류장$|역$/, '').replace(/\([^)]*\)/g, '').trim();
          return cleanStName.includes(cleanTargetName) || cleanTargetName.includes(cleanStName);
        });
        if (partialMatches.length > 0) {
          candidates = partialMatches;
        }
      }
    }

    if (candidates.length === 1) {
      return {
        stationId: candidates[0].stationId,
        stationName: candidates[0].stationName,
        arsNo: candidates[0].arsNo,
      };
    }

    // 2. 후보가 여러 개(상행/하행 등)이고 좌표(lat, lng)가 주어진 경우 가장 가까운 정류소 선택
    if (candidates.length > 1 && lat && lng) {
      let bestStation = candidates[0];
      let minDistance = Infinity;

      for (const st of candidates) {
        if (st.lat && st.lng) {
          const dLat = (st.lat - lat) * (Math.PI / 180);
          const dLng = (st.lng - lng) * (Math.PI / 180);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat * (Math.PI / 180)) * Math.cos(st.lat * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dist = 6371000 * c;

          if (dist < minDistance) {
            minDistance = dist;
            bestStation = st;
          }
        }
      }

      return {
        stationId: bestStation.stationId,
        stationName: bestStation.stationName,
        arsNo: bestStation.arsNo,
      };
    }

    if (candidates.length > 0) {
      return {
        stationId: candidates[0].stationId,
        stationName: candidates[0].stationName,
        arsNo: candidates[0].arsNo,
      };
    }

    return null;
  }

  /**
   * 부산 지역 Fallback 데이터
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
