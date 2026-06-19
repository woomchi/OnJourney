import { createClient } from '@/lib/supabase/client';
import { toJourneyErrorMessage } from '@/lib/journeys/errors';
import type { CreateJourneyInput, Journey, Place, TransportType } from '@/types/journey';

interface JourneyRow {
  id: string;
  user_id: string;
  title: string;
  transport_type: TransportType;
  journey_date: string;
  places: Place[];
  current_step: number;
  created_at: string;
  updated_at: string;
}

function mapRowToJourney(row: JourneyRow): Journey {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    transport_type: row.transport_type,
    journey_date: row.journey_date,
    places: row.places ?? [],
    current_step: row.current_step,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function insertJourney(input: CreateJourneyInput): Promise<Journey> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { data, error } = await supabase
    .from('journeys')
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      transport_type: input.transport_type,
      journey_date: input.journey_date,
      places: [],
      current_step: 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(toJourneyErrorMessage(error));
  }

  return mapRowToJourney(data as JourneyRow);
}

export async function fetchLatestJourney(): Promise<Journey | null> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from('journeys')
    .select()
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
      console.warn('[journeys] 테이블 미설정:', error.message);
    }
    return null;
  }

  if (!data) {
    return null;
  }

  return mapRowToJourney(data as JourneyRow);
}

export async function fetchJourneys(): Promise<Journey[]> {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from('journeys')
    .select()
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[journeys] 조회 실패:', error.message);
    return [];
  }

  return (data as JourneyRow[]).map(mapRowToJourney);
}

export async function deleteJourneys(ids: string[]): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('journeys')
    .delete()
    .in('id', ids);

  if (error) {
    throw new Error(toJourneyErrorMessage(error));
  }
}

export async function updateJourney(
  journeyId: string,
  updates: {
    title?: string;
    journey_date?: string;
    transport_type?: TransportType;
  }
): Promise<Journey> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('journeys')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journeyId)
    .select()
    .single();

  if (error) {
    throw new Error(toJourneyErrorMessage(error));
  }

  return mapRowToJourney(data as JourneyRow);
}

