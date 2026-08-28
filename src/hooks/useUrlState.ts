/**
 * @fileoverview URL 파라미터 기반 상태 관리 훅
 *
 * 브라우저 URL(Query String)과 Zustand 스토어의 핵심 UI/여정 상태를 양방향으로 동기화합니다.
 * - `j`: 활성 여정 ID (UUID)
 * - `s`: 포커스된 구간 (originId:destId)
 * - `st`: 포커스된 스텝 (originId:destId:stepIndex)
 * - `alt`: 대안 경로 탐색 구간 (originId:destId)
 * - `search`: 장소 검색 모드 ('1')
 *
 * 브라우저 뒤로가기/앞으로가기 네비게이션을 지원하며, 딥링크 접근 시 여정 데이터를 복원합니다.
 */

"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useJourneyStore } from '@/stores/journey-store';
import { useAuth } from '@/providers/AuthProvider';
import { useDialog } from '@/providers/DialogProvider';
import { fetchJourneyById } from '@/lib/journeys/index';
import { parseUrlState, serializeUrlState } from '@/lib/utils/urlStateUtils';

export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, openAuthModal } = useAuth();
  const { alert } = useDialog();

  // Zustand 상태 및 액션
  const activeJourney = useJourneyStore((state) => state.activeJourney);
  const journeys = useJourneyStore((state) => state.journeys);
  const focusedSegment = useJourneyStore((state) => state.focusedSegment);
  const focusedStep = useJourneyStore((state) => state.focusedStep);
  const alternativeSegment = useJourneyStore((state) => state.alternativeSegment);
  const isSearchMode = useJourneyStore((state) => state.isSearchMode);

  const setActiveJourney = useJourneyStore((state) => state.setActiveJourney);
  const clearJourney = useJourneyStore((state) => state.clearJourney);
  const setFocusedSegment = useJourneyStore((state) => state.setFocusedSegment);
  const setFocusedStep = useJourneyStore((state) => state.setFocusedStep);
  const setAlternativeSegment = useJourneyStore((state) => state.setAlternativeSegment);
  const openSearchMode = useJourneyStore((state) => state.openSearchMode);
  const closeSearchMode = useJourneyStore((state) => state.closeSearchMode);

  // 동기화 플래그 및 이전 상태 추적 (무한 루프 방지)
  const isApplyingUrlToStateRef = useRef(false);
  const prevUrlSearchStringRef = useRef<string>('');
  const prevJourneyIdRef = useRef<string | null>(activeJourney?.id ?? null);
  const isInitialLoadRef = useRef(true);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. URL SearchParams -> Zustand 상태 복원 (초기 로드 / 뒤로가기 / 앞으로가기)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;

    const currentSearchString = searchParams.toString();
    if (currentSearchString === prevUrlSearchStringRef.current && !isInitialLoadRef.current) {
      return;
    }
    prevUrlSearchStringRef.current = currentSearchString;

    const parsed = parseUrlState(searchParams);

    const syncStateFromUrl = async () => {
      isApplyingUrlToStateRef.current = true;

      try {
        // [A] 여정 동기화
        if (parsed.journeyId) {
          if (!activeJourney || activeJourney.id !== parsed.journeyId) {
            // 1) 메모리 상의 journeys 목록에서 검색
            const existingJourney = journeys.find((j) => j.id === parsed.journeyId);
            if (existingJourney) {
              setActiveJourney(existingJourney);
            } else if (user) {
              // 2) 목록에 없으면 DB에서 직접 단일 조회
              const fetched = await fetchJourneyById(parsed.journeyId);
              if (fetched) {
                setActiveJourney(fetched);
              } else {
                // 타인의 여정 또는 삭제된 여정 접근
                await alert({
                  title: '여정을 찾을 수 없습니다',
                  message: '존재하지 않거나 접근 권한이 없는 여정입니다.',
                  icon: 'warning',
                });
                router.replace(pathname || '/', { scroll: false });
                clearJourney();
                return;
              }
            } else {
              // 비로그인 상태에서 여정 링크 접근 시
              openAuthModal();
            }
          }
        } else if (activeJourney) {
          // URL에 j가 없는데 활성 여정이 세팅되어 있는 경우 (예: 뒤로가기로 목록 복귀)
          clearJourney();
        }

        // [B] 구간 포커스 동기화
        if (parsed.focusedSegment) {
          if (
            !focusedSegment ||
            focusedSegment.originId !== parsed.focusedSegment.originId ||
            focusedSegment.destId !== parsed.focusedSegment.destId
          ) {
            setFocusedSegment(parsed.focusedSegment);
          }
        } else if (focusedSegment) {
          setFocusedSegment(null);
        }

        // [C] 세부 스텝 동기화
        if (parsed.focusedStep) {
          if (
            !focusedStep ||
            focusedStep.originId !== parsed.focusedStep.originId ||
            focusedStep.destId !== parsed.focusedStep.destId ||
            focusedStep.stepIndex !== parsed.focusedStep.stepIndex
          ) {
            setFocusedStep(parsed.focusedStep);
          }
        } else if (focusedStep) {
          setFocusedStep(null);
        }

        // [D] 대안 경로 구간 동기화
        if (parsed.alternativeSegment) {
          if (
            !alternativeSegment ||
            alternativeSegment.originId !== parsed.alternativeSegment.originId ||
            alternativeSegment.destId !== parsed.alternativeSegment.destId
          ) {
            setAlternativeSegment(parsed.alternativeSegment);
          }
        } else if (alternativeSegment) {
          setAlternativeSegment(null);
        }

        // [E] 검색 모드 동기화
        if (parsed.isSearchMode && !isSearchMode) {
          openSearchMode();
        } else if (!parsed.isSearchMode && isSearchMode) {
          closeSearchMode();
        }
      } finally {
        isInitialLoadRef.current = false;
        // 상태 전파 후 플래그 해제
        setTimeout(() => {
          isApplyingUrlToStateRef.current = false;
        }, 50);
      }
    };

    syncStateFromUrl();
  }, [
    searchParams,
    authLoading,
    user,
    journeys,
    activeJourney,
    focusedSegment,
    focusedStep,
    alternativeSegment,
    isSearchMode,
    pathname,
    router,
    alert,
    openAuthModal,
    setActiveJourney,
    clearJourney,
    setFocusedSegment,
    setFocusedStep,
    setAlternativeSegment,
    openSearchMode,
    closeSearchMode,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Zustand 상태 -> URL SearchParams Mirror 동기화
  // ─────────────────────────────────────────────────────────────────────────────
  const updateUrlFromState = useCallback(() => {
    if (isApplyingUrlToStateRef.current || isInitialLoadRef.current) {
      return;
    }

    const currentJourneyId = activeJourney?.id ?? null;
    const isJourneyChanged = currentJourneyId !== prevJourneyIdRef.current;
    prevJourneyIdRef.current = currentJourneyId;

    const params = serializeUrlState({
      journeyId: activeJourney?.id,
      focusedSegment,
      focusedStep,
      alternativeSegment,
      isSearchMode,
    });

    const newQueryString = params.toString();
    const currentQueryString = searchParams.toString();

    if (newQueryString === currentQueryString) {
      return;
    }

    const newUrl = newQueryString ? `${pathname}?${newQueryString}` : (pathname || '/');
    prevUrlSearchStringRef.current = newQueryString;

    // 여정 전환 시에는 push (뒤로가기로 이전 여정/목록 복귀 지원)
    // 세부 패널/검색/스텝 조작 시에는 replace (히스토리 과다 누적 방지)
    if (isJourneyChanged) {
      router.push(newUrl, { scroll: false });
    } else {
      router.replace(newUrl, { scroll: false });
    }
  }, [
    activeJourney,
    focusedSegment,
    focusedStep,
    alternativeSegment,
    isSearchMode,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    updateUrlFromState();
  }, [updateUrlFromState]);
}
