'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { sharedTransitRefreshStore, SharedRefreshState } from '@/lib/transit/sharedTransitRefreshStore';

export type AutoRefreshStatus = 'idle' | 'active' | 'paused';

export interface UseAutoRefreshOptions {
  intervalSeconds?: number;
  maxRefreshCount?: number;
  onRefresh: () => void | Promise<unknown>;
  autoStart?: boolean;
  isFetching?: boolean;
  minLoadingDurationMs?: number;
  sharedKey?: string;
}

export interface AutoRefreshState {
  status: AutoRefreshStatus;
  refreshCount: number;
  countdown: number;
  sessionId: number;
}

export interface UseAutoRefreshReturn {
  status: AutoRefreshStatus;
  refreshCount: number;
  countdown: number;
  isLoading: boolean;
  start: () => void;
  reset: () => void;
  pause: () => void;
  buttonText: string;
  buttonTitle: string;
}

export function useAutoRefresh({
  intervalSeconds = 15,
  maxRefreshCount = 3,
  onRefresh,
  autoStart = false,
  isFetching = false,
  minLoadingDurationMs = 400,
  sharedKey,
}: UseAutoRefreshOptions): UseAutoRefreshReturn {
  // 공유 키 모드인 경우
  const [sharedState, setSharedState] = useState<SharedRefreshState | null>(() =>
    sharedKey ? sharedTransitRefreshStore.getState(sharedKey) : null
  );

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!sharedKey) return;

    const unsubscribe = sharedTransitRefreshStore.subscribe(
      sharedKey,
      () => onRefreshRef.current(),
      (nextState) => {
        setSharedState(nextState);
      },
      { intervalSeconds, maxRefreshCount, minLoadingDurationMs }
    );

    return () => {
      unsubscribe();
    };
  }, [sharedKey, intervalSeconds, maxRefreshCount, minLoadingDurationMs]);

  useEffect(() => {
    if (!sharedKey) return;
    sharedTransitRefreshStore.updateFetching(sharedKey, isFetching);
  }, [sharedKey, isFetching]);

  const [state, setState] = useState<AutoRefreshState>({
    status: autoStart ? 'active' : 'idle',
    refreshCount: 0,
    countdown: intervalSeconds,
    sessionId: Date.now(),
  });

  const [isDisplayLoading, setIsDisplayLoading] = useState<boolean>(isFetching);
  const fetchStartTimeRef = useRef<number>(0);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current !== null) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    clearFinishTimer();
    setIsDisplayLoading(false);
    setState({
      status: 'idle',
      refreshCount: 0,
      countdown: intervalSeconds,
      sessionId: Date.now(),
    });
  }, [clearTimer, clearFinishTimer, intervalSeconds]);

  const pause = useCallback(() => {
    clearTimer();
    clearFinishTimer();
    setIsDisplayLoading(false);
    setState((prev) => ({
      ...prev,
      status: 'paused',
      countdown: intervalSeconds,
    }));
  }, [clearTimer, clearFinishTimer, intervalSeconds]);

  const start = useCallback(() => {
    clearTimer();
    clearFinishTimer();
    fetchStartTimeRef.current = Date.now();
    setIsDisplayLoading(true);
    setState({
      status: 'active',
      refreshCount: 0,
      countdown: intervalSeconds,
      sessionId: Date.now(),
    });
    // 시작 시 갱신 함수 실행
    onRefreshRef.current();
  }, [clearTimer, clearFinishTimer, intervalSeconds]);

  // isFetching 상태 변화 감지 및 최소 로딩 시간(minLoadingDurationMs) 보장
  useEffect(() => {
    if (isFetching) {
      clearFinishTimer();
      fetchStartTimeRef.current = Date.now();
      setIsDisplayLoading(true);
    } else {
      // isFetching이 false가 되었을 때 경과 시간 계산
      const elapsed = Date.now() - fetchStartTimeRef.current;
      const remaining = Math.max(0, minLoadingDurationMs - elapsed);

      clearFinishTimer();
      finishTimerRef.current = setTimeout(() => {
        setIsDisplayLoading(false);
        if (state.status === 'active') {
          setState((prev) => ({
            ...prev,
            countdown: intervalSeconds,
          }));
        }
      }, remaining);
    }

    return () => {
      clearFinishTimer();
    };
  }, [isFetching, minLoadingDurationMs, intervalSeconds, state.status, clearFinishTimer]);

  useEffect(() => {
    if (state.status !== 'active' || isDisplayLoading) {
      clearTimer();
      return;
    }

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.status !== 'active') return prev;

        if (prev.countdown <= 1) {
          const nextRefreshCount = prev.refreshCount + 1;
          // 갱신 함수 실행
          try {
            fetchStartTimeRef.current = Date.now();
            setIsDisplayLoading(true);
            onRefreshRef.current();
          } catch {
            // ignore
          }

          if (nextRefreshCount >= maxRefreshCount) {
            return {
              ...prev,
              status: 'paused',
              refreshCount: nextRefreshCount,
              countdown: intervalSeconds,
            };
          }

          return {
            ...prev,
            status: 'active',
            refreshCount: nextRefreshCount,
            countdown: intervalSeconds,
          };
        }

        return {
          ...prev,
          countdown: prev.countdown - 1,
        };
      });
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [state.status, state.sessionId, isDisplayLoading, maxRefreshCount, intervalSeconds, clearTimer]);

  // 언마운트 시 타이머 정리 보장
  useEffect(() => {
    return () => {
      clearTimer();
      clearFinishTimer();
    };
  }, [clearTimer, clearFinishTimer]);

  const handleStart = useCallback(() => {
    if (sharedKey) {
      sharedTransitRefreshStore.triggerRefresh(sharedKey);
      return;
    }
    start();
  }, [sharedKey, start]);

  if (sharedKey && sharedState) {
    return {
      status: sharedState.status,
      refreshCount: sharedState.refreshCount,
      countdown: sharedState.countdown,
      isLoading: sharedState.isDisplayLoading,
      start: handleStart,
      reset,
      pause,
      buttonText: sharedState.buttonText,
      buttonTitle: sharedState.buttonTitle,
    };
  }

  let buttonText = '갱신';
  let buttonTitle = `클릭 시 ${maxRefreshCount}회(${intervalSeconds * maxRefreshCount}초) 자동 갱신 시작`;

  if (isDisplayLoading) {
    buttonText = '갱신 중';
    buttonTitle = '실시간 도착 정보 확인 중...';
  } else if (state.status === 'active') {
    buttonText = `${state.countdown}초`;
    buttonTitle = `자동 갱신 진행 중 (${state.refreshCount + 1}/${maxRefreshCount}회)`;
  } else if (state.status === 'paused') {
    buttonText = '갱신';
    buttonTitle = `${maxRefreshCount}회 자동 갱신 완료 (클릭 시 갱신 재개)`;
  }

  return {
    status: state.status,
    refreshCount: state.refreshCount,
    countdown: state.countdown,
    isLoading: isDisplayLoading,
    start: handleStart,
    reset,
    pause,
    buttonText,
    buttonTitle,
  };
}
