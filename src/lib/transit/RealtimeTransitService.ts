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

    // 1단계: TAGO 버스 서비스 호출 (전국 주축 Primary API)
    const tagoResult = await TagoBusService.getArrivalInfo({
      cityCode: resolvedCityCode,
      region: normalizedRegion,
      nodeId: stationId,
      stationName,
    });

    // 2단계: 시도별 보완 API 대상 확인 (경기도 / 부산)
    let supplementResult: NormalizedRealtimeData | null = null;
    if (normalizedRegion === 'gyeonggi' || normalizedRegion === '경기') {
      try {
        supplementResult = await GyeonggiBusService.getArrivalInfo(
          stationId,
          stationName
        );
      } catch (err: any) {
        console.warn(
          `[RealtimeTransitService] 경기도 보완 API 호출 실패: ${err?.message}`
        );
      }
    } else if (normalizedRegion === 'busan' || normalizedRegion === '부산') {
      try {
        supplementResult = await BusanBusService.getArrivalInfo(
          stationId,
          stationName
        );
      } catch (err: any) {
        console.warn(
          `[RealtimeTransitService] 부산 보완 API 호출 실패: ${err?.message}`
        );
      }
    }

    // 3단계: 데이터 머지
    if (supplementResult) {
      return MergeService.mergeArrivalData(tagoResult, supplementResult);
    }

    return tagoResult;
  }
}
