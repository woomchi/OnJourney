import { BusanBusService } from './BusanBusService';
import { DaejeonBusService } from './DaejeonBusService';
import { DaeguBusService } from './DaeguBusService';
import { GyeonggiBusService } from './GyeonggiBusService';
import { IncheonBusService } from './IncheonBusService';
import { MergeService } from './MergeService';
import { TagoBusService } from './TagoBusService';
import { NormalizedRealtimeData } from '@/types/realtimeTransit';
import { resolveBusRegion, resolveTagoCode } from '@/lib/utils/busRegionUtils';
import { GYEONGGI_STATION_ID_PREFIXES } from '@/constants/transit';
import { inferRegionFromPlace } from '@/lib/utils/journeyUtils';
import { getTransitApiKey } from './transitUtils';

export interface GetBusArrivalsParams {
  region: string;
  stationId: string;
  stationName?: string;
  cityCode?: string;
  lat?: number;
  lng?: number;
  destination?: string;
  headsign?: string;
}

// 지역명 입력값(한글/영문/별칭)을 단일 표준 영문 키로 정규화하는 매핑 맵
const REGION_NORMALIZE_MAP: Record<string, string> = {
  '경기': 'gyeonggi',
  '경기도': 'gyeonggi',
  'gyeonggi': 'gyeonggi',
  '서울': 'seoul',
  '서울특별시': 'seoul',
  'seoul': 'seoul',
  '부산': 'busan',
  '부산광역시': 'busan',
  'busan': 'busan',
  '인천': 'incheon',
  '인천광역시': 'incheon',
  'incheon': 'incheon',
  '대전': 'daejeon',
  '대전광역시': 'daejeon',
  'daejeon': 'daejeon',
  '대구': 'daegu',
  '대구광역시': 'daegu',
  'daegu': 'daegu',
  'tago': 'seoul', // tago는 수도권 복합 처리 기준
};

