/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * TEMPORARY HOME for types that belong in `@/types` once PC1 lands the
 * shared contract. Defined here so PC4 is not blocked waiting on it, and
 * so we don't edit a shared file concurrently with three other people.
 *
 * When PC1 lands them, replace this entire file with a re-export:
 *
 *   export type {
 *     MissedWindow, SummaryFlowEdge, SummaryFlowNode, VisualSummaryData,
 *   } from "@/types";
 *
 * Every other PC4 module imports from here, so that is a one-file change.
 */

import type { AttentionEventType } from "@/types";

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
