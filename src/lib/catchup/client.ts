import { generateCatchUp } from "./index";
import { transcript } from "@/data/transcript";
import type { CatchUpResult, TranscriptItem } from "@/types";

const FETCH_TIMEOUT_MS = 4000;

/**
 * Owned by the Catch-up feature team. Calls /api/catchup for an AI-condensed
 * summary, falling back to the local deterministic result on any error,
 * non-OK response, or if it takes longer than FETCH_TIMEOUT_MS — the demo
 * must never hang on a network call. `items` overrides the mock lesson
 * (e.g. a YouTube video's captions); only the lines in the window are sent.
 *
 * Shared by every catch-up entry point (the manual button, the "I'm looking
 * away" toggle) so there is exactly one fallback/timeout policy, not one per
 * button.
 */
export async function fetchCatchUp(
  items: TranscriptItem[] | undefined,
  start: number,
  end: number
): Promise<CatchUpResult> {
  const local = generateCatchUp(items ?? transcript, start, end);
  if (local.bullets.length === 0) return local;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const windowItems = items?.filter((item) => item.end > start && item.start < end);

  try {
    const response = await fetch("/api/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(windowItems ? { start, end, items: windowItems } : { start, end }),
      signal: controller.signal,
    });
    if (!response.ok) return local;
    return (await response.json()) as CatchUpResult;
  } catch {
    return local;
  } finally {
    clearTimeout(timeout);
  }
}
