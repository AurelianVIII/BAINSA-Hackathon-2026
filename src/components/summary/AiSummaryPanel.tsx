"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { SummaryFlowchart } from "@/components/summary/SummaryFlowchart";
import { buildVisualSummary } from "@/lib/summary";
import type { MissedWindow } from "@/lib/summary/types";
import { transcript } from "@/data/transcript";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
    </svg>
  );
}

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * The payoff panel: turns a missed window into a short written summary
 * and a diagram. The summary is computed synchronously so it renders the
 * instant the student asks — the AI route is an enhancement layered on
 * top, never something standing between the click and the answer.
 */
export function AiSummaryPanel({ request }: { request: MissedWindow | null }) {
  const data = useMemo(
    () => (request ? buildVisualSummary(transcript, request) : null),
    [request]
  );

  if (!request || !data) {
    return (
      <Card title="AI summary">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="text-zinc-300 dark:text-zinc-600">
            <SparkleIcon />
          </span>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Summaries appear here when you miss something.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <span className="flex items-center justify-between gap-2">
          <span>AI Summary of the missed part</span>
          <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium normal-case text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <SparkleIcon />
            AI
          </span>
        </span>
      }
    >
      <p className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
        {formatTime(request.start)} – {formatTime(request.end)} · {data.title}
      </p>

      <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-200">
        {data.text}
      </p>

      <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <SummaryFlowchart data={data} />
      </div>
    </Card>
  );
}
