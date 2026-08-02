import type { DirectionResult, DirectionStep } from '@/types/journey';
import { unstable_cache } from 'next/cache';
import { chunkAsync } from '@/lib/utils/odsayThrottle';
import { WALK_LIMITS } from '@/constants/transit';
import { odsayCircuitBreaker } from '@/lib/infrastructure/circuitBreaker';
import { OdsayAdapter, AppError } from '@/lib/infrastructure/odsayAdapter';
import { haversineDistance } from '../common/distanceUtils';
import { getTimeGroup } from '../common/timeUtils';
import { getSubwayColor, cleanSubwayName, getBusColor } from './transitColorUtils';
import { calculateCarFallback } from '../car/carRouteService';
import { DirectionsQueryType } from '@/lib/validations/directions';

type OdsayApiCacheResult =
  | { ok: true; data: any }
  | { ok: false; error: string; code: string };

// ODsay 대중교통 경로 조회를 위한 top-level 캐시 함수
const getCachedOdsayDirections = unstable_cache(
  async (rsx: string, rsy: string, rex: string, rey: string, apiKey: string, timeSlot: string) => {
    return odsayCircuitBreaker.execute<OdsayApiCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchPublicTransit(rsx, rsy, rex, rey, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
        if (!isRetryable) {
          return { ok: false as const, error: err?.message || 'API Error', code: err?.code || 'API_ERROR' };
        }
        throw err;
      }
    );
  },
  ['odsay-directions-pubtrans'],
  { revalidate: 3600 }
);

// ODsay loadLane 조회를 위한 top-level 캐시 함수
const getCachedOdsayLoadLane = unstable_cache(
  async (mapObjectParam: string, apiKey: string, timeSlot: string) => {
    return odsayCircuitBreaker.execute<OdsayApiCacheResult>(
      async () => {
        const data = await OdsayAdapter.fetchLoadLane(mapObjectParam, apiKey);
        return { ok: true as const, data };
      },
      (err: any) => {
        const isRetryable = err?.isRetryable === true || err?.message?.includes('Circuit breaker is OPEN');
        if (!isRetryable) {
          return { ok: false as const, error: err?.message || 'LoadLane Error', code: err?.code || 'LOADLANE_ERROR' };
        }
        throw err;
      }
    );
  },
  ['odsay-loadlane'],
  { revalidate: 3600 }
);

/**
 * ODsay 대중교통 경로 호출 함수
 */
