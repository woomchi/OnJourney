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

    // 보완 API(부산/대전/인천/경기도 등)의 노선들을 맵으로 등록
    const supplementMap = new Map<string, ArrivalBusItem[]>();
    for (const item of supplementData.nextArrivals) {
      const cleanName = cleanBusNumber(item.lineName) || item.lineName;
      if (!supplementMap.has(cleanName)) {
        supplementMap.set(cleanName, []);
      }
      supplementMap.get(cleanName)!.push(item);
    }

    const sources = new Set<string>([tagoData.dataSource]);
    sources.add(supplementData.dataSource);

    // 보완 API 데이터를 기본으로 채택하되, 동일 노선에 대해 TAGO의 구체적 메타데이터(행선지, 잔여정류소, 저상 등)를 보강
    const mergedList: ArrivalBusItem[] = supplementData.nextArrivals.map((suppItem) => {
      const cleanName = cleanBusNumber(suppItem.lineName) || suppItem.lineName;
      const tagoMatch = tagoData.nextArrivals.find(
        (tItem) => (cleanBusNumber(tItem.lineName) || tItem.lineName) === cleanName
      );
      if (!tagoMatch) return suppItem;

      const enriched: ArrivalBusItem = { ...suppItem };
      // 목적지가 누락되었거나 '종점 방향'과 같이 모호한 경우 TAGO의 명확한 종점/방면명으로 교정
      if ((!enriched.destination || enriched.destination === '종점 방향') && tagoMatch.destination) {
        enriched.destination = tagoMatch.destination;
      }
      if (enriched.currentStationSequence === undefined && tagoMatch.currentStationSequence !== undefined) {
        enriched.currentStationSequence = tagoMatch.currentStationSequence;
      }
      if (!enriched.vehicleId && tagoMatch.vehicleId) {
        enriched.vehicleId = tagoMatch.vehicleId;
      }
      if (!enriched.crowded && tagoMatch.crowded) {
        enriched.crowded = tagoMatch.crowded;
      }
      if (enriched.remainSeats === undefined && tagoMatch.remainSeats !== undefined) {
        enriched.remainSeats = tagoMatch.remainSeats;
      }
      return enriched;
    });

    // TAGO 데이터 중 보완 API에 없는 노선(일반 시내버스, 급행버스 등) 추가 등록
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
