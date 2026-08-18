/**
 * 10자리(초) 또는 13자리(밀리초) 타임스탬프를 안전하게 밀리초(ms) 단위로 정규화합니다.
 */
export function normalizeTimestampToMs(timestamp?: number): number {
  if (!timestamp || isNaN(timestamp)) {
    return Date.now();
  }
  // 10자리 Unix timestamp(초 단위, 예: 1787032800)인 경우 1000을 곱해 밀리초로 변환
  if (timestamp < 1e11) {
    return timestamp * 1000;
  }
  return timestamp;
}

/**
 * 타임스탬프(ms 또는 초)로부터 KST(한국 표준시, Asia/Seoul) 기준의 각 날짜/시간 요소를 분해하여 반환합니다.
 * 서버/클라이언트 환경의 타임존(UTC 등)과 무관하게 항상 일관된 KST 기준 시간을 제공합니다.
 */
export function getKstDateComponents(departureTime?: number) {
  const ms = normalizeTimestampToMs(departureTime);
  const date = new Date(ms);

  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const year = getPart('year');
  const month = getPart('month').padStart(2, '0');
  const day = getPart('day').padStart(2, '0');
  let hour = parseInt(getPart('hour'), 10);
  if (hour === 24) hour = 0; // hour12: false의 24시 예외 처리
  const hours = String(hour).padStart(2, '0');
  const minutes = getPart('minute').padStart(2, '0');

  // KST 기준 요일 계산 (0: 일요일, 6: 토요일)
  const kstDate = new Date(ms + (9 * 60 + date.getTimezoneOffset()) * 60 * 1000);
  const dayOfWeek = kstDate.getDay();

  return {
    year,
    month,
    day,
    hours,
    minutes,
    hour,
    dayOfWeek,
    formatted: `${year}${month}${day}${hours}${minutes}`,
  };
}

/**
 * departureTime 또는 현재 시각을 KST(한국 표준시) 기준 yyyyMMddHHmm 12자리 문자열로 변환합니다.
 * ODsay API 등의 SearchTime 파라미터 규격에 완벽히 부합합니다.
 */
export function toKstSearchTime(departureTime?: number): string {
  const { formatted } = getKstDateComponents(departureTime);
  return formatted;
}

/**
 * 시간대 분류 함수: 평일/주말, 낮/밤 구분하여 캐시 키 생성 (KST 기준)
 */
export function getTimeSlot(departureTime?: number): string {
  const { hour, dayOfWeek } = getKstDateComponents(departureTime);

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isNight = hour >= 23 || hour < 6;

  if (isWeekend) {
    return isNight ? 'weekend-night' : 'weekend-day';
  } else {
    return isNight ? 'weekday-night' : 'weekday-day';
  }
}

/**
 * 출발 시간 기반 시간 그룹화 함수 (3시간 단위, KST 기준)
 */
export function getTimeGroup(departureTime?: number): string {
  if (!departureTime) {
    return getTimeSlot();
  }

  const { hour } = getKstDateComponents(departureTime);
  const group = Math.floor(hour / 3); // 0-7 (8개 그룹, 3시간 단위)
  return `time-group-${group}`;
}

/**
 * 동적 캐시 만료 시간 함수: 시간대별 캐시 기간 반환 (KST 기준)
 */
export function getCacheDuration(departureTime?: number): number {
  const { hour } = getKstDateComponents(departureTime);

  // 밤 시간대 (23:00-06:00): 30분 (1800초) - 더 자주 갱신
  if (hour >= 23 || hour < 6) {
    return 1800;
  }

  // 낮 시간대 (06:00-23:00): 4시간 (14400초) - 길게 캐싱
  return 14400;
}
