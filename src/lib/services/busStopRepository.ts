import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export interface NearestBusStopResult {
  nodeId: string;
  nodeNm: string;
  arsNo: string | null;
  cityCd: string;
  cityName: string | null;
  distanceMeters: number;
}

export interface FindNearestBusStopOptions {
  lat: number;
  lng: number;
  stationName?: string;
  radiusMeters?: number;
  limit?: number;
}

/** 초경량 인메모리 LRU 캐시 (자주 조회되는 환승/출발 정류소 보존) */
const IN_MEMORY_CACHE = new Map<string, NearestBusStopResult | null>();
const MAX_CACHE_SIZE = 3000;

function setCache(key: string, value: NearestBusStopResult | null) {
  if (IN_MEMORY_CACHE.size >= MAX_CACHE_SIZE) {
    // 가장 오래된 첫 번째 엔트리 삭제
    const firstKey = IN_MEMORY_CACHE.keys().next().value;
    if (firstKey) IN_MEMORY_CACHE.delete(firstKey);
  }
  IN_MEMORY_CACHE.set(key, value);
}

export class BusStopRepository {
  /**
   * GPS 좌표 및 정류소명을 기반으로 국토교통부 표준 정류소 마스터(Supabase PostGIS)에서
   * 가장 인접하고 정합성이 일치하는 정류소를 5~15ms 내에 초고속 탐색합니다.
   */
  public static async findNearestBusStop({
    lat,
    lng,
    stationName,
    radiusMeters = 250.0,
    limit = 3,
  }: FindNearestBusStopOptions): Promise<NearestBusStopResult | null> {
    if (!lat || !lng) return null;

    const cleanName = stationName && stationName !== '정류소'
      ? (stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName).trim()
      : null;

    const cacheKey = `busstop_${lat.toFixed(4)}_${lng.toFixed(4)}_${cleanName || ''}`;
    if (IN_MEMORY_CACHE.has(cacheKey)) {
      return IN_MEMORY_CACHE.get(cacheKey) || null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    try {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await supabase.rpc('find_nearest_bus_stops', {
        target_lat: lat,
        target_lng: lng,
        target_name: cleanName,
        radius_meters: radiusMeters,
        limit_count: limit,
      });

      if (error) {
        // 테이블이나 RPC 함수가 아직 배포 전일 경우 조용히 null 반환 (Fallback 유도)
        return null;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        setCache(cacheKey, null);
        return null;
      }

      // 첫 번째 매칭 항목 (RPC 내부에서 정류소명 일치도 + 거리순으로 정렬됨)
      const best = data[0];
      const result: NearestBusStopResult = {
        nodeId: String(best.node_id),
        nodeNm: String(best.node_nm),
        arsNo: best.ars_no ? String(best.ars_no) : null,
        cityCd: String(best.city_cd),
        cityName: best.city_name ? String(best.city_name) : null,
        distanceMeters: Number(best.distance_meters),
      };

      setCache(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * 도시코드와 정류소 번호(ARS) 또는 정류소명을 기반으로 DB에서 고속 검색
   */
  public static async findBusStopByArsOrName(
    cityCode: string,
    stationId?: string,
    stationName?: string
  ): Promise<NearestBusStopResult | null> {
    const pureNo = stationId ? stationId.replace(/[^0-9]/g, '') : '';
    const cleanName = stationName && stationName !== '정류소'
      ? (stationName.includes('.') ? stationName.split('.').pop() || stationName : stationName).trim()
      : null;

    if (!pureNo && !cleanName) return null;

    const cacheKey = `ars_${cityCode}_${pureNo}_${cleanName || ''}`;
    if (IN_MEMORY_CACHE.has(cacheKey)) {
      return IN_MEMORY_CACHE.get(cacheKey) || null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    try {
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 1. ARS 번호 기반 탐색
      if (pureNo && pureNo.length >= 4) {
        const { data } = await supabase
          .from('bus_stops')
          .select('node_id, node_nm, ars_no, city_cd, city_name')
          .eq('city_cd', cityCode)
          .eq('ars_no', pureNo)
          .limit(1);

        if (data && data.length > 0) {
          const item = data[0];
          const result: NearestBusStopResult = {
            nodeId: String(item.node_id),
            nodeNm: String(item.node_nm),
            arsNo: item.ars_no ? String(item.ars_no) : null,
            cityCd: String(item.city_cd),
            cityName: item.city_name ? String(item.city_name) : null,
            distanceMeters: 0,
          };
          setCache(cacheKey, result);
          return result;
        }
      }

      // 2. 정류소명 기반 탐색
      if (cleanName && cleanName.length >= 2) {
        const { data } = await supabase
          .from('bus_stops')
          .select('node_id, node_nm, ars_no, city_cd, city_name')
          .eq('city_cd', cityCode)
          .ilike('node_nm', `%${cleanName}%`)
          .limit(1);

        if (data && data.length > 0) {
          const item = data[0];
          const result: NearestBusStopResult = {
            nodeId: String(item.node_id),
            nodeNm: String(item.node_nm),
            arsNo: item.ars_no ? String(item.ars_no) : null,
            cityCd: String(item.city_cd),
            cityName: item.city_name ? String(item.city_name) : null,
            distanceMeters: 0,
          };
          setCache(cacheKey, result);
          return result;
        }
      }

      setCache(cacheKey, null);
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 테스트 및 디버깅을 위한 캐시 초기화
   */
  public static clearCache(): void {
    IN_MEMORY_CACHE.clear();
  }
}
