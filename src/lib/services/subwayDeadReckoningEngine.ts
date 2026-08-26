/**
 * @fileoverview 지하철 열차 물리적 위치 추측 항법(Dead Reckoning) 엔진
 *
 * API 폴링 주기(15초) 사이의 공백 시간 또는 일시적 API 지연 시,
 * 직전 수신 시각(recptnDt), 열차 운행 상태(trainSttus), 역간 소요 시간(hmSeconds)을 기반으로
 * 열차의 역간 이동 진행 비율(progressRatio: 0.0 ~ 1.0)과 현재 물리적 세그먼트를 정밀 추정합니다.
 */

import { SubwayPosition, SubwayLineStation } from '@/types/journey';

export interface DeadReckoningResult {
  /** 현재 열차가 위치/진행 중인 기점 역명 */
  fromStation: string;
  /** 다음 도달할 목표 역명 (정차 중인 경우 fromStation과 동일) */
  toStation: string;
  /** 현재 세그먼트 내 진행 비율 (0.0: 출발역, 1.0: 도착역) */
  progressRatio: number;
  /** 추측 항법 상태 설명 ('at_station' | 'departed' | 'running' | 'approaching') */
  movementStage: 'at_station' | 'departed' | 'running' | 'approaching';
  /** 수신 시각 대비 경과 시간 (초) */
  elapsedSeconds: number;
  /** 남은 예상 도달 시간 (초) */
  remainingSecondsToTarget: number;
  /** 이상 패킷 여부 (지나치게 오래된 데이터) */
  isStale: boolean;
}

/**
 * 서울시 API recptnDt 문자열("YYYY-MM-DD HH:mm:ss" 또는 "YYYYMMDDHHmmss")을 밀리초 타임스탬프로 변환
 */
