import { createClient } from '@/lib/supabase/client';
import type { Place } from '@/types/journey';

export async function updateJourneyPlaces(
  journeyId: string,
  places: Place[]
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('journeys')
    .update({ places, updated_at: new Date().toISOString() })
    .eq('id', journeyId);

  if (error) {
    throw new Error(error.message);
  }
}
