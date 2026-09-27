/// <reference lib="webworker" />

/**
 * WebGPU LLM worker — runs a real language model in the browser via WebGPU.
 *
 * Uses @mlc-ai/web-llm to load a quantized model (Phi-3.5-mini or
 * Llama-3.2-1B) entirely client-side. All inference happens on the GPU
 * inside this worker so the main thread stays free for captions and
 * attention tracking.
 *
 * Message protocol:
 *   → { type: "load" }                     Start downloading/loading the model
 *   ← { type: "progress", text, progress } Loading progress updates
 *   ← { type: "ready" }                    Model loaded and ready
 *   → { type: "summarize", id, passage, title, mode }  Request a summary
 *   ← { type: "result", id, text }         Generated summary text
 *   ← { type: "error", id?, message }      Something went wrong
 */

import { CreateMLCEngine, type MLCEngine, type InitProgressReport } from "@mlc-ai/web-llm";

/**
 * Phi-3.5-mini-instruct is the sweet spot for in-browser inference:
 * - 3.8B parameters, quantized to q4f16 (~2GB download)
 * - Excellent instruction following and summarization quality
 * - Runs well on most modern GPUs via WebGPU
 *
 * Fallback: Llama-3.2-1B is smaller (~800MB) if Phi fails.
 */
const PRIMARY_MODEL = "Phi-3.5-mini-instruct-q4f16_1-MLC";
const FALLBACK_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `You are an AI tutor summarizing missed lesson content for a Deaf student who reads captions.

Rules:
- Write in third-person educational voice ("The instructor explains...", "The lesson covers...").
- NEVER copy verbatim first-person speech. Synthesize concepts into clear prose.
- NEVER include YouTube banter, channel promotion, greetings, or filler.
- Plain language, short sentences, maximum 3 sentences.
- No idioms, no references to hearing.
- If the passage is mostly introductory banter (subscribe, comments, channel promo), summarize only the educational subject matter mentioned.`;

const CATCHUP_SYSTEM_PROMPT = `You summarize missed lesson content for a Deaf student as structured JSON.

Rules:
- Write in third-person educational voice.
- NEVER copy verbatim first-person speech or YouTube banter.
- Filter out channel promotion, greetings, device instructions, and filler.
- Plain language, short sentences.

Reply with valid JSON in this exact format:
{"title":"<topic>","bullets":["<point 1>","<point 2>","<point 3>"],"keyIdea":"<one sentence main takeaway>"}`;

let engine: MLCEngine | null = null;
let loadFailed = false;

async function loadModel() {
  if (engine) return engine;

  const modelToTry = PRIMARY_MODEL;

  try {
    engine = await CreateMLCEngine(modelToTry, {
      initProgressCallback: (report: InitProgressReport) => {
        self.postMessage({
          type: "progress",
          text: report.text,
          progress: report.progress,
        });
      },
    });
    return engine;
  } catch (primaryError) {
    console.warn(`Failed to load ${modelToTry}, trying fallback:`, primaryError);

    try {
      engine = await CreateMLCEngine(FALLBACK_MODEL, {
        initProgressCallback: (report: InitProgressReport) => {
          self.postMessage({
            type: "progress",
            text: report.text,
            progress: report.progress,
          });
        },
      });
      return engine;
    } catch (fallbackError) {
      loadFailed = true;
      throw fallbackError;
    }
  }
}

self.addEventListener("message", async (event: MessageEvent) => {
  const data = event.data as {
    type: string;
    id?: string;
    passage?: string;
    title?: string;
    mode?: "summary" | "catchup";
  };

  try {
    if (data.type === "load") {
      await loadModel();
      self.postMessage({ type: "ready" });
      return;
    }

    if (data.type === "summarize") {
      if (!engine) {
        await loadModel();
      }

      const passage = (data.passage ?? "").slice(0, 2000);
      const title = data.title ?? "the lesson";
      const mode = data.mode ?? "summary";

      if (!passage.trim()) {
        self.postMessage({ type: "result", id: data.id, text: null });
        return;
      }

      const systemPrompt = mode === "catchup" ? CATCHUP_SYSTEM_PROMPT : SYSTEM_PROMPT;
      const userMessage = mode === "catchup"
        ? `The student missed this part of ${title}:\n\n"${passage}"\n\nSummarise what they missed as JSON.`
        : `The student missed this part of ${title}:\n\n"${passage}"\n\nExplain what they missed in 2-3 sentences.`;

      const reply = await engine!.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 300,
        temperature: 0.3,
      });

      const text = reply.choices[0]?.message?.content ?? null;

      self.postMessage({ type: "result", id: data.id, text });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      message: error instanceof Error ? error.message : "WebGPU LLM failed.",
    });
  }
});
