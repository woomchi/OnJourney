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
import { calculateHaversineDistanceMeter } from '@/lib/utils/geoUtils';
import { cleanBusNumber, resolveBusRegion, resolveTagoCode, resolveOdsayCid } from '@/lib/utils/busRegionUtils';
import {
  BusLinePositionsData,
  BusLineStation,
  BusPosition,
  BusPositionStage,
  EdgeAnchorPoints,
} from '@/types/journey';

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
}

// ─── 인메모리 캐시 ───────────────────────────────────────────────────────────

/** 정적 노선 정류소 목록 캐시 (TTL: 1시간) */
interface CachedBusRoute {
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
  stations: BusLineStation[];
  stationIndexMap: Map<string, number>; // 전체 통합 인덱스 맵
  upStationIndexMap: Map<string, number>; // 상행(0 ~ turningSeq-1) 인덱스 맵
  downStationIndexMap: Map<string, number>; // 하행(turningSeq-1 ~ end) 인덱스 맵
  stationIndexListMap: Map<string, number[]>; // 중복 정류소명/ID 다중 인덱스 맵
  expiresAt: number;
}

const BUS_ROUTE_CACHE = new Map<string, CachedBusRoute>();
const ROUTE_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

/** 실시간 버스 위치 캐시 (TTL: 10초) */
interface CachedBusPositions {
  positions: BusPosition[];
  expiresAt: number;
}

