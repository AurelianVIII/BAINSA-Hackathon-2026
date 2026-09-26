/**
 * Shared domain types for FocusAid.
 *
 * Owned jointly by all developers — keep changes minimal and additive.
 * If you need a feature-specific type, prefer defining it next to your
 * feature (e.g. src/lib/attention/types.ts) instead of adding it here.
 */

export interface TranscriptItem {
  id: string;
  /** Seconds from lesson start. */
  start: number;
  /** Seconds from lesson start. */
  end: number;
  text: string;
  topic: string;
  importance?: "normal" | "high";
}

export type AttentionEventType = "looking-away" | "confusion" | "low-attention";

export interface AttentionEvent {
  id: string;
  /** Seconds from lesson start. */
  start: number;
  /** Seconds from lesson start. */
  end: number;
  type: AttentionEventType;
  /** 0-1 confidence score for the simulated detector. */
  confidence: number;
}

export interface CatchUpResult {
  title: string;
  bullets: string[];
  keyIdea: string;
  startTime: number;
  endTime: number;
}
