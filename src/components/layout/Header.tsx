"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Top bar for the lesson screen. The centre line states who this product is
 * for — it is the first thing a stranger reads, so it stays in the header
 * rather than buried in a panel.
 */
export function Header({
  isLive,
  useRealCamera,
  onToggleRealCamera,
}: {
  isLive: boolean;
  useRealCamera: boolean;
  onToggleRealCamera: (active: boolean) => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
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
        <SettingsMenu useRealCamera={useRealCamera} onToggleRealCamera={onToggleRealCamera} />
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
 * Settings menu — a small dropdown rather than a modal, since it holds one
 * toggle. Real webcam capture lives here rather than as a button on the
 * Attention tracker card: it's an occasional setting, not something that
 * needs to compete for space with the things that change every second.
 */
function SettingsMenu({
  useRealCamera,
  onToggleRealCamera,
}: {
  useRealCamera: boolean;
  onToggleRealCamera: (active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Settings
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                Real webcam attention tracking
              </span>
              <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                Analyzes your live face instead of the simulated demo signal.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={useRealCamera}
              checked={useRealCamera}
              onChange={(event) => onToggleRealCamera(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-900"
            />
          </label>
        </div>
      )}
    </div>
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
