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
 * - Written strictly in third-person educational voice (NO direct speaker snippets).
 * - Zero hearing metaphors or idioms ("as you heard", "listen up").
 * - Aggressively filters YouTube banter, channel housekeeping, and filler.
 * - When all transcript content is non-educational (intros, channel promo),
 *   generates a clean topic-aware summary instead of surfacing raw captions.
 * - Extracts authentic conceptual relationships into visual flowchart nodes
 *   (and suppresses diagrams when no genuine process/comparison exists).
 */

// ─── Filler & banter detection ───────────────────────────────────────────────

const FILLER_REGEX =
  /\b(uh|um|er|ah|you know|so basically|basically|sort of|kind of|as you can see|let's see|first of all|feel free to|check out my|make sure to|don't forget to|hit the like|smash that like button|like and subscribe|turn on notifications|subscribe to|welcome back to the channel|welcome to the channel|welcome back|welcome to my channel|thanks for watching|hey guys|what's up guys|what is up guys|leave a comment down below|link in the description|in this video|without further ado|if you haven't already|before we get started|before we begin|real quick|just wanted to say|shout out to|sponsored by|patreon|merch|merchandise)\b/gi;

const SOUND_EFFECTS_REGEX = /\[(music|applause|laughter|cheering|chuckle|snicker|music \w+)\]/gi;

/**
 * Detects whether a sentence is YouTube channel banter / housekeeping
 * rather than educational content. These sentences should NEVER appear
 * in summaries — they are not lesson content.
 */
