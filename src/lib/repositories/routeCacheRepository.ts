import { createClient } from '@/lib/supabase/server';
import { DirectionsApiResponse } from '@/types/journey';

export interface RouteCacheParams {
  rsx: number;
  rsy: number;
  rex: number;
  rey: number;
}

export async function getRouteCache(params: RouteCacheParams): Promise<DirectionsApiResponse | null> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: cacheData, error } = await supabase
    .from('route_cache')
    .select('route_data')
    .eq('origin_lat', params.rsy)
    .eq('origin_lng', params.rsx)
    .eq('dest_lat', params.rey)
    .eq('dest_lng', params.rex)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[routeCacheRepository] getRouteCache error:', error);
    return null;
  }

  return cacheData?.route_data || null;
}

export async function saveRouteCache(params: RouteCacheParams, routeData: DirectionsApiResponse): Promise<void> {
  const supabase = await createClient();
  
  const { error } = await supabase.from('route_cache').insert({
    origin_lat: params.rsy,
    origin_lng: params.rsx,
    dest_lat: params.rey,
    dest_lng: params.rex,
    route_data: routeData
  });

  if (error) {
    console.error('[routeCacheRepository] saveRouteCache error:', error);
  }
}