const REALTIME_POS_CACHE = new Map<string, CachedBusPositions>();
const REALTIME_CACHE_TTL_MS = 30 * 1000; // 30초 (버스 노선뷰 실시간 위치 캐시)

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
    const resolvedRegion = resolveBusRegion(params.cityCode || params.region);

    // 1. ODsay 전용 5자리 busID와 TAGO 전용 routeId 분리
    const effectiveOdsayBusId =
      params.odsayBusId ||
      (params.busId && String(params.busId).length <= 6 ? String(params.busId) : undefined);
    let effectiveTagoRouteId =
      params.tagoRouteId ||
      params.routeId ||
      (params.busId && String(params.busId).length > 6 ? String(params.busId) : undefined);

    // 2. 노선 정적 정보 & 정류소 목록 조회 (ODsay API)
    const routeData = await this.getOrFetchRouteStations({
      busNo: cleanNo,
      rawBusNo,
      busId: effectiveOdsayBusId,
      cityCode: params.cityCode,
      resolvedCityCode,
    });

    if (!routeData || routeData.stations.length === 0) {
      return null;
    }

    // 💡 [핵심 해결] ODsay 노선 정적 정보에서 확인된 공인 국토부 routeId (busLocalBlID, 예: DJB30300104)를 최우선 확정
    if (routeData.routeId) {
      effectiveTagoRouteId = routeData.routeId;
    }

    // 💡 [핵심 개선: 항상 상/하행 전체 TAGO routeId 집합을 온전히 확보]
    let allRouteIds: string[] = [];
    if (routeData.routeId) {
      allRouteIds.push(routeData.routeId);
    }
    if (effectiveTagoRouteId && !allRouteIds.includes(effectiveTagoRouteId)) {
      allRouteIds.push(effectiveTagoRouteId);
    }
    if (routeData.routeIds && routeData.routeIds.length > 0) {
      for (const rId of routeData.routeIds) {
        if (!allRouteIds.includes(rId)) {
          allRouteIds.push(rId);
        }
      }
    }

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
      stationIndexListMap: routeData.stationIndexListMap,
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
   * ODsay 노선 정류소 목록 조회 및 33%/66% 앵커 포인트 사전 계산 캐싱 (교차 권역 검색 지원)
   */
  private static async getOrFetchRouteStations(params: {
    busNo: string;
    rawBusNo: string;
    busId?: string;
    cityCode?: string;
    resolvedCityCode: string;
  }): Promise<CachedBusRoute | null> {
    const cacheKey = params.busId ? `id:${params.busId}` : `no:${params.busNo}:${params.cityCode || '11'}`;
    const now = Date.now();
    const cached = BUS_ROUTE_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached;
    }

    try {
      let busID = params.busId;
      // 💡 안전장치: busID가 7자리 이상이면 TAGO routeId이므로 ODsay busID로 사용하지 않고 재검색
      if (busID && String(busID).length > 6) {
        busID = undefined;
      }

      let busLaneDetailRaw: any = null;

      // 1-1. busId가 없거나 TAGO routeId인 경우 searchBusLane으로 ODsay 5자리 busID 탐색
      if (!busID) {
        const odsayCid = resolveOdsayCid(params.cityCode);
        let searchRes = await OdsayAdapter.fetchBusLane(
          params.rawBusNo || params.busNo,
          odsayCid
        ).catch(() => null);

        let lanes = searchRes?.result?.lane;

        // 1차 검색 실패 시 CID 없이 전국(전체 권역)으로 2차 탐색
        if (!lanes || (Array.isArray(lanes) && lanes.length === 0)) {
          const fallbackRes = await OdsayAdapter.fetchBusLane(
            params.rawBusNo || params.busNo
          ).catch(() => null);
          lanes = fallbackRes?.result?.lane;
        }

        // 그래도 없으면 교차 CID(1000 <-> 1040) 3차 탐색
        if (!lanes || (Array.isArray(lanes) && lanes.length === 0)) {
          const crossCid = odsayCid === '1000' ? '1040' : '1000';
          const crossRes = await OdsayAdapter.fetchBusLane(
            params.rawBusNo || params.busNo,
            crossCid
          ).catch(() => null);
          lanes = crossRes?.result?.lane;
        }

        if (Array.isArray(lanes) && lanes.length > 0) {
          const exact = lanes.find(
            (l: any) => cleanBusNumber(l.busNo) === params.busNo
          ) || lanes[0];
          busID = String(exact.busID);
        } else if (lanes?.busID) {
          busID = String(lanes.busID);
        }
      }

      if (!busID) {
        return null;
      }

      // 1-2. busLaneDetail 호출
      busLaneDetailRaw = await OdsayAdapter.fetchBusLaneDetail(busID).catch(() => null);

      // 만약 기존 busID로 호출 실패 시, searchBusLane으로 ODsay busID 재추출 후 2차 시도
      if (!busLaneDetailRaw?.result?.station) {
        const odsayCid = resolveOdsayCid(params.cityCode);
        const retrySearch = await OdsayAdapter.fetchBusLane(params.rawBusNo || params.busNo, odsayCid).catch(() => null);
        const retryLanes = retrySearch?.result?.lane;
        if (Array.isArray(retryLanes) && retryLanes.length > 0) {
          const retryExact = retryLanes.find((l: any) => cleanBusNumber(l.busNo) === params.busNo) || retryLanes[0];
          busID = String(retryExact.busID);
          busLaneDetailRaw = await OdsayAdapter.fetchBusLaneDetail(busID).catch(() => null);
        }
      }

      const detailResult = busLaneDetailRaw?.result;
      if (!detailResult || !Array.isArray(detailResult.station)) {
        return null;
      }

      const rawStations = detailResult.station;
      const stations: BusLineStation[] = [];
      const stationIndexMap = new Map<string, number>();
      const upStationIndexMap = new Map<string, number>();
      const downStationIndexMap = new Map<string, number>();
      const stationIndexListMap = new Map<string, number[]>();

      const addToListMap = (key: string, idx: number) => {
        const list = stationIndexListMap.get(key) || [];
        list.push(idx);
        stationIndexListMap.set(key, list);
      };

      let turningStationName: string | undefined;
      let turningStationSeq: number | undefined;

      // 1차 회차점 탐색: ODsay 명시적 플래그(isTurningPoint, stationClass === '2')
      for (let i = 0; i < rawStations.length; i++) {
        const st = rawStations[i];
        const isTurning =
          st.isTurningPoint === 'Y' ||
          st.isTurningPoint === true ||
          st.stationClass === '2';

        if (isTurning && !turningStationName) {
          turningStationName = String(st.stationName || '').trim();
          turningStationSeq = Number(st.stationSeq ?? i + 1);
          break;
        }
      }

      // 2차 회차점 탐색: ODsay stationDirection 전환 지점 (1 -> 2 또는 상행->하행 변경)
      if (!turningStationSeq && rawStations.length >= 2) {
        for (let i = 1; i < rawStations.length; i++) {
          const prevDir = rawStations[i - 1].stationDirection;
          const currDir = rawStations[i].stationDirection;
          if (prevDir !== undefined && currDir !== undefined && String(prevDir) !== String(currDir)) {
            turningStationSeq = Number(rawStations[i].stationSeq ?? i + 1);
            turningStationName = String(rawStations[i].stationName || '').trim();
            break;
          }
        }
      }

      // 3차 회차점 탐색: 노선 중간(시작/끝 제외)에 '종점' 또는 '회차' 명칭이 포함된 정류소
      if (!turningStationSeq && rawStations.length >= 4) {
        for (let i = 1; i < rawStations.length - 1; i++) {
          const name = String(rawStations[i].stationName || '');
          if (name.includes('종점') || name.includes('회차')) {
            turningStationSeq = Number(rawStations[i].stationSeq ?? i + 1);
            turningStationName = name.trim();
            break;
          }
        }
      }

      // 4차 회차점 폴백 탐색: 명시적 플래그가 없더라도 노선 길이(>=6) 및 기점/종점 순환성 또는 최원단 거리로 자동 산출
      if (!turningStationSeq && rawStations.length >= 6) {
        let maxDist = 0;
        let maxDistIdx = Math.floor(rawStations.length / 2);
        const startLat = Number(rawStations[0].y || 0);
        const startLng = Number(rawStations[0].x || 0);

        if (startLat && startLng) {
          for (let i = 1; i < rawStations.length; i++) {
            const lat = Number(rawStations[i].y || 0);
            const lng = Number(rawStations[i].x || 0);
            if (lat && lng) {
              const d = calculateHaversineDistanceMeter(startLat, startLng, lat, lng);
              if (d > maxDist) {
                maxDist = d;
                maxDistIdx = i;
              }
            }
          }
        }

        turningStationSeq = maxDistIdx + 1;
        turningStationName = String(rawStations[maxDistIdx].stationName || '').trim();
      }

      const effectiveTurningSeq = turningStationSeq || Math.ceil(rawStations.length / 2);

      // 정류소 목록 생성 및 방향별 독립 인덱싱
      for (let i = 0; i < rawStations.length; i++) {
        const st = rawStations[i];
        const stationId = String(st.stationID || st.stationSeq || i + 1);
        const stationName = String(st.stationName || `정류소 ${i + 1}`).trim();
        const stationSeq = Number(st.stationSeq ?? i + 1);
        const lat = Number(st.y || 0);
        const lng = Number(st.x || 0);
        const arsNo = st.arsID ? String(st.arsID).trim() : undefined;
        const isTurning = stationSeq === effectiveTurningSeq;

        stations.push({
          stationId,
          stationName,
          stationSeq,
          lat,
          lng,
          arsNo,
          isTurningPoint: isTurning,
          edgePoints: null, // 아래 2차 패스에서 33%/66% 보간 계산
        });

        // 1) 전체 통합 맵 및 다중 인덱스 리스트 맵 등록
        stationIndexMap.set(stationId, i);
        stationIndexMap.set(`seq:${stationSeq}`, i);
        stationIndexMap.set(`name:${stationName}`, i);
        addToListMap(stationId, i);
        addToListMap(`seq:${stationSeq}`, i);
        addToListMap(`name:${stationName}`, i);

        if (arsNo) {
          stationIndexMap.set(`ars:${arsNo}`, i);
          addToListMap(`ars:${arsNo}`, i);
        }

        // 2) 방향별 독립 인덱스 맵 분리 (상행: seq <= effectiveTurningSeq, 하행: seq >= effectiveTurningSeq)
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

      // 💡 핵심: 정류소 간 33%(출발), 66%(진입) 앵커 포인트 사전 계산 (Pre-computation)
      for (let i = 0; i < stations.length - 1; i++) {
        const curr = stations[i];
        const next = stations[i + 1];

        if (curr.lat && curr.lng && next.lat && next.lng) {
          const latA = curr.lat;
          const lngA = curr.lng;
          const latB = next.lat;
          const lngB = next.lng;

          const edgePoints: EdgeAnchorPoints = {
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

          curr.edgePoints = edgePoints;
        }
      }

      const routeData: CachedBusRoute = {
        busNo: detailResult.busNo || params.busNo,
        busId: String(busID),
        routeId: detailResult.busLocalBlID ? String(detailResult.busLocalBlID) : undefined,
        busType: detailResult.busType,
        busColor: detailResult.busColor,
        startStationName: stations[0]?.stationName || detailResult.busStartPoint,
        endStationName: stations[stations.length - 1]?.stationName || detailResult.busEndPoint,
        turningStationName: turningStationName || stations[effectiveTurningSeq - 1]?.stationName,
        turningStationSeq: effectiveTurningSeq,
        stations,
        stationIndexMap,
        upStationIndexMap,
        downStationIndexMap,
        stationIndexListMap,
        expiresAt: now + ROUTE_CACHE_TTL_MS,
      };

      BUS_ROUTE_CACHE.set(cacheKey, routeData);
      if (params.busId && cacheKey !== `id:${params.busId}`) {
        BUS_ROUTE_CACHE.set(`id:${params.busId}`, routeData);
      }

      return routeData;
    } catch (err: any) {
      console.error('[BusPositionService] 노선 정류소 조회 실패:', err?.message);
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
    stationIndexListMap?: Map<string, number[]>;
  }): Promise<BusPosition[]> {
    // 💡 [핵심 개선 2: 캐시 키 일원화] 파라미터 조합 차이로 인한 플리커링/상하행 널뛰기 원천 차단
    const cacheKey = `realtime:${params.busNo}:${params.cityCode || '11'}`;
    const now = Date.now();
    const cached = REALTIME_POS_CACHE.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.positions;
    }

    try {
      const cleanRouteId = String(params.routeId || '').trim();
      const turningSeq = params.turningStationSeq || Math.ceil(params.stations.length / 2);
      const totalStations = params.stations.length;

      // ─── 1. 국토교통부(TAGO) 표준 버스 실시간 위치 API (전국 단일 일원화 및 상/하행 Multi-Route 병렬 수집) ───
      let rawPosList: any[] | null = null;
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
            const cleanTargetNm = nodenm ? nodenm.replace(/정류소$|정류장$|역$/, '').trim() : '';

            // 1-1. 정류소명이 일치하는 후보 정류소들 중 버스 GPS와 가장 가까운 정류소 탐색
            if (cleanTargetNm) {
              let minNameDist = Infinity;
              let bestNameIdx = -1;

              for (let i = 0; i < totalStations; i++) {
                const st = params.stations[i];
                const stNm = st.stationName.replace(/정류소$|정류장$|역$/, '').trim();
                if (stNm === cleanTargetNm || stNm.includes(cleanTargetNm) || cleanTargetNm.includes(stNm)) {
                  if (st.lat && st.lng) {
                    const d = calculateHaversineDistanceMeter(gpslati, gpslong, st.lat, st.lng);
                    if (d < minNameDist) {
                      minNameDist = d;
                      bestNameIdx = i;
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
                const st = params.stations[i];
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
          expiresAt: now + REALTIME_CACHE_TTL_MS,
        });

        return positions;
      }

      // ─── 3. 운행 차량 없음 또는 조회 결과 없음 처리 (가짜 순간이동 방지) ───
      return [];
    } catch (err: any) {
      console.warn('[BusPositionService] 실시간 버스 위치 처리 실패:', err?.message);
      return [];
    }
  }
}

