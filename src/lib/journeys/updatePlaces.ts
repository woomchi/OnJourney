import { createClient } from '@/lib/supabase/client';
import type { Place } from '@/types/journey';

// Queue to hold pending updates per journey
const pendingUpdates = new Map<string, Place[]>();
const updatePromise = new Map<string, Promise<void>>();

export function updateJourneyPlaces(
  journeyId: string,
  places: Place[]
): Promise<void> {
  pendingUpdates.set(journeyId, places);

  if (updatePromise.has(journeyId)) {
    return updatePromise.get(journeyId)!;
  }

  const promise = (async () => {
    try {
      while (pendingUpdates.has(journeyId)) {
        const placesToUpdate = pendingUpdates.get(journeyId)!;
        pendingUpdates.delete(journeyId);

        const supabase = createClient();
        const { error } = await supabase
          .from('journeys')
          .update({ places: placesToUpdate, updated_at: new Date().toISOString() })
          .eq('id', journeyId);

        if (error) {
          console.error('[updateJourneyPlaces] Failed to update places:', error);
        }
      }
    } finally {
      updatePromise.delete(journeyId);
    }
  })();

  updatePromise.set(journeyId, promise);
  return promise;
}
