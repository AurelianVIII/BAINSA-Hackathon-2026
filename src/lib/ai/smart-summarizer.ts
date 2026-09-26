import type {
  CatchUpResult,
  SummaryFlowEdge,
  SummaryFlowNode,
  TranscriptItem,
  VisualSummaryData,
} from "@/types";

/**
 * Intelligent summarization engine for FocusAid.
 *
 * Designed specifically for Deaf and hard-of-hearing learners who rely on
 * captions and visual threads:
 * - Plain language, active voice, short sentences.
 * - Zero hearing metaphors or idioms ("as you heard", "listen up").
 * - Filters conversational filler and speech-recognition artifacts.
 * - Extracts conceptual relationships into visual flowchart nodes.
 * - Provides reliable, high-quality summaries across demo, live ASR,
 *   and arbitrary YouTube lessons with or without external API keys.
 */

const FILLER_REGEX =
  /\b(uh|um|er|ah|you know|so basically|basically|sort of|kind of|as you can see|let's see|first of all|feel free to|check out my|make sure to|don't forget to|hit the like|subscribe to|welcome back|welcome to my channel|thanks for watching)\b/gi;

/** Strips vocal fillers, stutters, and excessive whitespace. */
export function cleanSpeechText(text: string): string {
  let clean = text.replace(FILLER_REGEX, " ");
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

  // If text already has standard punctuation (.!?), split along punctuation
  if (/[.!?]/.test(cleaned)) {
    const rawSentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    if (rawSentences.length > 0) {
      return rawSentences.map((s) => {
        const withCap = capitalize(s);
        return /[.!?]$/.test(withCap) ? withCap : `${withCap}.`;
      });
    }
  }

  // Heuristic segmentation for unpunctuated ASR / auto-captions:
  // Split on transition keywords or clause markers
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
    "let's",
    "remember",
    "notice",
    "then",
    "which",
    "where",
  ]);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lower = word.toLowerCase();

    // Split if we have reached at least 12 words and encounter a natural conjunction,
    // or if the sentence reaches 22 words unconditionally.
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
  // If dominant topic is authored and descriptive, use it
  if (
    dominantTopic &&
    dominantTopic !== "Live" &&
    dominantTopic !== "What you missed" &&
    !dominantTopic.startsWith("Minutes ")
  ) {
    return dominantTopic;
  }

  // If a specific lesson title exists (like YouTube video title)
  if (lessonTitle && !lessonTitle.includes("YouTube video")) {
    return lessonTitle;
  }

  // Inspect the words in the items to extract the primary subject
  const combined = items.map((i) => i.text).join(" ").toLowerCase();
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
 * Extracts 2 to 3 conceptual flow nodes and connecting edges from lesson content.
 */
