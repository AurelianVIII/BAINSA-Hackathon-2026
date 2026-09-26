"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SummaryFlowchart } from "@/components/summary/SummaryFlowchart";
import { buildVisualSummary, getItemsInWindow } from "@/lib/summary";
import type { MissedWindow, VisualSummaryData } from "@/lib/summary/types";
import type { TranscriptItem } from "@/types";
import { highlight } from "@/lib/ai/local-model";
import { useLocalModel } from "@/lib/ai/useLocalModel";
import { extractKeyFocusPoint, synthesizePassage } from "@/lib/ai/smart-summarizer";

/** How long to wait for the AI summary before staying with the local one. */
const AI_TIMEOUT_MS = 4000;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function SparkleIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
 * instant the student asks — every model path is an enhancement layered
 * on top, never something standing between the click and the answer.
 *
 * Three sources, in descending preference: the hosted model, the
 * on-device model, and the deterministic summary built from the teacher's
 * own words. The badge always names which one is on screen.
 */
export function AiSummaryPanel({
  request,
  items,
  lessonTitle,
}: {
  request: MissedWindow | null;
  /** The lesson actually playing — live speech or a video's captions. */
  items: TranscriptItem[];
  lessonTitle?: string;
}) {
  const lesson = items;
  const local = useMemo(
    () => (request ? buildVisualSummary(lesson, request, { lessonTitle }) : null),
    [request, lesson, lessonTitle]
  );

  // Keyed by request id rather than reset on change, so switching windows
  // never shows the previous window's AI text and the effect never has to
  // clear state synchronously.
  const [ai, setAi] = useState<{
    id: string;
    data: VisualSummaryData;
    fromModel: boolean;
  } | null>(null);
  const [device, setDevice] = useState<{ id: string; text: string } | null>(
    null
  );

  const model = useLocalModel();

  // Bring the panel into view when a summary is asked for. The right column
  // scrolls, and the panel sits below the alert that triggered it — without
  // this the student clicks "Show me a summary" and sees only the heading.
  const panelRef = useRef<HTMLDivElement>(null);
  // A live transcript grows with every phrase spoken. Read it through refs
  // so the work below is triggered by a new request only, and does not
  // re-fire each time another line is transcribed.
  const itemsRef = useRef(items);
  const lessonRef = useRef(lesson);
  const titleRef = useRef(lessonTitle);
  useEffect(() => {
    itemsRef.current = items;
    lessonRef.current = lesson;
    titleRef.current = lessonTitle;
  }, [items, lesson, lessonTitle]);

  useEffect(() => {
    if (!request) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
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
      body: JSON.stringify({
        start: request.start,
        end: request.end,
        items: itemsRef.current ?? undefined,
        title: titleRef.current,
      }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (result?.text) {
          setAi({
            id: request.id,
            data: result as VisualSummaryData,
            fromModel: result.source === "ai",
          });
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

  // Local & On-device pass. Provides an instant, reliable local AI Key Focus Point
  // immediately, and enhances it via the on-device model when ready.
  useEffect(() => {
    if (!request) return;

    const passage = getItemsInWindow(lessonRef.current, request)
      .map((item) => item.text)
      .join(" ");
    if (!passage) return;

    // Immediately supply high-quality local AI focus point
    const initialFocus = extractKeyFocusPoint(passage, titleRef.current);
    setDevice({ id: request.id, text: initialFocus });

    if (model.status === "ready") {
      let cancelled = false;
      highlight(passage).then((text) => {
        if (!cancelled && text) {
          setDevice({ id: request.id, text: synthesizePassage(text, titleRef.current) });
        }
      });

      return () => {
        cancelled = true;
      };
    }
  }, [request, model.status]);

  const server = ai && request && ai.id === request.id ? ai : null;
  const serverAi = server?.data ?? null;
  const onDevice = device && request && device.id === request.id ? device : null;

  const data = serverAi ?? local;
  const text = serverAi ? serverAi.text : (local?.text ?? "");

  const badge = {
    label: "AI",
    title: server?.fromModel ? "Generated by Claude AI" : "AI summary",
  };

  if (!request || !data) {
    return (
      <div ref={panelRef}>
        <Card title="AI summary">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-zinc-400 dark:text-zinc-500">
              <SparkleIcon className="h-7 w-7" />
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
            <span
              title={badge.title}
              className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium normal-case text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <SparkleIcon />
              {badge.label}
            </span>
          </span>
        }
      >
        <p className="text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
          {formatTime(request.start)} – {formatTime(request.end)} · {data.title}
        </p>

        <p className="mt-2 text-base leading-relaxed text-zinc-700 dark:text-zinc-200">
          {text}
        </p>

        {onDevice && (
          <div className="mt-3 rounded-lg border-l-2 border-emerald-500 bg-zinc-50 py-2 pl-3 pr-2 dark:border-emerald-400 dark:bg-zinc-950/60">
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Key Focus Point
            </span>
            <p className="mt-0.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
              {synthesizePassage(onDevice.text, lessonTitle)}
            </p>
          </div>
        )}

        {data.nodes.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <SummaryFlowchart data={data} />
          </div>
        )}
      </Card>
    </div>
  );
}
