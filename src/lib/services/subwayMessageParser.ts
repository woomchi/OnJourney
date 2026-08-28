/**
 * @fileoverview 지하철 실시간 도착 메시지(arvlMsg2) 정밀 파싱 엔진
 * 
 * 띄어쓰기 오타, 자모 결합 오류, 다중 공백, 유니코드 변종(NFD/NFC)을 정규화하고
 * 열차의 상태(진입, 도착, 출발, 전역, X전역)와 역명, 남은 역 수, 파싱 신뢰도(Confidence)를 산출합니다.
 */

export type SubwayTrainStatus = 'entering' | 'arrived' | 'departed' | 'approaching' | 'unknown';

export interface SubwayParsedMessage {
  /** 원본 메시지 */
  rawMessage: string;
  /** 정규화된 메시지 */
  normalizedMessage: string;
  /** 열차 상태 */
  status: SubwayTrainStatus;
  /** 파싱된 주 역명 (없으면 null) */
  stationName: string | null;
  /** 남은 역 수 (알 수 없으면 null) */
  remainingStations: number | null;
  /** 파싱 신뢰도 점수 (0.0 ~ 1.0) */
  confidence: number;
}

/**
 * 텍스트 유니코드 및 띄어쓰기/특수문자를 정규화합니다.
 */
export function normalizeSubwayMessage(msg: string): string {
  if (!msg) return '';
  
  return msg
    // 1. 유니코드 NFC 정규화 (자모 분리 보정)
    .normalize('NFC')
    // 2. 특수 기호/자모 연타 제거 (예: "부평ㅡ연신ㅠ" -> "부평연신")
    .replace(/[ㅡㅠㅜ\-_~!@#$%^&*()=+[\]{}|;:'",.<>/?]/g, '')
    // 3. 다중 연속 공백을 단일 공백으로 치환
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 역명 전처리: 역명 내부의 공백 제거 및 "역" 접미사 표준화
 */
function cleanStationName(name: string): string {
  if (!name) return '';
  return name.replace(/\s+/g, '').replace(/역$/, '').trim();
}

/**
 * arvlMsg2 도착 메시지를 정밀 분석합니다.
 */
export function parseSubwayArrivalMessage(
  rawMsg: string,
  targetStation?: string
): SubwayParsedMessage {
  const normalized = normalizeSubwayMessage(rawMsg);
  
  if (!normalized) {
    return {
      rawMessage: rawMsg,
      normalizedMessage: '',
      status: 'unknown',
      stationName: null,
      remainingStations: null,
      confidence: 0,
    };
  }

  const cleanTarget = targetStation ? cleanStationName(targetStation) : null;
  let status: SubwayTrainStatus = 'unknown';
  let stationName: string | null = null;
  let remainingStations: number | null = null;
  let confidence = 0.8; // 기본 신뢰도

  // 1. 목적지 역 직전/직후 상태 체크
  if (cleanTarget) {
    const compactNorm = normalized.replace(/\s+/g, '');
    const isTargetEntering = compactNorm.includes(`${cleanTarget}진입`) || compactNorm.includes(`${cleanTarget}역진입`);
    const isTargetArrived = compactNorm.includes(`${cleanTarget}도착`) || compactNorm.includes(`${cleanTarget}역도착`);
    const isTargetDeparted = compactNorm.includes(`${cleanTarget}출발`) || compactNorm.includes(`${cleanTarget}역출발`);

    if (isTargetEntering || isTargetArrived || isTargetDeparted) {
      status = isTargetEntering ? 'entering' : isTargetArrived ? 'arrived' : 'departed';
      return {
        rawMessage: rawMsg,
        normalizedMessage: normalized,
        status,
        stationName: cleanTarget,
        remainingStations: 0,
        confidence: 1.0,
      };
    }
  }

  // 2. 괄호 안 역명 우선 추출 (예: "[4]번째 전역 (진위)", "[11]번째 전역 (두정)", "[5]전역 (동인천(급))")
  const parenMatch = rawMsg.match(/\((.+)\)/);
  if (parenMatch) {
    let candidate = parenMatch[1];
    // 괄호 안에 "천안급행", "동인천(급)" 등 급행/특급 태그가 포함된 경우 제거
    candidate = candidate
      .replace(/\[?급행\]?|\(급행\)|\(급\)|\(특급\)|급행|특급|일반/g, '')
      .replace(/[()]/g, '');
    candidate = cleanStationName(candidate);
    if (candidate && candidate.length >= 2 && !['전역', '당역', '번째'].includes(candidate)) {
      stationName = candidate;
    }
  }

  // 3. 상태 키워드 패턴 매칭
  // 3-A: "X역 진입", "X역 도착", "X역 출발"
  if (!stationName) {
    const stationStatusMatch = normalized.match(/([가-힣A-Za-z0-9\s]+?)\s*(진입|도착|출발)/);
    if (stationStatusMatch) {
      const rawStn = stationStatusMatch[1].trim();
      const action = stationStatusMatch[2];
      const candidate = cleanStationName(rawStn);
      if (candidate && candidate.length >= 2 && !['전', '전역', '당역', '번째'].includes(candidate)) {
        stationName = candidate;
        status = action === '진입' ? 'entering' : action === '도착' ? 'arrived' : 'departed';
        confidence = 0.95;
      }
    }
  }

  // 3-B: "X전역", "[X]전역", "X개 역 전", "[X]번째 전역"
  const remainingMatch = normalized.match(/(?:\[(\d+)\]|(\d+))(?:\s*개?\s*역\s*전|\s*전역|\s*번째\s*전역)/);
  if (remainingMatch) {
    const numStr = remainingMatch[1] || remainingMatch[2];
    remainingStations = parseInt(numStr, 10);
    if (!isNaN(remainingStations)) {
      status = 'approaching';
      confidence = Math.max(confidence, 0.9);
    }
  } else if (normalized.includes('전역')) {
    remainingStations = 1;
    status = 'approaching';
    confidence = Math.max(confidence, 0.9);
  } else if (normalized.includes('진입') || normalized.includes('당역')) {
    remainingStations = 0;
    if (status === 'unknown') status = 'entering';
    confidence = Math.max(confidence, 0.85);
  }

  // 3-C: "X분 후 도착", "X분"
  const minutesMatch = normalized.match(/(\d+)\s*분/);
  if (minutesMatch && remainingStations === null) {
    const mins = parseInt(minutesMatch[1], 10);
    if (!isNaN(mins)) {
      // 대략 2분당 1개 역으로 추정
      remainingStations = Math.max(1, Math.round(mins / 2));
      status = 'approaching';
      confidence = 0.8;
    }
  }

  return {
    rawMessage: rawMsg,
    normalizedMessage: normalized,
    status,
    stationName,
    remainingStations,
    confidence,
  };
}

/**
 * arvlMsg2 메시지에서 현재 위치 역명을 정밀 추출합니다 (기존 헬퍼 고도화 호환).
 */
export function extractCurrentStationRobust(
  arvlMsg2: string,
  targetStation: string
): string {
  const parsed = parseSubwayArrivalMessage(arvlMsg2, targetStation);
  if (parsed.stationName) {
    return parsed.stationName;
  }
  return '';
}

/**
 * arvlMsg2 메시지에서 남은 역 수를 정밀 추출합니다 (기존 헬퍼 고도화 호환).
 */
export function extractRemainingStationsRobust(arvlMsg2: string): number | null {
  const parsed = parseSubwayArrivalMessage(arvlMsg2);
  return parsed.remainingStations;
}
