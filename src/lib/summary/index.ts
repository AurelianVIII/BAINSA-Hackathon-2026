import type { TranscriptItem } from "@/types";

/**
 * Owned by the Summaries/Threads feature team.
 *
 * Placeholder implementation: groups transcript lines by topic as a stand-in
 * for AI-generated visual summaries and topic threads.
 */
export function groupByTopic(
  transcriptItems: TranscriptItem[]
): Record<string, TranscriptItem[]> {
  return transcriptItems.reduce<Record<string, TranscriptItem[]>>((acc, item) => {
    (acc[item.topic] ??= []).push(item);
    return acc;
  }, {});
}
