import { generateCatchUp } from "./index";
import type { CatchUpResult, TranscriptItem } from "@/types";
import { generateCatchUpLLM, getWebLLMState } from "@/lib/ai/webllm-client";
import { cleanSpeechText } from "@/lib/ai/smart-summarizer";

const FETCH_TIMEOUT_MS = 4000;

/**
 * Owned by the Catch-up feature team. Tries three sources in parallel:
 *
 * 1. WebGPU LLM (in-browser, real generative AI)
 * 2. /api/catchup (server-side Claude, if API key is set)
 * 3. Local smart summarizer (rule-based, always instant)
 *
 * The local result is computed immediately and returned as fallback.
 * WebGPU and server results replace it if they arrive in time.
 */
export async function fetchCatchUp(
  items: TranscriptItem[],
  start: number,
  end: number,
  title?: string
): Promise<CatchUpResult> {
  const local = generateCatchUp(items, start, end, title);
  if (local.bullets.length === 0) return local;

  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 1, end);
  let windowItems = items?.filter((item) => item.end > safeStart && item.start < safeEnd);

  if (items && (!windowItems || windowItems.length === 0)) {
    windowItems = items.filter((item) => item.end > safeStart - 30 && item.start < safeEnd + 30);
    if (!windowItems || windowItems.length === 0) {
      windowItems = items.slice(0, 3);
    }
  }

  const passage = windowItems?.map((i) => i.text).join(" ") ?? "";

  // Race: WebGPU LLM vs server API, local is already computed
  const results = await Promise.allSettled([
    tryWebGPU(passage, title),
    tryServer(safeStart, safeEnd, windowItems, title),
  ]);

  // Prefer WebGPU result (real in-browser AI)
  const webgpuResult = results[0].status === "fulfilled" ? results[0].value : null;
  if (webgpuResult) return { ...webgpuResult, startTime: safeStart, endTime: safeEnd };

  // Then server result
  const serverResult = results[1].status === "fulfilled" ? results[1].value : null;
  if (serverResult) return serverResult;

  // Fall back to local
  return local;
}

async function tryWebGPU(
  passage: string,
  title?: string
): Promise<CatchUpResult | null> {
  const state = getWebLLMState();
  if (state.status !== "ready" || !passage.trim()) return null;

  const text = await generateCatchUpLLM(cleanSpeechText(passage), title);
  if (!text) return null;

  try {
    // The LLM returns JSON
    const parsed = JSON.parse(text) as {
      title?: string;
      bullets?: string[];
      keyIdea?: string;
    };

    if (!parsed.bullets?.length) return null;

    return {
      title: parsed.title?.trim() || title || "What you missed",
      bullets: parsed.bullets.slice(0, 3),
      keyIdea: parsed.keyIdea?.trim() || parsed.bullets[0],
      startTime: 0,
      endTime: 0,
    };
  } catch {
    // LLM didn't return valid JSON — use the text as a single bullet
    return {
      title: title || "What you missed",
      bullets: [text.slice(0, 200)],
      keyIdea: text.slice(0, 200),
      startTime: 0,
      endTime: 0,
    };
  }
}

async function tryServer(
  start: number,
  end: number,
  items: TranscriptItem[] | undefined,
  title?: string
): Promise<CatchUpResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch("/api/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start,
        end,
        items: items ?? undefined,
        title,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as CatchUpResult;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
