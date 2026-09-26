import type { AttentionEventType } from "@/types";

/**
 * Feature-local until PC1 lands the shared `src/types/index.ts` additive
 * block (see ROADMAP.md §2) with the same shape — swap the import then.
 */
export interface MissedWindow {
  id: string;
  start: number;
  end: number;
  reason: AttentionEventType;
  /** TranscriptItem ids overlapping the window. */
  transcriptIds: string[];
  /** True if any overlapped item has importance: "high". */
  hitKeyContent: boolean;
}
