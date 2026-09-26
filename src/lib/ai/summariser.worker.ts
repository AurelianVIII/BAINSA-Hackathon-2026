/// <reference lib="webworker" />

/**
 * On-device model, off the main thread.
 *
 * Generation runs in a worker rather than inline because the lesson is
 * still playing while this works: captions are being drawn every frame
 * and the attention tracker is sampling the webcam. A few seconds of
 * blocked main thread would stutter exactly the things a Deaf student is
 * relying on.
 *
 * The model's job is deliberately narrow — see `verify.ts` for the
 * measurements behind that decision.
 */

import { pipeline, type TextGenerationPipeline } from "@huggingface/transformers";
import { matchSourceSentence, selectCandidates, splitSentences } from "./verify";

/**
 * SmolLM2-360M picks a sentence reliably (6/6 on the demo transcript).
 * Qwen2.5-0.5B was tested at 460MB and was no more faithful, so the extra
 * 200MB of download buys nothing.
 */
const MODEL_ID = "HuggingFaceTB/SmolLM2-360M-Instruct";

/**
 * The model has exactly one job and an opinion about how to do it.
 *
 * Giving it a reason to prefer one sentence over another ("what does this
 * student need to follow what comes next?") produces markedly better picks
 * than "most important" alone, which tends to select whichever sentence is
 * longest. The output contract is unchanged: one sentence, verbatim.
 */
const SYSTEM_PROMPT = `A Deaf student looked away and missed part of a lesson. You choose the one line that gets them back on track.

From the numbered sentences, pick the SINGLE sentence that best explains what they need in order to follow what comes next.

Prefer a sentence that defines a term, states a cause or a result, or carries the main point.
Pass over greetings, admin, asides, repetition and filler.

Reply with that sentence copied EXACTLY as it appears, word for word.
Do not rewrite it. Do not explain your choice. Reply with nothing but the sentence.`;

const MAX_PASSAGE_CHARS = 1500;
const MAX_NEW_TOKENS = 90;

type LoadProgress = {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
};

let generator: Promise<TextGenerationPipeline> | null = null;

/**
 * Transformers.js reports progress per file. The panel shows one bar, so
 * bytes are summed across every file the load touches.
 */
function makeProgressReporter() {
  const files = new Map<string, { loaded: number; total: number }>();

  return (event: LoadProgress) => {
    if (event.status !== "progress" || !event.file || !event.total) return;

    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });

    let loaded = 0;
    let total = 0;
    for (const entry of files.values()) {
      loaded += entry.loaded;
      total += entry.total;
    }

    self.postMessage({ type: "progress", loaded, total });
  };
}

function load() {
  generator ??= pipeline("text-generation", MODEL_ID, {
    // q4f16 halves the download against q4 and is the format WebGPU runs
    // fastest on; it is only ever selected when WebGPU is present.
    dtype: "q4f16",
    device: "webgpu",
    progress_callback: makeProgressReporter(),
  });
  return generator;
}

self.addEventListener("message", async (event: MessageEvent) => {
  const data = event.data as { type: string; id?: string; passage?: string };

  try {
    if (data.type === "load") {
      await load();
      self.postMessage({ type: "ready" });
      return;
    }

    if (data.type === "highlight") {
      const passage = (data.passage ?? "").slice(0, MAX_PASSAGE_CHARS);
      // Housekeeping is filtered out here rather than asked for in the
      // prompt, which this model size does not reliably honour.
      const sentences = selectCandidates(splitSentences(passage));

      if (sentences.length === 0) {
        self.postMessage({ type: "result", id: data.id, text: null });
        return;
      }

      // Filtering left exactly one teaching sentence, so there is nothing
      // to choose between. Return it without spinning up the model — it is
      // verbatim source text by construction.
      if (sentences.length === 1) {
        self.postMessage({ type: "result", id: data.id, text: sentences[0] });
        return;
      }

      const model = await load();
      const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const output = await model(
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Passage sentences:\n${numbered}\n\nWhich single sentence is most important? Copy it exactly.`,
          },
        ],
        {
          max_new_tokens: MAX_NEW_TOKENS,
          // Greedy. Sampling buys variety nobody asked for and makes the
          // reply likelier to drift off the listed sentences.
          do_sample: false,
          return_full_text: false,
        }
      );

      const turns = (
        output as unknown as Array<{
          generated_text: Array<{ role: string; content: string }> | string;
        }>
      )[0]?.generated_text;

      const raw =
        typeof turns === "string" ? turns : (turns?.at(-1)?.content ?? "");

      // Only a verbatim source sentence leaves this worker.
      self.postMessage({
        type: "result",
        id: data.id,
        text: matchSourceSentence(raw, sentences),
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      message: error instanceof Error ? error.message : "On-device model failed.",
    });
  }
});
