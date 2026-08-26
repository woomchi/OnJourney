/**
 * @fileoverview 서울시 및 전국 지하철 실시간 도착 정보를 바탕으로 정밀 ETA 및 상태 텍스트를 산출하는 계산 엔진 모듈
 */

import type { SubwayEtaResult } from './types';
import {
  normalizeStationName,
  extractCurrentStation,
  extractRemainingStations,
  isExpressTrain,
  parseSeoulApiDate,
} from './trainMetadata';
import { calculateTimeBetweenStations } from './stationDistance';
import { timeOffsetManager } from '@/lib/utils/timeOffsetManager';

// ─── 상수 ────────────────────────────────────────────────────────────────────
/** 지하철 승강장 진입/도착 후 최대 유효 정차 시간 (180초 / 3분) */
const APPROACHING_MAX_DWELL_SECONDS = 180;

/** 급행 열차 소요 시간 가중치 (완행 대비 약 45% 단축) */
const EXPRESS_TIME_FACTOR = 0.55;

/** 코레일 등 barvlDt 없는 노선의 기본 Fallback 소요 시간 (초/역) */
const FALLBACK_SECONDS_PER_STATION = 120;

/** barvlDt 없는 노선의 기본 Fallback 시간 (분) */
const FALLBACK_DEFAULT_MINUTES = 99;

/**
 * 시간대별 혼잡도 정차 지연 가중치 (기본 1.0, 출퇴근 시간 정차 지연 보정)
 */
function getRushHourFactor(date: Date = new Date()): number {
  const hours = date.getHours();
  if ((hours >= 7 && hours < 9) || (hours >= 17 && hours < 19)) {
    return 1.1; // 출퇴근 시간대 승하차 정차 지연 10% 보정
  }
  return 1.0;
}

/**
 * 진입/도착 승강장 근접 상태 응답 객체를 빌드합니다.
 */
function buildApproachingResponse(
  arvlMsg2: string,
  targetClean: string,
  recptnDt?: string,
  arvlCd?: string | number
): SubwayEtaResult {
  const arvlCdStr = String(arvlCd ?? '');
  const isJustDeparted =
    arvlCdStr === '2' ||
    arvlMsg2.includes(`${targetClean} 출발`) ||
    arvlMsg2.includes('당역 출발') ||
    arvlMsg2.includes('당역출발') ||
    arvlMsg2 === '출발';

  if (isJustDeparted) {
    return {
      statusText: `${targetClean} 출발함`,
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: false,
      isPassed: true,
      arvlCd: '2',
      arrivalPriority: 999,
    };
  }

  // 수신 시각(recptnDt) 기준 정차 허용 시간 초과 검증
  if (recptnDt) {
    try {
      const receiptTime = parseSeoulApiDate(recptnDt);
      const currentTime = timeOffsetManager.getSynchronizedNow();
      if (!isNaN(receiptTime)) {
        const timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1_000));
        if (timeDiffSec > APPROACHING_MAX_DWELL_SECONDS) {
          return {
            statusText: `${targetClean} 출발함`,
            minutesLeft: 0,
            arrivalTime: '',
            isApproaching: false,
            isPassed: true,
            arvlCd: '2',
            arrivalPriority: 999,
          };
        }
      }
    } catch {
      // 날짜 파싱 실패 시 기본 로직 수행
    }
  }

  const isArrived =
    arvlCdStr === '1' ||
    arvlMsg2.includes(`${targetClean} 도착`) ||
    arvlMsg2.includes('당역 도착') ||
    arvlMsg2 === '도착';

  if (isArrived) {
    return {
      statusText: '도착',
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: true,
      isPassed: false,
      arvlCd: '1',
      arrivalPriority: 0,
    };
  }

  return {
    statusText: '곧 도착 [진입]',
    minutesLeft: 0,
    arrivalTime: '',
    isApproaching: true,
    isPassed: false,
    arvlCd: '0',
    arrivalPriority: 1,
  };
}

