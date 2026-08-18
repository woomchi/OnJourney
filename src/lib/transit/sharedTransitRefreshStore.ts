'use client';

export interface SharedRefreshState {
  countdown: number;
  isDisplayLoading: boolean;
  isFetching: boolean;
  buttonText: string;
  buttonTitle: string;
  refreshCount: number;
  status: 'idle' | 'active' | 'paused';
}

interface KeySession {
  state: SharedRefreshState;
  subscribers: Set<(state: SharedRefreshState) => void>;
  onRefreshHandlers: Set<() => void | Promise<unknown>>;
  timer: NodeJS.Timeout | null;
  finishTimer: NodeJS.Timeout | null;
  intervalSeconds: number;
  maxRefreshCount: number;
  minLoadingDurationMs: number;
  fetchStartTime: number;
}

class SharedTransitRefreshStore {
  private sessions = new Map<string, KeySession>();

  private getOrCreateSession(key: string, intervalSeconds = 15, maxRefreshCount = 3, minLoadingDurationMs = 400): KeySession {
    let session = this.sessions.get(key);
    if (!session) {
      session = {
        state: {
          countdown: intervalSeconds,
          isDisplayLoading: false,
          isFetching: false,
          buttonText: `${intervalSeconds}초`,
          buttonTitle: `실시간 정보 (${intervalSeconds}초 후 자동 갱신, 클릭하여 즉시 갱신)`,
          refreshCount: 0,
          status: 'active',
        },
        subscribers: new Set(),
        onRefreshHandlers: new Set(),
        timer: null,
        finishTimer: null,
        intervalSeconds,
        maxRefreshCount,
        minLoadingDurationMs,
        fetchStartTime: 0,
      };
      this.sessions.set(key, session);
      this.startTimer(key);
    }
    return session;
  }

  private notify(key: string) {
    const session = this.sessions.get(key);
    if (!session) return;
    session.subscribers.forEach((cb) => cb({ ...session.state }));
  }

  private updateButtonTexts(session: KeySession) {
    if (session.state.isDisplayLoading) {
      session.state.buttonText = '갱신 중';
      session.state.buttonTitle = '실시간 정보를 불러오는 중입니다...';
    } else if (session.state.status === 'paused') {
      session.state.buttonText = '갱신';
      session.state.buttonTitle = '자동 갱신 일시정지 (클릭하여 재개)';
    } else if (session.state.status === 'idle') {
      session.state.buttonText = '갱신';
      session.state.buttonTitle = '클릭하여 실시간 정보 갱신';
    } else {
      session.state.buttonText = `${session.state.countdown}초`;
      session.state.buttonTitle = `실시간 정보 (${session.state.countdown}초 후 자동 갱신, 클릭하여 즉시 갱신)`;
    }
  }

  private startTimer(key: string) {
    const session = this.sessions.get(key);
    if (!session || session.timer) return;

    session.timer = setInterval(() => {
      // 로딩 중에는 카운트다운 일시정지
      if (session.state.isDisplayLoading || session.state.isFetching) {
        return;
      }

      if (session.state.countdown > 1) {
        session.state.countdown -= 1;
        this.updateButtonTexts(session);
        this.notify(key);
      } else {
        // 타이머 만료 -> 갱신 트리거
        if (session.state.refreshCount < session.maxRefreshCount - 1) {
          session.state.refreshCount += 1;
          session.state.countdown = session.intervalSeconds;
          this.triggerRefresh(key);
        } else {
          // 최대 갱신 횟수 도달 시 일시정지
          session.state.status = 'paused';
          session.state.countdown = session.intervalSeconds;
          this.updateButtonTexts(session);
          this.notify(key);
          this.stopTimer(key);
        }
      }
    }, 1000);
  }

  private stopTimer(key: string) {
    const session = this.sessions.get(key);
    if (!session) return;
    if (session.timer) {
      clearInterval(session.timer);
      session.timer = null;
    }
  }

  public subscribe(
    key: string,
    onRefresh: () => void | Promise<unknown>,
    callback: (state: SharedRefreshState) => void,
    options?: { intervalSeconds?: number; maxRefreshCount?: number; minLoadingDurationMs?: number }
  ): () => void {
    const session = this.getOrCreateSession(
      key,
      options?.intervalSeconds ?? 15,
      options?.maxRefreshCount ?? 3,
      options?.minLoadingDurationMs ?? 400
    );

    session.subscribers.add(callback);
    session.onRefreshHandlers.add(onRefresh);

    // 즉시 현재 상태 통보
    callback({ ...session.state });

    // 구독 해제 반환 함수
    return () => {
      session.subscribers.delete(callback);
      session.onRefreshHandlers.delete(onRefresh);

      // 더 이상 구독자가 없으면 세션 및 타이머 완전 정리
      if (session.subscribers.size === 0) {
        this.stopTimer(key);
        if (session.finishTimer) {
          clearTimeout(session.finishTimer);
          session.finishTimer = null;
        }
        session.onRefreshHandlers.clear();
        this.sessions.delete(key);
      }
    };
  }

