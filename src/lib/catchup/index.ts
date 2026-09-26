import type { AttentionEvent, CatchUpResult, TranscriptItem } from "@/types";
import type { MissedWindow } from "./types";

const MAX_BULLETS = 3;
const MERGE_GAP_SECONDS = 5;
const PENDING_ALERT_WINDOW_SECONDS = 8;

/**
 * Owned by the Catch-up feature team.
 *
 * Condensed summary: first clause of each missed line, capped at
 * `MAX_BULLETS`, plus the highest-importance line as the key idea.
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
    bullets: missed.slice(0, MAX_BULLETS).map((item) => firstClause(item.text)),
    keyIdea: missed.find((item) => item.importance === "high")?.text ?? missed[0]?.text ?? "",
    bridge: buildBridge(transcriptItems, fromTime, toTime),
    startTime: fromTime,
    endTime: toTime,
  };
}

function firstClause(text: string): string {
  const match = text.match(/^(.*?)(,| — | - |;)/);
  return (match ? match[1] : text).trim();
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

  const overlapping = transcript.filter(
    (item) => item.end > start && item.start < end
  );

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