/**
 * barvlDt(초 단위 잔여 시간)가 제공되는 경우의 응답 객체를 빌드합니다.
 */
function buildBarvlDtResponse(
  barvlDt: number,
  recptnDt: string,
  arvlMsg2: string,
  remainingStations: number | null,
  arvlCd?: string | number,
  isExpress: boolean = false
): SubwayEtaResult {
  let timeDiffSec = 0;
  if (recptnDt) {
    try {
      const receiptTime = parseSeoulApiDate(recptnDt);
      const currentTime = timeOffsetManager.getSynchronizedNow();
      if (!isNaN(receiptTime)) {
        timeDiffSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1_000));
      }
    } catch {
      // 파싱 실패 시 경과 시간 보정 생략
    }
  }

  const correctedRemainingSec = Math.max(0, barvlDt - timeDiffSec);
  const arvlCdStr = String(arvlCd ?? '');

  // 0초에 도달했으나 스냅샷 수신 후 정차 시간(180초) 이내인 경우 '도착/진입' 유지
  if (correctedRemainingSec === 0) {
    if (timeDiffSec > APPROACHING_MAX_DWELL_SECONDS || arvlMsg2.includes('출발') || arvlCdStr === '2') {
      return {
        statusText: arvlMsg2.includes('출발') ? '출발함' : '지나침',
        minutesLeft: 0,
        arrivalTime: '',
        isApproaching: false,
        isPassed: true,
        arvlCd: '2',
        arrivalPriority: 999,
      };
    }
    const isArrived = arvlCdStr === '1' || arvlMsg2.includes('도착');
    return {
      statusText: isArrived ? '도착' : '곧 도착 [진입]',
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: true,
      isPassed: false,
      arvlCd: isArrived ? '1' : '0',
      arrivalPriority: isArrived ? 0 : 1,
    };
  }

  const minutesLeft = Math.ceil(correctedRemainingSec / 60);
  const syncNow = timeOffsetManager.getSynchronizedNow();
  const arrivalDate = new Date(syncNow + correctedRemainingSec * 1_000);
  const hours = String(arrivalDate.getHours()).padStart(2, '0');
  const mins = String(arrivalDate.getMinutes()).padStart(2, '0');
  const arrivalTime = `${hours}:${mins}`;
  const expressTag = isExpress ? ' [급행]' : '';

  let statusText = `${minutesLeft}분${expressTag}`;
  let arrivalPriority = isExpress ? Math.max(3, minutesLeft + 1) : 4 + (remainingStations ?? minutesLeft);

  if (arvlCdStr === '3' || arvlMsg2.includes('전역 출발') || arvlMsg2.includes('전역출발')) {
    statusText = `${minutesLeft}분 [전역출발]${expressTag}`;
    arrivalPriority = 2;
  } else if (arvlCdStr === '4' || arvlCdStr === '5' || arvlMsg2.includes('전역 진입') || arvlMsg2.includes('전역 도착') || remainingStations === 1) {
    statusText = `${minutesLeft}분 [전역]${expressTag}`;
    arrivalPriority = 3;
  } else if (remainingStations !== null) {
    if (remainingStations === 0) {
      statusText = `곧 도착 [진입]${expressTag}`;
      arrivalPriority = 1;
    } else {
      statusText = `${minutesLeft}분 [${remainingStations}전역]${expressTag}`;
      arrivalPriority = isExpress ? Math.max(3, minutesLeft + 1) : 4 + remainingStations;
    }
  }

  return {
    statusText,
    minutesLeft,
    arrivalTime,
    isApproaching: minutesLeft <= 1 || (remainingStations !== null && remainingStations <= 1),
    isPassed: false,
    arvlCd: arvlCdStr || '99',
    arrivalPriority,
  };
}

/**
 * barvlDt가 없는 경우 역간거리 DB 누적 시간 또는 남은 역 수 기반 Fallback 응답 객체를 빌드합니다.
 */