  public updateFetching(key: string, isFetching: boolean) {
    const session = this.sessions.get(key);
    if (!session) return;

    session.state.isFetching = isFetching;

    if (isFetching) {
      session.fetchStartTime = Date.now();
      session.state.isDisplayLoading = true;
      if (session.finishTimer) {
        clearTimeout(session.finishTimer);
        session.finishTimer = null;
      }
      this.updateButtonTexts(session);
      this.notify(key);

      // 💡 안전장치: 어떤 이유로든 isFetching이 3초 이상 false로 전환되지 않을 경우 강제 해제
      session.finishTimer = setTimeout(() => {
        if (session.state.isDisplayLoading) {
          session.state.isDisplayLoading = false;
          session.state.isFetching = false;
          session.state.countdown = session.intervalSeconds;
          this.updateButtonTexts(session);
          this.notify(key);
          session.finishTimer = null;
        }
      }, 3000);
    } else {
      const elapsed = Date.now() - session.fetchStartTime;
      const remainingTime = Math.max(0, session.minLoadingDurationMs - elapsed);

      if (session.finishTimer) clearTimeout(session.finishTimer);

      if (remainingTime > 0) {
        session.finishTimer = setTimeout(() => {
          session.state.isDisplayLoading = false;
          session.state.countdown = session.intervalSeconds;
          this.updateButtonTexts(session);
          this.notify(key);
          session.finishTimer = null;
        }, remainingTime);
      } else {
        session.state.isDisplayLoading = false;
        session.state.countdown = session.intervalSeconds;
        this.updateButtonTexts(session);
        this.notify(key);
        session.finishTimer = null;
      }
    }
  }

  public triggerRefresh(key: string) {
    const session = this.sessions.get(key);
    if (!session) return;

    session.state.status = 'active';
    session.fetchStartTime = Date.now();
    session.state.isDisplayLoading = true;
    if (session.finishTimer) {
      clearTimeout(session.finishTimer);
      session.finishTimer = null;
    }
    this.updateButtonTexts(session);
    this.notify(key);

    // 💡 안전장치: fetch 이벤트가 트리거되지 않더라도 최대 2초 후 로딩 강제 해제
    session.finishTimer = setTimeout(() => {
      if (session.state.isDisplayLoading && !session.state.isFetching) {
        session.state.isDisplayLoading = false;
        session.state.countdown = session.intervalSeconds;
        this.updateButtonTexts(session);
        this.notify(key);
        session.finishTimer = null;
      }
    }, 2000);

    // 등록된 모든 리프레시 핸들러 실행 (단 1개만 실행해도 됨)
    const handlers = Array.from(session.onRefreshHandlers);
    if (handlers.length > 0) {
      try {
        handlers[0]();
      } catch (err) {
        console.warn('[sharedTransitRefreshStore] 리프레시 핸들러 실행 실패:', err);
      }
    }

    if (!session.timer) {
      this.startTimer(key);
    }
  }

  public reset(key: string): void {
    this.stopTimer(key);
    const session = this.sessions.get(key);
    if (!session) return;

    if (session.finishTimer) {
      clearTimeout(session.finishTimer);
      session.finishTimer = null;
    }

    session.state.status = 'idle';
    session.state.refreshCount = 0;
    session.state.countdown = session.intervalSeconds;
    session.state.isDisplayLoading = false;
    session.state.isFetching = false;
    this.updateButtonTexts(session);
    this.notify(key);
  }

  public pause(key: string): void {
    this.stopTimer(key);
    const session = this.sessions.get(key);
    if (!session) return;

    if (session.finishTimer) {
      clearTimeout(session.finishTimer);
      session.finishTimer = null;
    }

    session.state.status = 'paused';
    session.state.countdown = session.intervalSeconds;
    session.state.isDisplayLoading = false;
    this.updateButtonTexts(session);
    this.notify(key);
  }

  public getState(key: string): SharedRefreshState | null {
    const session = this.sessions.get(key);
    return session ? { ...session.state } : null;
  }
}

export const sharedTransitRefreshStore = new SharedTransitRefreshStore();