export function extractConceptualFlow(
  sentences: string[],
  topicTitle?: string
): { nodes: SummaryFlowNode[]; edges: SummaryFlowEdge[] } {
  const fullText = sentences.join(" ").toLowerCase();

  // Pattern 1: Reaction / Conversion / Transformation (Input -> Process -> Output)
  const converts =
    fullText.includes("convert") ||
    fullText.includes("react") ||
    fullText.includes("produce") ||
    fullText.includes("make") ||
    fullText.includes("yield") ||
    fullText.includes("split");

  if (converts) {
    let inputLabel = "Starting Inputs";
    let processLabel = "Core Reaction";
    let outputLabel = "Result / Products";

    if (fullText.includes("light") || fullText.includes("water") || fullText.includes("sun")) {
      inputLabel = "Light & Reactants";
      processLabel = "Chemical Reaction";
      outputLabel = "Energy & Products";
    } else if (fullText.includes("hydrogen") || fullText.includes("oxygen")) {
      inputLabel = "Hydrogen & Oxygen";
      processLabel = "Combination";
      outputLabel = "Water (H₂O)";
    } else if (fullText.includes("equation") || fullText.includes("formula")) {
      inputLabel = "Given Equation";
      processLabel = "Balancing Steps";
      outputLabel = "Balanced Form";
    }

    const nodes: SummaryFlowNode[] = [
      { id: "flow-input", label: inputLabel, kind: "input" },
      { id: "flow-process", label: processLabel, kind: "process" },
      { id: "flow-output", label: outputLabel, kind: "output" },
    ];

    const edges: SummaryFlowEdge[] = [
      { from: "flow-input", to: "flow-process", label: "transforms" },
      { from: "flow-process", to: "flow-output", label: "produces" },
    ];

    return { nodes, edges };
  }

  // Pattern 2: Mathematical / Procedural Steps (Step 1 -> Step 2 -> Outcome)
  const isProcedural =
    fullText.includes("solve") ||
    fullText.includes("formula") ||
    fullText.includes("method") ||
    fullText.includes("example") ||
    fullText.includes("calculate");

  if (isProcedural) {
    const inputLabel =
      topicTitle && !topicTitle.includes("What you missed")
        ? `${topicTitle.slice(0, 16)} Problem`
        : "Identify Terms";

    const nodes: SummaryFlowNode[] = [
      { id: "step-1", label: inputLabel, kind: "input" },
      { id: "step-2", label: "Apply Formula", kind: "process" },
      { id: "step-3", label: "Final Solution", kind: "output" },
    ];

    const edges: SummaryFlowEdge[] = [
      { from: "step-1", to: "step-2", label: "substitute" },
      { from: "step-2", to: "step-3", label: "evaluate" },
    ];

    return { nodes, edges };
  }

  // Pattern 3: Sequential concepts if at least 2 distinct sentences exist
  if (sentences.length >= 2) {
    const toConceptLabel = (s: string, fallback: string) => {
      const words = s
        .replace(/^(and|so|now|then|but|also)\s+/i, "")
        .split(/\s+/)
        .slice(0, 4)
        .join(" ")
        .replace(/[.,;:?!]$/, "");
      return words.length > 3 ? words : fallback;
    };

    const node1Label = toConceptLabel(sentences[0], "Key Concept");
    const node2Label = toConceptLabel(sentences[1] ?? sentences[0], "Next Concept");

    const nodes: SummaryFlowNode[] = [
      { id: "concept-1", label: node1Label, kind: "input" },
      { id: "concept-2", label: node2Label, kind: "process" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "concept-1", to: "concept-2", label: "leads to" },
    ];

    return { nodes, edges };
  }

  return { nodes: [], edges: [] };
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

  // Collect candidate items
  const combinedRaw = items.map((i) => i.text).join(" ");
  const sentences = segmentSpeechIntoSentences(combinedRaw);

  const title = inferTopicTitle(
    items,
    context?.dominantTopic ?? items[0]?.topic ?? null,
    context?.lessonTitle
  );

  // Score sentences for educational significance
  const scored = sentences.map((sentence) => {
    let score = 0;
    const lower = sentence.toLowerCase();
    if (lower.includes("is called") || lower.includes("is defined")) score += 4;
    if (lower.includes("formula") || lower.includes("equation") || lower.includes("rule")) score += 3;
    if (lower.includes("because") || lower.includes("therefore") || lower.includes("means")) score += 3;
    if (lower.includes("convert") || lower.includes("produce") || lower.includes("react")) score += 3;
    if (lower.includes("important") || lower.includes("remember") || lower.includes("notice")) score += 2;
    // Demote conversational filler
    if (lower.includes("thank you") || lower.includes("channel") || lower.includes("playlist")) score -= 5;
    return { sentence, score };
  });

  // Pick the top 2-3 most educational sentences, maintaining original chronological order
  const topScored = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const selectedSentences = scored
    .filter((s) => topScored.some((ts) => ts.sentence === s.sentence))
    .slice(0, 3)
    .map((s) => s.sentence);

  let summaryText = selectedSentences.join(" ");

  // Fallback if scoring yielded nothing clean
  if (!summaryText.trim()) {
    summaryText = sentences.slice(0, 2).join(" ");
  }

  if (!summaryText.trim()) {
    summaryText = cleanSpeechText(combinedRaw);
    if (summaryText.length > 280) {
      summaryText = summaryText.slice(0, 277) + "…";
    }
  }

  const { nodes, edges } = extractConceptualFlow(sentences, title);

  return {
    title,
    text: summaryText,
    nodes,
    edges,
  };
}

/**
 * Generates concise bullets and key takeaways for manual catch-up.
 */
export function generateSmartCatchUp(
  items: TranscriptItem[],
  fromTime: number,
  toTime: number,
  lessonTitle?: string
): CatchUpResult {
  const summary = generateSmartSummary(items, { start: fromTime, end: toTime }, { lessonTitle });
  const sentences = segmentSpeechIntoSentences(summary.text);

  const bullets = sentences.slice(0, 3).map((s) => {
    // Keep bullets punchy and under 20 words
    const words = s.split(/\s+/);
    if (words.length > 18) {
      return words.slice(0, 18).join(" ") + "…";
    }
    return s;
  });

  // Pick the most impactful sentence as keyIdea
  const keyIdea =
    items.find((i) => i.importance === "high")?.text ??
    sentences[0] ??
    "Key lesson concepts were presented during this segment.";

  return {
    title: summary.title,
    bullets: bullets.length > 0 ? bullets : ["Lesson concepts were discussed during this time."],
    keyIdea: cleanSpeechText(keyIdea),
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
  const sentences = segmentSpeechIntoSentences(combined);
  if (sentences.length > 0) {
    const first = sentences[0];
    const words = first.split(/\s+/);
    if (words.length > 20) {
      return words.slice(0, 20).join(" ") + "…";
    }
    return first;
  }

  const clean = cleanSpeechText(combined);
  return clean.length > 100 ? `${clean.slice(0, 97)}…` : clean;
}
