/**
 * @fileoverview 여정(Journey) 관련 공통 유틸리티 함수 모음
 *
 * - 날짜 포맷 변환
 * - localStorage 기반 여정 순서 관리
 * - 거리·시간 포맷 변환
 */

import type { Journey } from '@/types/journey';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** localStorage에 저장되는 여정 순서 키의 접두사 */
const JOURNEY_ORDER_KEY_PREFIX = 'journey_order_';

/** 거리 표시 최소 임계값 (미터) — 이하는 표시하지 않음 */
const DISTANCE_DISPLAY_MIN_METERS = 10;

/** 거리 단위 전환 기준 (미터) — 이상은 km로 표시 */
const DISTANCE_KM_THRESHOLD_METERS = 1_000;

/** 소요 시간 표시 최소 임계값 (밀리초) — 이하는 표시하지 않음 */
const DURATION_DISPLAY_MIN_MS = 1_000;

/** 소요 시간 분 단위 전환 기준 (초) */
const DURATION_MINUTES_THRESHOLD_SECONDS = 60;

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

/**
 * 사용자별 여정 순서를 저장하는 localStorage 키를 생성합니다.
 *
 * 매직 스트링(`journey_order_${userId}`)을 함수로 추출하여
 * 키 형식 변경 시 단일 지점에서 수정 가능하도록 합니다.
 */
function getJourneyOrderKey(userId: string): string {
  return `${JOURNEY_ORDER_KEY_PREFIX}${userId}`;
}

// ─── 공개 유틸리티 ────────────────────────────────────────────────────────────

/**
 * ISO 날짜 문자열을 한국어 형식으로 포맷합니다.
 *
 * @param dateStr ISO 8601 날짜 문자열 (예: '2024-07-15')
 * @returns 포맷된 날짜 문자열 (예: '2024년 7월 15일'), 입력 오류 시 원본 반환
 *
 * @example
 * formatJourneyDate('2024-07-15') // → '2024년 7월 15일'
 */
export function formatJourneyDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = parseISO(dateStr);

    if (isNaN(date.getTime())) {
      // ISO 파싱 실패 시 "YYYY-MM-DD" 형식으로 직접 분해
      if (!dateStr.includes('-')) return dateStr;
      const [year, month, day] = dateStr.split('-');
      return `${year}년 ${Number(month)}월 ${Number(day)}일`;
    }

    return format(date, 'yyyy년 M월 d일', { locale: ko });
  } catch {
    return dateStr;
  }
}

/**
 * localStorage에 저장된 순서를 기준으로 여정 배열을 정렬합니다.
 *
 * - 저장된 순서에 없는 새 여정은 목록 맨 앞으로 배치합니다.
 * - 두 여정 모두 순서에 없으면 최근 수정일 기준으로 정렬합니다.
 * - SSR 환경(window 없음)에서는 원본 배열을 그대로 반환합니다.
 *
 * @param journeys 정렬할 여정 배열
 * @param userId   현재 사용자 ID (localStorage 키 생성에 사용)
 */
export function sortJourneysByStoredOrder(journeys: Journey[], userId: string): Journey[] {
  if (typeof window === 'undefined') return journeys;

  const orderStr = localStorage.getItem(getJourneyOrderKey(userId));
  if (!orderStr) return journeys;

  try {
    const orderIds = JSON.parse(orderStr) as string[];
    const idToIndex = new Map(orderIds.map((id, index) => [id, index]));

    return [...journeys].sort((a, b) => {
      const indexA = idToIndex.has(a.id) ? idToIndex.get(a.id)! : -1;
      const indexB = idToIndex.has(b.id) ? idToIndex.get(b.id)! : -1;

      // 둘 다 저장된 순서에 없으면 최근 수정일 기준 내림차순
      if (indexA === -1 && indexB === -1) {
        const timeA = new Date(b.updated_at || b.created_at || 0).getTime();
        const timeB = new Date(a.updated_at || a.created_at || 0).getTime();
        return timeA - timeB;
      }

      if (indexA === -1) return -1; // 새 여정을 맨 앞으로
      if (indexB === -1) return 1;

      return indexA - indexB;
    });
  } catch {
    return journeys;
  }
}

/**
 * localStorage에서 삭제된 여정 ID를 순서 목록에서 제거합니다.
 *
 * 여정 삭제 후 순서 목록이 비대해지는 것을 방지합니다.
 *
 * @param userId     현재 사용자 ID
 * @param deletedIds 삭제된 여정 ID 배열
 */
export function removeJourneysFromStoredOrder(userId: string, deletedIds: string[]): void {
  if (typeof window === 'undefined' || deletedIds.length === 0) return;

  const key = getJourneyOrderKey(userId);
  const orderStr = localStorage.getItem(key);
  if (!orderStr) return;

  try {
    const orderIds = JSON.parse(orderStr) as string[];
    const filtered = orderIds.filter((id) => !deletedIds.includes(id));
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    console.error('[journeyUtils] 여정 순서 목록 업데이트 실패:', key);
  }
}

/**
 * 미터 단위 거리를 사람이 읽기 쉬운 형식으로 변환합니다.
 *
 * - 10m 미만: 빈 문자열 반환 (노이즈 방지)
 * - 10m 이상 ~ 1km 미만: "Xm" 형식
 * - 1km 이상: "X.Xkm" 형식
 *
 * @param meters 거리 (미터)
 *
 * @example
 * formatDistance(500)   // → "500m"
 * formatDistance(1500)  // → "1.5km"
 * formatDistance(5)     // → ""
 */
