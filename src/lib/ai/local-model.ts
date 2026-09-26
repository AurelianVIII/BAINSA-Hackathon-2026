/**
 * Main-thread client for the on-device summariser worker.
 *
 * One worker is shared process-wide: the model is a ~260MB download, so a
 * second instance would mean a second download and a second copy resident
 * on the GPU.
 */

export type LocalModelStatus =
  | "unsupported"
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface LocalModelState {
  status: LocalModelStatus;
  /** 0–1 across every file the load touches, or null before bytes arrive. */
  progress: number | null;
  error: string | null;
}

/** Roughly what the q4f16 weights cost, for warning before the download. */
export const MODEL_DOWNLOAD_MB = 260;

export function isWebGpuAvailable(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

type Listener = (state: LocalModelState) => void;

let worker: Worker | null = null;
let state: LocalModelState = { status: "idle", progress: null, error: null };
const listeners = new Set<Listener>();
const pending = new Map<
  string,
  { resolve: (text: string | null) => void; reject: (error: Error) => void }
>();
let nextId = 0;

function setState(next: Partial<LocalModelState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

function ensureWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./summariser.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      id?: string;
      text?: string | null;
      message?: string;
      loaded?: number;
      total?: number;
    };

    if (data.type === "progress" && data.total) {
      setState({ status: "loading", progress: (data.loaded ?? 0) / data.total });
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
      // A failed generation leaves a loaded model usable; a failed load
      // does not. Only the latter should take the whole feature down.
      if (data.id) {
        pending.get(data.id)?.reject(new Error(data.message));
        pending.delete(data.id);
        if (state.status === "ready") return;
      }
      setState({ status: "error", error: data.message ?? "Model failed." });
    }
  });

  worker.addEventListener("error", (event) => {
    setState({ status: "error", error: event.message || "Model worker failed." });
  });

  return worker;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): LocalModelState {
  return state;
}

/** Stable object so `useSyncExternalStore` does not loop during SSR. */
const SERVER_STATE: LocalModelState = {
  status: "idle",
  progress: null,
  error: null,
};
export function getServerState(): LocalModelState {
  return SERVER_STATE;
}

/** Starts the download. Safe to call repeatedly — later calls are no-ops. */
export function preload() {
  if (!isWebGpuAvailable()) {
    setState({ status: "unsupported" });
    return;
  }
  if (state.status === "loading" || state.status === "ready") return;

  setState({ status: "loading", progress: null, error: null });
  ensureWorker().postMessage({ type: "load" });
}

/**
 * Picks the most important sentence of a passage, verbatim.
 *
 * Resolves null when the model is not ready, when its reply was not one
 * of the passage's own sentences, or when there was nothing to choose
 * between — so callers keep whatever they already show rather than
 * branching on load state. See `verify.ts` for why the model selects
 * instead of writing.
 */
export function highlight(passage: string): Promise<string | null> {
  if (state.status !== "ready" || !passage.trim()) return Promise.resolve(null);

  const id = String(++nextId);
  return new Promise<string | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ type: "highlight", id, passage });
  }).catch(() => null);
}
