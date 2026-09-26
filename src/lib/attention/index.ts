import type { AttentionEvent } from "@/types";

/**
 * Owned by the Attention feature team.
 *
 * Placeholder implementation: looks up the simulated attention event active
 * at a given playback time, if any. Replace/extend with real scoring,
 * aggregation, and "missed important moment" alert logic.
 */
export function getActiveAttentionEvent(
  events: AttentionEvent[],
  currentTime: number
): AttentionEvent | undefined {
  return events.find(
    (event) => currentTime >= event.start && currentTime <= event.end
  );
}
