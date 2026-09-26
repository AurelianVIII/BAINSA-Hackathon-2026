import type { MissedWindow } from "@/lib/catchup/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * What actually triggered this alert, in the student's words.
 *
 * The body text used to assert that the student was looking away *and*
 * showed confusion *and* that a key concept was explained — regardless of
 * which of those was detected. So an alert raised purely on gaze told the
 * student they had looked confused, and every alert claimed key content
 * whether or not any line was marked important.
 *
 * The student cannot check any of this against the audio, so the alert now
 * says only what the detector actually found.
 */
function describeReason(missedWindow: MissedWindow): string {
  const cause =
    missedWindow.reason === "confusion"
      ? "You looked unsure here"
      : missedWindow.reason === "low-attention"
        ? "Your attention dropped here"
        : "You were looking away here";

  const what = missedWindow.hitKeyContent
    ? "and the lesson was covering something marked as key."
    : "and the lesson kept going.";

  return `${cause} ${what}`;
}

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
          You might have missed something
        </p>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/40"
        >
          ×
        </button>
      </div>

      {/* The same time range the summary panel shows, so the two read as
          one thing rather than two separate claims about the lesson. */}
      <p className="mt-0.5 text-xs tabular-nums text-rose-700/80 dark:text-rose-300/70">
        {formatTime(missedWindow.start)} – {formatTime(missedWindow.end)}
      </p>

      <p className="mt-1.5 text-sm text-rose-800 dark:text-rose-300">
        {describeReason(missedWindow)}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onShowSummary(missedWindow)}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Show me a summary
        </button>
        <button
          onClick={() => onReplay(missedWindow.start)}
          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-rose-800 dark:bg-transparent dark:text-rose-200 dark:hover:bg-rose-950/60"
        >
          Replay that moment
        </button>
      </div>
    </div>
  );
}