const BANTER_PATTERNS: RegExp[] = [
  // Channel promotion & engagement
  /\b(appreciate.*comments|good comments|leave.*(comment|like)|post.*(comment|like))\b/i,
  /\b(subscribe|subscription|bell icon|notification|new to.*channel|my channel)\b/i,
  /\b(playlist|playlists on|check out.*playlist)\b/i,
  /\b(videos are helping|helped you|these videos|this video will)\b/i,
  /\b(thanks for watching|thank you for watching|glad you're here)\b/i,
  // Equipment / device instructions (not lesson content)
  /\b(desktop computer|laptop|cell phone|tablet|phone or|using your phone|using your cell)\b/i,
  /\b(computer or a laptop|if you're desktop|if you're using)\b/i,
  // Self-referential channel talk
  /\b(my channel|this channel|the channel|on this channel)\b/i,
  /\b(new to my|those of you who are new)\b/i,
  /\b(good to know that|always good to know)\b/i,
  // Greetings & housekeeping
  /\b(hello everyone|hi everyone|hey everyone|good morning|good afternoon)\b/i,
  /\b(hope you're doing|hope you are doing|how's everyone|how is everyone)\b/i,
  /\b(let's get started|let's get into it|let's jump into|let's dive in|without further ado)\b/i,
  // Sponsor / promo
  /\b(sponsored by|brought to you by|shout out to|special thanks to|patreon|merch store)\b/i,
  // Generic non-content filler
  /\b(succeed in school|do well in school|pass your class|pass the exam)\b/i,
  /\b(i definitely appreciate|we definitely appreciate|really appreciate)\b/i,
];

function isBanterSentence(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return BANTER_PATTERNS.some((pattern) => pattern.test(lower));
}

// ─── Text cleaning ───────────────────────────────────────────────────────────

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

// ─── Subject keyword extraction ──────────────────────────────────────────────

/** Subject area keywords and their human-readable labels. */
const SUBJECT_KEYWORDS: [RegExp, string][] = [
  [/\b(algebra|algebraic|quadratic|polynomial|equation|linear|variable|coefficient)\b/i, "algebra"],
  [/\b(calculus|derivative|integral|limit|differentiation|integration)\b/i, "calculus"],
  [/\b(geometry|triangle|circle|angle|polygon|area|perimeter|pythagorean|hypotenuse)\b/i, "geometry"],
  [/\b(trigonometry|sine|cosine|tangent|trig)\b/i, "trigonometry"],
  [/\b(chemistry|chemical|reaction|molecule|atom|element|compound|ion|bond|molar|stoichiometry)\b/i, "chemistry"],
  [/\b(organic chemistry|functional group|hydrocarbon|alkane|alkene|alkyl)\b/i, "organic chemistry"],
  [/\b(biology|cell|dna|protein|enzyme|organism|mitosis|meiosis|evolution)\b/i, "biology"],
  [/\b(photosynthesis|chloroplast|calvin|thylakoid|chlorophyll)\b/i, "photosynthesis"],
  [/\b(physics|force|velocity|acceleration|momentum|energy|kinetic|potential|newton)\b/i, "physics"],
  [/\b(programming|algorithm|compiler|syntax|function|variable|loop|array|code)\b/i, "computer science"],
  [/\b(cs50|computer science|data structure|binary|linked list|hash)\b/i, "computer science"],
  [/\b(statistics|probability|mean|median|standard deviation|distribution|hypothesis)\b/i, "statistics"],
  [/\b(math|mathematics|mathematical|formula|solve|solution|problem)\b/i, "mathematics"],
];

/**
 * Scans raw text for educational subject areas and returns a clean,
 * AI-generated summary about those subjects. Used when the actual
 * transcript sentences are all banter/filler and can't be used.
 */
function generateSubjectSummary(rawLower: string, lessonTitle?: string): string {
  const detectedSubjects: string[] = [];
  for (const [pattern, label] of SUBJECT_KEYWORDS) {
    if (pattern.test(rawLower) && !detectedSubjects.includes(label)) {
      detectedSubjects.push(label);
    }
  }

  // Use lesson title for context if available
  const titleLower = (lessonTitle ?? "").toLowerCase();
  for (const [pattern, label] of SUBJECT_KEYWORDS) {
    if (pattern.test(titleLower) && !detectedSubjects.includes(label)) {
      detectedSubjects.push(label);
    }
  }

  if (detectedSubjects.length === 0) {
    return "The instructor introduces the lesson and provides an overview of the topics that will be covered.";
  }

  const subjectList = detectedSubjects.slice(0, 3);
  if (subjectList.length === 1) {
    return `The instructor introduces key concepts in ${subjectList[0]}. The lesson provides foundational explanations and worked examples for this topic area.`;
  }

  const last = subjectList.pop()!;
  return `The instructor introduces key concepts across ${subjectList.join(", ")} and ${last}. The lesson provides foundational explanations and problem-solving approaches for these topics.`;
}

// ─── Topic title inference ───────────────────────────────────────────────────

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
  if (combined.includes("cs50") || (combined.includes("scratch") && combined.includes("c"))) {
    return "CS50: Computational Thinking & C Fundamentals";
  }
  if (combined.includes("programming") || combined.includes("algorithm") || combined.includes("compiler")) {
    return "Computer Science & Programming";
  }
  if (combined.includes("cell") || combined.includes("dna") || combined.includes("protein")) {
    return "Cellular Biology & Genetics";
  }
  if (combined.includes("geometry") || combined.includes("triangle") || combined.includes("circle")) {
    return "Geometry & Spatial Reasoning";
  }
  if (combined.includes("trigonometry") || combined.includes("sine") || combined.includes("cosine")) {
    return "Trigonometry";
  }
  if (combined.includes("statistics") || combined.includes("probability")) {
    return "Statistics & Probability";
  }
  if (combined.includes("organic") && combined.includes("chemistry")) {
    return "Organic Chemistry";
  }

  if (dominantTopic && dominantTopic.startsWith("Minutes ")) {
    return `Lesson Overview (${dominantTopic})`;
  }

  return "What you missed";
}

// ─── Core synthesis ──────────────────────────────────────────────────────────

/**
 * Scores a sentence by content richness: technical terms, length, specificity.
 * Banter sentences are pre-filtered before this is called.
 */
