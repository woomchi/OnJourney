import type { Journey } from '@/types/journey';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

export function formatJourneyDate(dateStr: string) {
  if (!dateStr) return '';
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) {
      if (!dateStr.includes('-')) return dateStr;
      const [year, month, day] = dateStr.split('-');
      return `${year}년 ${Number(month)}월 ${Number(day)}일`;
    }
    return format(date, 'yyyy년 M월 d일', { locale: ko });
  } catch (e) {
    return dateStr;
  }
}

export function sortJourneysByStoredOrder(journeys: Journey[], userId: string): Journey[] {
  if (typeof window === 'undefined') return journeys;
  const orderStr = localStorage.getItem(`journey_order_${userId}`);
  if (!orderStr) return journeys;
  try {
    const orderIds = JSON.parse(orderStr) as string[];
    const idToIndex = new Map(orderIds.map((id, index) => [id, index]));

    return [...journeys].sort((a, b) => {
      const indexA = idToIndex.has(a.id) ? idToIndex.get(a.id)! : -1;
      const indexB = idToIndex.has(b.id) ? idToIndex.get(b.id)! : -1;

      if (indexA === -1 && indexB === -1) {
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
      }
      if (indexA === -1) return -1; // New journeys to the top
      if (indexB === -1) return 1;
      return indexA - indexB;
    });
  } catch (e) {
    return journeys;
  }
}

export function removeJourneysFromStoredOrder(userId: string, deletedIds: string[]): void {
  if (typeof window === 'undefined' || !deletedIds.length) return;
  const key = `journey_order_${userId}`;
  const orderStr = localStorage.getItem(key);
  if (!orderStr) return;
  try {
    const orderIds = JSON.parse(orderStr) as string[];
    const filtered = orderIds.filter((id) => !deletedIds.includes(id));
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to update stored journey order:', e);
  }
}

export function formatDistance(meters: number) {
  if (meters < 10) return '';
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}분`;
}