export function formatDistance(meters?: number | null): string {
  if (meters == null || isNaN(meters) || meters < DISTANCE_DISPLAY_MIN_METERS) return '';
  if (meters < DISTANCE_KM_THRESHOLD_METERS) return `${Math.round(meters)}m`;
  return `${(meters / DISTANCE_KM_THRESHOLD_METERS).toFixed(1)}km`;
}

/**
 * km 단위 거리를 사람이 읽기 쉬운 형식으로 변환합니다.
 *
 * - null/undefined/0 이하: 빈 문자열 반환
 * - 1km 미만: "Xm" 형식
 * - 1km 이상: "X.Xkm" 형식
 *
 * @param km 거리 (킬로미터)
 *
 * @example
 * formatKmDistance(0.5)   // → "500m"
 * formatKmDistance(137.4) // → "137.4km"
 */
export function formatKmDistance(km?: number | null): string {
  if (km == null || isNaN(km) || km <= 0) return '';
  if (km >= 1) return `${km.toFixed(1)}km`;
  const meters = Math.round(km * 1000);
  if (meters < DISTANCE_DISPLAY_MIN_METERS) return '';
  return `${meters}m`;
}


/**
 * 밀리초 단위 소요 시간을 사람이 읽기 쉬운 형식으로 변환합니다.
 *
 * - 1초 미만: 빈 문자열 반환
 * - 1초 이상 ~ 60초 미만: "X초" 형식
 * - 60초 이상: "X분" 형식
 *
 * @param ms 소요 시간 (밀리초)
 *
 * @example
 * formatDuration(30000)  // → "30초"
 * formatDuration(90000)  // → "2분"
 * formatDuration(500)    // → ""
 */
export function formatDuration(ms?: number | null): string {
  if (ms == null || isNaN(ms) || ms < DURATION_DISPLAY_MIN_MS) return '';
  const seconds = Math.round(ms / DURATION_DISPLAY_MIN_MS);
  if (seconds < DURATION_MINUTES_THRESHOLD_SECONDS) return `${seconds}초`;
  return formatDurationMinutes(Math.round(seconds / DURATION_MINUTES_THRESHOLD_SECONDS));
}

/**
 * 분 단위 소요 시간을 사람이 읽기 쉬운 형식으로 변환합니다.
 *
 * - 60분 미만: "X분" 형식
 * - 60분 이상: "X시간 Y분" (0분인 경우 "X시간") 형식
 *
 * @param minutes 분 단위 소요 시간
 *
 * @example
 * formatDurationMinutes(35)  // → "35분"
 * formatDurationMinutes(60)  // → "1시간"
 * formatDurationMinutes(171) // → "2시간 51분"
 */
export function formatDurationMinutes(minutes?: number | null): string {
  if (minutes == null || isNaN(minutes) || minutes <= 0) return '0분';
  const mins = Math.round(minutes);
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hours}시간`;
  return `${hours}시간 ${remainingMins}분`;
}

/**
 * 장소(Place)의 주소, 지역명, 좌표 정보를 기반으로 17개 지자체 ID를 정밀 추론합니다.
 */
export function inferRegionFromPlace(place?: any): string {
  if (!place) return 'seoul';
  if (place.region && typeof place.region === 'string') {
    return place.region.toLowerCase();
  }

  const addr = (place.address || place.address_name || '').trim();
  const name = (place.place_name || '').trim();
  const fullText = `${addr} ${name}`;

  if (fullText.includes('부산')) return 'busan';
  if (fullText.includes('대구')) return 'daegu';
  if (fullText.includes('인천')) return 'incheon';
  if (fullText.includes('광주')) return 'gwangju';
  if (fullText.includes('대전')) return 'daejeon';
  if (fullText.includes('울산')) return 'ulsan';
  if (fullText.includes('세종')) return 'sejong';
  const GYEONGGI_CITIES = [
    '수원', '성남', '의정부', '안양', '부천', '광명', '평택', '동두천',
    '안산', '고양', '과천', '구리', '남양주', '오산', '시흥', '군포',
    '의왕', '하남', '용인', '파주', '이천', '안성', '김포', '화성',
    '양주', '포천', '여주', '연천', '가평', '양평'
  ];
  if (fullText.includes('경기') || GYEONGGI_CITIES.some(city => fullText.includes(city))) return 'gyeonggi';
  if (fullText.includes('강원')) return 'gangwon';
  if (fullText.includes('충북') || fullText.includes('충청북도')) return 'chungbuk';
  if (fullText.includes('충남') || fullText.includes('충청남도')) return 'chungnam';
  if (fullText.includes('전북') || fullText.includes('전라북도') || fullText.includes('전북특별자치도')) return 'jeonbuk';
  if (fullText.includes('전남') || fullText.includes('전라남도')) return 'jeonnam';
  if (fullText.includes('경북') || fullText.includes('경상북도') || fullText.includes('경주')) return 'gyeongbuk';
  if (fullText.includes('경남') || fullText.includes('경상남도')) return 'gyeongnam';
  if (fullText.includes('제주')) return 'jeju';

  // 위도/경도 기반 경계 fallback (부산, 대구, 인천 등)
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!isNaN(lat) && !isNaN(lng)) {
    if (lat >= 35.0 && lat <= 35.35 && lng >= 128.8 && lng <= 129.3) return 'busan';
    if (lat >= 35.7 && lat <= 36.0 && lng >= 128.4 && lng <= 128.8) return 'daegu';
    if (lat >= 37.35 && lat <= 37.65 && lng >= 126.5 && lng <= 126.85) return 'incheon';
  }

  return 'seoul';
}
