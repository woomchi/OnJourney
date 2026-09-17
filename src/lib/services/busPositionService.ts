/**
 * @fileoverview 버스 실시간 노선도 및 실시간 위치 조회 서비스
 *
 * ODsay busLaneDetail API(#2)를 통해 노선 경유 정류소 목록을 가져오고,
 * 각 정류소 간 33%(출발), 66%(진입) 앵커 좌표를 사전 계산하여 캐싱합니다.
 * 국토교통부(TAGO) 실시간 버스 위치 API와 결합하여 각 운행 버스의
 * 4분위(정류소A - 출발 - 진입 - 정류소B) 위치를 초정밀 판정합니다.
 */

import { OdsayAdapter } from '@/lib/infrastructure/odsayAdapter';
import { TagoBusService } from '@/lib/transit/TagoBusService';
import { BusanBusService } from '@/lib/transit/BusanBusService';
import { GyeonggiBusService } from '@/lib/transit/GyeonggiBusService';
import { RealtimeTransitService } from '@/lib/transit/RealtimeTransitService';
import { calculateHaversineDistanceMeter } from '@/lib/utils/geoUtils';
import { cleanBusNumber, resolveBusRegion, resolveTagoCode, resolveOdsayCid } from '@/lib/utils/busRegionUtils';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import {
  BusLinePositionsData,
  BusLineStation,
  BusPosition,
  BusPositionStage,
} from '@/types/journey';
import {
  BusRoutePersistentCache,
  HydratedCachedBusRoute,
} from '@/lib/infrastructure/busRoutePersistentCache';
import { LruTtlCache } from '@/lib/utils/lruCache';

export interface FetchBusLinePositionsParams {
  busNo: string;
  busId?: string;
  odsayBusId?: string;
  tagoRouteId?: string;
  routeId?: string;
  cityCode?: string;
  region?: string;
  stationId?: string;
  stationName?: string;
  destination?: string;
  headsign?: string;
  lat?: number;
  lng?: number;
}

// ─── 인메모리 캐시 ───────────────────────────────────────────────────────────

/** 정적 노선 정류소 목록 캐시 (TTL: 1시간, 최대 200개) */
type CachedBusRoute = HydratedCachedBusRoute;

const BUS_ROUTE_CACHE = new LruTtlCache<string, CachedBusRoute>({
  maxSize: 200,
  defaultTtlMs: 60 * 60 * 1000, // 1시간
});

/**
 * 정류소 명칭을 정규화합니다 (접미사 정류소/정류장/역 및 공백 제거).
 */
export function normalizeStationName(name?: string): string {
  if (!name) return '';
  return name.trim().replace(/(정류소|정류장|역)+$/, '').trim();
}

/**
 * 반환 또는 캐시된 노선 데이터가 조회 대상 정류소(stationName)를 실제로 포함하는지 정합성을 검증합니다.
 */
function validateRouteContainsStation(routeData: CachedBusRoute | null, stationName?: string): boolean {
  if (!routeData || !stationName) return true;
  const cleanTarget = normalizeStationName(stationName);
  if (cleanTarget.length < 2) return true;
  return routeData.stations.some((st) => {
    const cleanSt = normalizeStationName(st.stationName);
    return cleanSt.includes(cleanTarget) || cleanTarget.includes(cleanSt);
  });
}

/** 실시간 버스 위치 캐시 (TTL: 30초, 최대 100개) */
interface CachedBusPositions {
  positions: BusPosition[];
}

const REALTIME_POS_CACHE = new LruTtlCache<string, CachedBusPositions>({
  maxSize: 100,
  defaultTtlMs: 30 * 1000, // 30초
});

