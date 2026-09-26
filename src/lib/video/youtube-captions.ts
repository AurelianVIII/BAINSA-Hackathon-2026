import type { CaptionChunk, TranscriptItem } from "@/types";

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

/** Lines are grouped into transcript items of roughly this length… */
const TARGET_ITEM_SECONDS = 20;
/** …and never longer than this, even without a sentence break. */
const MAX_ITEM_SECONDS = 35;
/** Items are labelled with the block of the video they fall in. */
const TOPIC_BLOCK_SECONDS = 120;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  let out = text;
  // Some tracks arrive double-encoded (`&amp;#39;`), so decode twice.
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith("#")) {
        const isHex = code[1] === "x" || code[1] === "X";
        const point = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(point) && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    });
  }
  return out;
}

function cleanText(raw: string): string {
  const stripTags = (value: string) => value.replace(/<[^>]+>/g, "");
  return stripTags(decodeEntities(stripTags(raw))).replace(/\s+/g, " ").trim();
}

function numberAttr(attrs: string, name: string): number | null {
  const match = attrs.match(new RegExp(`\\b${name}="([\\d.]+)"`));
  return match ? Number(match[1]) : null;
}

/**
 * Parses a YouTube timedtext track in either the srv3 shape
 * (`<p t="ms" d="ms">`, used for both manual and auto-generated tracks) or
 * the legacy shape (`<text start="s" dur="s">`).
 */
export function parseTimedText(xml: string): CaptionSegment[] {
  const segments: CaptionSegment[] = [];

  for (const match of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const start = numberAttr(match[1], "t");
    const duration = numberAttr(match[1], "d") ?? 2000;
    const text = cleanText(match[2]);
    if (start === null || !text) continue;
    segments.push({ start: start / 1000, end: (start + duration) / 1000, text });
  }

  if (segments.length === 0) {
    for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const start = numberAttr(match[1], "start");
      const duration = numberAttr(match[1], "dur") ?? 2;
      const text = cleanText(match[2]);
      if (start === null || !text) continue;
      segments.push({ start, end: start + duration, text });
    }
  }

  segments.sort((a, b) => a.start - b.start);

  // Auto-generated tracks roll, so consecutive lines overlap. Clamp each
  // line to the next one's start so exactly one caption is on screen.
  for (let i = 0; i < segments.length - 1; i++) {
    const next = segments[i + 1];
    if (next.start > segments[i].start) {
      segments[i].end = Math.min(segments[i].end, next.start);
    }
  }

  return segments;
}

/**
 * Turns raw caption lines into the two shapes the rest of the app already
 * consumes: short `CaptionChunk`s for the burned-in caption bar (one per
 * line), and ~20s `TranscriptItem`s for the transcript list, catch-up and
 * search — so a YouTube video flows through the same pipeline as the mock
 * lesson.
 */
export function captionsToLesson(segments: CaptionSegment[]): {
  captions: CaptionChunk[];
  items: TranscriptItem[];
} {
  const captions: CaptionChunk[] = [];
  const items: TranscriptItem[] = [];
  const blockMinutes = TOPIC_BLOCK_SECONDS / 60;
  let group: CaptionSegment[] = [];

  const flush = () => {
    if (group.length === 0) return;
    const id = `yt-${items.length + 1}`;
    const start = group[0].start;
    const block = Math.floor(start / TOPIC_BLOCK_SECONDS);

    const itemText = group.map((segment) => segment.text).join(" ");
    const isImportant =
      /\b(formula|equation|reaction|is defined|key point|important|remember|rule|step 1|first step|notice that|this means|therefore|converts?|produces?|example|solve)\b/i.test(
        itemText
      ) || items.length === 0;

    items.push({
      id,
      start,
      end: group[group.length - 1].end,
      text: itemText,
      topic: `Minutes ${block * blockMinutes}–${(block + 1) * blockMinutes}`,
      importance: isImportant ? "high" : "normal",
    });
    group.forEach((segment, index) =>
      captions.push({ id: `${id}-c${index + 1}`, itemId: id, ...segment })
    );
    group = [];
  };

  for (const segment of segments) {
    group.push(segment);
    const span = segment.end - group[0].start;
    const endsSentence = /[.?!]["')\]]?$/.test(segment.text);
    if (span >= MAX_ITEM_SECONDS || (span >= TARGET_ITEM_SECONDS && endsSentence)) {
      flush();
    }
  }
  flush();

  return { captions, items };
}
