import fs from 'fs';
import path from 'path';
import { BusLineStation } from '@/types/journey';

export interface PersistentCachedBusRoute {
  busNo: string;
  busId: string;
  routeId?: string;
  routeIds?: string[];
  busType?: string;
  busColor?: string;
  startStationName?: string;
  endStationName?: string;
  turningStationName?: string;
  turningStationSeq?: number;
  stations: BusLineStation[];
  stationIndexMap: [string, number][];
  upStationIndexMap?: [string, number][];
  downStationIndexMap?: [string, number][];
  cachedAt: number;
}

export interface HydratedCachedBusRoute {
  busNo: string;
  busId: string;
  routeId?: string;
  routeIds?: string[];
  busType?: string;
  busColor?: string;
  startStationName?: string;
  endStationName?: string;
  turningStationName?: string;
  turningStationSeq?: number;
  stations: BusLineStation[];
  stationIndexMap: Map<string, number>;
  upStationIndexMap: Map<string, number>;
  downStationIndexMap: Map<string, number>;
}

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'bus-routes');
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 영구 수준 캐시
const CACHE_VERSION = 'v2';
const MAX_MEMORY_ROUTES = 300; // 메모리 누수 방지 상한

// 안전한 파일명 생성 (특수문자 치환 및 버전 프리픽스)
function sanitizeKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${CACHE_VERSION}_${safe}`;
}

/**
 * 버스 노선 정적 정보(경유 정류소 목록) 영속 캐시 매니저
 */
export class BusRoutePersistentCache {
  private static memoryCache = new Map<string, { data: HydratedCachedBusRoute; cachedAt: number }>();
  private static dirEnsured = false;

  private static ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
      this.dirEnsured = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[BusRoutePersistentCache] 디렉토리 생성 경고:', msg);
    }
  }

  /**
   * 영속 캐시에서 노선 정보 조회 (메모리 LRU 1차 -> 로컬 파일 2차)
   */
  public static async get(key: string): Promise<HydratedCachedBusRoute | null> {
    const cleanKey = sanitizeKey(key);

    // 1. 메모리 캐시 1차 확인 (LRU 갱신)
    const mem = this.memoryCache.get(cleanKey);
    if (mem) {
      if (Date.now() - mem.cachedAt < TTL_MS) {
        this.memoryCache.delete(cleanKey);
        this.memoryCache.set(cleanKey, mem);
        return mem.data;
      }
      this.memoryCache.delete(cleanKey);
    }

    // 2. 파일 시스템 캐시 2차 확인
    try {
      const filePath = path.join(CACHE_DIR, `${cleanKey}.json`);
      if (fs.existsSync(filePath)) {
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        const parsed: PersistentCachedBusRoute = JSON.parse(raw);

        if (Date.now() - parsed.cachedAt < TTL_MS && Array.isArray(parsed.stations) && parsed.stations.length > 0) {
          const hydrated: HydratedCachedBusRoute = {
            ...parsed,
            stationIndexMap: new Map(parsed.stationIndexMap || []),
            upStationIndexMap: new Map(parsed.upStationIndexMap || []),
            downStationIndexMap: new Map(parsed.downStationIndexMap || []),
          };
          this.setMemory(cleanKey, hydrated, parsed.cachedAt);
          return hydrated;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[BusRoutePersistentCache] 파일 캐시 읽기 실패:', msg);
    }

    return null;
  }

  /**
   * 영속 캐시에 노선 정보 저장 (메모리 + 로컬 파일 비동기 쓰기)
   */
  public static async set(key: string, data: HydratedCachedBusRoute): Promise<void> {
    const cleanKey = sanitizeKey(key);
    const now = Date.now();

    // 메모리 캐시 저장 (LRU 관리)
    this.setMemory(cleanKey, data, now);

    // 파일 시스템 비동기 저장
    try {
      this.ensureDir();
      const persistent: PersistentCachedBusRoute = {
        busNo: data.busNo,
        busId: data.busId,
        routeId: data.routeId,
        routeIds: data.routeIds,
        busType: data.busType,
        busColor: data.busColor,
        startStationName: data.startStationName,
        endStationName: data.endStationName,
        turningStationName: data.turningStationName,
        turningStationSeq: data.turningStationSeq,
        stations: data.stations,
        stationIndexMap: Array.from(data.stationIndexMap.entries()),
        upStationIndexMap: Array.from(data.upStationIndexMap.entries()),
        downStationIndexMap: Array.from(data.downStationIndexMap.entries()),
        cachedAt: now,
      };

      const filePath = path.join(CACHE_DIR, `${cleanKey}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(persistent), 'utf-8');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[BusRoutePersistentCache] 파일 캐시 저장 실패:', msg);
    }
  }

  /**
   * 인메모리 캐시 LRU 저장 헬퍼
   */
  private static setMemory(cleanKey: string, data: HydratedCachedBusRoute, cachedAt: number): void {
    if (this.memoryCache.has(cleanKey)) {
      this.memoryCache.delete(cleanKey);
    } else if (this.memoryCache.size >= MAX_MEMORY_ROUTES) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(cleanKey, { data, cachedAt });
  }

  /**
   * 영속 캐시에서 특정 키의 노선 데이터 삭제 (무효화)
   */
  public static async delete(key: string): Promise<void> {
    const cleanKey = sanitizeKey(key);
    this.memoryCache.delete(cleanKey);
    try {
      const filePath = path.join(CACHE_DIR, `${cleanKey}.json`);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[BusRoutePersistentCache] 파일 캐시 삭제 실패:', msg);
    }
  }
}
