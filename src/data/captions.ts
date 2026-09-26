import type { CaptionChunk, TranscriptItem } from "@/types";
import { transcript } from "./transcript";

/**
 * Burned-in live captions for the video stage, derived from the transcript
 * so the two can never drift apart. Each TranscriptItem is split into short
 * phrases (~8s, hard-capped by word count) and given timings proportional
 * to how many words each phrase carries.
 *
 * The caption bar is the hero element of this product, so chunks are kept
 * short enough to render at a large size in at most two lines.
 */
const TARGET_CHUNK_SECONDS = 8;
const MAX_WORDS_PER_CHUNK = 14;

/** Does this word end a natural speech pause? */
function endsPhrase(word: string): boolean {
  return /[.,;:?!—]$/.test(word);
}

/**
 * Split `words` into `groups` runs of near-equal length, nudging each break
 * onto a nearby punctuation boundary so captions do not end mid-phrase.
 */
function splitEvenly(words: string[], groups: number): string[][] {
  const perGroup = words.length / groups;
  const breaks: number[] = [];

  for (let i = 1; i < groups; i++) {
    const ideal = Math.round(i * perGroup);
    let chosen = ideal;

    // Prefer the closest phrase boundary within two words of the even split.
    for (let offset = 1; offset <= 2; offset++) {
      const earlier = ideal - offset;
      const later = ideal + offset;
      if (earlier > (breaks.at(-1) ?? 0) && endsPhrase(words[earlier - 1])) {
        chosen = earlier;
        break;
      }
      if (later < words.length && endsPhrase(words[later - 1])) {
        chosen = later;
        break;
      }
    }

    if (chosen > (breaks.at(-1) ?? 0)) breaks.push(chosen);
  }

  const out: string[][] = [];
  let cursor = 0;
  for (const stop of [...breaks, words.length]) {
    const slice = words.slice(cursor, stop);
    if (slice.length > 0) out.push(slice);
    cursor = stop;
  }

  return out;
}

function toCaptionChunks(item: TranscriptItem): CaptionChunk[] {
  const duration = item.end - item.start;
  const words = item.text.split(/\s+/).filter(Boolean);

  const byDuration = Math.round(duration / TARGET_CHUNK_SECONDS);
  const byLength = Math.ceil(words.length / MAX_WORDS_PER_CHUNK);
  const groupCount = Math.max(1, byDuration, byLength);

  const groups = splitEvenly(words, groupCount);
  const totalWords = groups.reduce((sum, g) => sum + g.length, 0);

  let cursor = item.start;
  return groups.map((group, index) => {
    const isLast = index === groups.length - 1;
    const start = cursor;
    // Proportional to word count, so dense phrases stay on screen longer.
    const end = isLast ? item.end : start + (group.length / totalWords) * duration;
    cursor = end;

    return {
      id: `${item.id}-c${index + 1}`,
      itemId: item.id,
      start: Math.round(start * 10) / 10,
      end: Math.round(end * 10) / 10,
      text: group.join(" "),
    };
  });
}

/**
 * Derive caption chunks for any transcript — the built-in demo lesson, or
 * one produced live by speech recognition.
 */
export function buildCaptions(items: TranscriptItem[]): CaptionChunk[] {
  return items.flatMap(toCaptionChunks);
}

/** Captions for the built-in demo lesson. */
export const captions: CaptionChunk[] = buildCaptions(transcript);

/** The caption visible at `time`, with sub-second smoothing to prevent flicker between adjacent phrases. */
export function getCaptionAt(
  chunks: CaptionChunk[],
  time: number
): CaptionChunk | null {
  const exact = chunks.find((chunk) => time >= chunk.start && time < chunk.end);
  if (exact) return exact;

  // Smoothing bridge: hold previous caption for up to 0.6s into a silence
  // rather than flickering the caption box away for a fraction of a second.
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const next = chunks[i + 1];
    const bridgeLimit = next ? Math.min(chunk.end + 0.6, next.start) : chunk.end + 0.6;
    if (time >= chunk.start && time < bridgeLimit) {
      return chunk;
    }
  }

  return null;
}
