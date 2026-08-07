import type { DirectionResult, CarWalkDirectionsResult, SnapMeta, SnapType } from '@/types/journey';
import { DirectionsQueryType } from '@/lib/validations/directions';
import { isNonWalkableArea } from '@/lib/utils/walkabilityCheck';
import { getNearestRoadCoords } from '@/lib/utils/snapToRoad';
import { getHikingTrailPolyline } from '@/utils/hikingTrailService';
import { haversineDistance, roundCoord } from './common/distanceUtils';
import { fetchCarRoute, calculateCarFallback } from './car/carRouteService';
import { buildWalkFallbackResults } from './walk/walkFallbackService';
import { getCachedTMapWalkingRoute, parseTMapResponse } from './walk/tmapWalkingService';

/**
 * 차량 + 도보 + 등산/지형 Snap 통합 오케스트레이션 함수
 */
export async function fetchCarWalkDirections(params: DirectionsQueryType): Promise<CarWalkDirectionsResult> {
  const { sx, sy, ex, ey } = params;

  // 1. 거리 제한 계산 (도보 탐색은 10km 미만만 지원)
  const straightDistKm = haversineDistance(sy, sx, ey, ex);
  const isWalkExceedLimit = straightDistKm >= 10.0;

  // 2. 지형 기반 좌표 보정 및 TMAP API 지연 호출 (On-Demand) 결정
  const isStartNonWalkable = !isWalkExceedLimit && isNonWalkableArea(sx, sy);
  const isEndNonWalkable = !isWalkExceedLimit && isNonWalkableArea(ex, ey);

  let snappedStartCoords: { lng: number; lat: number } | undefined;
  let snappedEndCoords: { lng: number; lat: number } | undefined;

  let walkResults: DirectionResult[] = [];

  const roundCoordWalk = (val: number) => roundCoord(val, 4);
  const roundCoordCar = (val: number) => roundCoord(val, 6);

  // 차량용 Snap 좌표 (기존 도로 좌표 스냅)
  let effectiveSx = sx;
  let effectiveSy = sy;
  let effectiveEx = ex;
  let effectiveEy = ey;

  if (isStartNonWalkable) {
    const startOptions = getHikingTrailPolyline({ lng: sx, lat: sy }, { lng: ex, lat: ey });
    if (startOptions.length > 0) {
      effectiveSx = startOptions[0].snappedStart.lng;
      effectiveSy = startOptions[0].snappedStart.lat;
    } else {
      const snapped = await getNearestRoadCoords(sx, sy, ex, ey);
      effectiveSx = snapped.lng;
      effectiveSy = snapped.lat;
    }
  }
  if (isEndNonWalkable) {
    const endOptions = getHikingTrailPolyline({ lng: ex, lat: ey }, { lng: sx, lat: sy });
    if (endOptions.length > 0) {
      effectiveEx = endOptions[0].snappedStart.lng;
      effectiveEy = endOptions[0].snappedStart.lat;
    } else {
      const snapped = await getNearestRoadCoords(ex, ey, sx, sy);
      effectiveEx = snapped.lng;
      effectiveEy = snapped.lat;
    }
  }

  const csx = roundCoordCar(effectiveSx);
  const csy = roundCoordCar(effectiveSy);
  const cex = roundCoordCar(effectiveEx);
  const cey = roundCoordCar(effectiveEy);

  // 3. 상황별 snapType 판정
  let snapType: SnapType = 'NONE';
  let message = '';

  if (isStartNonWalkable && isEndNonWalkable) {
    snapType = 'BOTH';
    message = '출발지와 도착지 모두 가장 가까운 도로/등산로를 기준으로 경로를 탐색했습니다.';
  } else if (isStartNonWalkable) {
    snapType = 'START';
    message = '출발지 근처 산림청 등산로 및 도로를 기준으로 경로를 탐색했습니다.';
  } else if (isEndNonWalkable) {
    snapType = 'END';
    message = '도착지 근처 산림청 등산로 및 도로를 기준으로 경로를 탐색했습니다.';
  }

  // 4. 도보 탐색 (10km 미만인 경우만 수행)
  if (isWalkExceedLimit) {
    walkResults = [];
  } else if (isStartNonWalkable || isEndNonWalkable) {
    const startOptions = isStartNonWalkable
      ? getHikingTrailPolyline({ lng: sx, lat: sy }, { lng: ex, lat: ey })
      : [];
    const endOptions = isEndNonWalkable
      ? getHikingTrailPolyline({ lng: ex, lat: ey }, { lng: sx, lat: sy })
      : [];

    const hasStartTrails = isStartNonWalkable && startOptions.length > 0;
    const hasEndTrails = isEndNonWalkable && endOptions.length > 0;

    if (hasStartTrails || hasEndTrails) {
      const numOptions = Math.max(startOptions.length, endOptions.length);
      const optionsData = [];

      for (let i = 0; i < numOptions; i++) {
        const startOpt = startOptions[i] || startOptions[0];
        const endOpt = endOptions[i] || endOptions[0];

        let pathPoints: { lat: number; lng: number }[] = [];
        let d_mountain = 0;
        let snappedStart: { lng: number; lat: number } | undefined;
        let snappedEnd: { lng: number; lat: number } | undefined;

        if (isStartNonWalkable && startOpt) {
          snappedStart = startOpt.snappedStart;
          for (let j = 0; j < startOpt.polyline.length - 1; j++) {
            d_mountain += haversineDistance(
              startOpt.polyline[j].lat, startOpt.polyline[j].lng,
              startOpt.polyline[j + 1].lat, startOpt.polyline[j + 1].lng
            );
          }
          pathPoints.push(...startOpt.polyline);
        }

        if (isEndNonWalkable && endOpt) {
          snappedEnd = endOpt.snappedStart;
          const revPolyline = [...endOpt.polyline].reverse();
          for (let j = 0; j < revPolyline.length - 1; j++) {
            d_mountain += haversineDistance(
              revPolyline[j].lat, revPolyline[j].lng,
              revPolyline[j + 1].lat, revPolyline[j + 1].lng
            );
          }

          if (pathPoints.length > 0) {
            const lastStart = pathPoints[pathPoints.length - 1];
            const firstEnd = revPolyline[0];
            if (Math.abs(lastStart.lat - firstEnd.lat) > 1e-6 || Math.abs(lastStart.lng - firstEnd.lng) > 1e-6) {
              pathPoints.push(...revPolyline);
            } else {
              pathPoints.push(...revPolyline.slice(1));
            }
          } else {
            pathPoints.push(...revPolyline);
          }
        }

        const flatStartLat = snappedStart ? snappedStart.lat : sy;
        const flatStartLng = snappedStart ? snappedStart.lng : sx;
        const flatEndLat = snappedEnd ? snappedEnd.lat : ey;
        const flatEndLng = snappedEnd ? snappedEnd.lng : ex;

        const d_flat = haversineDistance(flatStartLat, flatStartLng, flatEndLat, flatEndLng);

        if (!isStartNonWalkable) {
          pathPoints.unshift({ lat: sy, lng: sx });
        } else if (!isEndNonWalkable) {
          pathPoints.push({ lat: ey, lng: ex });
        }

        const totalDistance = d_mountain + d_flat;
        const mountainTime = (d_mountain / 2.5) * 60;
        const flatTime = (d_flat / 4.5) * 60;
        const totalDuration = Math.max(1, Math.round(mountainTime + flatTime));

        optionsData.push({
          index: i,
          totalDuration,
          totalDistance,
          mountainDistance: (startOpt?.mountainDistance || 0) + (endOpt?.mountainDistance || 0),
          difficulty: startOpt?.difficulty || endOpt?.difficulty || '쉬움',
          pathPoints,
          snappedStart,
          snappedEnd,
          flatStartLat,
          flatStartLng,
          flatEndLat,
          flatEndLng,
        });
      }

      let minMountainDist = Infinity;
      let minMountainIdx = -1;
      optionsData.forEach((opt, idx) => {
        if (opt.mountainDistance < minMountainDist) {
          minMountainDist = opt.mountainDistance;
          minMountainIdx = idx;
        }
      });

      optionsData.forEach((opt, idx) => {
        const tags: string[] = [];

        if (idx === 0) {
          tags.push('최단시간');
        }
        if (idx === minMountainIdx) {
          tags.push('최단 산길');
        }
        if (opt.difficulty === '쉬움') {
          tags.push('완만한 코스');
        }

        const uniqueTags = Array.from(new Set(tags));

        if (idx === 0) {
          if (opt.snappedStart) snappedStartCoords = opt.snappedStart;
          if (opt.snappedEnd) snappedEndCoords = opt.snappedEnd;
        }

        walkResults.push({
          id: `walk-${idx}`,
          type: 'walk',
          name: `도보 (등산로 경로 ${idx + 1})`,
          duration: opt.totalDuration,
          fare: 0,
          distance: opt.totalDistance,
          isEstimated: true,
          steps: [
            {
              type: 'walk',
              name: `도보 (등산로 경로 ${idx + 1})`,
              duration: opt.totalDuration,
              color: '#E4E4E7',
              pathPoints: opt.pathPoints,
              startLat: sy,
              startLng: sx,
              endLat: ey,
              endLng: ex,
            },
          ],
          pathPoints: opt.pathPoints,
          straightSection: (opt.snappedStart || opt.snappedEnd)
            ? [
                { lat: opt.flatStartLat, lng: opt.flatStartLng },
                { lat: opt.flatEndLat, lng: opt.flatEndLng },
              ]
            : undefined,
          isStraightSectionAtEnd: !!(opt.snappedEnd && !opt.snappedStart),
          snappedStart: opt.snappedStart,
          snappedEnd: opt.snappedEnd,
          tags: uniqueTags,
        });
      });
    } else {
      let pathPoints: { lat: number; lng: number }[] = [];
      let d_mountain = 0;
      let snappedStart: { lng: number; lat: number } | undefined;
      let snappedEnd: { lng: number; lat: number } | undefined;

      if (isStartNonWalkable) {
        snappedStart = await getNearestRoadCoords(sx, sy, ex, ey);
        snappedStartCoords = snappedStart;
        d_mountain = haversineDistance(sy, sx, snappedStart.lat, snappedStart.lng);
        pathPoints.push({ lat: sy, lng: sx }, { lat: snappedStart.lat, lng: snappedStart.lng });
      }

      if (isEndNonWalkable) {
        snappedEnd = await getNearestRoadCoords(ex, ey, sx, sy);
        snappedEndCoords = snappedEnd;
        d_mountain += haversineDistance(ey, ex, snappedEnd.lat, snappedEnd.lng);
        pathPoints.push({ lat: snappedEnd.lat, lng: snappedEnd.lng }, { lat: ey, lng: ex });
      }

      const flatStartLat = snappedStart ? snappedStart.lat : sy;
      const flatStartLng = snappedStart ? snappedStart.lng : sx;
      const flatEndLat = snappedEnd ? snappedEnd.lat : ey;
      const flatEndLng = snappedEnd ? snappedEnd.lng : ex;

      const d_flat = haversineDistance(flatStartLat, flatStartLng, flatEndLat, flatEndLng);

      if (!isStartNonWalkable) {
        pathPoints.unshift({ lat: sy, lng: sx });
      }
      if (!isEndNonWalkable) {
        pathPoints.push({ lat: ey, lng: ex });
      }

      const totalDistance = d_mountain + d_flat;
      const totalDuration = Math.max(1, Math.round((d_mountain / 2.5) * 60 + (d_flat / 4.5) * 60));

      walkResults.push({
        id: 'walk',
        type: 'walk',
        name: '도보 (경로 예상)',
        duration: totalDuration,
        fare: 0,
        distance: totalDistance,
        isEstimated: true,
        steps: [
          {
            type: 'walk',
            name: '도보 (경로 예상)',
            duration: totalDuration,
            color: '#E4E4E7',
            pathPoints,
            startLat: sy,
            startLng: sx,
            endLat: ey,
            endLng: ex,
          },
        ],
        pathPoints,
        straightSection: [
          { lat: flatStartLat, lng: flatStartLng },
          { lat: flatEndLat, lng: flatEndLng },
        ],
        isStraightSectionAtEnd: !!(snappedEnd && !snappedStart),
        snappedStart,
        snappedEnd,
      });
    }
  } else {
    const apiKey = process.env.TMAP_API_KEY;
    if (!apiKey) {
      console.warn('[serverDirectionsService] TMAP_API_KEY is not defined. Using fallback straight line calculations.');
      walkResults = buildWalkFallbackResults(sx, sy, ex, ey);
    } else {
      try {
        const wsx = roundCoordWalk(sx);
        const wsy = roundCoordWalk(sy);
        const wex = roundCoordWalk(ex);
        const wey = roundCoordWalk(ey);

        const tmapData = await getCachedTMapWalkingRoute(wsx, wsy, wex, wey, apiKey);
        walkResults = parseTMapResponse(tmapData, wsx, wsy, wex, wey);
      } catch (error) {
        console.warn('[serverDirectionsService] TMap Walking API failed, using fallback.', error);
        walkResults = buildWalkFallbackResults(sx, sy, ex, ey);
      }
    }
  }

  const snapMeta: SnapMeta = {
    snapType,
    ...(snapType !== 'NONE' ? { message } : {}),
    ...(snappedStartCoords ? { snappedStartCoords } : {}),
    ...(snappedEndCoords ? { snappedEndCoords } : {}),
  };

  let carResults: DirectionResult[];
  try {
    carResults = await fetchCarRoute(csx, csy, cex, cey);
  } catch (error: any) {
    console.error('[directionsOrchestrator] 차량 경로 API 실패, Fallback 적용:', error?.message || error);
    carResults = [calculateCarFallback(sx, sy, ex, ey)];
  }

  return {
    car: carResults,
    walk: walkResults,
    snapMeta,
  };
}
