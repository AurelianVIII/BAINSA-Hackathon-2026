import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { TranscriptItem } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Live timestamped captions/transcript. Clicking a line seeks the shared
 * playback time (see src/app/page.tsx), which is how "jump back to the
 * exact caption" source-checking is expected to work.
 */
export function TranscriptPanel({
  items,
  currentTime,
  onSeek,
}: {
  items: TranscriptItem[];
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  return (
    <Card title="Transcript" className="max-h-80 overflow-y-auto">
      <ol className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = currentTime >= item.start && currentTime < item.end;
          return (
            <li key={item.id}>
              <button
                onClick={() => onSeek(item.start)}
                className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="mt-0.5 shrink-0 text-xs tabular-nums text-zinc-400">
                  {formatTime(item.start)}
                </span>
                <span className="flex-1 text-zinc-700 dark:text-zinc-300">
                  {item.text}
                </span>
                {item.importance === "high" && <Badge tone="info">key</Badge>}
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