export async function fetchPublicTransitOptions(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  departureTime?: number
): Promise<DirectionResult[]> {
  const apiKey = process.env.ODSAY_API_KEY;
  if (!apiKey) {
    throw new Error('ODsay API Key가 설정되지 않았습니다.');
  }

  const rsx = sx.toFixed(4);
  const rsy = sy.toFixed(4);
  const rex = ex.toFixed(4);
  const rey = ey.toFixed(4);
  const timeGroup = getTimeGroup(departureTime);

  const res = await getCachedOdsayDirections(rsx, rsy, rex, rey, apiKey, timeGroup);
  if (!res.ok) {
    throw new AppError(`[API 내부 에러] ${res.error}`, res.code, 500, false);
  }
  const data = res.data;

  if (!data.result || !data.result.path || data.result.path.length === 0) {
    const err = new Error('대중교통 경로를 찾을 수 없습니다.');
    err.name = 'NoRouteFound';
    throw err;
  }

  const validPaths = data.result.path.filter((path: any) => {
    let totalWalkTime = 0;
    let firstWalkTime = 0;
    let lastWalkTime = 0;
    let maxTransferWalkTime = 0;

    const hasTransit = path.subPath.some((sp: any) => [1, 2, 4, 5, 6].includes(sp.trafficType));
    if (!hasTransit) return false;

    const isIntercity = path.subPath.some((sp: any) => [4, 5, 6].includes(sp.trafficType));
    const limits = isIntercity ? WALK_LIMITS.INTERCITY : WALK_LIMITS.GENERAL;

    const subPathsList = path.subPath;
    subPathsList.forEach((sp: any, i: number) => {
      if (sp.trafficType === 3) {
        const time = sp.sectionTime || 0;
        totalWalkTime += time;

        if (i === 0) {
          firstWalkTime = time;
        } else if (i === subPathsList.length - 1) {
          lastWalkTime = time;
        } else {
          maxTransferWalkTime = Math.max(maxTransferWalkTime, time);
        }
      }
    });

    if (firstWalkTime > limits.MAX_WALK_TO_FIRST_STATION) return false;
    if (lastWalkTime > limits.MAX_WALK_FROM_LAST_STATION) return false;
    if (maxTransferWalkTime > limits.MAX_TRANSFER_WALK) return false;
    if (totalWalkTime > limits.MAX_TOTAL_WALK) return false;

    return true;
  });

  if (validPaths.length === 0) {
    throw new Error('도보 검색 제한 반경을 초과하여 적절한 대중교통 경로가 없습니다.');
  }

  return chunkAsync(
    validPaths,
    async (path: any, pathIdx: number) => {
      const info = path.info;
      const subPaths = path.subPath;

      let hasDetailedLanes = false;
      let laneList: any[] = [];
      if (info.mapObj) {
        try {
          const mapObjectParam = `0:0@${info.mapObj}`;
          let laneData: any = null;
          const laneRes = await getCachedOdsayLoadLane(mapObjectParam, apiKey, timeGroup);
          if (laneRes.ok) {
            laneData = laneRes.data;
          }

          if (laneData && laneData.result && laneData.result.lane) {
            laneList = laneData.result.lane;
            const transitCount = subPaths.filter((sp: any) => [1, 2, 4, 5, 6].includes(sp.trafficType)).length;
            if (laneList.length === transitCount) {
              hasDetailedLanes = true;
            } else {
              console.warn(
                `[directions] path ${pathIdx} loadLane length mismatch (${laneList.length} vs ${transitCount}), ignoring detailed lanes`
              );
            }
          }
        } catch (e) {
          console.warn(
            `[directions] path ${pathIdx} loadLane detailed coordinates fetch failed, fallback to station points:`,
            e
          );
        }
      }

      let transitIndex = 0;
      const steps: DirectionStep[] = subPaths
        .map((sp: any, idx: number) => {
          let type: DirectionStep['type'] = 'walk';
          let name = '도보';
          let color = '#E4E4E7';
          const stepPathPoints: { lat: number; lng: number }[] = [];

          let startLat = parseFloat(sp.startY || sp.y1);
          let startLng = parseFloat(sp.startX || sp.x1);
          if (isNaN(startLat) || isNaN(startLng)) {
            if (idx === 0) {
              startLat = sy;
              startLng = sx;
            } else {
              const prevSp = subPaths[idx - 1];
              if (prevSp.passStopList?.stations?.length > 0) {
                const lastStation = prevSp.passStopList.stations[prevSp.passStopList.stations.length - 1];
                startLat = parseFloat(lastStation.y);
                startLng = parseFloat(lastStation.x);
              } else {
                startLat = parseFloat(prevSp.endY || prevSp.y2 || sy);
                startLng = parseFloat(prevSp.endX || prevSp.x2 || sx);
              }
            }
          }

          let endLat = parseFloat(sp.endY || sp.y2);
          let endLng = parseFloat(sp.endX || sp.x2);
          if (isNaN(endLat) || isNaN(endLng)) {
            if (idx === subPaths.length - 1) {
              endLat = ey;
              endLng = ex;
            } else {
              const nextSp = subPaths[idx + 1];
              if (nextSp.passStopList?.stations?.length > 0) {
                const firstStation = nextSp.passStopList.stations[0];
                endLat = parseFloat(firstStation.y);
                endLng = parseFloat(firstStation.x);
              } else {
                endLat = parseFloat(nextSp.startY || nextSp.y1 || ey);
                endLng = parseFloat(nextSp.startX || nextSp.x1 || ex);
              }
            }
          }

          if (sp.trafficType === 1) {
            type = 'subway';
            const laneName = sp.lane?.[0]?.name || '지하철';
            name = cleanSubwayName(laneName);
            color = getSubwayColor(laneName);

            if (hasDetailedLanes && laneList[transitIndex]) {
              const lane = laneList[transitIndex];
              lane.section.forEach((section: any) => {
                section.graphPos.forEach((pos: any) => {
                  stepPathPoints.push({ lat: pos.y, lng: pos.x });
                });
              });
            } else if (sp.passStopList && sp.passStopList.stations) {
              sp.passStopList.stations.forEach((station: any) => {
                const lat = parseFloat(station.y);
                const lng = parseFloat(station.x);
                if (!isNaN(lat) && !isNaN(lng)) {
                  stepPathPoints.push({ lat, lng });
                }
              });
            }
            transitIndex++;
          } else if (sp.trafficType === 2) {
            type = 'bus';
            const busNo = sp.lane?.[0]?.busNo || '버스';
            const busType = sp.lane?.[0]?.type || 1;
            name = `${busNo}번 버스`;
            color = getBusColor(busType, busNo);

            if (hasDetailedLanes && laneList[transitIndex]) {
              const lane = laneList[transitIndex];
              lane.section.forEach((section: any) => {
                section.graphPos.forEach((pos: any) => {
                  stepPathPoints.push({ lat: pos.y, lng: pos.x });
                });
              });
            } else if (sp.passStopList && sp.passStopList.stations) {
              sp.passStopList.stations.forEach((station: any) => {
                const lat = parseFloat(station.y);
                const lng = parseFloat(station.x);
                if (!isNaN(lat) && !isNaN(lng)) {
                  stepPathPoints.push({ lat, lng });
                }
              });
            }
            transitIndex++;
          } else if (sp.trafficType === 4 || sp.trafficType === 5 || sp.trafficType === 6) {
            type = sp.trafficType === 4 ? 'train' : 'expressbus';
            if (sp.trafficType === 4) {
              const trainTypes: Record<number, string> = {
                1: 'KTX', 2: '새마을호', 3: '무궁화호', 4: '누리로',
                6: 'ITX-새마을', 7: 'SRT', 8: 'ITX-청춘', 9: 'ITX-마음',
              };
              name = trainTypes[sp.trainType] || '기차';
            } else {
              name = sp.trafficType === 5 ? '고속버스' : '시외버스';
            }

            if (type === 'train') {
              color = name.includes('SRT') ? '#582E55' : name.includes('KTX') ? '#003366' : '#2C3E50';
            } else {
              color = '#e60012';
            }

            if (sp.passStopList && sp.passStopList.stations) {
              sp.passStopList.stations.forEach((station: any) => {
                const lat = parseFloat(station.y);
                const lng = parseFloat(station.x);
                if (!isNaN(lat) && !isNaN(lng)) {
                  stepPathPoints.push({ lat, lng });
                }
              });
            }
            transitIndex++;
          } else {
            type = 'walk';
            name = '도보';
            color = '#E4E4E7';

            if (!isNaN(startLat) && !isNaN(startLng)) {
              stepPathPoints.push({ lat: startLat, lng: startLng });
            }
            if (!isNaN(endLat) && !isNaN(endLng)) {
              stepPathPoints.push({ lat: endLat, lng: endLng });
            }
          }

          if (stepPathPoints.length === 0) {
            if (!isNaN(startLat) && !isNaN(startLng)) {
              stepPathPoints.push({ lat: startLat, lng: startLng });
            }
            if (!isNaN(endLat) && !isNaN(endLng)) {
              stepPathPoints.push({ lat: endLat, lng: endLng });
            }
          }

          if (stepPathPoints.length >= 2 && !isNaN(startLat) && !isNaN(startLng) && !isNaN(endLat) && !isNaN(endLng)) {
            const firstPoint = stepPathPoints[0];
            const lastPoint = stepPathPoints[stepPathPoints.length - 1];

            const distNormal =
              haversineDistance(startLat, startLng, firstPoint.lat, firstPoint.lng) +
              haversineDistance(endLat, endLng, lastPoint.lat, lastPoint.lng);

            const distReversed =
              haversineDistance(startLat, startLng, lastPoint.lat, lastPoint.lng) +
              haversineDistance(endLat, endLng, firstPoint.lat, firstPoint.lng);

            if (distReversed < distNormal) {
              stepPathPoints.reverse();
            }
          }

          let startName = sp.startName || '';
          let endName = sp.endName || '';
          if (!startName && sp.passStopList?.stations?.length > 0) {
            startName = sp.passStopList.stations[0].stationName || '';
          }
          if (!endName && sp.passStopList?.stations?.length > 0) {
            endName = sp.passStopList.stations[sp.passStopList.stations.length - 1].stationName || '';
          }

          if (type === 'subway' || type === 'train') {
            if (startName && !startName.endsWith('역')) {
              startName = `${startName}역`;
            }
            if (endName && !endName.endsWith('역')) {
              endName = `${endName}역`;
            }
          }

          let passStopList = undefined;
          if (sp.passStopList && sp.passStopList.stations) {
            passStopList = {
              stationList: sp.passStopList.stations.map((station: any) => ({
                stationName: station.stationName,
                lat: parseFloat(station.y) || undefined,
                lng: parseFloat(station.x) || undefined,
              })),
            };
          }

          return {
            type,
            name,
            duration: sp.sectionTime,
            color,
            pathPoints: stepPathPoints,
            startName: startName || undefined,
            endName: endName || undefined,
            headsign: sp.way || undefined,
            wayCode: sp.wayCode || undefined,
            startLat: !isNaN(startLat) ? startLat : undefined,
            startLng: !isNaN(startLng) ? startLng : undefined,
            endLat: !isNaN(endLat) ? endLat : undefined,
            endLng: !isNaN(endLng) ? endLng : undefined,
            passStopList,
          };
        })
        .filter((step: DirectionStep) => step.duration > 0);

      const pathPoints: { lat: number; lng: number }[] = [];
      pathPoints.push({ lat: sy, lng: sx });
      steps.forEach((step) => {
        if (step.pathPoints) {
          pathPoints.push(...step.pathPoints);
        }
      });
      pathPoints.push({ lat: ey, lng: ex });

      const transitNames = steps
        .filter((s) => s.type !== 'walk')
        .map((s) => s.name.replace(' 버스', ''));
      const displayTitle = transitNames.length > 0 ? transitNames.join(' → ') : '도보 이동';

      const isIntercity = steps.some((s) => s.type === 'train' || s.type === 'expressbus');
      let fare = info.payment && info.payment > 0 ? info.payment : 0;
      let isFareEstimated = false;

      if (fare === 0) {
        const subPathsPayment = subPaths.reduce((sum: number, sp: any) => sum + (sp.payment || 0), 0);
        if (subPathsPayment > 0) {
          fare = subPathsPayment;
        } else if (!isIntercity) {
          const hasWideAreaBus = steps.some((s) => s.type === 'bus' && s.color === '#e60012');
          fare = hasWideAreaBus ? 3000 : 1400;
          isFareEstimated = true;
        }
      }

      return {
        id: `public-${pathIdx}`,
        type: 'public' as const,
        name: displayTitle,
        duration: info.totalTime,
        fare,
        isFareEstimated: isFareEstimated ? true : undefined,
        isIntercity: isIntercity ? true : undefined,
        steps,
        pathPoints,
      };
    },
    2,
    150
  );
}

/**
 * 대중교통 경로 조회 API 핸들러용 래퍼 함수
 */
export async function fetchPublicDirections(params: DirectionsQueryType): Promise<{ public: DirectionResult[] }> {
  const { sx, sy, ex, ey, departureTime } = params;

  try {
    const publicResults = await fetchPublicTransitOptions(sx, sy, ex, ey, departureTime);
    return { public: publicResults };
  } catch (error: any) {
    console.warn('[fetchPublicDirections] Public transit API fetch failed:', error);
    return { public: [] };
  }
}
