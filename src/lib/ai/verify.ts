/**
 * Verification for on-device model output.
 *
 * Why the model selects rather than writes
 * ----------------------------------------
 * The first build of this feature asked SmolLM2-360M to rewrite a missed
 * passage in plainer language. Measured against the demo transcript, 0 of
 * 6 windows came back faithful. The failures were not stylistic:
 *
 *   - "the Calvin cycle gets oxygen from the air"   (it takes CO2)
 *   - "Rubisco helps fix some of that sugar"        (it fixes carbon)
 *   - "chlorophyll in your cells"                   (wrong organism)
 *   - "we'll see the light-dependent reactions"     (passage said the
 *                                                    light-INdependent ones)
 *
 * Qwen2.5-0.5B at 460MB was not better, only differently wrong — it
 * invented a toy-car analogy for mitosis. So the problem is the parameter
 * count, and no prompt fixes it.
 *
 * A hearing student catches these against the audio. The student this
 * product exists for cannot. So the model is never allowed to produce
 * prose: it only picks which of the teacher's own sentences matters most,
 * and the pick is checked against the source before it is shown. It can
 * be wrong about importance, which is recoverable. It cannot be wrong
 * about facts, which is not.
 */

/** Splits a passage into candidate sentences, dropping fragments. */
export function splitSentences(passage: string): string[] {
  return passage
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/**
 * Small models wrap answers in packaging — `The sentence is: "..."`, a
 * list number, surrounding quotes. Stripped before matching so the
 * comparison is against the sentence, not the wrapper.
 */
export function cleanOutput(raw: string): string {
  let text = raw.trim();

  // A short lead-in ending in a colon, e.g. `The sentence is:`.
  text = text.replace(/^[^."']{0,60}:\s*/, "");
  text = text.replace(/^\d+[.)]\s*/, "");
  text = text.replace(/^["'“‘]+/, "").replace(/["'”’]+$/, "");

  return text.trim();
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns the source sentence the model picked, or null if its reply was
 * not one of them. Null is the safe outcome: the caller keeps the
 * deterministic summary rather than showing unverified text.
 */
export function matchSourceSentence(
  raw: string,
  sentences: string[]
): string | null {
  const cleaned = normalise(cleanOutput(raw));
  if (cleaned.length < 20) return null;

  // Exact match first.
  const exact = sentences.find((s) => normalise(s) === cleaned);
  if (exact) return exact;

  // Then a source sentence the reply is a prefix of, which is what a
  // reply truncated by the token limit looks like.
  const partial = sentences.find((s) => normalise(s).startsWith(cleaned));
  if (partial) return partial;

  // Finally a source sentence fully contained in the reply, which is what
  // trailing commentary after the sentence looks like.
  return sentences.find((s) => cleaned.includes(normalise(s))) ?? null;
}
