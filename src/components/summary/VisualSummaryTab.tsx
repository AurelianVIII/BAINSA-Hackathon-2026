"use client";

import { getTopicGist, groupByTopic } from "@/lib/summary";
import type { TranscriptItem } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * The whole lesson at a glance — one card per topic with a one-line gist.
 * Becomes the "Visual Summary" tab in PC1's transcript panel. Deliberately
 * simple: it is a tab, not a second product.
 */
export function VisualSummaryTab({
  items,
  currentTime,
  onSeek,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  const byTopic = groupByTopic(items);

  return (
    <ul className="flex flex-col gap-2">
      {Object.entries(byTopic).map(([topic, topicItems]) => {
        const start = Math.min(...topicItems.map((item) => item.start));
        const end = Math.max(...topicItems.map((item) => item.end));
        const isActive = currentTime >= start && currentTime < end;

        return (
          <li key={topic}>
            <button
              onClick={() => onSeek(start)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                isActive
                  ? "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {topic}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                  {formatTime(start)} – {formatTime(end)}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {getTopicGist(topic)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
