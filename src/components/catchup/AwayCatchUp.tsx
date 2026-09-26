"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { fetchCatchUp } from "@/lib/catchup/client";
import type { CatchUpResult, TranscriptItem } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Owned by the Catch-up feature team. A deliberate "I'm about to look away"
 * declaration — the mirror image of MissedAlert's automatic, detected
 * version. The student marks the moment themselves (no camera required),
 * then asks to be caught up the moment they're back. Unlike the plain
 * "What did I miss?" button, the result leads with `bridge`: not just what
 * was said, but how the lesson moved from where they left to where it is
 * now.
 */
export function AwayCatchUp({
  currentTime,
  items,
}: {
  currentTime: number;
  items: TranscriptItem[];
}) {
  const [awayFrom, setAwayFrom] = useState<number | null>(null);
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLookAway = () => {
    setAwayFrom(currentTime);
    setResult(null);
  };

  const handleReturn = async () => {
    const from = awayFrom;
    if (from === null) return;
    setAwayFrom(null);
    setIsLoading(true);
    try {
      // At least a 1s window — tapping "I'm back" immediately after "I'm
      // looking away" would otherwise send an empty (end <= start) range.
      setResult(await fetchCatchUp(items, from, Math.max(currentTime, from + 1)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card title="Stepping away?">
      {awayFrom === null ? (
        <button
          type="button"
          onClick={handleLookAway}
          disabled={isLoading}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          I&apos;m looking away
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
            Marked at {formatTime(awayFrom)} — tap below whenever you&apos;re back.
          </p>
          <button
            type="button"
            onClick={handleReturn}
            disabled={isLoading}
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLoading ? "Catching you up…" : "I'm back — catch me up"}
          </button>
        </div>
      )}

      {isLoading && (
        <div
          className="mt-3 animate-pulse space-y-2 motion-reduce:animate-none"
          role="status"
          aria-label="Preparing your summary"
        >
          <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-3 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      )}

      {!isLoading && result && (
        <div className="mt-3 text-sm">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">{result.title}</p>
          {result.bridge && (
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{result.bridge}</p>
          )}
          <ul className="mt-2 list-inside list-disc text-zinc-600 dark:text-zinc-400">
            {result.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
