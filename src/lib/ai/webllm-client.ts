/**
 * Main-thread client for the WebGPU LLM worker.
 *
 * Provides a simple API for the rest of the app to request real AI-generated
 * summaries from the in-browser LLM running via WebGPU. Falls back gracefully
 * when WebGPU is unavailable.
 */

export type WebLLMStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "unsupported";

export interface WebLLMState {
  status: WebLLMStatus;
  /** Loading progress text from the engine (e.g. "Loading model...") */
  progressText: string | null;
  /** 0–1 loading progress */
  progress: number | null;
  error: string | null;
}

type Listener = (state: WebLLMState) => void;

let worker: Worker | null = null;
let state: WebLLMState = {
  status: "idle",
  progressText: null,
  progress: null,
  error: null,
};
const listeners = new Set<Listener>();
const pending = new Map<
  string,
  { resolve: (text: string | null) => void; reject: (error: Error) => void }
>();
let nextId = 0;

function setState(next: Partial<WebLLMState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function isWebGPUAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "gpu" in navigator
  );
}

function ensureWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      id?: string;
      text?: string | null;
      message?: string;
      progress?: number;
    };

    if (data.type === "progress") {
      setState({
        status: "loading",
        progressText: data.text ?? null,
        progress: data.progress ?? null,
      });
      return;
    }

    if (data.type === "ready") {
      setState({ status: "ready", progress: 1, error: null });
      return;
    }

    if (data.type === "result" && data.id) {
      pending.get(data.id)?.resolve(data.text ?? null);
      pending.delete(data.id);
      return;
    }

    if (data.type === "error") {
      if (data.id) {
        pending.get(data.id)?.reject(new Error(data.message));
        pending.delete(data.id);
        // A failed generation on a loaded model doesn't take it down
        if (state.status === "ready") return;
      }
      setState({ status: "error", error: data.message ?? "WebGPU LLM failed." });
    }
  });

  worker.addEventListener("error", (event) => {
    setState({
      status: "error",
      error: event.message || "WebGPU LLM worker failed.",
    });
  });

  return worker;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWebLLMState(): WebLLMState {
  return state;
}

const SERVER_STATE: WebLLMState = {
  status: "idle",
  progressText: null,
  progress: null,
  error: null,
};

export function getWebLLMServerState(): WebLLMState {
  return SERVER_STATE;
}

/** Starts downloading the model. Safe to call repeatedly. */
export function loadWebLLM() {
  if (!isWebGPUAvailable()) {
    setState({ status: "unsupported" });
    return;
  }
  if (state.status === "loading" || state.status === "ready") return;

  setState({ status: "loading", progress: null, progressText: "Initializing WebGPU...", error: null });
  ensureWorker().postMessage({ type: "load" });
}

/**
 * Generate a summary using the in-browser LLM.
 * Returns null if the model isn't ready or generation fails.
 */
export function generateSummary(
  passage: string,
  title?: string
): Promise<string | null> {
  if (state.status !== "ready" || !passage.trim()) return Promise.resolve(null);

  const id = String(++nextId);
  return new Promise<string | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({
      type: "summarize",
      id,
      passage,
      title,
      mode: "summary",
    });
  }).catch(() => null);
}

/**
 * Generate a catch-up summary using the in-browser LLM.
 * Returns JSON string with {title, bullets, keyIdea} or null.
 */
export function generateCatchUpLLM(
  passage: string,
  title?: string
): Promise<string | null> {
  if (state.status !== "ready" || !passage.trim()) return Promise.resolve(null);

  const id = String(++nextId);
  return new Promise<string | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({
      type: "summarize",
      id,
      passage,
      title,
      mode: "catchup",
    });
  }).catch(() => null);
}