function buildFallbackResponse(
  arvlMsg2: string,
  remainingStations: number | null,
  currentStation: string,
  targetClean: string,
  subwayId: string | undefined,
  updnLine: string | undefined,
  recptnDt?: string,
  isExpress: boolean = false,
  arvlCd?: string | number
): SubwayEtaResult {
  const rushFactor = getRushHourFactor();
  const expressFactor = isExpress ? EXPRESS_TIME_FACTOR : 1.0;

  // 1. 역간거리 DB 누적 시간 산출
  let totalSec: number | null = null;
  if (currentStation && subwayId && currentStation !== targetClean) {
    const dbSeconds = calculateTimeBetweenStations(currentStation, targetClean, subwayId, updnLine);
    if (dbSeconds !== null && dbSeconds > 0) {
      totalSec = dbSeconds * rushFactor * expressFactor;
    }
  }

  // 2. DB 미매칭 시 남은 역 수 기반 추산 (급행: 역당 ~75초, 완행: 120초)
  if (totalSec === null) {
    const secPerStation = isExpress ? 75 : FALLBACK_SECONDS_PER_STATION;
    totalSec =
      (remainingStations !== null
        ? remainingStations * secPerStation
        : FALLBACK_DEFAULT_MINUTES * 60) * rushFactor;
  }

  // 3. 수신 시각(recptnDt) 기준 경과 시간 실시간 동적 차감
  let elapsedSec = 0;
  if (recptnDt) {
    try {
      const receiptTime = parseSeoulApiDate(recptnDt);
      const currentTime = timeOffsetManager.getSynchronizedNow();
      if (!isNaN(receiptTime)) {
        elapsedSec = Math.max(0, Math.floor((currentTime - receiptTime) / 1_000));
      }
    } catch {
      // 날짜 파싱 실패 시 기본값 유지
    }
  }

  const isApproaching = remainingStations !== null && remainingStations <= 1;
  const correctedRemainingSec = Math.max(
    isApproaching ? 0 : 30,
    Math.round(totalSec - elapsedSec)
  );
  const minutesLeft = Math.ceil(correctedRemainingSec / 60);

  // 4. 도착 예정 시각 계산 (HH:MM)
  const syncNow = timeOffsetManager.getSynchronizedNow();
  const arrivalDate = new Date(syncNow + correctedRemainingSec * 1_000);
  const hours = String(arrivalDate.getHours()).padStart(2, '0');
  const mins = String(arrivalDate.getMinutes()).padStart(2, '0');
  const arrivalTime = `${hours}:${mins}`;

  let statusText = arvlMsg2;
  const expressTag = isExpress ? ' [급행]' : '';
  let arrivalPriority = isExpress ? Math.max(3, minutesLeft + 1) : 4 + (remainingStations ?? Math.max(1, minutesLeft));

  const arvlCdStr = String(arvlCd ?? '');
  if (arvlCdStr === '3' || arvlMsg2.includes('전역 출발') || arvlMsg2.includes('전역출발')) {
    statusText = `1분 [전역출발]${expressTag}`;
    arrivalPriority = 2;
  } else if (arvlCdStr === '4' || arvlCdStr === '5' || arvlMsg2.includes('전역 진입') || arvlMsg2.includes('전역 도착') || remainingStations === 1) {
    statusText = `${Math.max(1, minutesLeft)}분 [전역]${expressTag}`;
    arrivalPriority = 3;
  } else if (remainingStations !== null) {
    if (remainingStations === 0) {
      statusText = `곧 도착 [진입]${expressTag}`;
      arrivalPriority = 1;
    } else {
      statusText = `${minutesLeft}분 [${remainingStations}전역]${expressTag}`;
      arrivalPriority = isExpress ? Math.max(3, minutesLeft + 1) : 4 + remainingStations;
    }
  } else {
    statusText = `${minutesLeft}분${expressTag}`;
  }

  return {
    statusText,
    minutesLeft,
    arrivalTime,
    isApproaching,
    isPassed: false,
    arvlCd: arvlCdStr || '99',
    arrivalPriority,
  };
}

