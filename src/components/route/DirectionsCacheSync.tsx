'use client';

import { useEffect, useMemo } from 'react';
import { useJourneyStore } from '@/stores/journey-store';
import { useJourneyDirectionsCache } from '@/hooks/queries/useDirections';

/**
 * @fileoverview 단일 경로 캐시 동기화 헤드리스 컴포넌트
 *
 * 앱 전체에서 useJourneyDirectionsCache(places) 쿼리를 단 1회만 인스턴스화하여,
 * 5개 컴포넌트에서 각각 수십 개의 React Query Observer가 중복 생성되는 병목을 방지합니다.
 * 계산된 directionsCache는 useJourneyStore에 저장되어 자식 컴포넌트들이 효율적으로 구독합니다.
 */
export function DirectionsCacheSync() {
  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const places = useMemo(() => activeJourney?.places ?? [], [activeJourney?.places]);
  const directionsCache = useJourneyDirectionsCache(places);
  const setDirectionsCache = useJourneyStore((state) => state.setDirectionsCache);

  useEffect(() => {
    setDirectionsCache(directionsCache);
  }, [directionsCache, setDirectionsCache]);

  return null;
}
