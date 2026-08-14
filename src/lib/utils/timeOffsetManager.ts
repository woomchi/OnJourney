/**
 * @fileoverview 클라이언트-서버 시각 동기화 관리자 (TimeOffsetManager)
 * 
 * 서버 응답 타임스탬프와의 Drift(시각 오차)를 관리하여
 * 지하철 실시간 도착 계산(barvlDt, recptnDt)의 1~5초 오차를 ±1초 이내로 정밀하게 보정합니다.
 */

class TimeOffsetManager {
  private static instance: TimeOffsetManager;
  
  /** 클라이언트 타임스탬프와 서버 타임스탬프 차이 (ms, serverTime - clientTime) */
  private timeOffsetMs: number = 0;
  
  /** 동기화 완료 여부 */
  private isSynchronized: boolean = false;
  
  /** 마지막 동기화 시각 (ms) */
  private lastSyncTimeMs: number = 0;

  private constructor() {}

  public static getInstance(): TimeOffsetManager {
    if (!TimeOffsetManager.instance) {
      TimeOffsetManager.instance = new TimeOffsetManager();
    }
    return TimeOffsetManager.instance;
  }

  /**
   * 서버 타임스탬프와 요청 RTT(Round Trip Time)를 바탕으로 오프셋을 동기화합니다.
   * 
   * @param serverTimeMs 서버 시각 (ms)
   * @param requestStartMs 요청 시작 시각 (ms)
   * @param responseEndMs 응답 완료 시각 (ms, 기본값: 현재시각)
   */
  public syncWithServerTime(
    serverTimeMs: number,
    requestStartMs: number,
    responseEndMs: number = Date.now()
  ): number {
    const rttMs = Math.max(0, responseEndMs - requestStartMs);
    const estimatedServerTimeMs = serverTimeMs + Math.round(rttMs / 2);
    
    this.timeOffsetMs = estimatedServerTimeMs - responseEndMs;
    this.isSynchronized = true;
    this.lastSyncTimeMs = responseEndMs;

    return this.timeOffsetMs;
  }

  /**
   * 서버 시각 오프셋(ms)을 직접 설정합니다.
   */
  public setOffset(offsetMs: number): void {
    this.timeOffsetMs = offsetMs;
    this.isSynchronized = true;
    this.lastSyncTimeMs = Date.now();
  }

  /**
   * 보정된 현재 서버 시각(ms)을 반환합니다.
   */
  public getSynchronizedNow(): number {
    return Date.now() + this.timeOffsetMs;
  }

  /**
   * 현재 시각 오프셋(ms)을 반환합니다.
   */
  public getOffset(): number {
    return this.timeOffsetMs;
  }

  /**
   * 동기화 상태 및 신뢰도 점수를 반환합니다 (0.5 ~ 1.0).
   */
  public getSyncConfidence(): number {
    if (!this.isSynchronized) return 0.7; // 미동기화 시 기본값
    
    // 오프셋 절댓값이 커질수록 신뢰도 감점 (5000ms 오차 시 0.5)
    const offsetAbs = Math.abs(this.timeOffsetMs);
    return Math.max(0.5, Number((1.0 - offsetAbs / 10000).toFixed(2)));
  }
}

export const timeOffsetManager = TimeOffsetManager.getInstance();
