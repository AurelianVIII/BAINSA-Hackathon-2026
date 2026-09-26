import type { SummaryFlowNode } from "./types";

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * The diagram is a single vertical chain, which is what the design calls
 * for — sun, light-dependent reactions, ATP/NADPH, Calvin cycle, glucose.
 * Secondary molecules (water, oxygen, CO₂) ride on the edges as labels
 * rather than becoming boxes, which keeps the chart legible in a narrow
 * side panel instead of needing a wide one.
 */

export const VIEW_W = 320;
export const NODE_W = 244;
export const NODE_H = 50;
export const ROW_GAP = 86;
const TOP_PAD = 22;

/** Fixed reaction order. Anything unknown sorts to the end. */
const CHAIN_ORDER = ["sun", "light", "atp", "calvin", "glucose"];

function chainIndex(id: string) {
  const i = CHAIN_ORDER.indexOf(id);
  return i === -1 ? CHAIN_ORDER.length : i;
}

export function layoutChain(nodes: SummaryFlowNode[]) {
  const ordered = [...nodes].sort(
    (a, b) => chainIndex(a.id) - chainIndex(b.id)
  );

  const positions = new Map(
    ordered.map((node, i) => [
      node.id,
      { x: VIEW_W / 2, y: TOP_PAD + NODE_H / 2 + i * ROW_GAP },
    ])
  );

  const viewH =
    TOP_PAD * 2 + NODE_H + Math.max(0, ordered.length - 1) * ROW_GAP;

  return { ordered, positions, viewH };
}
