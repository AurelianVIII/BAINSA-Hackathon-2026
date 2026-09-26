import type { CatchUpResult, TranscriptItem } from "@/types";

/**
 * Owned by the Catch-up feature team.
 *
 * Placeholder implementation: builds a naive summary from whatever
 * transcript lines fall in [fromTime, toTime]. Replace with real
 * summarization logic (rule-based or AI-backed).
 */
export function generateCatchUp(
  transcriptItems: TranscriptItem[],
  fromTime: number,
  toTime: number
): CatchUpResult {
  const missed = transcriptItems.filter(
    (item) => item.end > fromTime && item.start < toTime
  );

  return {
    title: missed[0]?.topic ?? "What you missed",
    bullets: missed.map((item) => item.text),
    keyIdea: missed.find((item) => item.importance === "high")?.text ?? missed[0]?.text ?? "",
    startTime: fromTime,
    endTime: toTime,
  };
}
