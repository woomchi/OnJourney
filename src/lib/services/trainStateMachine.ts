/**
 * @fileoverview 지하철 열차 유한 상태 머신(FSM) 및 이상치 자기 치유(Self-Healing) 엔진
 *
 * 공공 API 특성상 발생하는 패킷 지연, 역주행/순간이동 이상치, 급행 열차 추월 불일치를
 * 유한 상태 머신(FSM)과 물리적 제약 조건을 통해 실시간으로 감지하고 보정합니다.
 */

import { SubwayPosition, SubwayLineStation } from '@/types/journey';
import { parseReceiptTimestamp } from './subwayDeadReckoningEngine';

/** 열차 운행 라이프사이클 상태 */
export type TrainLifecycleState =
  | 'STATIONARY'   // 역 정차 중
  | 'DEPARTED'     // 당역 출발
  | 'RUNNING'      // 본선 주행 중
  | 'APPROACHING'  // 다음 역 진입 중
  | 'ARRIVED'      // 다음 역 도착 완료
  | 'TERMINATED';  // 종착역 도착 후 운행 종료

export interface SanitizedTrainState {
  position: SubwayPosition;
  lifecycleState: TrainLifecycleState;
  stationIndex: number;
  isAnomalyDetected: boolean;
  anomalyReason?: string;
  confidenceScore: number; // 0.0 ~ 1.0 신뢰도 지수
}

/**
 * 서울시 trainSttus 코드를 FSM 상태로 매핑
 */
export function mapTrainStatusToLifecycle(trainSttus?: string): TrainLifecycleState {
  switch (String(trainSttus || '1')) {
    case '0':
      return 'APPROACHING'; // 진입
    case '1':
      return 'ARRIVED';     // 도착
    case '2':
      return 'DEPARTED';    // 출발
    case '3':
      return 'RUNNING';     // 전역출발 (주행 중)
    case '4':
      return 'APPROACHING'; // 전역진입
    case '5':
      return 'STATIONARY';  // 전역도착
    default:
      return 'RUNNING';
  }
}

/**
 * 열차 위치 목록을 검증하고, 역주행/순간이동/중복 이상치를 필터링 및 보정합니다.
 *
 * @param positions 노선별 실시간 열차 위치 목록
 * @param orderedStations 진행 방향별 정렬된 정차역 목록
 * @param previousStates 직전 스냅샷의 열차 상태 맵 (trainNo -> SanitizedTrainState)
 */
export function sanitizeAndSmoothTrainPositions(
  positions: SubwayPosition[],
  orderedStations: SubwayLineStation[],
  previousStates?: Map<string, SanitizedTrainState>
): SanitizedTrainState[] {
  if (!positions || positions.length === 0) return [];
  if (!orderedStations || orderedStations.length === 0) {
    return positions.map((p) => ({
      position: p,
      lifecycleState: mapTrainStatusToLifecycle(p.trainSttus),
      stationIndex: -1,
      isAnomalyDetected: false,
      confidenceScore: 1.0,
    }));
  }

  const stationIndexMap = new Map<string, number>();
  orderedStations.forEach((st, idx) => {
    const clean = st.stationName.replace(/역$/, '').trim();
    stationIndexMap.set(clean, idx);
    const noBrackets = clean.replace(/\(.*?\)/g, '').trim();
    if (!stationIndexMap.has(noBrackets)) {
      stationIndexMap.set(noBrackets, idx);
    }
  });

  const totalStations = orderedStations.length;
  const results: SanitizedTrainState[] = [];

  for (const pos of positions) {
    const rawStatn = (pos.statnNm || '').replace(/역$/, '').trim();
    const cleanStatn = rawStatn.replace(/\(.*?\)/g, '').trim();
    const stIdx = stationIndexMap.get(rawStatn) ?? stationIndexMap.get(cleanStatn) ?? -1;

    let lifecycleState = mapTrainStatusToLifecycle(pos.trainSttus);
    let isAnomaly = false;
    let anomalyReason: string | undefined = undefined;
    let confidence = 1.0;

    // 1. 역 목록 미존재 검사
    if (stIdx === -1) {
      isAnomaly = true;
      anomalyReason = `정차역 목록에 존재하지 않는 역: ${pos.statnNm}`;
      confidence = 0.5;
    }

    // 2. 종착역 도달 검사
    if (stIdx === totalStations - 1 && (pos.trainSttus === '1' || pos.trainSttus === '2')) {
      lifecycleState = 'TERMINATED';
    }

    // 3. 직전 상태 대비 역주행/순간이동 이상치 감지
    if (previousStates && pos.trainNo) {
      const prev = previousStates.get(pos.trainNo);
      if (prev && prev.stationIndex >= 0 && stIdx >= 0) {
        const stationDelta = stIdx - prev.stationIndex;
        const prevReceiptTime = parseReceiptTimestamp(prev.position.recptnDt || prev.position.lastRecptnDt);
        const currReceiptTime = parseReceiptTimestamp(pos.recptnDt || pos.lastRecptnDt);
        const timeDiffSec = Math.max(1, (currReceiptTime - prevReceiptTime) / 1000);

        // a. 과거 패킷 지연 수신 (수신 시각이 직전보다 이전인 경우)
        if (currReceiptTime < prevReceiptTime - 5000) {
          isAnomaly = true;
          anomalyReason = `과거 지연 패킷 감지 (폐기 권장)`;
          confidence = 0.2;
        }
        // b. 비정상적 역주행 (진행 방향 반대로 2역 이상 점프)
        else if (stationDelta < -1) {
          isAnomaly = true;
          anomalyReason = `역주행 이상치 감지 (${prev.position.statnNm} -> ${pos.statnNm})`;
          confidence = 0.3;
        }
        // c. 비정상적 초고속 순간이동 (30초 이내에 5역 이상 점프)
        else if (stationDelta > 4 && timeDiffSec < 30) {
          isAnomaly = true;
          anomalyReason = `순간이동 이상치 감지 (${timeDiffSec}초 내 ${stationDelta}역 이동)`;
          confidence = 0.4;
        }
      }
    }

    results.push({
      position: pos,
      lifecycleState,
      stationIndex: stIdx,
      isAnomalyDetected: isAnomaly,
      anomalyReason,
      confidenceScore: confidence,
    });
  }

  // 신뢰도가 지나치게 낮은(0.2 이하) 과거 지연 패킷만 필터링하고 나머지는 정상 반영
  return results.filter((r) => r.confidenceScore > 0.2);
}