function scoreSentence(sentence: string): number {
  const lower = sentence.toLowerCase();
  const words = lower.split(/\s+/);
  let score = 0;

  // Reward longer sentences (up to a point)
  score += Math.min(words.length, 20) * 0.5;

  // Reward technical / content keywords
  const CONTENT_WORDS = /\b(algorithm|variable|function|loop|array|string|type|compile|binary|data|code|program|syntax|memory|pointer|error|debug|class|object|method|library|module|process|equation|formula|energy|cell|reaction|molecule|atom|force|velocity|theorem|proof|graph|matrix|vector|structure|database|network|protocol|system|model|analysis|concept|principle|theory|definition|example|step|rule|pattern|result|output|input|condition|parameter|argument|return|value|state|interface|solve|solution|calculate|angle|triangle|circle|area|perimeter|slope|intercept|coefficient|denominator|numerator|fraction|ratio|proportion|percent|exponent|logarithm|polynomial|integer|rational|irrational|complex|domain|range|asymptote)\b/g;
  const contentMatches = lower.match(CONTENT_WORDS);
  score += (contentMatches?.length ?? 0) * 3;

  // Reward numbers and specific references
  if (/\d/.test(sentence)) score += 2;

  // Penalise conversational / filler sentences
  const CONVERSATIONAL = /\b(welcome|hello|hey|guys|awesome|amazing|cool|great|perfect|wonderful|excited|fun|love|hate|favorite|favourite|feel|opinion|think about|reminds me|appreciate|comments|channel|subscribe|playlist|video|laptop|desktop|phone|tablet|watching|helping)\b/gi;
  const convMatches = lower.match(CONVERSATIONAL);
  score -= (convMatches?.length ?? 0) * 4;

  // Penalise very short sentences
  if (words.length < 6) score -= 3;

  // Penalise sentences that are mostly personal pronouns
  const pronouns = lower.match(/\b(i|me|my|we|our|you|your|you're|i'm|i've|we're|we've)\b/g);
  if (pronouns && pronouns.length > words.length * 0.25) score -= 4;

  return score;
}

/** Cleans a single sentence into third-person educational prose. */
function polishSentence(sentence: string): string {
  let s = sentence.trim();

  // Strip conversational lead-ins
  s = s.replace(/^(all right|okay|so|now|well|and so|and indeed|in fact|you see|remember|recall that|as mentioned|as you know|let me|let's|and|but)\b[,:\s]*/gi, "");

  // Targeted first→third person replacements (specific patterns only)
  s = s.replace(/\b(i'm|i am)\s+(going to|gonna)\s+/gi, "The next step is to ");
  s = s.replace(/\b(i'm|i am)\s+(showing|demonstrating|explaining)\s+/gi, "The lesson demonstrates ");
  s = s.replace(/\bwe('re| are)\s+(going to|gonna)\s+/gi, "The next step is to ");
  s = s.replace(/\bwe('re| are)\s+(looking at|learning about|talking about|exploring|covering|discussing)\s+/gi, "The lesson covers ");
  s = s.replace(/\b(i|we)\s+want\s+to\b/gi, "the goal is to");
  s = s.replace(/\b(i|we)\s+need\s+to\b/gi, "the next step is to");
  s = s.replace(/\byou\s+can\s+see\b/gi, "notice");
  s = s.replace(/\byou\s+can\s+think\s+of\b/gi, "consider");
  s = s.replace(/\bif\s+you\s+look\s+at\b/gi, "looking at");
  s = s.replace(/\bwhat\s+i('m| am)\s+doing\b/gi, "what happens");
  s = s.replace(/\bwhat\s+we('re| are)\s+doing\b/gi, "what happens");
  s = s.replace(/\b(i|we)\s+have\b/gi, "the lesson has");
  s = s.replace(/\b(i|we)\s+will\b/gi, "the lesson will");
  s = s.replace(/\b(i|we)\s+can\b/gi, "one can");
  s = s.replace(/\b(we're|we are)\b/gi, "the lesson is");
  s = s.replace(/\b(i'm|i am)\b/gi, "the instructor is");
  s = s.replace(/\byou\s+(should|need to|have to|must|will)\b/gi, "it is important to");

  // Fix remaining isolated "I " at sentence start
  s = s.replace(/^I\s+/, "The instructor ");

  // Remove remaining "my" / "our" → "the"
  s = s.replace(/\b(my|our)\b/gi, "the");

  // Ensure proper capitalisation and ending punctuation
  s = capitalize(s);
  if (!/[.!?]$/.test(s)) s += ".";

  return s;
}

/** Returns a brief topic-specific opening line, or null for unknown domains. */
function getTopicOpener(lower: string): string | null {
  if (
    (lower.includes("unreal") || lower.includes("fortnite")) &&
    (lower.includes("html") || lower.includes("javascript") || lower.includes("engine"))
  ) {
    return "The lesson compares building game environments across different platforms.";
  }
  if (lower.includes("photosynthesis") || lower.includes("calvin") || lower.includes("chloroplast")) {
    return "The lesson covers the stages of photosynthesis and cellular energy conversion.";
  }
  if ((lower.includes("equation") || lower.includes("reaction")) && (lower.includes("balance") || lower.includes("reactant"))) {
    return "The lesson walks through balancing chemical equations step by step.";
  }
  if (lower.includes("quadratic") || lower.includes("derivative") || lower.includes("integral")) {
    return "The lesson demonstrates systematic problem-solving in mathematics.";
  }
  if (
    lower.includes("cs50") ||
    lower.includes("programming") ||
    lower.includes("computer science") ||
    (lower.includes("scratch") && (lower.includes("c ") || lower.includes("syntax") || lower.includes("week")))
  ) {
    return "The lesson introduces core computational thinking and programming constructs.";
  }
  if (lower.includes("algebra") || lower.includes("polynomial")) {
    return "The lesson covers fundamental algebraic concepts and problem-solving techniques.";
  }
  if (lower.includes("geometry") || lower.includes("triangle") || lower.includes("circle")) {
    return "The lesson explores geometric properties, proofs, and spatial reasoning.";
  }
  if (lower.includes("trigonometry") || lower.includes("sine") || lower.includes("cosine")) {
    return "The lesson covers trigonometric functions and their applications.";
  }
  if (lower.includes("organic chemistry") || (lower.includes("organic") && lower.includes("chemistry"))) {
    return "The lesson introduces organic chemistry concepts and molecular structures.";
  }
  if (lower.includes("chemistry") || lower.includes("chemical")) {
    return "The lesson covers fundamental chemistry concepts and chemical processes.";
  }
  if (lower.includes("physics") || lower.includes("velocity") || lower.includes("force")) {
    return "The lesson covers physics principles and problem-solving approaches.";
  }
  if (lower.includes("biology") || lower.includes("cell") || lower.includes("dna")) {
    return "The lesson explores biological processes and cellular mechanisms.";
  }
  if (lower.includes("math") || lower.includes("mathematics") || lower.includes("formula")) {
    return "The lesson demonstrates mathematical concepts and problem-solving methods.";
  }
  if (lower.includes("statistics") || lower.includes("probability")) {
    return "The lesson introduces statistical methods and probability concepts.";
  }
  return null;
}

/**
 * Core synthesis function. Produces a clean, third-person educational summary.
 *
 * 1. Filters out ALL banter/channel-housekeeping sentences
 * 2. If educational content remains, scores and picks the best sentences
 * 3. If ONLY banter remains, generates a clean topic-aware summary from
 *    detected subject keywords — never surfaces raw captions
 */
export function synthesizePassage(
  rawText: string,
  lessonTitle?: string
): string {
  const clean = cleanSpeechText(rawText);
  if (!clean || clean.split(/\s+/).length < 4) {
    return generateSubjectSummary(clean.toLowerCase(), lessonTitle);
  }

  const sentences = segmentSpeechIntoSentences(clean);
  if (sentences.length === 0) {
    return generateSubjectSummary(clean.toLowerCase(), lessonTitle);
  }

  // CRITICAL: Filter out banter sentences BEFORE scoring
  const contentSentences = sentences.filter((s) => !isBanterSentence(s));

  // If ALL sentences are banter, generate a clean summary from subject keywords
  if (contentSentences.length === 0) {
    const lower = (clean + " " + (lessonTitle ?? "")).toLowerCase();
    return generateSubjectSummary(lower, lessonTitle);
  }

  // Score remaining content sentences by informational density
  const scored = contentSentences.map((s) => ({
    text: s,
    score: scoreSentence(s),
  }));

  // If even the best content sentences score poorly (mostly filler),
  // fall back to a generated summary
  const bestScore = Math.max(...scored.map((s) => s.score));
  if (bestScore < 2) {
    const lower = (clean + " " + (lessonTitle ?? "")).toLowerCase();
    return generateSubjectSummary(lower, lessonTitle);
  }

  // Sort by score descending, take top 3, then re-sort by original order
  const originalOrder = contentSentences.map((s, i) => i);
  const topEntries = scored
    .map((s, i) => ({ ...s, idx: i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx);

  // Clean each sentence
  const polished = topEntries.map((entry) => polishSentence(entry.text));

  // Build the final summary
  const lower = (clean + " " + (lessonTitle ?? "")).toLowerCase();
  const opener = getTopicOpener(lower);

  if (opener && polished.length > 0) {
    return opener + " " + polished.join(" ");
  }

  return polished.join(" ") || generateSubjectSummary(lower, lessonTitle);
}

// ─── Conceptual flow diagrams ────────────────────────────────────────────────

/**
 * Extracts authentic conceptual flowchart nodes.
 * ONLY draws diagrams when genuine multi-step pipelines or conceptual comparisons exist.
 * Returns empty nodes if the passage is conversational or narrative, avoiding broken text boxes.
 */
export function extractConceptualFlow(
  sentences: string[],
  topicTitle?: string
): { nodes: SummaryFlowNode[]; edges: SummaryFlowEdge[] } {
  const fullText = (sentences.join(" ") + " " + (topicTitle ?? "")).toLowerCase();

  // Pattern 1: Game Dev / Tech Comparison (Scratch vs Engine)
  if (
    (fullText.includes("unreal") || fullText.includes("engine") || fullText.includes("fortnite")) &&
    (fullText.includes("html") || fullText.includes("javascript") || fullText.includes("scratch"))
  ) {
    const nodes: SummaryFlowNode[] = [
      { id: "flow-input", label: "HTML & JavaScript (Scratch)", kind: "input" },
      { id: "flow-process", label: "Multi-Turn AI Prompting", kind: "process" },
      { id: "flow-output", label: "Unreal Engine 5 Build", kind: "output" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "flow-input", to: "flow-process", label: "iterates" },
      { from: "flow-process", to: "flow-output", label: "compares with" },
    ];
    return { nodes, edges };
  }

  // Pattern 2: Photosynthesis & Cellular Energy
  if (
    fullText.includes("photosynthesis") ||
    fullText.includes("calvin") ||
    fullText.includes("chloroplast") ||
    fullText.includes("light-dependent")
  ) {
    const nodes: SummaryFlowNode[] = [
      { id: "flow-input", label: "Sunlight & Water", kind: "input" },
      { id: "flow-process", label: "Light-Dependent Reactions", kind: "process" },
      { id: "flow-process-2", label: "ATP & NADPH", kind: "process" },
      { id: "flow-output", label: "Calvin Cycle & Glucose", kind: "output" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "flow-input", to: "flow-process", label: "absorbs" },
      { from: "flow-process", to: "flow-process-2", label: "charges" },
      { from: "flow-process-2", to: "flow-output", label: "synthesizes" },
    ];
    return { nodes, edges };
  }

  // Pattern 3: Chemical Reactions (Conservation of Mass)
  if (
    (fullText.includes("chemical") || fullText.includes("equation") || fullText.includes("reaction")) &&
    (fullText.includes("reactant") || fullText.includes("product") || fullText.includes("balance") || fullText.includes("water") || fullText.includes("hydrogen"))
  ) {
    const nodes: SummaryFlowNode[] = [
      { id: "flow-input", label: "Starting Reactants", kind: "input" },
      { id: "flow-process", label: "Chemical Reaction", kind: "process" },
      { id: "flow-output", label: "Balanced Products", kind: "output" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "flow-input", to: "flow-process", label: "reacts" },
      { from: "flow-process", to: "flow-output", label: "yields" },
    ];
    return { nodes, edges };
  }

  // Pattern 4: Mathematical Derivations
  if (
    fullText.includes("quadratic") ||
    fullText.includes("derivative") ||
    fullText.includes("calculus") ||
    fullText.includes("integral")
  ) {
    const inputLabel = fullText.includes("quadratic")
      ? "Identify a, b, c Terms"
      : fullText.includes("derivative")
        ? "Given Function f(x)"
        : "Initial Equation";

    const processLabel = fullText.includes("quadratic")
      ? "Apply Quadratic Formula"
      : fullText.includes("derivative")
        ? "Differentiation Rule"
        : "Algebraic Operations";

    const outputLabel = fullText.includes("quadratic")
      ? "Calculated Roots (x)"
      : "Derived Result";

    const nodes: SummaryFlowNode[] = [
      { id: "step-1", label: inputLabel, kind: "input" },
      { id: "step-2", label: processLabel, kind: "process" },
      { id: "step-3", label: outputLabel, kind: "output" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "step-1", to: "step-2", label: "substitute" },
      { from: "step-2", to: "step-3", label: "evaluate" },
    ];
    return { nodes, edges };
  }

  // Pattern 5: Computer Science Compilation & Code Execution
  if (
    fullText.includes("cs50") ||
    (fullText.includes("c ") && (fullText.includes("scratch") || fullText.includes("code") || fullText.includes("compile"))) ||
    fullText.includes("compiler") ||
    fullText.includes("source code") ||
    (fullText.includes("function") && fullText.includes("variable") && fullText.includes("loop"))
  ) {
    if (fullText.includes("scratch")) {
      const nodes: SummaryFlowNode[] = [
        { id: "cs-step-1", label: "Scratch Visual Blocks", kind: "input" },
        { id: "cs-step-2", label: "Core Logic (Loops, Vars)", kind: "process" },
        { id: "cs-step-3", label: "C Syntax & Types", kind: "output" },
      ];
      const edges: SummaryFlowEdge[] = [
        { from: "cs-step-1", to: "cs-step-2", label: "maps to" },
        { from: "cs-step-2", to: "cs-step-3", label: "implements in" },
      ];
      return { nodes, edges };
    }

    const nodes: SummaryFlowNode[] = [
      { id: "cs-step-1", label: "C Source Code (.c)", kind: "input" },
      { id: "cs-step-2", label: "Compiler (Clang / GCC)", kind: "process" },
      { id: "cs-step-3", label: "Machine Code (Binary)", kind: "output" },
    ];
    const edges: SummaryFlowEdge[] = [
      { from: "cs-step-1", to: "cs-step-2", label: "compiles" },
      { from: "cs-step-2", to: "cs-step-3", label: "executes" },
    ];
    return { nodes, edges };
  }

  // If no authentic multi-stage pipeline exists, return NO diagram
  return { nodes: [], edges: [] };
}

// ─── High-level summary builders ─────────────────────────────────────────────

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
 *
 * Banter sentences are filtered out — bullets are NEVER raw captions.
 * When only banter is found, generated topic-aware bullets replace them.
 */
export function generateSmartCatchUp(
  items: TranscriptItem[],
  fromTime: number,
  toTime: number,
  lessonTitle?: string
): CatchUpResult {
  const summary = generateSmartSummary(items, { start: fromTime, end: toTime }, { lessonTitle });

  // Get the raw transcript text for the missed window
  const rawText = items.map((i) => i.text).join(" ");
  const allSentences = segmentSpeechIntoSentences(cleanSpeechText(rawText));

  // Filter out banter before scoring
  const contentSentences = allSentences.filter((s) => !isBanterSentence(s));

  // If all sentences are banter, generate topic-aware bullets
  if (contentSentences.length === 0) {
    const lower = (rawText + " " + (lessonTitle ?? "")).toLowerCase();
    return {
      title: summary.title,
      bullets: generateTopicBullets(lower, lessonTitle),
      keyIdea: generateSubjectSummary(lower, lessonTitle),
      startTime: fromTime,
      endTime: toTime,
    };
  }

  // Score and pick the top sentences for bullets
  const scored = contentSentences
    .map((s, i) => ({ text: s, score: scoreSentence(s), idx: i }))
    .sort((a, b) => b.score - a.score);

  // If best scores are too low, use generated bullets
  const bestScore = Math.max(...scored.map((s) => s.score));
  if (bestScore < 2) {
    const lower = (rawText + " " + (lessonTitle ?? "")).toLowerCase();
    return {
      title: summary.title,
      bullets: generateTopicBullets(lower, lessonTitle),
      keyIdea: generateSubjectSummary(lower, lessonTitle),
      startTime: fromTime,
      endTime: toTime,
    };
  }

  const topSentences = scored
    .slice(0, 3)
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => polishSentence(entry.text));

  // Build bullets — use polished sentences, truncated if too long
  const bullets = topSentences.map((s) => {
    const words = s.split(/\s+/);
    return words.length > 20 ? words.slice(0, 20).join(" ") + "…" : s;
  });

  // Key idea is the highest-scored sentence
  const keyIdea = scored.length > 0
    ? polishSentence(scored[0].text)
    : generateSubjectSummary((rawText + " " + (lessonTitle ?? "")).toLowerCase(), lessonTitle);

  return {
    title: summary.title,
    bullets: bullets.length > 0 ? bullets : ["The instructor covered foundational concepts during this segment."],
    keyIdea,
    startTime: fromTime,
    endTime: toTime,
  };
}

/**
 * Generates clean, topic-aware bullet points when transcript is all banter.
 */
function generateTopicBullets(lower: string, lessonTitle?: string): string[] {
  const detectedSubjects: string[] = [];
  for (const [pattern, label] of SUBJECT_KEYWORDS) {
    if (pattern.test(lower) && !detectedSubjects.includes(label)) {
      detectedSubjects.push(label);
    }
  }

  const titleLower = (lessonTitle ?? "").toLowerCase();
  for (const [pattern, label] of SUBJECT_KEYWORDS) {
    if (pattern.test(titleLower) && !detectedSubjects.includes(label)) {
      detectedSubjects.push(label);
    }
  }

  if (detectedSubjects.length === 0) {
    return [
      "The instructor provides an introduction and overview of the lesson topics.",
      "Key concepts and learning objectives are outlined for the session.",
      "The lesson establishes the foundational framework for the material ahead.",
    ];
  }

  return detectedSubjects.slice(0, 3).map((subject) => {
    const templates: Record<string, string> = {
      algebra: "Algebraic foundations: The lesson covers equations, variables, and systematic solving techniques.",
      calculus: "Calculus concepts: The lesson explores derivatives, integrals, and rate-of-change analysis.",
      geometry: "Geometric principles: The lesson examines shapes, proofs, and spatial properties.",
      trigonometry: "Trigonometric functions: The lesson covers sine, cosine, tangent, and their applications.",
      chemistry: "Chemistry fundamentals: The lesson introduces chemical processes, reactions, and molecular behavior.",
      "organic chemistry": "Organic chemistry: The lesson covers molecular structures, functional groups, and reaction mechanisms.",
      biology: "Biology concepts: The lesson explores cellular processes, genetics, and biological systems.",
      photosynthesis: "Photosynthesis: The lesson covers energy conversion from sunlight to chemical energy in plants.",
      physics: "Physics principles: The lesson examines forces, motion, energy, and their mathematical relationships.",
      "computer science": "Computing fundamentals: The lesson introduces algorithms, data structures, and programming logic.",
      statistics: "Statistical methods: The lesson covers data analysis, probability, and distribution patterns.",
      mathematics: "Mathematical concepts: The lesson demonstrates problem-solving techniques and formula applications.",
    };
    return templates[subject] ?? `The lesson introduces key concepts in ${subject}.`;
  });
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

/**
 * Extracts the single most important conceptual takeaway sentence from a passage
 * to serve as the Key Focus Point, guaranteed to be clean, third-person, and accurate.
 */
export function extractKeyFocusPoint(passage: string, lessonTitle?: string): string {
  const summary = synthesizePassage(passage, lessonTitle);
  const sentences = segmentSpeechIntoSentences(summary);
  return sentences[0] || "Key concepts and problem-solving steps were demonstrated during this segment.";
}