export function parseReceiptTimestamp(recptnDt?: string): number {
  if (!recptnDt) return Date.now();
  const clean = recptnDt.trim();

  // "2026-08-26 15:30:00" 형식
  if (clean.includes('-') || clean.includes(':')) {
    const parsed = new Date(clean.replace(' ', 'T')).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  // "20260826153000" 형식
  if (clean.length === 14 && /^\d+$/.test(clean)) {
    const y = parseInt(clean.substring(0, 4), 10);
    const m = parseInt(clean.substring(4, 6), 10) - 1;
    const d = parseInt(clean.substring(6, 8), 10);
    const h = parseInt(clean.substring(8, 10), 10);
    const min = parseInt(clean.substring(10, 12), 10);
    const s = parseInt(clean.substring(12, 14), 10);
    return new Date(y, m, d, h, min, s).getTime();
  }

  const defaultParsed = new Date(clean).getTime();
  return isNaN(defaultParsed) ? Date.now() : defaultParsed;
}

/**
 * 단일 열차의 현재 물리적 위치 및 진행 비율을 추측 항법(Dead Reckoning)으로 계산합니다.
 *
 * @param position 실시간 열차 위치 객체
 * @param orderedStations 해당 노선의 방향별 정렬된 역 목록
 * @param currentTimeMs 현재 시각 밀리초 (기본값: Date.now())
 * @param defaultInterStationSeconds 기본 역간 소요 시간 (초, 기본값: 120초)
 */
export function calculateTrainDeadReckoning(
  position: SubwayPosition,
  orderedStations: SubwayLineStation[],
  currentTimeMs: number = Date.now(),
  defaultInterStationSeconds: number = 120
): DeadReckoningResult {
  const currentStatnClean = (position.statnNm || '').replace(/역$/, '').trim();
  const trainSttus = String(position.trainSttus ?? '1'); // '0': 진입, '1': 도착, '2': 출발, '3': 전역출발, '4': 전역진입, '5': 전역도착
  const receiptTimeMs = parseReceiptTimestamp(position.recptnDt || position.lastRecptnDt);
  const elapsedSeconds = Math.max(0, Math.floor((currentTimeMs - receiptTimeMs) / 1000));

  // 10분 이상 지난 데이터는 완전 만료 처리
  const isStale = elapsedSeconds > 600;

  const currentIdx = orderedStations.findIndex(
    (st) => st.stationName.replace(/역$/, '').trim() === currentStatnClean
  );

  // 역 목록에 없는 경우 기본 정차 상태 반환
  if (currentIdx === -1) {
    return {
      fromStation: currentStatnClean,
      toStation: currentStatnClean,
      progressRatio: 0.0,
      movementStage: 'at_station',
      elapsedSeconds,
      remainingSecondsToTarget: 0,
      isStale,
    };
  }

  const isLastStation = currentIdx >= orderedStations.length - 1;
  const isFirstStation = currentIdx === 0;

  // ── 상태별 기본 진행 구간 및 세그먼트 산출 ───────────────────────────
  let fromIdx = currentIdx;
  let toIdx = currentIdx;
  let baseRatio = 0.0;
  let stage: 'at_station' | 'departed' | 'running' | 'approaching' = 'at_station';

  if (trainSttus === '2') {
    // 당역 출발: 현재 역에서 다음 역으로 진행
    fromIdx = currentIdx;
    toIdx = !isLastStation ? currentIdx + 1 : currentIdx;
    baseRatio = 0.25;
    stage = 'departed';
  } else if (trainSttus === '3') {
    // 전역 출발: 이전 역에서 현재 역으로 50% 진행
    fromIdx = !isFirstStation ? currentIdx - 1 : currentIdx;
    toIdx = currentIdx;
    baseRatio = 0.5;
    stage = 'running';
  } else if (trainSttus === '4') {
    // 전역 진입: 현재 역 직전 75% 진행
    fromIdx = !isFirstStation ? currentIdx - 1 : currentIdx;
    toIdx = currentIdx;
    baseRatio = 0.75;
    stage = 'approaching';
  } else if (trainSttus === '5') {
    // 전역 도착: 이전 역 도착 상태
    fromIdx = !isFirstStation ? currentIdx - 1 : currentIdx;
    toIdx = currentIdx;
    baseRatio = 0.0;
    stage = 'at_station';
  } else if (trainSttus === '0') {
    // 당역 진입: 현재 역 진입 직전 (80%)
    fromIdx = !isFirstStation ? currentIdx - 1 : currentIdx;
    toIdx = currentIdx;
    baseRatio = 0.8;
    stage = 'approaching';
  } else {
    // 당역 도착 (1): 정차 중 (정차 시간 ~30초 가정)
    fromIdx = currentIdx;
    toIdx = currentIdx;
    baseRatio = 0.0;
    stage = 'at_station';
  }

  // ── 시간 경과(elapsedSeconds)에 따른 동적 추측 항법 보정 ──────────────
  const estimatedTravelTimeSec = defaultInterStationSeconds; // 역간 소요 초 (예: 120초)
  let calculatedRatio = baseRatio;

  if (fromIdx !== toIdx) {
    // 주행 중인 경우 경과 시간에 비례하여 진행률 전진
    const addedRatio = elapsedSeconds / estimatedTravelTimeSec;
    calculatedRatio = Math.min(0.95, baseRatio + addedRatio); // 다음 역 도착 전 95%까지만 자연스럽게 전진
  } else if (stage === 'at_station' && elapsedSeconds > 35 && !isLastStation) {
    // 정차 중 35초 이상 경과 시 출발로 가상 전환하여 주행 시작
    fromIdx = currentIdx;
    toIdx = currentIdx + 1;
    const runningElapsed = elapsedSeconds - 35;
    calculatedRatio = Math.min(0.95, 0.2 + (runningElapsed / estimatedTravelTimeSec));
    stage = calculatedRatio > 0.7 ? 'approaching' : 'running';
  }

  const fromStation = orderedStations[fromIdx]?.stationName.replace(/역$/, '').trim() || currentStatnClean;
  const toStation = orderedStations[toIdx]?.stationName.replace(/역$/, '').trim() || currentStatnClean;

  const remainingRatio = Math.max(0, 1.0 - calculatedRatio);
  const remainingSecondsToTarget = Math.round(remainingRatio * estimatedTravelTimeSec);

  return {
    fromStation,
    toStation,
    progressRatio: Number(calculatedRatio.toFixed(3)),
    movementStage: stage,
    elapsedSeconds,
    remainingSecondsToTarget,
    isStale,
  };
}