export class RealtimeTransitService {
  /**
   * 실시간 버스 도착 정보 조회 (지역별 특화 서비스 라우팅 및 지능형 폴백)
   */
  public static async getBusArrivals({
    region,
    stationId,
    stationName = '정류소',
    cityCode,
    lat,
    lng,
    destination,
    headsign,
  }: GetBusArrivalsParams): Promise<NormalizedRealtimeData> {
    // 0. 입구에서 단일 표준 영문 키로 1회 정규화
    const rawRegion = (region || '').trim();
    let normalizedRegion = REGION_NORMALIZE_MAP[rawRegion.toLowerCase()] || REGION_NORMALIZE_MAP[rawRegion] || 'seoul';
    let resolvedCityCode = cityCode;
    let effectiveStationId = stationId || '';

    // 0-0-1단계: 좌표(lat, lng)가 주어졌을 때 권역 최우선 보정 (서울 오인 방지)
    if (lat && lng) {
      const coordRegion = inferRegionFromPlace({ lat, lng, place_name: stationName });
      if (coordRegion && (normalizedRegion === 'seoul' || !region)) {
        normalizedRegion = REGION_NORMALIZE_MAP[coordRegion] || coordRegion;
        if (normalizedRegion === 'gyeonggi' && !resolvedCityCode) {
          resolvedCityCode = '31';
        }
      }
    }

    // 0-0단계: stationId가 비어있거나 가상 ID('auto', 'none', '_')인 경우 좌표/정류소명 기반 공공 정류소 역조회
    const isSpecialId = !stationId || stationId === 'auto' || stationId === 'none' || stationId === '_' || !/[0-9]/.test(stationId);
    if (isSpecialId && lat && lng) {
      const apiKey = getTransitApiKey();
      try {
        const coordsInfo = await TagoBusService.lookupTagoNodeIdByCoords(lat, lng, stationName, apiKey || undefined);
        if (coordsInfo?.nodeId) {
          effectiveStationId = coordsInfo.nodeId;
          if (coordsInfo.cityCode) {
            resolvedCityCode = coordsInfo.cityCode;
            if (String(coordsInfo.cityCode).startsWith('31') || coordsInfo.nodeId.toUpperCase().startsWith('GGB')) {
              normalizedRegion = 'gyeonggi';
            }
          }
        }
      } catch (lookupErr: unknown) {
        const errMsg = lookupErr instanceof Error ? lookupErr.message : '알 수 없는 오류';
        console.warn('[RealtimeTransitService] 좌표 기반 정류소 역조회 실패:', errMsg);
      }
    }

    // 0단계: stationId 고유 접두사 기반 최우선 권역 교정 (DJB/GGB/BSB/ICB 등 가장 신뢰도 높은 기준)
    const upperStationId = effectiveStationId.toUpperCase();
    const pureId = effectiveStationId.replace(/[^0-9]/g, '');

    if (upperStationId.startsWith('DJB')) {
      normalizedRegion = 'daejeon';
      resolvedCityCode = '25';
    } else if (
      upperStationId.startsWith('GGB') ||
      (pureId.length === 9 && GYEONGGI_STATION_ID_PREFIXES.some((prefix) => pureId.startsWith(prefix)))
    ) {
      normalizedRegion = 'gyeonggi';
      resolvedCityCode = '31';
    } else if (upperStationId.startsWith('BSB')) {
      normalizedRegion = 'busan';
      resolvedCityCode = '21';
    } else if (upperStationId.startsWith('ICB') || upperStationId.startsWith('INB')) {
      normalizedRegion = 'incheon';
      resolvedCityCode = '23';
    } else if (upperStationId.startsWith('DGB')) {
      normalizedRegion = 'daegu';
      resolvedCityCode = '22';
    } else if (cityCode) {
      // 공공데이터포털(TAGO) 및 지자체 도시코드 매핑을 통한 보조 권역 교정
      resolvedCityCode = resolveTagoCode(cityCode);
      const mappedRegion = resolveBusRegion(cityCode);
      if (mappedRegion && mappedRegion !== 'seoul') {
        normalizedRegion = REGION_NORMALIZE_MAP[mappedRegion] || mappedRegion;
      }
    }

    // 1단계: 경기도 전용 권역 (Primary: 경기도 버스도착정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'gyeonggi') {
      const hasValidNumericId = /[0-9]/.test(effectiveStationId);
      if (hasValidNumericId) {
        try {
          const ggResult = await GyeonggiBusService.getArrivalInfo(effectiveStationId, stationName);
          if (ggResult && ggResult.nextArrivals.length > 0) {
            return ggResult;
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
          console.warn(`[RealtimeTransitService] 경기도 1순위 API 호출 실패, TAGO 폴백 진행: ${errMsg}`);
        }
      }

      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode || '31',
        region: normalizedRegion,
        nodeId: effectiveStationId,
        stationName,
        lat,
        lng,
      });
    }

    // 2단계: 부산 권역 (Primary: 부산 버스정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'busan') {
      try {
        const busanResult = await BusanBusService.getArrivalInfo(effectiveStationId, stationName);
        if (busanResult && busanResult.nextArrivals.length > 0) {
          return busanResult;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.warn(`[RealtimeTransitService] 부산 1순위 API 호출 실패, TAGO 폴백 진행: ${errMsg}`);
      }

      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode,
        region: normalizedRegion,
        nodeId: effectiveStationId,
        stationName,
        lat,
        lng,
      });
    }

    // 3단계: 인천 권역 (Primary: 인천 버스도착정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'incheon') {
      try {
        const incheonResult = await IncheonBusService.getArrivalInfo(effectiveStationId, stationName);
        if (incheonResult && incheonResult.nextArrivals.length > 0) {
          return incheonResult;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.warn(`[RealtimeTransitService] 인천 1순위 API 호출 실패, TAGO 폴백 진행: ${errMsg}`);
      }

      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode || '23',
        region: normalizedRegion,
        nodeId: effectiveStationId,
        stationName,
        lat,
        lng,
      });
    }

    // 4단계: 대전 권역 (대전광역시 공식 API 전용 호출)
    if (normalizedRegion === 'daejeon') {
      return DaejeonBusService.getArrivalInfo(
        effectiveStationId,
        stationName,
        destination,
        headsign,
        lat,
        lng
      );
    }

    // 4-1단계: 대구 권역 (Primary: 대구 버스정보 API -> Fallback: TAGO)
    if (normalizedRegion === 'daegu') {
      try {
        const daeguResult = await DaeguBusService.getArrivalInfo(
          effectiveStationId,
          stationName,
          destination,
          headsign,
          lat,
          lng
        );
        if (daeguResult && daeguResult.nextArrivals.length > 0) {
          return daeguResult;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.warn(`[RealtimeTransitService] 대구 1순위 API 호출 실패, TAGO 폴백 진행: ${errMsg}`);
      }

      return TagoBusService.getArrivalInfoSmartNodeTrigger({
        cityCode: resolvedCityCode || '22',
        region: normalizedRegion,
        nodeId: effectiveStationId,
        stationName,
        lat,
        lng,
      });
    }

    // 5단계: 서울 및 수도권 권역 (TAGO 서울/전국 버스 + 경기도 광역버스 머지)
    if (normalizedRegion === 'seoul') {
      try {
        // 경기도 광역버스 연계 호출 여부 판단:
        // 정류소 ID가 9자리 경기도 ID이거나 GGB 접두사를 가지는 경우에만 경기도 API 병렬 호출
        const isGgbCandidate =
          upperStationId.startsWith('GGB') ||
          (pureId.length === 9 && GYEONGGI_STATION_ID_PREFIXES.some((prefix) => pureId.startsWith(prefix)));

        const [ggbSettled, tagoSettled] = await Promise.allSettled([
          isGgbCandidate
            ? GyeonggiBusService.getArrivalInfo(effectiveStationId, stationName)
            : Promise.resolve(null),
          TagoBusService.getArrivalInfoSmartNodeTrigger({
            cityCode: resolvedCityCode || '11',
            region: normalizedRegion,
            nodeId: effectiveStationId,
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
          // 둘 다 도착 정보가 존재하면 지능형 병합 (TAGO 베이스 + GBIS 광역버스 머지)
          return MergeService.mergeArrivalData(tagoResult, ggbResult);
        } else if (hasGgbArrivals && ggbResult) {
          return ggbResult;
        } else if (hasTagoArrivals && tagoResult) {
          return tagoResult;
        } else if (ggbResult && (!tagoResult || ggbResult.reliability >= tagoResult.reliability)) {
          return ggbResult;
        } else if (tagoResult) {
          return tagoResult;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : '알 수 없는 오류';
        console.warn(`[RealtimeTransitService] 서울/수도권 호출 에러: ${errMsg}`);
      }
    }

    // 6단계: 전국 및 기타 권역 (TAGO 스마트 버스 서비스)
    return TagoBusService.getArrivalInfoSmartNodeTrigger({
      cityCode: resolvedCityCode,
      region: normalizedRegion,
      nodeId: effectiveStationId,
      stationName,
      lat,
      lng,
    });
  }
}