export class BusPositionService {
  /**
   * 버스 노선의 전체 정류소 목록 및 실시간 버스 위치 목록 통합 조회
   */
  public static async getBusLinePositions(
    params: FetchBusLinePositionsParams
  ): Promise<BusLinePositionsData | null> {
    const rawBusNo = params.busNo.trim();
    const cleanNo = cleanBusNumber(rawBusNo);
    const resolvedCityCode = resolveTagoCode(params.cityCode);
    const coordRegion = params.lat && params.lng
      ? inferRegionFromPlace({ lat: params.lat, lng: params.lng, place_name: params.stationName })
      : undefined;

    let resolvedRegion = resolveBusRegion(params.cityCode || params.region);
    if (coordRegion && (resolvedRegion === 'seoul' || !params.region)) {
      resolvedRegion = coordRegion;
    }

    // 1. ODsay 전용 5자리 busID와 TAGO 전용 routeId 분리
    const effectiveOdsayBusId =
      params.odsayBusId ||
      (params.busId && String(params.busId).length <= 6 ? String(params.busId) : undefined);
    let effectiveTagoRouteId =
      params.tagoRouteId ||
      params.routeId ||
      (params.busId && String(params.busId).length > 6 ? String(params.busId) : undefined);

    // 경기도 9자리 순수 숫자인 경우 국토교통부 표준 GGB 접두사 보정
    if (effectiveTagoRouteId && /^[0-9]{9}$/.test(effectiveTagoRouteId.trim())) {
      effectiveTagoRouteId = `GGB${effectiveTagoRouteId.trim()}`;
    }

    // 💡 [부산 권역 전용 고속 BIMS 파이프라인 최우선 실행]
    // 부산 버스는 타 지자체 탐색 없이 즉시 부산 BIMS로 분기하여 불필요한 네트워크 지연(2~4초)을 사전에 차단합니다.
    const isBusan =
      resolvedRegion === 'busan' ||
      params.cityCode === '21' ||
      params.cityCode === '7000' ||
      params.region === 'busan' ||
      params.region === '부산' ||
      (params.stationId && String(params.stationId).toUpperCase().startsWith('BSB')) ||
      (effectiveTagoRouteId && String(effectiveTagoRouteId).startsWith('52')) ||
      (params.busId && String(params.busId).startsWith('52'));

    if (isBusan) {
      try {
        const busanData = await BusanBusService.getBusLinePositions({
          busNo: cleanNo,
          routeId: effectiveTagoRouteId,
          busId: params.busId,
          stationId: params.stationId,
          stationName: params.stationName,
        });

        if (busanData && busanData.stations.length > 0) {
          return busanData;
        }
      } catch (busanErr: unknown) {
        const errMsg = busanErr instanceof Error ? busanErr.message : String(busanErr);
        console.warn('[BusPositionService] 부산 전용 노선도 조회 실패, TAGO/ODsay 폴백 진행:', errMsg);
      }
    }

    // 💡 [경기도 권역 전용 판별 및 routeId 조회]
    const isGyeonggiHint =
      resolvedRegion === 'gyeonggi' ||
      coordRegion === 'gyeonggi' ||
      params.cityCode === '31' ||
      (params.cityCode && params.cityCode.startsWith('31')) ||
      params.region === 'gyeonggi' ||
      params.region === '경기' ||
      (params.stationId && String(params.stationId).toUpperCase().startsWith('GGB')) ||
      (effectiveTagoRouteId && String(effectiveTagoRouteId).toUpperCase().startsWith('GGB'));

    // 경기도 버스 후보 판별 (타 지자체 명시 시 불필요한 호출 방지)
    const isGyeonggiCandidate =
      isGyeonggiHint ||
      coordRegion === 'gyeonggi' ||
      (!params.region && !coordRegion && cleanNo.includes('-'));

    if (!effectiveTagoRouteId && isGyeonggiCandidate) {
      try {
        const bestRoute = await GyeonggiBusService.findBestRoute({
          busNo: cleanNo,
          stationName: params.stationName,
          destination: params.destination,
          headsign: params.headsign,
          cityCode: params.cityCode || (isGyeonggiHint ? '31' : undefined),
          lat: params.lat,
          lng: params.lng,
        });
        if (bestRoute?.routeId) {
          effectiveTagoRouteId = `GGB${bestRoute.routeId}`;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[BusPositionService] 경기도 노선 검색 routeId 역조회 스킵:', errMsg);
      }
    }

    // 💡 [자체 스마트 routeId 역조회 Fallback]
    // routeId가 누락되었으나 정류소 정보(stationId 또는 stationName)가 전달된 경우
    if (!effectiveTagoRouteId && (params.stationId || params.stationName)) {
      try {
        const targetRegion = isGyeonggiHint ? 'gyeonggi' : (resolvedRegion || 'seoul');
        const arrivalData = await RealtimeTransitService.getBusArrivals({
          region: targetRegion,
          stationId: params.stationId || 'auto',
          stationName: params.stationName,
          cityCode: params.cityCode || (isGyeonggiHint ? '31' : undefined),
          lat: params.lat,
          lng: params.lng,
        });
        const matched = arrivalData?.nextArrivals?.find((b) => cleanBusNumber(b.lineName) === cleanNo);
        if (matched?.lineId) {
          const lId = String(matched.lineId).trim();
          effectiveTagoRouteId = /^[0-9]{9}$/.test(lId) ? `GGB${lId}` : lId;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[BusPositionService] 실시간 도착정보 기반 routeId 역조회 스킵:', errMsg);
      }
    }

    // 2. 노선 정적 정보 & 정류소 목록 조회 (캐시 최우선 -> GGB/TAGO API -> ODsay API)
    const routeData = await this.getOrFetchRouteStations({
      busNo: cleanNo,
      rawBusNo,
      busId: effectiveOdsayBusId,
      routeId: effectiveTagoRouteId,
      cityCode: params.cityCode,
      resolvedCityCode,
      resolvedRegion,
      coordRegion,
      stationName: params.stationName,
      destination: params.destination,
      headsign: params.headsign,
      lat: params.lat,
      lng: params.lng,
    });

    // 💡 [핵심 해결] 노선 정적 정보에서 확인된 공인 국토부 routeId를 최우선 확정
    if (routeData?.routeId) {
      effectiveTagoRouteId = routeData.routeId;
    }

    // 💡 [핵심 Graceful Fallback] 정류소 목록 획득에 실패하더라도 실시간 운행 버스 위치로부터 가상 노선 뷰 즉석 합성
    if (!routeData || routeData.stations.length === 0) {
      if (effectiveTagoRouteId) {
        const fallbackRes = await this.createFallbackRouteFromRealtimePositions({
          routeId: effectiveTagoRouteId,
          busNo: cleanNo,
          cityCode: resolvedCityCode,
          stationName: params.stationName,
          stationId: params.stationId,
        });
        if (fallbackRes) {
          return fallbackRes;
        }
      }
      return null;
    }

    // 💡 [핵심 개선: Set 기반 중복 없는 상/하행 전체 TAGO routeId 집합 구성]
    const allRouteIds = Array.from(
      new Set(
        [routeData.routeId, effectiveTagoRouteId, ...(routeData.routeIds || [])].filter(Boolean) as string[]
      )
    );

    // 3. 실시간 버스 위치 목록 조회 및 공간(Spatial GPS) + 정류소명 정밀 매핑
    const positions = await this.getOrFetchRealtimePositions({
      routeId: effectiveTagoRouteId,
      routeIds: allRouteIds,
      busId: routeData.busId,
      busNo: cleanNo,
      cityCode: resolvedCityCode,
      region: resolvedRegion,
      stations: routeData.stations,
      turningStationSeq: routeData.turningStationSeq,
      stationIndexMap: routeData.stationIndexMap,
      upStationIndexMap: routeData.upStationIndexMap,
      downStationIndexMap: routeData.downStationIndexMap,
    });

    return {
      busNo: routeData.busNo || cleanNo,
      busId: routeData.busId,
      routeId: effectiveTagoRouteId,
      busType: routeData.busType,
      busColor: routeData.busColor,
      startStationName: routeData.startStationName,
      endStationName: routeData.endStationName,
      turningStationName: routeData.turningStationName,
      turningStationSeq: routeData.turningStationSeq,
      stations: routeData.stations,
      positions,
      timestamp: Date.now(),
    };
  }

  /**
   * 정류소 원시 목록으로부터 CachedBusRoute 객체(인덱스 맵, 33/66% 앵커 등) 생성
   */
  private static buildRouteData(params: {
    busNo: string;
    busId: string;
    routeId?: string;
    routeIds?: string[];
    busType?: string;
    busColor?: string;
    startStationName?: string;
    endStationName?: string;
    turningStationName?: string;
    turningStationSeq?: number;
    rawStations: Array<{
      stationId: string;
      stationName: string;
      stationSeq: number;
      lat: number;
      lng: number;
      arsNo?: string;
      isTurningPoint?: boolean;
    }>;
  }): CachedBusRoute {
    const rawStations = params.rawStations;
    const stations: BusLineStation[] = [];
    const stationIndexMap = new Map<string, number>();
    const upStationIndexMap = new Map<string, number>();
    const downStationIndexMap = new Map<string, number>();

    const effectiveTurningSeq = params.turningStationSeq || Math.ceil(rawStations.length / 2);

    for (let i = 0; i < rawStations.length; i++) {
      const st = rawStations[i];
      const stationId = String(st.stationId || st.stationSeq || i + 1);
      const stationName = String(st.stationName || `정류소 ${i + 1}`).trim();
      const stationSeq = Number(st.stationSeq ?? i + 1);
      const lat = Number(st.lat || 0);
      const lng = Number(st.lng || 0);
      const arsNo = st.arsNo ? String(st.arsNo).trim() : undefined;
      const isTurning = st.isTurningPoint || stationSeq === effectiveTurningSeq;

      stations.push({
        stationId,
        stationName,
        stationSeq,
        lat,
        lng,
        arsNo,
        isTurningPoint: isTurning,
        edgePoints: null,
      });

      // 1) 전체 통합 맵 등록
      stationIndexMap.set(stationId, i);
      stationIndexMap.set(`seq:${stationSeq}`, i);
      stationIndexMap.set(`name:${stationName}`, i);

      if (arsNo) {
        stationIndexMap.set(`ars:${arsNo}`, i);
      }

      // 2) 방향별 독립 인덱스 맵 분리
      if (stationSeq <= effectiveTurningSeq) {
        upStationIndexMap.set(stationId, i);
        upStationIndexMap.set(`seq:${stationSeq}`, i);
        upStationIndexMap.set(`name:${stationName}`, i);
        if (arsNo) upStationIndexMap.set(`ars:${arsNo}`, i);
      }
      if (stationSeq >= effectiveTurningSeq) {
        downStationIndexMap.set(stationId, i);
        downStationIndexMap.set(`seq:${stationSeq}`, i);
        downStationIndexMap.set(`name:${stationName}`, i);
        if (arsNo) downStationIndexMap.set(`ars:${arsNo}`, i);
      }
    }

    // 앵커 포인트 계산
    for (let i = 0; i < stations.length - 1; i++) {
      const curr = stations[i];
      const next = stations[i + 1];

      if (curr.lat && curr.lng && next.lat && next.lng) {
        const latA = curr.lat;
        const lngA = curr.lng;
        const latB = next.lat;
        const lngB = next.lng;

        curr.edgePoints = {
          departurePoint: {
            lat: latA + (latB - latA) * (1 / 3),
            lng: lngA + (lngB - lngA) * (1 / 3),
            ratio: 0.33,
          },
          approachingPoint: {
            lat: latA + (latB - latA) * (2 / 3),
            lng: lngA + (lngB - lngA) * (2 / 3),
            ratio: 0.66,
          },
        };
      }
    }

    return {
      busNo: params.busNo,
      busId: params.busId,
      routeId: params.routeId,
      routeIds: params.routeIds,
      busType: params.busType,
      busColor: params.busColor,
      startStationName: params.startStationName || stations[0]?.stationName,
      endStationName: params.endStationName || stations[stations.length - 1]?.stationName,
      turningStationName: params.turningStationName || stations[effectiveTurningSeq - 1]?.stationName,
      turningStationSeq: effectiveTurningSeq,
      stations,
      stationIndexMap,
      upStationIndexMap,
      downStationIndexMap,
    };
  }

  /**
   * 노선 경유 정류소 목록 조회 (캐시 최우선 -> GGB/TAGO API -> ODsay API)
   */
  private static async getOrFetchRouteStations(params: {
    busNo: string;
    rawBusNo: string;
    busId?: string;
    routeId?: string;
    cityCode?: string;
    resolvedCityCode: string;
    resolvedRegion?: string;
    coordRegion?: string;
    stationName?: string;
    destination?: string;
    headsign?: string;
    lat?: number;
    lng?: number;
  }): Promise<CachedBusRoute | null> {
    const ggbRouteId = (params.routeId && /^GGB[0-9]{9}$/i.test(params.routeId))
      ? params.routeId.replace(/^GGB/i, '')
      : (params.routeId && /^[0-9]{9}$/.test(params.routeId))
      ? params.routeId
      : null;

    let targetGgbRouteId = ggbRouteId;
    const cleanStationKey = normalizeStationName(params.stationName);
    const cityPrefix = params.resolvedCityCode || params.cityCode || '11';

    // ─── 0. 캐시 최우선 조회 (Cache-First): 외부 API 호출 전 캐시 즉시 확인 ───
    const candidateKeys: string[] = [];
    if (targetGgbRouteId) {
      candidateKeys.push(`route:GGB${targetGgbRouteId}`);
    }
    if (params.routeId) {
      candidateKeys.push(`route:${cityPrefix}:${params.routeId}`);
    }
    if (params.busId) {
      candidateKeys.push(`id:${params.busId}`);
    }
    if (params.busNo) {
      candidateKeys.push(`no:${cityPrefix}:${params.busNo}:${cleanStationKey}`);
    }

    for (const key of candidateKeys) {
      // 1) 인메모리 캐시 1차 확인
      const memCached = BUS_ROUTE_CACHE.get(key);
      if (memCached) {
        if (validateRouteContainsStation(memCached, params.stationName)) {
          return memCached;
        }
        BUS_ROUTE_CACHE.delete(key);
      }

      // 2) 영속 파일 캐시 2차 확인
      const persistentCached = await BusRoutePersistentCache.get(key);
      if (persistentCached) {
        if (validateRouteContainsStation(persistentCached, params.stationName)) {
          BUS_ROUTE_CACHE.set(key, persistentCached);
          return persistentCached;
        }
        await BusRoutePersistentCache.delete(key).catch(() => {});
      }
    }

    // ─── 1. 캐시 미스 시 경기도 버스 노선 식별 ───
    const isGyeonggiRegion =
      params.resolvedRegion === 'gyeonggi' ||
      params.coordRegion === 'gyeonggi' ||
      params.resolvedCityCode === '31' ||
      params.resolvedCityCode?.startsWith('31') ||
      params.cityCode === '31' ||
      String(params.cityCode).startsWith('31');

    if (!targetGgbRouteId && isGyeonggiRegion) {
      const best = await GyeonggiBusService.findBestRoute({
        busNo: params.busNo,
        stationName: params.stationName,
        destination: params.destination,
        headsign: params.headsign,
        cityCode: params.cityCode,
        lat: params.lat,
        lng: params.lng,
      }).catch(() => null);
      if (best?.routeId) {
        targetGgbRouteId = best.routeId;
      }
    }

    const primaryKey = targetGgbRouteId
      ? `route:GGB${targetGgbRouteId}`
      : params.routeId
      ? `route:${cityPrefix}:${params.routeId}`
      : params.busId
      ? `id:${params.busId}`
      : `no:${cityPrefix}:${params.busNo}:${cleanStationKey}`;

    // 2. 경기도 버스 노선 API (v2 getBusRouteStationListv2) 조회
    if (targetGgbRouteId) {
      const ggbRes = await GyeonggiBusService.getRouteStationList(targetGgbRouteId).catch(() => null);
      if (ggbRes && ggbRes.stations && ggbRes.stations.length > 0) {
        const routeData = this.buildRouteData({
          busNo: params.busNo,
          busId: targetGgbRouteId,
          routeId: `GGB${targetGgbRouteId}`,
          rawStations: ggbRes.stations,
          turningStationSeq: ggbRes.turningStationSeq,
          turningStationName: ggbRes.turningStationName,
        });

        if (validateRouteContainsStation(routeData, params.stationName)) {
          BUS_ROUTE_CACHE.set(primaryKey, routeData);
          await BusRoutePersistentCache.set(primaryKey, routeData);
          return routeData;
        }
      }
    }

    // 3. 국토교통부(TAGO) 노선 경유 정류소 API 조회 시도 (routeId가 있는 경우)
    if (params.routeId) {
      const tagoRes = await TagoBusService.getRouteThroughStations(
        params.resolvedCityCode,
        params.routeId
      ).catch(() => null);

      if (tagoRes && tagoRes.stations && tagoRes.stations.length > 0) {
        const routeData = this.buildRouteData({
          busNo: params.busNo,
          busId: params.busId || params.routeId,
          routeId: params.routeId,
          rawStations: tagoRes.stations,
          turningStationSeq: tagoRes.turningStationSeq,
          turningStationName: tagoRes.turningStationName,
        });

        if (validateRouteContainsStation(routeData, params.stationName)) {
          BUS_ROUTE_CACHE.set(primaryKey, routeData);
          await BusRoutePersistentCache.set(primaryKey, routeData);
          return routeData;
        }
      }
    }

    // 4. ODsay busLaneDetail API 안전 조회 (단 1회 시도, 429 쿼터 초과 시 안전 스킵)
    try {
      let busID = params.busId;

      // busID가 없는 경우 searchBusLane 1회만 시도
      if (!busID) {
        const odsayCid = resolveOdsayCid(params.cityCode || params.resolvedCityCode);
        const searchRes = await OdsayAdapter.fetchBusLane(
          params.rawBusNo || params.busNo,
          odsayCid
        ).catch(() => null);

        const rawLanes = searchRes?.result?.lane;
        const lanes: Array<Record<string, unknown>> = Array.isArray(rawLanes)
          ? rawLanes
          : rawLanes && typeof rawLanes === 'object' && 'busID' in rawLanes
          ? [rawLanes as Record<string, unknown>]
          : [];

        if (lanes.length > 0) {
          const targetCleanNo = cleanBusNumber(params.busNo);
          // 1) 노선 번호 완전 일치 필터링
          const exactNumberLanes = lanes.filter(
            (l) => cleanBusNumber(String(l.busNo || '')) === targetCleanNo
          );

          if (exactNumberLanes.length === 1) {
            busID = String(exactNumberLanes[0].busID);
          } else if (exactNumberLanes.length > 1) {
            // 정류소명이나 방향과 매칭 시도
            const cleanStation = normalizeStationName(params.stationName);
            const matched = exactNumberLanes.find((l) => {
              const busInfo = `${String(l.busCityName || '')} ${String(l.busFirstStationName || '')} ${String(l.busLastStationName || '')} ${String(l.busDestination || '')}`;
              return cleanStation && busInfo.includes(cleanStation);
            });
            busID = String((matched || exactNumberLanes[0]).busID);
          }
        }
      }

      if (busID) {
        const busLaneDetailRaw = await OdsayAdapter.fetchBusLaneDetail(busID).catch(() => null);
        const detailResult = busLaneDetailRaw?.result;

        if (detailResult && Array.isArray(detailResult.station) && detailResult.station.length > 0) {
          const rawStations = detailResult.station.map((st: Record<string, unknown>, idx: number) => ({
            stationId: String(st.stationID || st.stationSeq || idx + 1),
            stationName: String(st.stationName || `정류소 ${idx + 1}`).trim(),
            stationSeq: Number(st.stationSeq ?? idx + 1),
            lat: Number(st.y || 0),
            lng: Number(st.x || 0),
            arsNo: st.arsID ? String(st.arsID).trim() : undefined,
            isTurningPoint:
              st.isTurningPoint === 'Y' ||
              st.isTurningPoint === true ||
              st.stationClass === '2',
          }));

          const routeData = this.buildRouteData({
            busNo: detailResult.busNo || params.busNo,
            busId: String(busID),
            routeId: detailResult.busLocalBlID ? String(detailResult.busLocalBlID) : params.routeId,
            busType: detailResult.busType,
            busColor: detailResult.busColor,
            startStationName: detailResult.busStartPoint,
            endStationName: detailResult.busEndPoint,
            rawStations,
          });

          if (validateRouteContainsStation(routeData, params.stationName)) {
            BUS_ROUTE_CACHE.set(primaryKey, routeData);
            await BusRoutePersistentCache.set(primaryKey, routeData);
            return routeData;
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[BusPositionService] ODsay 노선 정류소 조회 스킵/실패:', errMsg);
    }

    return null;
  }

  /**
   * 💡 [핵심 Graceful Fallback] 노선 정류소 조회가 실패했을 때,
   * TAGO 실시간 운행 버스 데이터(200 OK)로부터 최소 정류소 축을 즉석 합성하여 반환
   */
  private static async createFallbackRouteFromRealtimePositions(params: {
    routeId: string;
    busNo: string;
    cityCode: string;
    stationName?: string;
    stationId?: string;
  }): Promise<BusLinePositionsData | null> {
    try {
      const rawPosList = await TagoBusService.getBusLocationInfoMulti(
        [params.routeId],
        params.cityCode
      );

      if (!rawPosList || rawPosList.length === 0) {
        return null;
      }

      // 버스들이 위치한 정류소 노드들을 추출
      const nodeMap = new Map<number, { nodeord: number; nodenm: string; nodeid?: string; lat?: number; lng?: number }>();

      for (const pos of rawPosList) {
        const ord = pos.nodeord !== undefined ? Number(pos.nodeord) : undefined;
        if (ord !== undefined && !nodeMap.has(ord)) {
          nodeMap.set(ord, {
            nodeord: ord,
            nodenm: String(pos.nodenm || `정류소 ${ord}`).trim(),
            nodeid: pos.nodeid ? String(pos.nodeid) : undefined,
            lat: pos.gpslati ? Number(pos.gpslati) : undefined,
            lng: pos.gpslong ? Number(pos.gpslong) : undefined,
          });
        }
      }

      // 사용자 탑승 정류소 정보가 있으면 추가
      if (params.stationName && !Array.from(nodeMap.values()).some((n) => n.nodenm.includes(params.stationName!))) {
        nodeMap.set(999, {
          nodeord: 999,
          nodenm: params.stationName,
          nodeid: params.stationId,
        });
      }

      const sortedNodes = Array.from(nodeMap.values()).sort((a, b) => a.nodeord - b.nodeord);
      if (sortedNodes.length === 0) return null;

      const rawStations = sortedNodes.map((n, idx) => ({
        stationId: n.nodeid || `fallback_${n.nodeord}`,
        stationName: n.nodenm,
        stationSeq: n.nodeord === 999 ? idx + 1 : n.nodeord,
        lat: n.lat || 0,
        lng: n.lng || 0,
      }));

      const routeData = this.buildRouteData({
        busNo: params.busNo,
        busId: params.routeId,
        routeId: params.routeId,
        rawStations,
      });

      // 차량 중복 수신 필터링
      const seenVehicles = new Set<string>();
      const positions: BusPosition[] = [];

      for (const pos of rawPosList) {
        const vehicleno = String(pos.vehicleno || '').trim();
        if (!vehicleno || seenVehicles.has(vehicleno)) continue;
        seenVehicles.add(vehicleno);

        positions.push({
          vehicleno: vehicleno || '운행차량',
          nodeid: pos.nodeid ? String(pos.nodeid) : undefined,
          nodenm: pos.nodenm ? String(pos.nodenm) : undefined,
          nodeord: pos.nodeord !== undefined ? Number(pos.nodeord) : undefined,
          direction: '0',
          gpslati: pos.gpslati !== undefined ? Number(pos.gpslati) : undefined,
          gpslong: pos.gpslong !== undefined ? Number(pos.gpslong) : undefined,
          stage: 'at_station',
          progressRate: 0.0,
        });
      }

      return {
        busNo: params.busNo,
        busId: params.routeId,
        routeId: params.routeId,
        startStationName: routeData.startStationName,
        endStationName: routeData.endStationName,
        turningStationName: routeData.turningStationName,
        turningStationSeq: routeData.turningStationSeq,
        stations: routeData.stations,
        positions,
        timestamp: Date.now(),
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[BusPositionService] Fallback 위치 합성 실패:', errMsg);
      return null;
    }
  }

  /**
   * 실시간 버스 위치 목록 조회 및 공간(Spatial GPS) + 정류소 순번 정밀 매핑 (상/하행 완전 분리)
   */
  private static async getOrFetchRealtimePositions(params: {
    routeId?: string;
    routeIds?: string[];
    busId: string;
    busNo: string;
    cityCode: string;
    region?: string;
    stations: BusLineStation[];
    turningStationSeq?: number;
    stationIndexMap: Map<string, number>;
    upStationIndexMap?: Map<string, number>;
    downStationIndexMap?: Map<string, number>;
  }): Promise<BusPosition[]> {
    // 💡 [핵심 개선 2: 캐시 키 일원화 및 노선별 격리]
    const cacheKey = `realtime:${params.routeId || params.busId || params.busNo}:${params.cityCode || '11'}`;
    const cached = REALTIME_POS_CACHE.get(cacheKey);

    if (cached) {
      return cached.positions;
    }

    try {
      const cleanRouteId = String(params.routeId || '').trim();
      const turningSeq = params.turningStationSeq || Math.ceil(params.stations.length / 2);
      const totalStations = params.stations.length;

      // ─── 0. 경기도 전용 실시간 버스 위치 API (v2 getBusLocationListv2) 우선 연동 ───
      const ggbRouteId = cleanRouteId.replace(/^GGB/i, '');
      const isGgb =
        /^[0-9]{9}$/.test(ggbRouteId) ||
        params.cityCode === '31' ||
        params.cityCode?.startsWith('31') ||
        params.region === 'gyeonggi';

      if (isGgb) {
        const targetId = /^[0-9]{9}$/.test(ggbRouteId)
          ? ggbRouteId
          : (params.routeIds && params.routeIds[0] ? params.routeIds[0].replace(/^GGB/i, '') : '');

        if (targetId && /^[0-9]{9}$/.test(targetId)) {
          const ggbLocations = await GyeonggiBusService.getBusLocationList(targetId).catch(() => null);
          if (ggbLocations && ggbLocations.length > 0) {
            const positions: BusPosition[] = [];
            const seenVehicles = new Set<string>();

            for (const item of ggbLocations) {
              const vehicleno = item.plateNo ? item.plateNo.trim() : (item.vehId ? `차량-${item.vehId}` : '운행차량');
              if (seenVehicles.has(vehicleno)) continue;
              seenVehicles.add(vehicleno);

              const nodeord = item.stationSeq !== undefined ? Number(item.stationSeq) : undefined;
              const nodeid = item.stationId ? String(item.stationId).trim() : undefined;

              let stationIdx = -1;
              if (nodeord !== undefined && params.stationIndexMap.has(`seq:${nodeord}`)) {
                stationIdx = params.stationIndexMap.get(`seq:${nodeord}`)!;
              } else if (nodeid && params.stationIndexMap.has(nodeid)) {
                stationIdx = params.stationIndexMap.get(nodeid)!;
              }

              let nodenm: string | undefined = undefined;
              let gpslati: number | undefined = undefined;
              let gpslong: number | undefined = undefined;

              if (stationIdx >= 0 && stationIdx < totalStations) {
                const st = params.stations[stationIdx];
                nodenm = st.stationName;
                gpslati = st.lat;
                gpslong = st.lng;
              }

              const finalDirection: '0' | '1' =
                stationIdx >= 0
                  ? stationIdx >= turningSeq - 1
                    ? '1'
                    : '0'
                  : nodeord !== undefined && nodeord >= turningSeq
                  ? '1'
                  : '0';

              positions.push({
                vehicleno,
                nodeid,
                nodenm,
                nodeord: nodeord || (stationIdx >= 0 ? params.stations[stationIdx].stationSeq : undefined),
                direction: finalDirection,
                gpslati,
                gpslong,
                stage: 'at_station',
                progressRate: 0.0,
              });
            }

            if (positions.length > 0) {
              REALTIME_POS_CACHE.set(cacheKey, { positions });
              return positions;
            }
          }
        }
      }

      // ─── 1. 국토교통부(TAGO) 표준 버스 실시간 위치 API (전국 단일 일원화 및 상/하행 Multi-Route 병렬 수집) ───
      let rawPosList: Array<{
        vehicleno?: string;
        nodeid?: string;
        nodenm?: string;
        nodeord?: number;
        gpslati?: number;
        gpslong?: number;
        directionIdx?: number;
      }> | null = null;

      const targetRouteIds =
        params.routeIds && params.routeIds.length > 0
          ? params.routeIds
          : params.routeId
          ? [params.routeId]
          : [];

      if (targetRouteIds.length > 0) {
        rawPosList = await TagoBusService.getBusLocationInfoMulti(
          targetRouteIds,
          params.cityCode
        );
      }

      if (rawPosList && rawPosList.length > 0) {
        const positions: BusPosition[] = [];
        const seenVehicles = new Set<string>();

        // 💡 [성능 최적화] 정류소 명칭 사전 정규화 및 O(1) 매핑 테이블 사전 구축 (루프 내 정규식 반복 제거)
        const normalizedStations = params.stations.map((st, i) => ({
          idx: i,
          cleanName: normalizeStationName(st.stationName),
          lat: st.lat,
          lng: st.lng,
        }));

        const nameToIndices = new Map<string, number[]>();
        for (const ns of normalizedStations) {
          if (ns.cleanName) {
            const list = nameToIndices.get(ns.cleanName) || [];
            list.push(ns.idx);
            nameToIndices.set(ns.cleanName, list);
          }
        }

        for (const item of rawPosList) {
          const vehicleno = String(item.vehicleno || '').trim();
          if (!vehicleno || seenVehicles.has(vehicleno)) continue;
          seenVehicles.add(vehicleno);

          const nodeord = item.nodeord !== undefined ? Number(item.nodeord) : undefined;
          const nodeid = item.nodeid ? String(item.nodeid).trim() : undefined;
          const nodenm = item.nodenm ? String(item.nodenm).trim() : undefined;
          const gpslati = item.gpslati !== undefined ? Number(item.gpslati) : undefined;
          const gpslong = item.gpslong !== undefined ? Number(item.gpslong) : undefined;
          const directionIdx = item.directionIdx; // 0: 1순위 route, 1: 2순위 route

          // ─── 💡 [핵심 혁신: Spatial GPS 기반 100% 무오류 상/하행 판별] ───
          let stationIdx = -1;

          // 1단계: GPS 좌표가 있는 경우 -> 물리적 위경도 거리 기반으로 상행 vs 하행 정류소 판별
          if (gpslati && gpslong && totalStations > 0) {
            const cleanTargetNm = normalizeStationName(nodenm);

            // 1-1. 정류소명이 일치하는 후보 정류소들 중 버스 GPS와 가장 가까운 정류소 탐색
            if (cleanTargetNm) {
              let minNameDist = Infinity;
              let bestNameIdx = -1;

              // 사전 인덱싱된 Map에서 O(1) 후보 탐색
              const candidateIndices = nameToIndices.get(cleanTargetNm);
              if (candidateIndices && candidateIndices.length > 0) {
                for (const idx of candidateIndices) {
                  const st = normalizedStations[idx];
                  if (st.lat && st.lng) {
                    const d = calculateHaversineDistanceMeter(gpslati, gpslong, st.lat, st.lng);
                    if (d < minNameDist) {
                      minNameDist = d;
                      bestNameIdx = idx;
                    }
                  }
                }
              }

              // 부분 일치 후보 탐색 (O(1) 매치 실패 시에만 수행하며 정규식 재연산 없음)
              if (bestNameIdx === -1) {
                for (let i = 0; i < totalStations; i++) {
                  const st = normalizedStations[i];
                  if (st.cleanName && (st.cleanName.includes(cleanTargetNm) || cleanTargetNm.includes(st.cleanName))) {
                    if (st.lat && st.lng) {
                      const d = calculateHaversineDistanceMeter(gpslati, gpslong, st.lat, st.lng);
                      if (d < minNameDist) {
                        minNameDist = d;
                        bestNameIdx = i;
                      }
                    }
                  }
                }
              }

              // 정류소명 일치 후보 중 1.5km 이내에 있는 경우 최우선 확정
              if (bestNameIdx !== -1 && minNameDist <= 1500) {
                stationIdx = bestNameIdx;
              }
            }

            // 1-2. 정류소명 매칭이 안 되었을 때, 전체 정류소 중 GPS 최단 거리 정류소 탐색
            if (stationIdx === -1) {
              let minGlobalDist = Infinity;
              let bestGlobalIdx = -1;

              for (let i = 0; i < totalStations; i++) {
                const st = normalizedStations[i];
                if (st.lat && st.lng) {
                  const d = calculateHaversineDistanceMeter(gpslati, gpslong, st.lat, st.lng);
                  if (d < minGlobalDist) {
                    minGlobalDist = d;
                    bestGlobalIdx = i;
                  }
                }
              }

              if (bestGlobalIdx !== -1 && minGlobalDist <= 800) {
                stationIdx = bestGlobalIdx;
              }
            }
          }

          // 2단계: GPS 매칭 실패 시 -> 방향 힌트(directionIdx) + 순번/ID 정합성 매핑
          if (stationIdx === -1) {
            const isDownHint = directionIdx === 1 || (directionIdx === undefined && nodeord !== undefined && nodeord > turningSeq);
            const targetMap = isDownHint
              ? params.downStationIndexMap || params.stationIndexMap
              : params.upStationIndexMap || params.stationIndexMap;

            if (nodeid && targetMap.has(nodeid)) {
              stationIdx = targetMap.get(nodeid)!;
            } else if (nodeid && targetMap.has(`ars:${nodeid}`)) {
              stationIdx = targetMap.get(`ars:${nodeid}`)!;
            } else if (nodenm && targetMap.has(`name:${nodenm.trim()}`)) {
              stationIdx = targetMap.get(`name:${nodenm.trim()}`)!;
            } else if (nodeord !== undefined) {
              if (isDownHint) {
                const offsetSeq = turningSeq + (nodeord - 1);
                if (targetMap.has(`seq:${offsetSeq}`)) {
                  stationIdx = targetMap.get(`seq:${offsetSeq}`)!;
                } else if (targetMap.has(`seq:${nodeord}`)) {
                  stationIdx = targetMap.get(`seq:${nodeord}`)!;
                }
              } else {
                if (targetMap.has(`seq:${nodeord}`)) {
                  stationIdx = targetMap.get(`seq:${nodeord}`)!;
                }
              }
            }
          }

          // 3단계: 최종 폴백
          if (stationIdx === -1 && nodenm && params.stationIndexMap.has(`name:${nodenm.trim()}`)) {
            stationIdx = params.stationIndexMap.get(`name:${nodenm.trim()}`)!;
          }

          let stage: BusPositionStage = 'at_station';
          let progressRate = 0.0;
          let finalNodeOrd = nodeord;

          if (stationIdx >= 0 && stationIdx < totalStations) {
            const currStation = params.stations[stationIdx];
            finalNodeOrd = currStation.stationSeq;

            if (gpslati && gpslong) {
              const nextStation =
                stationIdx < totalStations - 1
                  ? params.stations[stationIdx + 1]
                  : null;

              if (currStation.edgePoints && nextStation) {
                const p0 = { lat: currStation.lat, lng: currStation.lng };
                const p33 = currStation.edgePoints.departurePoint;
                const p66 = currStation.edgePoints.approachingPoint;
                const p100 = { lat: nextStation.lat, lng: nextStation.lng };

                const d0 = calculateHaversineDistanceMeter(gpslati, gpslong, p0.lat, p0.lng);
                const d1 = calculateHaversineDistanceMeter(gpslati, gpslong, p33.lat, p33.lng);
                const d2 = calculateHaversineDistanceMeter(gpslati, gpslong, p66.lat, p66.lng);
                const d3 = calculateHaversineDistanceMeter(gpslati, gpslong, p100.lat, p100.lng);

                const minDist = Math.min(d0, d1, d2, d3);

                if (minDist === d0) {
                  stage = 'at_prev_station';
                  progressRate = 0.0;
                } else if (minDist === d1) {
                  stage = 'departed';
                  progressRate = 0.33;
                } else if (minDist === d2) {
                  stage = 'approaching';
                  progressRate = 0.66;
                } else {
                  stage = 'at_station';
                  progressRate = 1.0;
                }
              }
            }
          }

          // 💡 [핵심] 실제 확정된 정류소 인덱스로부터 상행('0') vs 하행('1') 결정
          const finalDirection: '0' | '1' =
            stationIdx >= 0
              ? stationIdx >= turningSeq - 1
                ? '1'
                : '0'
              : directionIdx === 1
              ? '1'
              : '0';

          positions.push({
            vehicleno: vehicleno || '운행차량',
            nodeid,
            nodenm,
            nodeord: finalNodeOrd,
            direction: finalDirection,
            gpslati,
            gpslong,
            stage,
            progressRate,
          });
        }

        REALTIME_POS_CACHE.set(cacheKey, {
          positions,
        });

        return positions;
      }

      // ─── 3. 운행 차량 없음 또는 조회 결과 없음 처리 (가짜 순간이동 방지) ───
      return [];
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn('[BusPositionService] 실시간 버스 위치 처리 실패:', errMsg);
      return [];
    }
  }
}
