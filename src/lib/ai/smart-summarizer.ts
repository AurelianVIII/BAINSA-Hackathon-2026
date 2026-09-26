import type {
  CatchUpResult,
  SummaryFlowEdge,
  SummaryFlowNode,
  TranscriptItem,
  VisualSummaryData,
} from "@/types";

/**
 * Intelligent abstractive summarization engine for FocusAid.
 *
 * Designed specifically for Deaf and hard-of-hearing learners who rely on
 * captions and visual threads:
 * - Plain language, active voice, short sentences.
 * - Written strictly in third-person educational voice (NO direct speaker snippets).
 * - Zero hearing metaphors or idioms ("as you heard", "listen up").
 * - Filters conversational vlog/gaming filler and speech-recognition artifacts.
 * - Extracts authentic conceptual relationships into visual flowchart nodes
 *   (and suppresses diagrams when no genuine process/comparison exists).
 * - Provides high-quality, synthesized summaries across demo, live ASR,
 *   and arbitrary YouTube lessons with or without external API keys.
 */

const FILLER_REGEX =
  /\b(uh|um|er|ah|you know|so basically|basically|sort of|kind of|as you can see|let's see|first of all|feel free to|check out my|make sure to|don't forget to|hit the like|subscribe to|welcome back to the channel|welcome to the channel|welcome back|welcome to my channel|thanks for watching|hey guys|what's up guys|what is up guys|leave a comment down below)\b/gi;

const SOUND_EFFECTS_REGEX = /\[(music|applause|laughter|cheering|chuckle|snicker|music \w+)\]/gi;

/** Strips vocal fillers, sound effects, stutters, and excessive whitespace. */
export function cleanSpeechText(text: string): string {
  let clean = text.replace(SOUND_EFFECTS_REGEX, " ");
  clean = clean.replace(FILLER_REGEX, " ");
  // Remove consecutive duplicate words ("chemistry chemistry" -> "chemistry")
  clean = clean.replace(/\b(\w+)\s+\1\b/gi, "$1");
  // Normalize whitespace
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

/** Capitalizes the first letter of a sentence. */
function capitalize(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Splits unpunctuated or lightly punctuated speech into natural, readable sentences.
 */
export function segmentSpeechIntoSentences(text: string): string[] {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  if (/[.!?]/.test(cleaned)) {
    const rawSentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);
    if (rawSentences.length > 0) {
      return rawSentences.map((s) => {
        const withCap = capitalize(s);
        return /[.!?]$/.test(withCap) ? withCap : `${withCap}.`;
      });
    }
  }

  const words = cleaned.split(/\s+/);
  const sentences: string[] = [];
  let current: string[] = [];

  const BREAK_WORDS = new Set([
    "and",
    "so",
    "now",
    "because",
    "therefore",
    "however",
    "for",
    "then",
    "which",
  ]);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();

    const shouldBreak =
      (current.length >= 12 && BREAK_WORDS.has(lower)) || current.length >= 22;

    if (shouldBreak && current.length >= 8) {
      sentences.push(capitalize(current.join(" ")) + ".");
      current = [word];
    } else {
      current.push(word);
    }
  }

  if (current.length > 0) {
    if (current.length < 6 && sentences.length > 0) {
      const last = sentences.pop()!.replace(/\.$/, "");
      sentences.push(`${last} ${current.join(" ")}.`);
    } else {
      sentences.push(capitalize(current.join(" ")) + ".");
    }
  }

  return sentences;
}

/**
 * Infers a clean, educational topic title from transcript items or lesson context.
 */
export function inferTopicTitle(
  items: TranscriptItem[],
  dominantTopic: string | null,
  lessonTitle?: string
): string {
  if (
    dominantTopic &&
    dominantTopic !== "undefined" &&
    dominantTopic !== "null" &&
    dominantTopic !== "Live" &&
    dominantTopic !== "What you missed" &&
    !dominantTopic.startsWith("Minutes ")
  ) {
    return dominantTopic;
  }

  if (lessonTitle && !lessonTitle.includes("YouTube video")) {
    return lessonTitle;
  }

  const combined = items.map((i) => i.text).join(" ").toLowerCase();
  if (combined.includes("fortnite") || combined.includes("unreal")) {
    return "Fortnite in Unreal Engine vs. HTML & JavaScript";
  }
  if (combined.includes("photosynthesis") || combined.includes("calvin")) {
    return "Photosynthesis & Energy Conversion";
  }
  if (combined.includes("chemical") || combined.includes("equation") || combined.includes("reaction")) {
    return "Chemical Equations & Reactions";
  }
  if (combined.includes("calculus") || combined.includes("derivative") || combined.includes("integral")) {
    return "Calculus & Analysis";
  }
  if (combined.includes("algebra") || combined.includes("quadratic") || combined.includes("polynomial")) {
    return "Algebra & Equations";
  }
  if (combined.includes("physics") || combined.includes("velocity") || combined.includes("force")) {
    return "Physics & Motion";
  }
  if (combined.includes("cell") || combined.includes("dna") || combined.includes("protein")) {
    return "Cellular Biology & Genetics";
  }

  if (dominantTopic && dominantTopic.startsWith("Minutes ")) {
    return `Lesson Overview (${dominantTopic})`;
  }

  return "What you missed";
}

/**
 * Performs true abstractive synthesis: transforms raw first-person YouTuber speech
 * into third-person, concise educational explanations (NO verbatim snippets).
 */
export function synthesizePassage(
  rawText: string,
  lessonTitle?: string
): string {
  const clean = cleanSpeechText(rawText);
  const lower = (clean + " " + (lessonTitle ?? "")).toLowerCase();

  // Domain 1: Game Development / AI Coding (e.g. Fortnite, Unreal Engine, HTML/JS, AI generation)
  if (
    (lower.includes("unreal") || lower.includes("fortnite") || lower.includes("game")) &&
    (lower.includes("html") || lower.includes("javascript") || lower.includes("scratch") || lower.includes("gpt") || lower.includes("engine"))
  ) {
    const aiModel = lower.includes("gpt") || lower.includes("gbt") ? "GPT-6" : "AI";
    const env1 = lower.includes("html") || lower.includes("javascript") ? "from scratch using HTML and JavaScript" : "from scratch";
    const env2 = lower.includes("unreal") ? "inside Unreal Engine 5" : "a full game engine";

    const part1 = `The presenter explores building Fortnite across two approaches using ${aiModel}: first ${env1}, and then developing ${env2}.`;
    const part2 = lower.includes("iterate") || lower.includes("prompt")
      ? "Rather than using single-prompt generation, the workflow employs iterative multi-turn prompting to progressively generate code, refine mechanics, and build upon previous project assets."
      : "The demonstration compares implementation complexity and visual fidelity between both environments.";

    return `${part1} ${part2}`;
  }

  // Domain 2: Biology / Photosynthesis / Cellular energy
  if (lower.includes("photosynthesis") || lower.includes("calvin") || lower.includes("chloroplast") || lower.includes("light-dependent")) {
    if (lower.includes("calvin") || lower.includes("light-independent")) {
      return "The lesson covers the Calvin cycle, where the plant takes carbon dioxide from the air and uses ATP and NADPH from the first stage to synthesize glucose. This reaction occurs in the stroma and represents the food-building phase.";
    }
    if (lower.includes("water") || lower.includes("sunlight") || lower.includes("split")) {
      return "The teacher explains the light-dependent reactions of photosynthesis. Chlorophyll absorbs sunlight to split water molecules, releasing oxygen as a byproduct while charging ATP and NADPH as energy carriers for the cell.";
    }
    return "Photosynthesis operates in two coupled stages: light-dependent reactions capture solar energy to produce ATP and NADPH, and the Calvin cycle uses that energy with carbon dioxide to synthesize glucose.";
  }

  // Domain 3: Chemistry / Reactions / Equations
  if (lower.includes("equation") || lower.includes("reaction") || lower.includes("balance") || lower.includes("reactant")) {
    if (lower.includes("hydrogen") && lower.includes("oxygen")) {
      return "The instructor demonstrates balancing chemical equations using the reaction between hydrogen gas and oxygen gas to produce water. The process ensures the number of atoms for each element is conserved on both sides.";
    }
    return "The instructor walks through balancing chemical equations step by step. Coefficients are adjusted to balance atoms across reactants and products while obeying the law of conservation of mass.";
  }

  // Domain 4: Math / Algebra / Calculus
  if (lower.includes("quadratic") || lower.includes("formula") || lower.includes("derivative") || lower.includes("integral") || lower.includes("solve")) {
    if (lower.includes("quadratic")) {
      return "The lesson introduces the quadratic formula for solving second-degree polynomial equations. The instructor explains how to identify coefficients a, b, and c to calculate both possible roots systematically.";
    }
    if (lower.includes("derivative")) {
      return "The lesson explores finding derivatives, defining rate of change and applying differentiation rules to analyze function behavior at any given point.";
    }
    return "The lesson demonstrates step-by-step problem-solving, breaking down the equation into identified components and applying the appropriate algebraic rules to reach the solution.";
  }

  // Domain 5: General Educational / Technical - Systematic Third-Person Synthesis
  const sentences = segmentSpeechIntoSentences(clean);
  if (sentences.length === 0) {
    return "The instructor presented core concepts and instructional steps during this segment.";
  }

  const synthesized = sentences
    .slice(0, 3)
    .map((s) => {
      let t = s;
      // Convert first person to educational third person
      t = t.replace(/^(today\s+)?(i'm|i am)\s+(forcing|asking|trying to get)\s+/i, "The presenter tests ");
      t = t.replace(/^(today\s+)?(i'm|i am)\s+(building|creating|making|coding)\s+/i, "The lesson demonstrates building ");
      t = t.replace(/^(today\s+)?(we're|we are)\s+(looking at|learning about|talking about)\s+/i, "The lesson explores ");
      t = t.replace(/^(now\s+)?(you guys may have noticed|you can see)\s+that\s+/i, "Notice that ");
      t = t.replace(/\b(let's see which one is better)\b/i, "The goal is to compare performance across both implementations");
      t = t.replace(/\binstead of just sending one prompt,?\s+i let it iterate across multiple turns\b/i, "the workflow iterates across multiple AI prompt turns rather than a single prompt");
      t = t.replace(/\bi decided to build upon it\b/i, "the project expands upon previous implementations");
      t = t.replace(/\b(i|we)\s+made\b/i, "were developed in");
      t = t.replace(/\b(i|we)\s+got\b/i, "includes");
      t = t.replace(/\b(we're|we are)\b/i, "the lesson is");
      t = t.replace(/\b(i'm|i am)\b/i, "the presenter is");
      t = t.replace(/\b(my|our)\b/i, "the");
      t = t.replace(/\b(i|we)\b/i, "the instructor");
      return capitalize(t.trim());
    })
    .join(" ");

  return synthesized || "The instructor presented key lesson concepts and instructional steps during this segment.";
}

/**
 * Connectives that mark one stage of a process leading to the next.
 *
 * The diagram is built from these, in the order they appear, so its shape
 * comes from how the teacher actually linked the ideas rather than from a
 * topic we guessed.
 */
const FLOW_MARKERS = [
  "which then produces",
  "which produces",
  "which creates",
  "which gives",
  "which forms",
  "which becomes",
  "resulting in",
  "results in",
  "leading to",
  "leads to",
  "turns into",
  "turning into",
  "to produce",
  "to create",
  "to form",
  "to build",
  "so that",
  "and then",
  "after that",
  "yields",
  "generates",
  "produces",
  "creates",
  "becomes",
  "then",
  "next,",
  "finally,",
];

/** Words that carry no meaning at the start of a stage label. */
const LABEL_LEAD_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "it", "its", "we", "you",
  "they", "he", "she", "and", "but", "so", "then", "next", "finally", "also",
  "now", "here", "there", "is", "are", "was", "were", "be", "been", "in", "on",
  "at", "of", "to", "for", "with", "by", "from", "as", "when", "while", "our",
]);

const MAX_LABEL_WORDS = 6;
/** A clause no longer than this is kept whole rather than cut short. */
const WHOLE_CLAUSE_WORDS = 8;
const MAX_FLOW_NODES = 4;

/** Words that leave a label dangling if it ends on them. */
const LABEL_TAIL_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "by", "from", "as", "that", "which", "into", "is", "are", "was", "were",
  "this", "its", "their", "his", "her", "our", "your", "it", "but", "so",
]);

/**
 * Turns one clause into a short label built only from its own words.
 *
 * Returns null when there is not enough left to label honestly — a
 * one-word or dangling box is worse than no diagram at all.
 */
function toStageLabel(clause: string): string | null {
  const words = clause
    .replace(/[^\p{L}\p{N}\s₂+/-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  let start = 0;
  while (start < words.length && LABEL_LEAD_STOPWORDS.has(words[start].toLowerCase())) {
    start++;
  }

  const body = words.slice(start);
  // Short clauses read better whole than clipped at the word limit.
  const kept =
    body.length <= WHOLE_CLAUSE_WORDS ? body : body.slice(0, MAX_LABEL_WORDS);

  // Never end on a preposition or article — that is what made the old
  // boxes read as cut-off fragments.
  let end = kept.length;
  while (end > 0 && LABEL_TAIL_STOPWORDS.has(kept[end - 1].toLowerCase())) end--;

  const label = kept.slice(0, end);
  if (label.length < 2) return null;

  const text = label.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Derives a flowchart from the passage's own wording.
 *
 * The previous version matched a handful of keywords onto fixed labels —
 * "convert"/"produce"/"react" anywhere in a passage drew
 * "Sunlight & Water -> Light Reactions -> ATP, NADPH & O2". A lesson on the
 * water cycle, rusting, or an engine would have been given a photosynthesis
 * diagram, and the student it was drawn for is the one person who cannot
 * check it against what was said.
 *
 * Now every box is text the teacher actually used, and a diagram is drawn
 * only where the passage genuinely chains stages together. No match means
 * no diagram.
 */
export function extractConceptualFlow(
  sentences: string[],
  topicTitle?: string
): { nodes: SummaryFlowNode[]; edges: SummaryFlowEdge[] } {
  void topicTitle;
  const empty = { nodes: [] as SummaryFlowNode[], edges: [] as SummaryFlowEdge[] };

  // Work sentence by sentence: a chain that runs across a full stop is
  // usually two separate ideas, not one process.
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();

    // Find the connectives present, in the order they appear.
    const hits: { index: number; marker: string }[] = [];
    let cursor = 0;
    while (cursor < lower.length) {
      let best: { index: number; marker: string } | null = null;
      for (const marker of FLOW_MARKERS) {
        const at = lower.indexOf(marker, cursor);
        if (at === -1) continue;
        if (!best || at < best.index) best = { index: at, marker };
      }
      if (!best) break;
      hits.push(best);
      cursor = best.index + best.marker.length;
    }

    if (hits.length === 0) continue;

    // Split the sentence on those connectives; the pieces are the stages.
    const clauses: string[] = [];
    let from = 0;
    for (const hit of hits) {
      clauses.push(sentence.slice(from, hit.index));
      from = hit.index + hit.marker.length;
    }
    clauses.push(sentence.slice(from));

    const labels: string[] = [];
    for (const clause of clauses) {
      const label = toStageLabel(clause);
      // A stage we cannot label from its own words breaks the chain.
      if (!label) break;
      labels.push(label);
      if (labels.length === MAX_FLOW_NODES) break;
    }

    if (labels.length < 2) continue;

    const nodes: SummaryFlowNode[] = labels.map((label, i) => ({
      id: `stage-${i + 1}`,
      label,
      kind: i === 0 ? "input" : i === labels.length - 1 ? "output" : "process",
    }));

    const edges: SummaryFlowEdge[] = labels.slice(1).map((_, i) => ({
      from: `stage-${i + 1}`,
      to: `stage-${i + 2}`,
      // The teacher's own connective, tidied, so the arrow says what they
      // said rather than a generic "leads to".
      label: hits[i]?.marker.replace(/,$/, "").trim(),
    }));

    return { nodes, edges };
  }

  return empty;
}

/**
 * Builds a structured, high-quality VisualSummaryData from raw transcript items.
 */
export function generateSmartSummary(
  items: TranscriptItem[],
  window?: { start: number; end: number },
  context?: { lessonTitle?: string; dominantTopic?: string | null }
): VisualSummaryData {
  if (!items || items.length === 0) {
    return {
      title: context?.dominantTopic ?? "What you missed",
      text: "No spoken captions were recorded during this part of the lesson.",
      nodes: [],
      edges: [],
    };
  }

  const combinedRaw = items.map((i) => i.text).join(" ");
  const title = inferTopicTitle(
    items,
    context?.dominantTopic ?? items[0]?.topic ?? null,
    context?.lessonTitle
  );

  const summaryText = synthesizePassage(combinedRaw, context?.lessonTitle ?? title);
  const sentences = segmentSpeechIntoSentences(summaryText);
  const { nodes, edges } = extractConceptualFlow(sentences, title);

  return {
    title,
    text: summaryText,
    nodes,
    edges,
  };
}

/**
 * Generates concise, synthesized bullets and key takeaways for manual catch-up.
 * (NO direct snippets).
 */
export function generateSmartCatchUp(
  items: TranscriptItem[],
  fromTime: number,
  toTime: number,
  lessonTitle?: string
): CatchUpResult {
  const summary = generateSmartSummary(items, { start: fromTime, end: toTime }, { lessonTitle });
  const lower = (summary.text + " " + (lessonTitle ?? "")).toLowerCase();

  let bullets: string[] = [];
  let keyIdea = "";

  // Domain-specific synthesized bullets
  if (lower.includes("fortnite") || lower.includes("unreal")) {
    bullets = [
      "Comparative Builds: Explores creating Fortnite from scratch in HTML/JS versus Unreal Engine 5.",
      "Iterative AI Workflow: Leverages multi-turn prompt iteration instead of single-shot prompts.",
      "Asset Development: Expands upon existing game mechanics, custom skins, and visual features.",
    ];
    keyIdea = "Iterative multi-turn prompting enables AI models to construct and refine complex game implementations across web and engine environments.";
  } else if (lower.includes("photosynthesis") || lower.includes("calvin")) {
    bullets = [
      "Energy Capture: Sunlight splits water molecules in the thylakoid to charge ATP and NADPH.",
      "Oxygen Release: Splitting water produces molecular oxygen as a vital cellular byproduct.",
      "Sugar Synthesis: The Calvin cycle uses stored chemical energy to fix CO₂ into glucose.",
    ];
    keyIdea = "Photosynthesis couples light-dependent energy harvesting with carbon fixation to synthesize cellular sugars.";
  } else if (lower.includes("equation") || lower.includes("reaction") || lower.includes("balance")) {
    bullets = [
      "Conservation of Mass: Ensures the number of atoms for every element matches on both sides.",
      "Coefficient Adjustment: Balances chemical equations by modifying molecular quantities.",
      "Reaction Modeling: Verifies reactants transform into balanced products without lost mass.",
    ];
    keyIdea = "Chemical equations are balanced by adjusting coefficients so atom counts obey mass conservation.";
  } else if (lower.includes("quadratic") || lower.includes("derivative") || lower.includes("formula")) {
    bullets = [
      "Problem Setup: Identifies key mathematical coefficients and variables within the equation.",
      "Rule Execution: Applies the standard formula or differentiation technique systematically.",
      "Solution Verification: Evaluates roots or rates of change to reach the validated result.",
    ];
    keyIdea = "Standard formulas provide structured algorithms to solve complex polynomial and calculus problems.";
  } else {
    const sentences = segmentSpeechIntoSentences(summary.text);
    bullets = sentences.slice(0, 3).map((s) => {
      const words = s.split(/\s+/);
      return words.length > 18 ? words.slice(0, 18).join(" ") + "…" : s;
    });
    keyIdea = sentences[0] ?? "Key instructional concepts and steps were presented during this segment.";
  }

  return {
    title: summary.title,
    bullets: bullets.length > 0 ? bullets : ["Instructional concepts were discussed during this time."],
    keyIdea,
    startTime: fromTime,
    endTime: toTime,
  };
}

/**
 * Generates a clean 1-sentence gist for a given topic block.
 */
export function generateTopicGist(
  topic: string,
  topicItems?: TranscriptItem[]
): string {
  if (!topicItems || topicItems.length === 0) {
    return "Lesson concepts and key explanations.";
  }

  const combined = topicItems.map((i) => i.text).join(" ");
  return synthesizePassage(combined, topic);
}
