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

type BandSegment = { band: TimelineBand; start: number; end: number };

/** Collapses a per-second band array into contiguous segments. */
function runLengthEncodeBands(perSecond: TimelineBand[], duration: number): BandSegment[] {
  const bands: BandSegment[] = [];
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

/** Marks transcript lines tagged `importance: "high"` as the "key" band,
 * overwriting whatever was there — key content always wins ties. Shared by
 * both the scripted and the live band builders since it's real lesson
 * content either way, not simulated attention data. */
function applyKeyContentBand(
  perSecond: TimelineBand[],
  transcript: TranscriptItem[],
  duration: number
) {
  for (const item of transcript) {
    if (item.importance !== "high") continue;
    const start = Math.max(0, Math.round(item.start));
    const end = Math.min(duration, Math.round(item.end));
    for (let t = start; t <= end; t++) perSecond[t] = "key";
  }
}

/** low-attention is grouped with "away" — both represent reduced attention. */
const EVENT_BAND: Record<AttentionEvent["type"], TimelineBand> = {
  "looking-away": "away",
  confusion: "confused",
  "low-attention": "away",
};

const RECOVERY_WINDOW = 6;

/**
 * Segments the full lesson duration into coloured timeline bands from the
 * scripted demo data: "key" (purple) where the transcript marks high
 * importance, "away"/"confused" from the simulated attentionEvents, a short
 * "recovered" band right after an event ends, and "high" everywhere else.
 */
export function buildTimelineBands(
  events: AttentionEvent[],
  transcript: TranscriptItem[],
  duration: number
): BandSegment[] {
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

  applyKeyContentBand(perSecond, transcript, duration);

  return runLengthEncodeBands(perSecond, duration);
}

/** Below this gaze, a recorded live second reads as "away". */
const LIVE_GAZE_AWAY_THRESHOLD = 0.4;
/** Above this confusion, a recorded live second reads as "confused" (only
 * checked once gaze is high enough that it isn't already "away"). */
const LIVE_CONFUSION_THRESHOLD = 0.5;

/**
 * Segments the lesson duration into coloured timeline bands from *real*
 * recorded webcam detections instead of the scripted demo data — seconds
 * with no recording yet stay "high" (neutral), not simulated. Used instead
 * of `buildTimelineBands` whenever real capture is active, so the pre-built
 * demo timeline isn't shown mixed in with genuine live readings.
 */
export function buildLiveTimelineBands(
  recordedSamples: Record<number, AttentionSample>,
  transcript: TranscriptItem[],
  duration: number
): BandSegment[] {
  const perSecond: TimelineBand[] = new Array(duration + 1).fill("high");

  for (let t = 0; t <= duration; t++) {
    const sample = recordedSamples[t];
    if (!sample) continue;
    if (sample.gaze < LIVE_GAZE_AWAY_THRESHOLD) perSecond[t] = "away";
    else if (sample.confusion > LIVE_CONFUSION_THRESHOLD) perSecond[t] = "confused";
  }

  applyKeyContentBand(perSecond, transcript, duration);

  return runLengthEncodeBands(perSecond, duration);
}
