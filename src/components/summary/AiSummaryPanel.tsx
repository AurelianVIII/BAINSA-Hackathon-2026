"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SummaryFlowchart } from "@/components/summary/SummaryFlowchart";
import { buildVisualSummary, getItemsInWindow } from "@/lib/summary";
import type { MissedWindow, VisualSummaryData } from "@/lib/summary/types";
import type { TranscriptItem } from "@/types";
import { extractKeyFocusPoint, synthesizePassage } from "@/lib/ai/smart-summarizer";
import { generateSummary } from "@/lib/ai/webllm-client";
import { useAutoLoadWebLLM } from "@/lib/ai/useWebLLM";

/** How long to wait for the server AI summary before staying with the local one. */
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
 * Three-tier summary sources:
 * 1. WebGPU LLM (in-browser, real generative AI via web-llm)
 * 2. Server API (Claude via Anthropic API, if key is set)
 * 3. Local smart summarizer (rule-based fallback, always instant)
 *
 * The local summary renders immediately. WebGPU and server results
 * replace it as they arrive. The badge shows which source is active.
 */
export function AiSummaryPanel({
  request,
  items,
  lessonTitle,
}: {
  request: MissedWindow | null;
  items: TranscriptItem[];
  lessonTitle?: string;
}) {
  const lesson = items;
  const local = useMemo(
    () => (request ? buildVisualSummary(lesson, request, { lessonTitle }) : null),
    [request, lesson, lessonTitle]
  );

  const [ai, setAi] = useState<{
    id: string;
    data: VisualSummaryData;
    source: "webgpu" | "server" | "local";
  } | null>(null);

  // Auto-load the WebGPU LLM on mount
  const webllm = useAutoLoadWebLLM();

  const panelRef = useRef<HTMLDivElement>(null);
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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }, [request]);

  // Try WebGPU LLM first, then server API
  useEffect(() => {
    if (!request) return;
    let cancelled = false;

    const passage = getItemsInWindow(lessonRef.current, request)
      .map((item) => item.text)
      .join(" ");

    // 1. Try WebGPU LLM (in-browser)
    if (webllm.status === "ready" && passage.trim()) {
      generateSummary(passage, titleRef.current).then((text) => {
        if (!cancelled && text) {
          setAi({
            id: request.id,
            data: {
              title: local?.title ?? "What you missed",
              text,
              nodes: local?.nodes ?? [],
              edges: local?.edges ?? [],
            },
            source: "webgpu",
          });
        }
      });
    }

    // 2. Try server API (in parallel, may arrive first if WebGPU is still loading)
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
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (!cancelled && result?.text) {
          // Only use server result if we don't already have a WebGPU result
          setAi((prev) => {
            if (prev?.id === request.id && prev.source === "webgpu") return prev;
            return {
              id: request.id,
              data: result as VisualSummaryData,
              source: "server",
            };
          });
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [request, webllm.status, local]);

  const active = ai && request && ai.id === request.id ? ai : null;
  const data = active?.data ?? local;
  const text = active ? active.data.text : (local?.text ?? "");

  const badgeLabel = active?.source === "webgpu"
    ? "WebGPU AI"
    : active?.source === "server"
      ? "AI"
      : "AI";
  const badgeTitle = active?.source === "webgpu"
    ? "Generated by in-browser LLM via WebGPU"
    : active?.source === "server"
      ? "Generated by cloud AI"
      : "AI summary";

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
            {webllm.status === "loading" && (
              <div className="mt-2 w-full max-w-xs">
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Loading AI model… {webllm.progress != null ? `${Math.round(webllm.progress * 100)}%` : ""}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${(webllm.progress ?? 0) * 100}%` }}
                  />
                </div>
              </div>
            )}
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
              title={badgeTitle}
              className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium normal-case text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <SparkleIcon />
              {badgeLabel}
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

        {data.nodes.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
            <SummaryFlowchart data={data} />
          </div>
        )}
      </Card>
    </div>
  );
}
