import type { MissedWindow } from "@/lib/catchup/types";

/**
 * Owned by the Catch-up feature team. Renders nothing when `window` is
 * null. PC1 mounts this once in `page.tsx` and drives `window` from
 * `getPendingAlert` — this component holds no playback or alert state.
 *
 * Entrance is a pure-CSS fade + slide via `starting:` (no JS animation
 * state, so no exit-animation retained-state juggling); dismiss is
 * instant.
 */
export function MissedAlert({
  window: missedWindow,
  onShowSummary,
  onReplay,
  onDismiss,
}: {
  window: MissedWindow | null;
  onShowSummary: (window: MissedWindow) => void;
  onReplay: (t: number) => void;
  onDismiss: () => void;
}) {
  if (!missedWindow) return null;

  return (
    <div
      key={missedWindow.id}
      role="status"
      className="translate-y-0 rounded-xl border border-rose-200 bg-rose-50 p-4 opacity-100 shadow-sm transition-all duration-200 starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none dark:border-rose-900/50 dark:bg-rose-950/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-rose-900 dark:text-rose-200">
          You might have missed something important
        </p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
        >
          ×
        </button>
      </div>
      <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">
        A key concept was explained while you were looking away and showed
        signs of confusion.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onShowSummary(missedWindow)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Show me a summary
        </button>
        <button
          onClick={() => onReplay(missedWindow.start)}
          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-950/60"
        >
          Replay that moment
        </button>
      </div>
    </div>
  );
}
