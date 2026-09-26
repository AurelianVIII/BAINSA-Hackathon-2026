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
  end: number,
  title?: string
): Promise<CatchUpResult> {
  const local = generateCatchUp(items ?? transcript, start, end, title);
  if (local.bullets.length === 0) return local;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 1, end);
  let windowItems = items?.filter((item) => item.end > safeStart && item.start < safeEnd);

  if (items && (!windowItems || windowItems.length === 0)) {
    windowItems = items.filter((item) => item.end > safeStart - 30 && item.start < safeEnd + 30);
    if (!windowItems || windowItems.length === 0) {
      windowItems = items.slice(0, 3);
    }
  }

  try {
    const response = await fetch("/api/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: safeStart,
        end: safeEnd,
        items: windowItems ?? undefined,
        title,
      }),
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
