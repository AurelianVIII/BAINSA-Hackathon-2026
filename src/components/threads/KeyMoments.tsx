"use client";

import { Card } from "@/components/ui/Card";
import { groupByTopic } from "@/lib/summary";
import type { MissedWindow } from "@/lib/summary/types";
import type { TranscriptItem } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/** A key moment the student asked about directly, rather than one an
 *  attention event flagged. PC2's alert produces the other kind. */
function windowForItem(item: TranscriptItem): MissedWindow {
  return {
    id: `moment-${item.id}`,
    start: item.start,
    end: item.end,
    reason: "low-attention",
    transcriptIds: [item.id],
    hitKeyContent: item.importance === "high",
  };
}

/**
 * Owned by the Summaries/Threads feature team (PC4).
 *
 * The lesson's key moments, grouped by topic. Becomes the "Key Moments"
 * tab once PC1 builds the transcript tab bar; until then it stands on its
 * own. Each moment can be jumped to, or summarised on the spot — a second
 * way into the summary panel that doesn't depend on having missed
 * anything.
 */
export function KeyMoments({
  items,
  currentTime,
  onSeek,
  missedIds = [],
  onRequestSummary,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
  missedIds?: string[];
  onRequestSummary?: (window: MissedWindow) => void;
}) {
  const keyItems = items.filter((item) => item.importance === "high");
  const byTopic = groupByTopic(keyItems);

  return (
    <Card title="Key moments" className="max-h-80 overflow-y-auto">
      <div className="flex flex-col gap-3">
        {Object.entries(byTopic).map(([topic, topicItems]) => (
          <div key={topic}>
            <h3 className="mb-1 text-xs font-semibold text-zinc-400 dark:text-zinc-500">
              {topic}
            </h3>
            <ul className="flex flex-col gap-1">
              {topicItems.map((item) => {
                const isActive =
                  currentTime >= item.start && currentTime < item.end;
                const wasMissed = missedIds.includes(item.id);

                return (
                  <li key={item.id} className="flex items-start gap-1">
                    <button
                      onClick={() => onSeek(item.start)}
                      className={`flex flex-1 gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-zinc-100 dark:bg-zinc-800"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-xs tabular-nums text-zinc-400">
                        {formatTime(item.start)}
                      </span>
                      <span className="flex-1 text-zinc-700 dark:text-zinc-300">
                        {item.text}
                      </span>
                      {wasMissed && (
                        <span
                          className="shrink-0 font-bold text-rose-500"
                          aria-label="You missed this"
                        >
                          !
                        </span>
                      )}
                    </button>
                    {onRequestSummary && (
                      <button
                        onClick={() => onRequestSummary(windowForItem(item))}
                        className="mt-1 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Summarise
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
