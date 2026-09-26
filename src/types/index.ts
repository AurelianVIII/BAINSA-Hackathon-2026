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

/** One sampled frame of the simulated webcam attention signal. */
export interface AttentionSample {
  /** Seconds from lesson start. */
  t: number;
  /** 0-1, "gaze to screen". */
  gaze: number;
  /** 0-1, "brow" confusion signal — high is bad. */
  confusion: number;
  /** 0-1. */
  engagement: number;
}

/** Colour band for the attention timeline. */
export type TimelineBand = "high" | "away" | "confused" | "key" | "recovered";

export interface CatchUpResult {
  title: string;
  bullets: string[];
  keyIdea: string;
  startTime: number;
  endTime: number;
}

/** A stretch of lesson the student demonstrably missed. */
export interface MissedWindow {
  id: string;
  /** Seconds from lesson start. */
  start: number;
  /** Seconds from lesson start. */
  end: number;
  reason: AttentionEventType;
  /** TranscriptItem ids overlapping the window. */
  transcriptIds: string[];
  /** True if any overlapped item has importance: "high". */
  hitKeyContent: boolean;
}

/** Short caption chunk for the burned-in live captions overlay. */
export interface CaptionChunk {
  id: string;
  /** Parent TranscriptItem id. */
  itemId: string;
  /** Seconds from lesson start. */
  start: number;
  /** Seconds from lesson start. */
  end: number;
  text: string;
}

/** Nodes/edges for the generated summary flowchart. */
export interface SummaryFlowNode {
  id: string;
  label: string;
  kind: "input" | "process" | "output";
}

export interface SummaryFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface VisualSummaryData {
  title: string;
  text: string;
  nodes: SummaryFlowNode[];
  edges: SummaryFlowEdge[];
}
