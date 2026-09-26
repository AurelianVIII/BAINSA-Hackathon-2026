import type { AttentionEvent } from "@/types";

/**
 * Simulated attention/gaze events for the demo lesson. Real eye tracking is
 * out of scope for this prototype — this is placeholder data for the
 * attention feature team to build against.
 */
export const attentionEvents: AttentionEvent[] = [
  { id: "a1", start: 30, end: 40, type: "low-attention", confidence: 0.62 },
  { id: "a2", start: 75, end: 92, type: "looking-away", confidence: 0.88 },
  { id: "a3", start: 150, end: 168, type: "confusion", confidence: 0.71 },
  { id: "a4", start: 205, end: 218, type: "low-attention", confidence: 0.55 },
  { id: "a5", start: 258, end: 270, type: "looking-away", confidence: 0.8 },
];
