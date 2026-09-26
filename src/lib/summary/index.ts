import type { TranscriptItem } from "@/types";
import type {
  SummaryFlowEdge,
  SummaryFlowNode,
  VisualSummaryData,
} from "./types";

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * Groups transcript lines by topic. Used by the Visual Summary tab and as
 * the basis for picking which part of the reaction diagram to show.
 */
export function groupByTopic(
  transcriptItems: TranscriptItem[]
): Record<string, TranscriptItem[]> {
  return transcriptItems.reduce<Record<string, TranscriptItem[]>>((acc, item) => {
    (acc[item.topic] ??= []).push(item);
    return acc;
  }, {});
}

/**
 * The full photosynthesis diagram. Every per-topic view is a subset of
 * this, so the diagram stays consistent whichever moment the student
 * asks about.
 */
const FULL_NODES: SummaryFlowNode[] = [
  { id: "sun", label: "Sunlight", kind: "input" },
  { id: "water", label: "Water (H₂O)", kind: "input" },
  { id: "light", label: "Light-dependent reactions", kind: "process" },
  { id: "oxygen", label: "Oxygen (O₂)", kind: "output" },
  { id: "atp", label: "ATP + NADPH", kind: "process" },
  { id: "co2", label: "Carbon dioxide (CO₂)", kind: "input" },
  { id: "calvin", label: "Calvin cycle", kind: "process" },
  { id: "glucose", label: "Glucose", kind: "output" },
];

const FULL_EDGES: SummaryFlowEdge[] = [
  { from: "sun", to: "light" },
  { from: "water", to: "light" },
  { from: "light", to: "oxygen", label: "released" },
  { from: "light", to: "atp" },
  { from: "atp", to: "calvin", label: "energy" },
  { from: "co2", to: "calvin" },
  { from: "calvin", to: "glucose" },
];

/**
 * Which part of the diagram matters for each topic. Anything not listed
 * falls back to the full diagram, so an unexpected topic can never render
 * an empty box.
 */
const TOPIC_NODE_IDS: Record<string, string[]> = {
  "Calvin Cycle": ["light", "atp", "co2", "calvin", "glucose"],
  "Light-Dependent Reactions": ["sun", "water", "light", "oxygen", "atp"],
  "ATP and NADPH": ["light", "atp", "calvin"],
  "Glucose Production": ["atp", "co2", "calvin", "glucose"],
};

/**
 * Plain-language summaries, written by hand.
 *
 * Deliberately NOT built by concatenating transcript lines: replaying the
 * transcript verbatim is the exact problem this product exists to solve.
 * Short sentences, no idioms, and no references to hearing.
 */
const TOPIC_TEXT: Record<string, string> = {
  "Calvin Cycle":
    "While you were away, the teacher moved on to the Calvin cycle. It is also called the light-independent reactions. It takes carbon dioxide from the air and uses the ATP and NADPH made in the first stage to build glucose.",
  "Light-Dependent Reactions":
    "Chlorophyll absorbs sunlight and uses that energy to split water. This releases oxygen and makes two energy carriers: ATP and NADPH.",
  "ATP and NADPH":
    "ATP and NADPH are the energy carriers made in the first stage. Think of them as battery packs the plant spends in the next stage.",
  "Glucose Production":
    "After several turns of the cycle the plant makes G3P, which is rearranged into glucose. Glucose is the sugar the plant uses for energy and growth.",
  Overview:
    "Photosynthesis has two stages. The first uses sunlight and water to make ATP and NADPH. The second uses those, plus carbon dioxide, to make glucose.",
  "Real-World Applications":
    "Photosynthesis is the base of almost every food chain, and it keeps atmospheric carbon dioxide in check. Researchers are studying artificial photosynthesis to make clean fuels.",
};

const FALLBACK_TEXT =
  "Photosynthesis has two stages. The first uses sunlight and water to make ATP and NADPH. The second uses those, plus carbon dioxide, to make glucose.";

/** One-line gist per topic, for the lesson-at-a-glance tab. */
export function getTopicGist(topic: string): string {
  const text = TOPIC_TEXT[topic];
  if (!text) return FALLBACK_TEXT;

  const first = text.split(". ")[0];
  return first.endsWith(".") ? first : `${first}.`;
}

/** Transcript lines overlapping a time window. */
export function getItemsInWindow(
  transcriptItems: TranscriptItem[],
  window: { start: number; end: number }
): TranscriptItem[] {
  return transcriptItems.filter(
    (item) => item.end > window.start && item.start < window.end
  );
}

/**
 * The topic covering the most seconds of the window — not simply the
 * first one, because a missed window often straddles two topics and the
 * larger share is the one worth explaining.
 */
function dominantTopic(items: TranscriptItem[], window: { start: number; end: number }) {
  const seconds: Record<string, number> = {};

  for (const item of items) {
    const overlap =
      Math.min(item.end, window.end) - Math.max(item.start, window.start);
    if (overlap > 0) seconds[item.topic] = (seconds[item.topic] ?? 0) + overlap;
  }

  return Object.entries(seconds).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Filter the full diagram down to a set of node ids, keeping edges whole. */
function subgraph(ids: string[]) {
  const shown = new Set(ids);
  return {
    nodes: FULL_NODES.filter((node) => shown.has(node.id)),
    edges: FULL_EDGES.filter(
      (edge) => shown.has(edge.from) && shown.has(edge.to)
    ),
  };
}

/**
 * Turns a missed time window into a short written summary plus the part
 * of the reaction diagram that explains it.
 *
 * Always returns a diagram with at least one node — an empty panel during
 * the demo is worse than a slightly too-broad one.
 */
export function buildVisualSummary(
  transcriptItems: TranscriptItem[],
  window: { start: number; end: number }
): VisualSummaryData {
  const items = getItemsInWindow(transcriptItems, window);
  const topic = dominantTopic(items, window);

  if (!topic) {
    return {
      title: "What you missed",
      text: FALLBACK_TEXT,
      nodes: FULL_NODES,
      edges: FULL_EDGES,
    };
  }

  const ids = TOPIC_NODE_IDS[topic];
  const graph = ids ? subgraph(ids) : { nodes: FULL_NODES, edges: FULL_EDGES };

  return {
    title: topic,
    text: TOPIC_TEXT[topic] ?? FALLBACK_TEXT,
    nodes: graph.nodes,
    edges: graph.edges,
  };
}
