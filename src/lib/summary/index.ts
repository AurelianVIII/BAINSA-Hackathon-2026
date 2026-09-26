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
  { id: "light", label: "Light-dependent reactions", kind: "process" },
  { id: "atp", label: "ATP + NADPH", kind: "process" },
  { id: "calvin", label: "Calvin cycle", kind: "process" },
  { id: "glucose", label: "Glucose", kind: "output" },
];

/**
 * Secondary molecules ride on the edges rather than becoming boxes — it
 * keeps the chain readable in a narrow panel and still shows what enters
 * and leaves at each step.
 */
const FULL_EDGES: SummaryFlowEdge[] = [
  { from: "sun", to: "light", label: "+ water" },
  { from: "light", to: "atp", label: "releases O₂" },
  { from: "atp", to: "calvin", label: "+ CO₂" },
  { from: "calvin", to: "glucose" },
];

/**
 * Which part of the diagram matters for each topic. Anything not listed
 * falls back to the full diagram, so an unexpected topic can never render
 * an empty box.
 */
const TOPIC_NODE_IDS: Record<string, string[]> = {
  "Calvin Cycle": ["light", "atp", "calvin", "glucose"],
  "Light-Dependent Reactions": ["sun", "light", "atp"],
  "ATP and NADPH": ["light", "atp", "calvin"],
  "Glucose Production": ["atp", "calvin", "glucose"],
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
 * Every node id the diagram knows how to draw. The AI route constrains
 * the model to this set, so a generated summary can pick which part of
 * the chain to show but cannot invent a node with no layout position.
 */
export const DIAGRAM_NODE_IDS = FULL_NODES.map((node) => node.id);

/**
 * Build a diagram from a caller-supplied list of node ids, falling back
 * to the full chain if the list is empty or contains nothing known.
 */
export function graphForNodeIds(ids: string[]) {
  const known = ids.filter((id) => DIAGRAM_NODE_IDS.includes(id));
  return known.length > 0
    ? subgraph(known)
    : { nodes: FULL_NODES, edges: FULL_EDGES };
}

/**
 * Turns a missed time window into a short written summary plus the part
 * of the reaction diagram that explains it.
 *
 * Always returns a diagram with at least one node — an empty panel during
 * the demo is worse than a slightly too-broad one.
 */
/** Trim a passage to roughly `limit` characters on a sentence boundary. */
function condense(text: string, limit = 320): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > limit * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.trim()}…`;
}

/**
 * Summary for a lesson this module has no authored content for — anything
 * transcribed live or pulled from a YouTube video.
 *
 * Reports what was actually said and draws no diagram. The authored graph
 * below describes the demo lesson specifically, and rendering it for an
 * unrelated lesson would state, with a diagram, things the teacher never
 * said. For a product a deaf student relies on for access, no diagram beats
 * a confident wrong one.
 */
function summariseUnknownLesson(
  items: TranscriptItem[],
  topic: string | null
): VisualSummaryData {
  const said = condense(items.map((item) => item.text).join(" "));

  // "Live" is the bucket label the transcriber stamps on every line, not a
  // subject — it tells the student nothing as a heading.
  const heading = !topic || topic === "Live" ? "What you missed" : topic;

  return {
    title: heading,
    text: said || "Nothing was captured during this stretch of the lesson.",
    nodes: [],
    edges: [],
  };
}

export function buildVisualSummary(
  transcriptItems: TranscriptItem[],
  window: { start: number; end: number }
): VisualSummaryData {
  const items = getItemsInWindow(transcriptItems, window);
  const topic = dominantTopic(items, window);

  // The authored text/diagram only covers the built-in demo lesson's
  // topics. Anything else gets summarised from its own transcript.
  const authored = topic ? TOPIC_TEXT[topic] : undefined;
  if (!authored) return summariseUnknownLesson(items, topic);

  const ids = topic ? TOPIC_NODE_IDS[topic] : undefined;
  const graph = ids ? subgraph(ids) : { nodes: FULL_NODES, edges: FULL_EDGES };

  return { title: topic as string, text: authored, nodes: graph.nodes, edges: graph.edges };
}
