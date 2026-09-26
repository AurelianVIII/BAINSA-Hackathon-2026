import type {
  AttentionEvent,
  AttentionSample,
  TimelineBand,
  TranscriptItem,
} from "@/types";

/**
 * Owned by the Attention feature team.
 */
export function getActiveAttentionEvent(
  events: AttentionEvent[],
  currentTime: number
): AttentionEvent | undefined {
  return events.find(
    (event) => currentTime >= event.start && currentTime <= event.end
  );
}

/** Nearest-neighbour interpolated sample at an arbitrary time. */
export function getSampleAt(
  samples: AttentionSample[],
  time: number
): AttentionSample {
  if (samples.length === 0) {
    return { t: time, gaze: 0, confusion: 0, engagement: 0 };
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const clamped = Math.min(Math.max(time, first.t), last.t);

  const lowIndex = Math.max(
    0,
    Math.min(Math.floor(clamped - first.t), samples.length - 2)
  );
  const low = samples[lowIndex];
  const high = samples[lowIndex + 1] ?? low;
  const span = high.t - low.t || 1;
  const fraction = (clamped - low.t) / span;

  return {
    t: clamped,
    gaze: low.gaze + (high.gaze - low.gaze) * fraction,
    confusion: low.confusion + (high.confusion - low.confusion) * fraction,
    engagement: low.engagement + (high.engagement - low.engagement) * fraction,
  };
}

export function getAttentionLevel(
  sample: AttentionSample
): "high" | "medium" | "low" {
  if (sample.engagement >= 0.7) return "high";
  if (sample.engagement >= 0.4) return "medium";
  return "low";
}

/** low-attention is grouped with "away" — both represent reduced attention. */
const EVENT_BAND: Record<AttentionEvent["type"], TimelineBand> = {
  "looking-away": "away",
  confusion: "confused",
  "low-attention": "away",
};

const RECOVERY_WINDOW = 6;

/**
 * Segments the full lesson duration into coloured timeline bands: "key"
 * (purple) where the transcript marks high importance, "away"/"confused"
 * from attention events, a short "recovered" band right after an event
 * ends, and "high" everywhere else. Key content always wins ties.
 */
export function buildTimelineBands(
  events: AttentionEvent[],
  transcript: TranscriptItem[],
  duration: number
): { band: TimelineBand; start: number; end: number }[] {
  const perSecond: TimelineBand[] = new Array(duration + 1).fill("high");

  for (const event of events) {
    const band = EVENT_BAND[event.type];
    const start = Math.max(0, Math.round(event.start));
    const end = Math.min(duration, Math.round(event.end));
    for (let t = start; t <= end; t++) perSecond[t] = band;

    const recoverEnd = Math.min(duration, end + RECOVERY_WINDOW);
    for (let t = end + 1; t <= recoverEnd; t++) {
      if (perSecond[t] === "high") perSecond[t] = "recovered";
    }
  }

  for (const item of transcript) {
    if (item.importance !== "high") continue;
    const start = Math.max(0, Math.round(item.start));
    const end = Math.min(duration, Math.round(item.end));
    for (let t = start; t <= end; t++) perSecond[t] = "key";
  }

  const bands: { band: TimelineBand; start: number; end: number }[] = [];
  let segStart = 0;
  let segBand = perSecond[0];
  for (let t = 1; t <= duration; t++) {
    if (perSecond[t] !== segBand) {
      bands.push({ band: segBand, start: segStart, end: t });
      segStart = t;
      segBand = perSecond[t];
    }
  }
  bands.push({ band: segBand, start: segStart, end: duration });

  return bands;
}
