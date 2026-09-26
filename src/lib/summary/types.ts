/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * These types now live in the shared contract (PC1 landed them in
 * c08f12f). Re-exported here so every PC4 module keeps importing from a
 * single place — the indirection cost nothing and made the swap a
 * one-file change.
 */

export type {
  MissedWindow,
  SummaryFlowEdge,
  SummaryFlowNode,
  VisualSummaryData,
} from "@/types";
