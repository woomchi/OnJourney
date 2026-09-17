import { RELIABILITY_SCORES } from '@/constants/transit';
import {
  ArrivalBusItem,
  BusType,
  NormalizedRealtimeData,
} from '@/types/realtimeTransit';
import { TagoBusService } from './TagoBusService';
import {
  getTransitApiKey,
  getEncodedServiceKey,
  parseXmlOrJsonItems,
  safeNumber,
  safeString,
} from './transitUtils';

export class DaejeonBusService {
  // 대전광역시_정류소별 버스도착예정정보 조회 서비스 공식 공공데이터포털 엔드포인트
  private static readonly API_URL =
    'https://apis.data.go.kr/6300000/arrive/getArrInfoByStopID';

  /**
   * 대전 BIS ROUTE_TP 및 노선명을 바탕으로 BusType 분류
   */
  private static parseDaejeonBusType(routeTp?: string | number, routeNo?: string): BusType {
    const tp = String(routeTp || '').trim();
    const no = String(routeNo || '').trim();

    if (tp === '1' || no.includes('급행')) return 'express';
    if (tp === '2' || no.includes('간선')) return 'normal';
    if (tp === '3' || no.includes('지선') || no.includes('외곽')) return 'circulation';
    if (tp === '4' || no.includes('마을') || no.includes('첨단') || no.includes('특구')) return 'circulation';
    return 'normal';
  }

