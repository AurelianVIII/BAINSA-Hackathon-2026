import type { AttentionEvent, AttentionSample } from "@/types";
import { attentionEvents } from "@/data/attention-events";

const DURATION = 300;
const RAMP = 5;

const BASELINE = { gaze: 0.9, confusion: 0.08, engagement: 0.88 };

/** Target signal while each event type is at full intensity. */
const EVENT_PROFILE: Record<
  AttentionEvent["type"],
  { gaze: number; confusion: number; engagement: number }
> = {
  "looking-away": { gaze: 0.2, confusion: 0.72, engagement: 0.28 },
  confusion: { gaze: 0.45, confusion: 0.8, engagement: 0.35 },
  "low-attention": { gaze: 0.55, confusion: 0.25, engagement: 0.4 },
};

function smoothstep(x: number) {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
}

/** 0-1 ramp: eases in before the event, holds at 1 during it, eases out after. */
function eventWeightAt(t: number, event: AttentionEvent) {
  if (t < event.start - RAMP || t > event.end + RAMP) return 0;
  if (t < event.start) return smoothstep((t - (event.start - RAMP)) / RAMP);
  if (t <= event.end) return 1;
  return 1 - smoothstep((t - event.end) / RAMP);
}

/** Smooth, deterministic wiggle bounded to +/-0.03 — no Math.random(), reproducible. */
function noise(t: number, phase: number) {
  return 0.015 * Math.sin(t * 0.7 + phase) + 0.015 * Math.sin(t * 0.31 + phase * 1.7);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function generateAttentionSamples(): AttentionSample[] {
  const samples: AttentionSample[] = [];

  for (let t = 0; t <= DURATION; t++) {
    let gaze = BASELINE.gaze;
    let confusion = BASELINE.confusion;
    let engagement = BASELINE.engagement;

    for (const event of attentionEvents) {
      const weight = eventWeightAt(t, event);
      if (weight === 0) continue;
      const profile = EVENT_PROFILE[event.type];
      gaze += weight * (profile.gaze - BASELINE.gaze);
      confusion += weight * (profile.confusion - BASELINE.confusion);
      engagement += weight * (profile.engagement - BASELINE.engagement);
    }

    samples.push({
      t,
      gaze: clamp01(gaze + noise(t, 0)),
      confusion: clamp01(confusion + noise(t, 2)),
      engagement: clamp01(engagement + noise(t, 4)),
    });
  }

  return samples;
}

/**
 * Simulated 1s-resolution webcam attention signal for the demo lesson.
 * Deterministically derived from `attentionEvents` — real eye/expression
 * tracking is out of scope for this prototype (see ROADMAP.md risk #6).
 */
export const attentionSamples: AttentionSample[] = generateAttentionSamples();
