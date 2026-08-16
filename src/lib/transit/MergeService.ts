import { ArrivalBusItem, NormalizedRealtimeData } from '@/types/realtimeTransit';

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

    const mergedMap = new Map<string, ArrivalBusItem>();
    const sources = new Set<string>([tagoData.dataSource]);

    const getMergeKey = (item: ArrivalBusItem): string => {
      const cleanName = (item.lineName || '')
        .replace(/^(일반|마을|직행|광역|지선|간선|순환|좌석|급행|시외|공항)/g, '')
        .replace(/버스|번/g, '')
        .replace(/[^0-9a-zA-Z가-힣]/g, '')
        .trim();
      const timeBucket = Math.floor((item.arrivedInSeconds || 0) / 180);
      return `${cleanName || item.lineId || 'bus'}_${timeBucket}`;
    };

    // 1단계: TAGO 기본 노선 적재
    for (const item of tagoData.nextArrivals) {
      mergedMap.set(getMergeKey(item), item);
    }

    // 2단계: 보완 API 노선 추가 및 동일 노선 덮어쓰기
    sources.add(supplementData.dataSource);
    for (const item of supplementData.nextArrivals) {
      mergedMap.set(getMergeKey(item), item);
    }

    const nextArrivals = Array.from(mergedMap.values()).sort(
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
