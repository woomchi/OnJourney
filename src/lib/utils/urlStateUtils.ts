/**
 * @fileoverview URL 파라미터와 OnJourney 앱 상태 간의 직렬화/역직렬화 유틸리티
 */

import type { FocusedSegment, FocusedStep } from '@/types/journey';

export interface UrlState {
  journeyId: string | null;
  focusedSegment: FocusedSegment | null;
  focusedStep: FocusedStep | null;
  alternativeSegment: FocusedSegment | null;
  isSearchMode: boolean;
}

/**
 * URL SearchParams 또는 쿼리 스트링으로부터 앱 상태를 파싱합니다.
 */
export function parseUrlState(searchParamsOrQuery: URLSearchParams | string): UrlState {
  const params =
    typeof searchParamsOrQuery === 'string'
      ? new URLSearchParams(searchParamsOrQuery.startsWith('?') ? searchParamsOrQuery.slice(1) : searchParamsOrQuery)
      : searchParamsOrQuery;

  const journeyId = params.get('j') || null;
  const segmentParam = params.get('s');
  const stepParam = params.get('st');
  const altParam = params.get('alt');
  const isSearchMode = params.get('search') === '1';

  let focusedSegment: FocusedSegment | null = null;
  if (segmentParam) {
    const [originId, destId] = segmentParam.split(':');
    if (originId && destId) {
      focusedSegment = { originId, destId };
    }
  }

  let focusedStep: FocusedStep | null = null;
  if (stepParam) {
    const [originId, destId, stepIndexStr] = stepParam.split(':');
    const stepIndex = parseInt(stepIndexStr, 10);
    if (originId && destId && !isNaN(stepIndex) && stepIndex >= 0) {
      focusedStep = { originId, destId, stepIndex };
    }
  }

  let alternativeSegment: FocusedSegment | null = null;
  if (altParam) {
    const [originId, destId] = altParam.split(':');
    if (originId && destId) {
      alternativeSegment = { originId, destId };
    }
  }

  return {
    journeyId,
    focusedSegment,
    focusedStep,
    alternativeSegment,
    isSearchMode,
  };
}

/**
 * 현재 앱 상태를 URLSearchParams로 직렬화합니다.
 */
export function serializeUrlState(state: {
  journeyId?: string | null;
  focusedSegment?: FocusedSegment | null;
  focusedStep?: FocusedStep | null;
  alternativeSegment?: FocusedSegment | null;
  isSearchMode?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();

  if (state.journeyId) {
    params.set('j', state.journeyId);
  }
  if (state.focusedSegment?.originId && state.focusedSegment?.destId) {
    params.set('s', `${state.focusedSegment.originId}:${state.focusedSegment.destId}`);
  }
  if (
    state.focusedStep?.originId &&
    state.focusedStep?.destId &&
    typeof state.focusedStep.stepIndex === 'number'
  ) {
    params.set('st', `${state.focusedStep.originId}:${state.focusedStep.destId}:${state.focusedStep.stepIndex}`);
  }
  if (state.alternativeSegment?.originId && state.alternativeSegment?.destId) {
    params.set('alt', `${state.alternativeSegment.originId}:${state.alternativeSegment.destId}`);
  }
  if (state.isSearchMode) {
    params.set('search', '1');
  }

  return params;
}
