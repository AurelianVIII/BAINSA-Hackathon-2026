"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { generateCatchUp } from "@/lib/catchup";
import { transcript } from "@/data/transcript";
import type { CatchUpResult } from "@/types";

const FETCH_TIMEOUT_MS = 4000;

/**
 * Calls /api/catchup for an AI-condensed summary, falling back to the
 * local deterministic result on any error, non-OK response, or if it
 * takes longer than FETCH_TIMEOUT_MS — the demo must never hang on a
 * network call.
 */
async function fetchCatchUp(start: number, end: number): Promise<CatchUpResult> {
  const local = generateCatchUp(transcript, start, end);
  if (local.bullets.length === 0) return local;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch("/api/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
      signal: controller.signal,
    });
    if (!response.ok) return local;
    return (await response.json()) as CatchUpResult;
  } catch {
    return local;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Owned by the Catch-up feature team. Minimal working demo (manual
 * "Catch me up" over the last 60s) — keep the `currentTime` prop as the
 * input contract.
 */
export function CatchUpButton({ currentTime }: { currentTime: number }) {
  const [result, setResult] = useState<CatchUpResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      setResult(await fetchCatchUp(currentTime - 60, currentTime));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card title="Catch me up">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
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
        </div>
      )}
    </Card>
  );
}