/**
 * 실시간 도착 정보를 바탕으로 지하철 ETA를 동적으로 계산합니다.
 */
export function calculateSubwayETADynamic(
  arvlMsg2: string,
  recptnDt: string,
  targetStation: string,
  trainNo: string,
  updnLine?: string,
  barvlDt?: number,
  subwayId?: string,
  arvlCd?: string | number,
  trainLineNm?: string,
  btrainSttus?: string,
  positionStatnNm?: string
): SubwayEtaResult {
  const targetClean = normalizeStationName(targetStation);
  const isExpress = isExpressTrain(trainLineNm, btrainSttus, arvlMsg2, trainNo);
  const arvlCdStr = String(arvlCd ?? '');

  // 1. 이미 해당 역(targetClean)을 출발한 열차 판별 (arvlCd === '2' 또는 당역 출발 완료)
  const isDepartedCode = arvlCdStr === '2';
  const isDepartedMsg =
    arvlMsg2.includes(`${targetClean} 출발`) ||
    arvlMsg2.includes('당역 출발') ||
    arvlMsg2.includes('당역출발') ||
    arvlMsg2 === '출발';

  if (isDepartedCode || isDepartedMsg) {
    return {
      statusText: `${targetClean} 출발함`,
      minutesLeft: 0,
      arrivalTime: '',
      isApproaching: false,
      isPassed: true,
      arvlCd: '2',
      arrivalPriority: 999,
    };
  }

  const remainingStations = extractRemainingStations(arvlMsg2);

  // 2. 당역 도착(승강장 정차) 또는 당역 진입(곧 도착) 판별
  // 메시지상 2개 역 이상 떨어져 있는 원거리 열차는 코드 오매칭 방지를 위해 제외
  const isFarAwayMsg = remainingStations !== null && remainingStations >= 2;
  const isDirectlyAtTarget =
    !isFarAwayMsg &&
    (arvlCdStr === '0' ||
      arvlCdStr === '1' ||
      arvlMsg2.includes(`${targetClean} 진입`) ||
      arvlMsg2.includes(`${targetClean} 도착`) ||
      arvlMsg2.includes('당역 진입') ||
      arvlMsg2.includes('당역 도착') ||
      arvlMsg2 === '진입' ||
      arvlMsg2 === '도착');

  if (isDirectlyAtTarget) {
    return buildApproachingResponse(arvlMsg2, targetClean, recptnDt, arvlCd);
  }

  if (barvlDt && barvlDt > 0) {
    return buildBarvlDtResponse(barvlDt, recptnDt, arvlMsg2, remainingStations, arvlCd, isExpress);
  }

  // 위치 API에서 제공된 실제 위치 역명이 있으면 최우선 적용, 없으면 메시지 파싱
  const currentStation = positionStatnNm
    ? normalizeStationName(positionStatnNm)
    : extractCurrentStation(arvlMsg2, targetClean, updnLine);

  return buildFallbackResponse(
    arvlMsg2,
    remainingStations,
    currentStation,
    targetClean,
    subwayId,
    updnLine,
    recptnDt,
    isExpress,
    arvlCd
  );
}

/**
 * Fallback 소요 시간을 초 단위로 계산합니다 (남은 역 수 기반).
 * @deprecated calculateSubwayETADynamic 사용 권장
 */
export function calculateFallbackTimeSec(
  _currentStation: string,
  _targetStation: string,
  arvlMsg2: string
): number {
  const fallbackStations = extractRemainingStations(arvlMsg2);
  if (fallbackStations !== null) {
    return fallbackStations * FALLBACK_SECONDS_PER_STATION;
  }
  return 4 * 60;
}
