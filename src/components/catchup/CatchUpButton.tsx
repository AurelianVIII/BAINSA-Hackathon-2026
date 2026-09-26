"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { fetchCatchUp } from "@/lib/catchup/client";
import type { CatchUpResult, TranscriptItem } from "@/types";

/**
 * Owned by the Catch-up feature team. Minimal working demo (manual
 * "Catch me up" over the last 60s) — keep the `currentTime` prop as the
 * input contract. `items` defaults to the mock lesson transcript.
 */
export function CatchUpButton({
  currentTime,
  items,
  title,
}: {
  currentTime: number;
  items?: TranscriptItem[];
  title?: string;
}) {
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      setResult(await fetchCatchUp(items, currentTime - 60, currentTime, title));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card title="Catch me up">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isLoading ? "Thinking…" : "What did I miss?"}
      </button>
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
          <ul className="mt-1 list-inside list-disc text-zinc-600 dark:text-zinc-400">
            {result.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          {result.bridge && (
            <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-400">
              {result.bridge}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