  /**
   * 대전광역시 BIS API를 통해 특정 정류소의 실시간 버스 도착 정보 조회 (단일 초고속 호출)
   */
  public static async getArrivalInfo(
    stationId: string,
    stationName: string = '정류소',
    destination?: string,
    headsign?: string,
    lat?: number,
    lng?: number
  ): Promise<NormalizedRealtimeData> {
    if (!stationId && !stationName && (!lat || !lng)) {
      return this.getFallbackData(stationId, stationName, '정류소 식별 정보가 유효하지 않습니다.');
    }

    const apiKey = getTransitApiKey('daejeon');
    if (!apiKey) {
      return this.getFallbackData(stationId, stationName, '대전 버스 API 키가 설정되지 않았습니다.');
    }

    try {
      // 1. stationId 정제 (DJB 접두사 제거 및 숫자 추출)
      const cleanStationId = (stationId || '').replace(/^DJB/i, '').trim();
      const pureNumeric = (stationId || '').replace(/[^0-9]/g, '');
      let targetStopId = cleanStationId || pureNumeric || (stationId || '').trim();

      const isDaejeon7DigitNodeId = pureNumeric.startsWith('800') && pureNumeric.length === 7;

      // 7자리 BUS_NODE_ID(800xxxx)가 아닌 경우(5자리 ARS, ODsay ID 등) TAGO 스마트 룩업으로 7자리 Node ID 변환
      if (!isDaejeon7DigitNodeId) {
        let lookedUpNodeId = await TagoBusService.lookupTagoNodeId(
          '25',
          pureNumeric,
          stationName,
          apiKey
        );

        if (!lookedUpNodeId && lat && lng) {
          const coordsResult = await TagoBusService.lookupTagoNodeIdByCoords(
            lat,
            lng,
            stationName,
            apiKey
          );
          if (coordsResult?.nodeId) {
            lookedUpNodeId = coordsResult.nodeId;
          }
        }

        if (lookedUpNodeId) {
          targetStopId = lookedUpNodeId.replace(/^DJB/i, '').trim();
        }
      }

      const encodedKey = getEncodedServiceKey('daejeon');
      const requestUrl = `${this.API_URL}?serviceKey=${encodedKey}&BusStopID=${encodeURIComponent(targetStopId)}&_type=json`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/xml, */*' },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }).catch(() => null);

      if (!res || !res.ok) {
        throw new Error(`대전 버스 API HTTP ${res?.status || 'Network Error'}`);
      }

      const text = await res.text();
      const { items: itemsArray } = parseXmlOrJsonItems<Record<string, unknown>>(text);

      const nextArrivals: ArrivalBusItem[] = [];

      for (const item of itemsArray) {
        const lineName = safeString(
          item.ROUTE_NO ||
          item.routeNo ||
          item.routeno ||
          item.ROUTE_CD ||
          item.route_cd ||
          item.LINENO ||
          item.lineNo,
          '대전버스'
        );

        const msgTpRaw = safeString(item.MSG_TP || item.msg_tp);
        const msgTp = msgTpRaw ? msgTpRaw.padStart(2, '0') : '';

        const rawExMin = item.EXTIME_MIN ?? item.extime_min ?? item.MIN1 ?? item.min1;
        const rawExSec = item.EXTIME_SEC ?? item.extime_sec;
        const rawStatusPos = item.STATUS_POS ?? item.status_pos ?? item.ARRPREVSTATIONCNT ?? item.arrprevstationcnt ?? item.REST_STOP_COUNT ?? item.rest_stop_count;

        let arrivalSeconds = 0;
        let isWaiting = false;

        // 남은 정류장 수 (대전 BIS STATUS_POS / ARRPREVSTATIONCNT)
        const restStopCount = safeNumber(rawStatusPos);
        const currentStationSequence = restStopCount !== undefined && restStopCount >= 0 ? restStopCount : undefined;

        const numExMin = safeNumber(rawExMin);
        const numExSec = safeNumber(rawExSec);

        // 1순위: EXTIME_SEC(초 단위) 우선 적용, 2순위: EXTIME_MIN(분 단위) 적용
        if (numExSec !== undefined && numExSec > 0) {
          arrivalSeconds = numExSec;
        } else if (numExMin !== undefined && numExMin > 0) {
          arrivalSeconds = numExMin * 60;
        }

        if (msgTp === '07' || msgTp === '7') {
          // 기점/차고지/종점 운행 대기
          isWaiting = true;
          if (arrivalSeconds <= 0) {
            arrivalSeconds = 1200; // 20분 (1200초)
          }
        } else if (msgTp === '01' || msgTp === '06' || msgTp === '1' || msgTp === '6') {
          // '01': 도착, '06': 진입 중
          if (arrivalSeconds <= 0 || arrivalSeconds > 30) {
            arrivalSeconds = 30;
          }
        } else if (msgTp === '02' || msgTp === '2') {
          // '02': 출발 (전역 출발)
          if (arrivalSeconds <= 0 || arrivalSeconds > 60) {
            arrivalSeconds = 60;
          }
        } else {
          // 일반 운행 중: arrivalSeconds가 없으면 정거장 수로 추정
          if (arrivalSeconds <= 0 && currentStationSequence !== undefined && currentStationSequence > 0) {
            arrivalSeconds = currentStationSequence * 120; // 1정거장당 약 2분 추정
          }
        }

        const routeId = item.ROUTE_CD || item.route_cd || item.BUS_NODE_ID || item.bus_node_id || item.routeId || item.routeid || item.ROUTEID;
        const busDest = safeString(item.DESTINATION || item.destination || item.DIR_END || item.dir_end || item.DEST_BUSSTOP_NM, '종점 방향');
        const plateNo = item.CAR_REG_NO || item.car_reg_no || item.PLATE_NO || item.plate_no || item.vehicleno || item.BUS_NUM;
        const routeTp = item.ROUTE_TP || item.route_tp || item.routety || item.ROUTE_TYPE;

        if (arrivalSeconds > 0) {
          nextArrivals.push({
            lineId: routeId ? `DJB${safeString(routeId).replace(/^DJB/i, '')}` : `DJB_${lineName}`,
            lineName,
            arrivedInSeconds: arrivalSeconds,
            currentStationSequence,
            busType: this.parseDaejeonBusType(routeTp as string | number | undefined, lineName),
            destination: busDest,
            vehicleId: plateNo ? safeString(plateNo) : undefined,
            isWaiting,
          });
        }
      }

      // 방향(destination/headsign) 일치도 기준 정렬 및 잔여 시간 순 정렬
      const targetDir = (destination || headsign || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
      nextArrivals.sort((a, b) => {
        if (targetDir) {
          const aDest = (a.destination || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
          const bDest = (b.destination || '').replace(/[\s\(\)\-_]/g, '').toLowerCase();
          const aMatch = aDest.includes(targetDir) || targetDir.includes(aDest);
          const bMatch = bDest.includes(targetDir) || targetDir.includes(bDest);
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
        }
        return a.arrivedInSeconds - b.arrivedInSeconds;
      });

      return {
        stationId,
        stationName,
        nextArrivals,
        dataSource: 'daejeon',
        lastUpdated: Date.now(),
        reliability: RELIABILITY_SCORES.daejeon,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '알 수 없는 오류';
      console.warn('[DaejeonBusService] API 호출 오류:', errMsg);
      return this.getFallbackData(
        stationId,
        stationName,
        `대전 버스 연동 에러: ${errMsg}`
      );
    }
  }

  /**
   * 대전 지역 Fallback 데이터
   */
  private static getFallbackData(
    stationId: string,
    stationName: string,
    errorMessage?: string
  ): NormalizedRealtimeData {
    return {
      stationId,
      stationName,
      nextArrivals: [],
      dataSource: 'daejeon',
      lastUpdated: Date.now(),
      reliability: 0.0,
      errorMessage,
    };
  }
}
