export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          F
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            FocusAid
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Never lose the thread of a lesson
          </p>
        </div>
      </div>
      <Badge />
    </header>
  );
}

function Badge() {
  return (
    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
      Prototype
    </span>
  );
}
