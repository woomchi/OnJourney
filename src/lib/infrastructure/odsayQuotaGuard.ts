import fs from 'fs';
import path from 'path';

/**
 * ODsay 일일 쿼터 안전 관리자 (Quota Guard)
 * 
 * - 무료 티어 일일 30회 제한 환경에서 안전하게 하드캡(기본 25회)으로 제어합니다.
 * - KST(한국 표준시) 자정을 기준으로 일일 카운트를 리셋합니다.
 * - 서버 재시작 시에도 쿼터 소진 상태가 보존되도록 파일 영속화를 함께 제공합니다.
 */

const QUOTA_DIR = path.join(process.cwd(), 'data', 'cache', 'odsay');
const QUOTA_FILE = path.join(QUOTA_DIR, 'daily_quota.json');

export const ODSAY_DAILY_HARD_CAP = 25; // 일일 최대 허용 호출 횟수 (30회 중 5회는 비상 버퍼)

interface DailyQuotaRecord {
  dateStr: string; // YYYY-MM-DD (KST)
  count: number;
  lastUpdated: number;
}

export class OdsayQuotaGuard {
  private static cachedRecord: DailyQuotaRecord | null = null;
  private static dirEnsured = false;

  /**
   * KST 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
   */
  public static getKstTodayString(): string {
    const now = new Date();
    // UTC+9 계산
    const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const kstDate = new Date(utc + 9 * 60 * 60 * 1000);
    const yyyy = kstDate.getFullYear();
    const mm = String(kstDate.getMonth() + 1).padStart(2, '0');
    const dd = String(kstDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private static ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      if (!fs.existsSync(QUOTA_DIR)) {
        fs.mkdirSync(QUOTA_DIR, { recursive: true });
      }
      this.dirEnsured = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[OdsayQuotaGuard] 디렉터리 생성 실패:', msg);
    }
  }

  /**
   * 당일 쿼터 레코드 로드
   */
  private static loadRecord(): DailyQuotaRecord {
    const today = this.getKstTodayString();

    if (this.cachedRecord && this.cachedRecord.dateStr === today) {
      return this.cachedRecord;
    }

    this.ensureDir();

    try {
      if (fs.existsSync(QUOTA_FILE)) {
        const raw = fs.readFileSync(QUOTA_FILE, 'utf-8');
        const parsed: DailyQuotaRecord = JSON.parse(raw);
        if (parsed.dateStr === today) {
          this.cachedRecord = parsed;
          return parsed;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[OdsayQuotaGuard] 쿼터 파일 읽기 실패, 새로 초기화:', msg);
    }

    const newRecord: DailyQuotaRecord = {
      dateStr: today,
      count: 0,
      lastUpdated: Date.now(),
    };
    this.cachedRecord = newRecord;
    this.persistRecord(newRecord);
    return newRecord;
  }

  /**
   * 쿼터 레코드 디스크 저장 (비동기 백그라운드)
   */
  private static persistRecord(record: DailyQuotaRecord): void {
    try {
      this.ensureDir();
      fs.promises.writeFile(QUOTA_FILE, JSON.stringify(record, null, 2), 'utf-8').catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[OdsayQuotaGuard] 쿼터 파일 비동기 저장 실패:', msg);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[OdsayQuotaGuard] 쿼터 파일 저장 실패:', msg);
    }
  }

  /**
   * ODsay API 호출이 가능한지 확인
   * @param hardCap 선택적 커스텀 한도
   */
  public static canCall(hardCap: number = ODSAY_DAILY_HARD_CAP): boolean {
    const record = this.loadRecord();
    return record.count < hardCap;
  }

  /**
   * ODsay API 실제 호출 1회 기록
   */
  public static recordCall(): number {
    const record = this.loadRecord();
    record.count += 1;
    record.lastUpdated = Date.now();
    this.cachedRecord = record;
    this.persistRecord(record);
    return record.count;
  }

  /**
   * 현재 쿼터 사용 현황 확인
   */
  public static getStatus(hardCap: number = ODSAY_DAILY_HARD_CAP) {
    const record = this.loadRecord();
    return {
      date: record.dateStr,
      used: record.count,
      hardCap,
      remaining: Math.max(0, hardCap - record.count),
      isExhausted: record.count >= hardCap,
    };
  }

  /**
   * 테스트 및 관리자 전용: 카운트 초기화 또는 지정
   */
  public static resetForTest(count: number = 0, dateStr?: string): void {
    const record: DailyQuotaRecord = {
      dateStr: dateStr || this.getKstTodayString(),
      count,
      lastUpdated: Date.now(),
    };
    this.cachedRecord = record;
    this.persistRecord(record);
  }
}
