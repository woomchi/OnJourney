import { BusanBusService } from './BusanBusService';
import { GyeonggiBusService } from './GyeonggiBusService';
import { MergeService } from './MergeService';
import { TagoBusService } from './TagoBusService';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';
import { resolveBusRegion, resolveTagoCode } from '@/lib/utils/busRegionUtils';

export interface GetBusArrivalsParams {
  region: string;
  stationId: string;
  stationName?: string;
  cityCode?: string;
  lat?: number;
  lng?: number;
}

export class RealtimeTransitService {
  /**
   * 실시간 버스 도착 정보 조회 (TAGO 주축 -> 시도별 보완 순차 호출 및 머지)
   */
  public static async getBusArrivals({
    region,
    stationId,
    stationName = '정류소',
    cityCode,
    lat,
    lng,
  }: GetBusArrivalsParams): Promise<NormalizedRealtimeData> {
    let normalizedRegion = region ? region.toLowerCase() : 'seoul';
    let resolvedCityCode = cityCode;

    // 0단계: ODsay CID 및 cityCode 매핑을 통한 region 및 TAGO cityCode 자동 교정
    if (cityCode) {
      resolvedCityCode = resolveTagoCode(cityCode);
      const mappedRegion = resolveBusRegion(cityCode);
      if (mappedRegion && mappedRegion !== 'seoul') {
        normalizedRegion = mappedRegion;
      }
    }

    // 0-1단계: stationId 패턴 기반 보조 판별 (경기도 9자리 2xxxxxxxxx ID 또는 GGB/BSB 접두사)
    const pureId = stationId.replace(/[^0-9]/g, '');
    if (normalizedRegion === 'tago' || normalizedRegion === 'seoul' || !region) {
      if (
        stationId.toUpperCase().startsWith('GGB') ||
        (pureId.length === 9 &&
          (pureId.startsWith('20') ||
            pureId.startsWith('21') ||
            pureId.startsWith('22') ||
            pureId.startsWith('23') ||
            pureId.startsWith('24')))
      ) {
        normalizedRegion = 'gyeonggi';
        if (!resolvedCityCode || resolvedCityCode === '11') {
          resolvedCityCode = '31';
        }
      } else if (stationId.toUpperCase().startsWith('BSB') || resolvedCityCode === '21') {
        normalizedRegion = 'busan';
      }
    }

    // 1단계: TAGO 스마트 노드 변화 감지 트래픽 최적화 버스 서비스 Promise 생성
    const tagoPromise = TagoBusService.getArrivalInfoSmartNodeTrigger({
      cityCode: resolvedCityCode,
      region: normalizedRegion,
      nodeId: stationId,
      stationName,
      lat,
      lng,
    });

    // 2단계: 시도별 보완 API Promise 생성 (경기도 / 부산)
    let supplementPromise: Promise<NormalizedRealtimeData | null> = Promise.resolve(null);
    if (normalizedRegion === 'gyeonggi' || normalizedRegion === '경기') {
      supplementPromise = GyeonggiBusService.getArrivalInfo(stationId, stationName).catch((err) => {
        console.warn(`[RealtimeTransitService] 경기도 보완 API 호출 실패: ${err?.message}`);
        return null;
      });
    } else if (normalizedRegion === 'busan' || normalizedRegion === '부산') {
      supplementPromise = BusanBusService.getArrivalInfo(stationId, stationName).catch((err) => {
        console.warn(`[RealtimeTransitService] 부산 보완 API 호출 실패: ${err?.message}`);
        return null;
      });
    }

    // 3단계: 두 API를 병렬로 동시 대기 후 머지
    const [tagoSettled, supplementSettled] = await Promise.allSettled([
      tagoPromise,
      supplementPromise,
    ]);

    const tagoResult: NormalizedRealtimeData =
      tagoSettled.status === 'fulfilled'
        ? tagoSettled.value
        : {
            stationId,
            stationName,
            nextArrivals: [],
            dataSource: 'tago',
            lastUpdated: Date.now(),
            reliability: 0.0,
          };

    const supplementResult: NormalizedRealtimeData | null =
      supplementSettled.status === 'fulfilled' ? supplementSettled.value : null;

    if (supplementResult) {
      return MergeService.mergeArrivalData(tagoResult, supplementResult);
    }

    return tagoResult;
  }
}
