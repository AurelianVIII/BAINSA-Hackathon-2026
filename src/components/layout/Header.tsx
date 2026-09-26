/**
 * Top bar for the lesson screen. The centre line states who this product is
 * for — it is the first thing a stranger reads, so it stays in the header
 * rather than buried in a panel.
 */
export function Header({ isLive }: { isLive: boolean }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          F
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            FocusAid
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Never miss what matters.
          </p>
        </div>
      </div>

      <p className="hidden text-sm text-zinc-600 lg:block dark:text-zinc-300">
        AI attention &amp; understanding support for deaf learners
      </p>

      <div className="flex items-center gap-3">
        <LiveIndicator isLive={isLive} />
        <button
          type="button"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Settings
        </button>
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        >
          SM
        </div>
      </div>
    </header>
  );
}

/**
 * Live state is carried by the text as well as the dot — colour alone must
 * not be the only signal (see the accessibility pass in ROADMAP §PC1).
 */
function LiveIndicator({ isLive }: { isLive: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
      <span className="relative flex h-2.5 w-2.5">
        {isLive && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            isLive ? "bg-red-500" : "bg-zinc-400 dark:bg-zinc-600"
          }`}
        />
      </span>
      {isLive ? "Live Lesson" : "Paused"}
    </span>
  );
}
