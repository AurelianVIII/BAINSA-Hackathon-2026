import type { TranscriptItem } from "@/types";
import type { VisualSummaryData } from "./types";

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Groups transcript lines by topic. Used by the Visual Summary tab and as
 * the basis for picking which part of the reaction diagram to show.
 */
export function groupByTopic(
  transcriptItems: TranscriptItem[]
): Record<string, TranscriptItem[]> {
  return transcriptItems.reduce<Record<string, TranscriptItem[]>>((acc, item) => {
    (acc[item.topic] ??= []).push(item);
    return acc;
  }, {});
}

import {
  generateSmartSummary,
  generateTopicGist,
} from "@/lib/ai/smart-summarizer";

/** One-line gist per topic, for the lesson-at-a-glance tab. */
export function getTopicGist(topic: string, topicItems?: TranscriptItem[]): string {
  return generateTopicGist(topic, topicItems);
}

/** Transcript lines overlapping a time window, with boundary padding fallback. */
export function getItemsInWindow(
  transcriptItems: TranscriptItem[],
  window: { start: number; end: number }
): TranscriptItem[] {
  const strict = transcriptItems.filter(
    (item) => item.end > window.start && item.start < window.end
  );
  if (strict.length > 0 || transcriptItems.length === 0) {
    return strict;
  }

  // Gracefully handle alerts during brief speech pauses or near boundaries
  const padded = transcriptItems.filter(
    (item) => item.end > window.start - 15 && item.start < window.end + 15
  );
  if (padded.length > 0) return padded;

  // Closest item
  const sorted = [...transcriptItems].sort(
    (a, b) => Math.abs(a.start - window.start) - Math.abs(b.start - window.start)
  );
  return sorted.slice(0, 1);
}

/**
 * The topic covering the most seconds of the window — not simply the
 * first one, because a missed window often straddles two topics and the
 * larger share is the one worth explaining.
 */
function dominantTopic(items: TranscriptItem[], window: { start: number; end: number }) {
  const seconds: Record<string, number> = {};

  for (const item of items) {
    if (!item.topic) continue;
    const overlap =
      Math.min(item.end, window.end) - Math.max(item.start, window.start);
    if (overlap > 0) seconds[item.topic] = (seconds[item.topic] ?? 0) + overlap;
  }

  return Object.entries(seconds).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * Summary for the lesson actually running — live speech or a video's
 * captions. Reports what was said and derives any diagram from that
 * transcript, never from authored content about another lesson: stating
 * with a diagram something the teacher never said is the one failure a
 * student who cannot hear the audio has no way to catch.
 */
function summariseLesson(
  items: TranscriptItem[],
  topic: string | null,
  window?: { start: number; end: number },
  context?: { lessonTitle?: string }
): VisualSummaryData {
  return generateSmartSummary(items, window, {
    dominantTopic: topic,
    lessonTitle: context?.lessonTitle,
  });
}

export function buildVisualSummary(
  transcriptItems: TranscriptItem[],
  window: { start: number; end: number },
  context?: { lessonTitle?: string }
): VisualSummaryData {
  const items = getItemsInWindow(transcriptItems, window);
  const topic = dominantTopic(items, window);
  return summariseLesson(items, topic, window, context);
}
