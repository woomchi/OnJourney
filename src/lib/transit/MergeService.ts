import { ArrivalBusItem, NormalizedRealtimeData } from '@/types/realtimeTransit';
import { cleanBusNumber } from '@/lib/utils/busRegionUtils';

export class MergeService {
  /**
   * TAGO(전국 주축) 데이터와 시도별 보완 API 데이터를 지능적으로 병합
   * 동일 버스 노선번호(lineName)가 존재할 경우 보완 API 데이터(신뢰도 0.85)로 덮어씁니다.
   */
  public static mergeArrivalData(
    tagoData: NormalizedRealtimeData,
    supplementData?: NormalizedRealtimeData | null
  ): NormalizedRealtimeData {
    if (!supplementData || supplementData.nextArrivals.length === 0) {
      return tagoData;
    }

    // 보완 API(대전/인천/경기도 등)는 정밀 실시간 정보를 제공하므로 보완 API 데이터를 최우선으로 등록
    const supplementMap = new Map<string, ArrivalBusItem[]>();
    for (const item of supplementData.nextArrivals) {
      const cleanName = cleanBusNumber(item.lineName) || item.lineName;
      if (!supplementMap.has(cleanName)) {
        supplementMap.set(cleanName, []);
      }
      supplementMap.get(cleanName)!.push(item);
    }

    const sources = new Set<string>([tagoData.dataSource]);
    const mergedList: ArrivalBusItem[] = [...supplementData.nextArrivals];
    sources.add(supplementData.dataSource);

    // TAGO 데이터 중 보완 API에 없는 노선만 추가 등록
    for (const item of tagoData.nextArrivals) {
      const cleanName = cleanBusNumber(item.lineName) || item.lineName;
      if (!supplementMap.has(cleanName)) {
        mergedList.push(item);
      }
    }

    const nextArrivals = mergedList.sort(
      (a, b) => a.arrivedInSeconds - b.arrivedInSeconds
    );

    // 머지 후 신뢰도는 높은 쪽 스코어 적용
    const highestReliability = Math.max(
      tagoData.reliability,
      supplementData.reliability
    );

    return {
      stationId: tagoData.stationId,
      stationName: tagoData.stationName || supplementData.stationName,
      nextArrivals,
      dataSource: tagoData.dataSource,
      mergedSources: Array.from(sources),
      lastUpdated: Date.now(),
      reliability: highestReliability,
    };
  }
}
