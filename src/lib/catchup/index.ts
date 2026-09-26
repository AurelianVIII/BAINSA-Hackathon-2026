import type { AttentionEvent, CatchUpResult, TranscriptItem } from "@/types";
import type { MissedWindow } from "./types";

const MERGE_GAP_SECONDS = 5;
const PENDING_ALERT_WINDOW_SECONDS = 8;

import { generateSmartCatchUp } from "@/lib/ai/smart-summarizer";

/**
 * Owned by the Catch-up feature team.
 *
 * Condensed summary: clean, plain-language bullets capped at `MAX_BULLETS`,
 * plus the highest-importance line or central concept as the key idea.
 */
export function generateCatchUp(
  transcriptItems: TranscriptItem[],
  fromTime: number,
  toTime: number,
  lessonTitle?: string
): CatchUpResult {
  const safeStart = Math.max(0, fromTime);
  const safeEnd = Math.max(safeStart + 1, toTime);
  let missed = transcriptItems.filter(
    (item) => item.end > safeStart && item.start < safeEnd
  );

  // If the window fell in a quiet pause or near start/end, grab adjacent context
  if (missed.length === 0 && transcriptItems.length > 0) {
    missed = transcriptItems.filter(
      (item) => item.end > safeStart - 25 && item.start < safeEnd + 25
    );
    if (missed.length === 0) {
      const sorted = [...transcriptItems].sort(
        (a, b) => Math.abs(a.start - safeStart) - Math.abs(b.start - safeStart)
      );
      missed = sorted.slice(0, 2);
    }
  }

  const smart = generateSmartCatchUp(missed, safeStart, safeEnd, lessonTitle);
  return {
    ...smart,
    bridge: buildBridge(transcriptItems, safeStart, safeEnd),
  };
}

/**
 * Narrates the throughline of a missed stretch: not what was said, but how
 * the lesson moved from the topic the student left on to the topic it's on
 * now. "Catch me up" answers "what did I miss"; this answers "how did we
 * get here" — the connective tissue a flat bullet list doesn't give.
 */
export function buildBridge(
  transcriptItems: TranscriptItem[],
  fromTime: number,
  toTime: number
): string {
  const missed = transcriptItems.filter(
    (item) => item.end > fromTime && item.start < toTime
  );
  if (missed.length === 0) {
    return "Nothing new was covered while you were away.";
  }

  const topics: string[] = [];
  for (const item of missed) {
    if (topics[topics.length - 1] !== item.topic) topics.push(item.topic);
  }

  if (topics.length === 1) {
    return `The lesson stayed on ${topics[0]} the whole time you were away.`;
  }

  const [from, ...rest] = topics;
  const to = rest[rest.length - 1];
  const through = rest.slice(0, -1);
  const stops = through.length > 0 ? ` through ${through.join(", ")}` : "";
  return `You left during ${from}. Since then the lesson moved${stops} to ${to} — that's where it is now.`;
}

/**
 * Expands `event` to any other events in `events` it overlaps or sits
 * within `MERGE_GAP_SECONDS` of (a short "looking away" followed by
 * "confusion" reads as one missed stretch, not two alerts), then to the
 * transcript lines that stretch covers.
 */
export function buildMissedWindow(
  events: AttentionEvent[],
  transcript: TranscriptItem[],
  event: AttentionEvent
): MissedWindow {
  const cluster = events.filter(
    (e) =>
      e.start <= event.end + MERGE_GAP_SECONDS &&
      e.end >= event.start - MERGE_GAP_SECONDS
  );
  const start = Math.min(...cluster.map((e) => e.start), event.start);
  const end = Math.max(...cluster.map((e) => e.end), event.end);

  let overlapping = transcript.filter(
    (item) => item.end > start && item.start < end
  );
  if (overlapping.length === 0 && transcript.length > 0) {
    overlapping = transcript.filter(
      (item) => item.end > start - 15 && item.start < end + 15
    );
    if (overlapping.length === 0) {
      const sorted = [...transcript].sort(
        (a, b) => Math.abs(a.start - start) - Math.abs(b.start - start)
      );
      overlapping = sorted.slice(0, 1);
    }
  }

  return {
    id: event.id,
    start,
    end,
    reason: event.type,
    transcriptIds: overlapping.map((item) => item.id),
    hitKeyContent: overlapping.some((item) => item.importance === "high"),
  };
}

/**
 * Returns the missed window to alert on: the event has just ended (within
 * `PENDING_ALERT_WINDOW_SECONDS` of `currentTime`) and isn't dismissed.
 * Alerting after the gap closes, not during it — the student is still
 * looking away mid-gap, so an alert then goes unseen. Prefers a window
 * that overlaps key content when more than one candidate qualifies.
 */
export function getPendingAlert(
  events: AttentionEvent[],
  transcript: TranscriptItem[],
  currentTime: number,
  dismissedIds: string[]
): MissedWindow | null {
  const candidates = events
    .filter(
      (event) =>
        event.end <= currentTime &&
        currentTime - event.end <= PENDING_ALERT_WINDOW_SECONDS &&
        !dismissedIds.includes(event.id)
    )
    .map((event) => buildMissedWindow(events, transcript, event));

  if (candidates.length === 0) return null;

  return (
    candidates.find((w) => w.hitKeyContent) ??
    candidates.reduce((latest, w) => (w.end > latest.end ? w : latest))
  );
}
