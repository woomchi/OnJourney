/**
 * 시간대 분류 함수: 평일/주말, 낮/밤 구분하여 캐시 키 생성
 */
export function getTimeSlot(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0: 일요일, 6: 토요일
  
  const isWeekend = day === 0 || day === 6;
  const isNight = hour >= 23 || hour < 6;
  
  if (isWeekend) {
    return isNight ? 'weekend-night' : 'weekend-day';
  } else {
    return isNight ? 'weekday-night' : 'weekday-day';
  }
}

/**
 * 출발 시간 기반 시간 그룹화 함수 (3시간 단위)
 */
export function getTimeGroup(departureTime?: number): string {
  if (!departureTime) {
    return getTimeSlot(); // 출발 시간이 없으면 현재 시간대 사용
  }
  
  const date = new Date(departureTime * 1000); // Unix timestamp to Date
  const hour = date.getHours();
  const group = Math.floor(hour / 3); // 0-7 (8개 그룹, 3시간 단위)
  return `time-group-${group}`;
}

/**
 * 동적 캐시 만료 시간 함수: 시간대별 캐시 기간 반환
 */
export function getCacheDuration(departureTime?: number): number {
  if (!departureTime) {
    departureTime = Math.floor(Date.now() / 1000);
  }
  
  const date = new Date(departureTime * 1000);
  const hour = date.getHours();
  
  // 밤 시간대 (23:00-06:00): 30분 (1800초) - 더 자주 갱신
  if (hour >= 23 || hour < 6) {
    return 1800;
  }
  
  // 낮 시간대 (06:00-23:00): 4시간 (14400초) - 길게 캐싱
  return 14400;
}
