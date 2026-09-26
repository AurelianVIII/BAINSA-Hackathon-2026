"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SummaryFlowchart } from "@/components/summary/SummaryFlowchart";
import { buildVisualSummary } from "@/lib/summary";
import type { MissedWindow, VisualSummaryData } from "@/lib/summary/types";
import { transcript } from "@/data/transcript";

/** How long to wait for the AI summary before staying with the local one. */
const AI_TIMEOUT_MS = 4000;

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
  const local = useMemo(
    () => (request ? buildVisualSummary(transcript, request) : null),
    [request]
  );

  // Keyed by request id rather than reset on change, so switching windows
  // never shows the previous window's AI text and the effect never has to
  // clear state synchronously.
  const [ai, setAi] = useState<{ id: string; data: VisualSummaryData } | null>(
    null
  );

  // Bring the panel into view when a summary is asked for. The right column
  // scrolls, and the panel sits below the alert that triggered it — without
  // this the student clicks "Show me a summary" and sees only the heading.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!request) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, [request]);

  useEffect(() => {
    if (!request) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: request.start, end: request.end }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        // Only upgrade when the route actually reached the model. A local
        // result is already on screen, so there is nothing to swap in.
        if (result?.source === "ai") {
          setAi({ id: request.id, data: result as VisualSummaryData });
        }
      })
      .catch(() => {
        // Aborted or offline — the local summary is already rendered.
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request]);

  const data = ai && request && ai.id === request.id ? ai.data : local;

  if (!request || !data) {
    return (
      <div ref={panelRef}>
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
      </div>
    );
  }

  return (
    <div ref={panelRef} className="scroll-mt-2">
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
    </div>
  );
}
