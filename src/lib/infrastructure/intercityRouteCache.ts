import fs from 'fs';
import path from 'path';
import type { DirectionResult } from '@/types/journey';

/**
 * 장거리 대중교통(시외/고속버스, KTX, 항공) 경로 2주(14일) 영속 캐시 매니저
 * 
 * - KTX, 고속버스 스케줄은 정기 운행표 기반이므로 2주(14일) 유효기간을 적용합니다.
 * - 파일 시스템(data/cache/intercity-routes/) 및 메모리 Map 2단계 계층으로 저장하여
 *   서버 재시작 후에도 ODsay API 쿼터를 1회도 소모하지 않도록 방어합니다.
 */

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'intercity-routes');
export const INTERCITY_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14일 (1,209,600,000ms)
export const INTERCITY_CACHE_REVALIDATE_SEC = 14 * 24 * 60 * 60; // 14일 (초 단위: 1,209,600s)

export interface PersistentIntercityCacheEntry {
  key: string;
  data: DirectionResult[];
  cachedAt: number;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export class IntercityRouteCache {
  private static memoryCache = new Map<string, { data: DirectionResult[]; cachedAt: number }>();

  private static ensureDir(): void {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('[IntercityRouteCache] 캐시 디렉터리 생성 실패:', e);
    }
  }

  /**
   * 캐시 데이터 조회
   */
  public static get(key: string): DirectionResult[] | null {
    const now = Date.now();

    // 1. 메모리 캐시 확인
    const mem = this.memoryCache.get(key);
    if (mem) {
      if (now - mem.cachedAt < INTERCITY_CACHE_TTL_MS) {
        return mem.data;
      }
      // 만료됨
      this.memoryCache.delete(key);
    }

    // 2. 디스크 캐시 확인
    try {
      const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const entry: PersistentIntercityCacheEntry = JSON.parse(raw);

        if (now - entry.cachedAt < INTERCITY_CACHE_TTL_MS) {
          // 메모리 복원
          this.memoryCache.set(key, { data: entry.data, cachedAt: entry.cachedAt });
          return entry.data;
        }

        // 만료된 디스크 파일 삭제
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn(`[IntercityRouteCache] 디스크 캐시 읽기 실패 (${key}):`, e);
    }

    return null;
  }

  /**
   * 캐시 데이터 저장 (메모리 + 디스크)
   */
  public static set(key: string, data: DirectionResult[]): void {
    const now = Date.now();

    // 1. 메모리 저장
    this.memoryCache.set(key, { data, cachedAt: now });

    // 2. 디스크 저장
    try {
      this.ensureDir();
      const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
      const entry: PersistentIntercityCacheEntry = {
        key,
        data,
        cachedAt: now,
      };
      fs.writeFileSync(filePath, JSON.stringify(entry), 'utf-8');
    } catch (e) {
      console.warn(`[IntercityRouteCache] 디스크 캐시 저장 실패 (${key}):`, e);
    }
  }

  /**
   * 테스트 및 관리용: 특정 키 삭제 또는 전체 클리어
   */
  public static clear(key?: string): void {
    if (key) {
      this.memoryCache.delete(key);
      try {
        const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    } else {
      this.memoryCache.clear();
      try {
        if (fs.existsSync(CACHE_DIR)) {
          const files = fs.readdirSync(CACHE_DIR);
          for (const file of files) {
            fs.unlinkSync(path.join(CACHE_DIR, file));
          }
        }
      } catch {}
    }
  }
}
