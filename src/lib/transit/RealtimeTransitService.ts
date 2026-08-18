import { BusanBusService } from './BusanBusService';
import { GyeonggiBusService } from './GyeonggiBusService';
import { IncheonBusService } from './IncheonBusService';
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

    // 0-1단계: stationId 패턴 기반 보조 판별 (경기도 9자리 2xxxxxxxxx ID 또는 GGB/BSB/ICB 접두사)
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
      } else if (
        stationId.toUpperCase().startsWith('ICB') ||
        stationId.toUpperCase().startsWith('INB') ||
        resolvedCityCode === '23'
      ) {
        normalizedRegion = 'incheon';
      }
    }

    // 1단계: 경기도 전용 권역 (Primary: 경기도 버스도착정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'gyeonggi' || normalizedRegion === '경기') {
      try {
        const ggResult = await GyeonggiBusService.getArrivalInfo(stationId, stationName);
        if (ggResult && ggResult.nextArrivals.length > 0) {
          return ggResult; // 경기도 1순위 데이터 즉시 반환
        }
      } catch (err: any) {
        console.warn(`[RealtimeTransitService] 경기도 1순위 API 호출 실패, TAGO 폴백 진행: ${err?.message}`);
      }

      // 경기도 API 결과 0건 또는 실패 시 TAGO로 폴백
      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode,
        region: normalizedRegion,
        nodeId: stationId,
        stationName,
        lat,
        lng,
      });
    }

    // 2단계: 부산 권역 (Primary: 부산 버스정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'busan' || normalizedRegion === '부산') {
      try {
        const busanResult = await BusanBusService.getArrivalInfo(stationId, stationName);
        if (busanResult && busanResult.nextArrivals.length > 0) {
          return busanResult; // 부산 1순위 데이터 즉시 반환
        }
      } catch (err: any) {
        console.warn(`[RealtimeTransitService] 부산 1순위 API 호출 실패, TAGO 폴백 진행: ${err?.message}`);
      }

      // 부산 API 결과 0건 또는 실패 시 TAGO로 폴백
      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode,
        region: normalizedRegion,
        nodeId: stationId,
        stationName,
        lat,
        lng,
      });
    }

    // 3단계: 인천 권역 (Primary: 인천 버스도착정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'incheon' || normalizedRegion === '인천') {
      try {
        const incheonResult = await IncheonBusService.getArrivalInfo(stationId, stationName);
        if (incheonResult && incheonResult.nextArrivals.length > 0) {
          return incheonResult; // 인천 1순위 데이터 즉시 반환
        }
      } catch (err: any) {
        console.warn(`[RealtimeTransitService] 인천 1순위 API 호출 실패, TAGO 폴백 진행: ${err?.message}`);
      }

      // 인천 API 결과 0건 또는 실패 시 TAGO로 폴백
      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode || '23',
        region: normalizedRegion,
        nodeId: stationId,
        stationName,
        lat,
        lng,
      });
    }

    // 4단계: 서울 및 수도권 복합 권역 (GBIS 경기도 광역버스 + TAGO 서울/전국 버스 병렬 호출 및 머지)
    if (normalizedRegion === 'seoul' || normalizedRegion === '서울' || !region) {
      try {
        const [ggbSettled, tagoSettled] = await Promise.allSettled([
          GyeonggiBusService.getArrivalInfo(stationId, stationName),
          TagoBusService.getArrivalInfoSmartNodeTrigger({
            cityCode: resolvedCityCode || '11',
            region: normalizedRegion,
            nodeId: stationId,
            stationName,
            lat,
            lng,
          }),
        ]);

        const ggbResult = ggbSettled.status === 'fulfilled' ? ggbSettled.value : null;
        const tagoResult = tagoSettled.status === 'fulfilled' ? tagoSettled.value : null;

        const hasGgbArrivals = Boolean(ggbResult && ggbResult.nextArrivals.length > 0);
        const hasTagoArrivals = Boolean(tagoResult && tagoResult.nextArrivals.length > 0);

        if (hasGgbArrivals && hasTagoArrivals && tagoResult && ggbResult) {
          // 둘 다 도착 정보가 존재하면 지능형 병합 (TAGO 베이스 + GBIS 광역버스 우선 머지)
          return MergeService.mergeArrivalData(tagoResult, ggbResult);
        } else if (hasGgbArrivals && ggbResult) {
          // GBIS에만 광역버스 데이터가 있으면 GBIS 결과 반환
          return ggbResult;
        } else if (hasTagoArrivals && tagoResult) {
          // TAGO에만 데이터가 있으면 TAGO 결과 반환
          return tagoResult;
        } else if (ggbResult && (!tagoResult || ggbResult.reliability >= tagoResult.reliability)) {
          return ggbResult;
        } else if (tagoResult) {
          return tagoResult;
        }
      } catch (err: any) {
        console.warn(`[RealtimeTransitService] 서울/수도권 복합 병렬 호출 에러: ${err?.message}`);
      }
    }

    // 5단계: 전국 및 기타 권역 (Primary: TAGO 스마트 노드 버스 서비스)
    return TagoBusService.getArrivalInfoSmartNodeTrigger({
      cityCode: resolvedCityCode,
      region: normalizedRegion,
      nodeId: stationId,
      stationName,
      lat,
      lng,
    });
  }
}
