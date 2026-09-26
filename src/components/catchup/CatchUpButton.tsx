"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { generateCatchUp } from "@/lib/catchup";
import { transcript } from "@/data/transcript";

/**
 * Owned by the Catch-up feature team. This is a minimal working demo
 * (manual "Catch me up" over the last 60s) — replace the interaction and
 * styling as needed, but keep the `currentTime` prop as the input contract.
 */
export function CatchUpButton({ currentTime }: { currentTime: number }) {
  const [result, setResult] = useState<ReturnType<typeof generateCatchUp> | null>(
    null
  );

  return (
    <Card title="Catch me up">
      <button
        onClick={() => setResult(generateCatchUp(transcript, currentTime - 60, currentTime))}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        What did I miss?
      </button>
      {result && (
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
