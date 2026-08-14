'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export type AutoRefreshStatus = 'idle' | 'active' | 'paused';

export interface UseAutoRefreshOptions {
  intervalSeconds?: number;
  maxRefreshCount?: number;
  onRefresh: () => void | Promise<unknown>;
  autoStart?: boolean;
}

export interface AutoRefreshState {
  status: AutoRefreshStatus;
  refreshCount: number;
  countdown: number;
}

export interface UseAutoRefreshReturn {
  status: AutoRefreshStatus;
  refreshCount: number;
  countdown: number;
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
}: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const [state, setState] = useState<AutoRefreshState>({
    status: autoStart ? 'active' : 'idle',
    refreshCount: 0,
    countdown: intervalSeconds,
  });

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setState({
      status: 'idle',
      refreshCount: 0,
      countdown: intervalSeconds,
    });
  }, [clearTimer, intervalSeconds]);

  const pause = useCallback(() => {
    clearTimer();
    setState((prev) => ({
      ...prev,
      status: 'paused',
      countdown: intervalSeconds,
    }));
  }, [clearTimer, intervalSeconds]);

  const start = useCallback(() => {
    clearTimer();
    setState({
      status: 'active',
      refreshCount: 0,
      countdown: intervalSeconds,
    });
    // 시작 시 즉시 1회 갱신
    onRefreshRef.current();
  }, [clearTimer, intervalSeconds]);

  useEffect(() => {
    if (state.status !== 'active') {
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
            onRefreshRef.current();
          } catch {
            // ignore
          }

          if (nextRefreshCount >= maxRefreshCount) {
            return {
              status: 'paused',
              refreshCount: nextRefreshCount,
              countdown: intervalSeconds,
            };
          }

          return {
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
  }, [state.status, maxRefreshCount, intervalSeconds, clearTimer]);

  // 언마운트 시 타이머 정리 보장
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  let buttonText = '갱신';
  let buttonTitle = `클릭 시 ${maxRefreshCount}회(${intervalSeconds * maxRefreshCount}초) 자동 갱신 시작`;

  if (state.status === 'active') {
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
    start,
    reset,
    pause,
    buttonText,
    buttonTitle,
  };
}
