import { Card } from "@/components/ui/Card";
import type { AttentionEvent } from "@/types";

const TYPE_COLOR: Record<AttentionEvent["type"], string> = {
  "looking-away": "bg-rose-400",
  confusion: "bg-amber-400",
  "low-attention": "bg-zinc-400",
};

/**
 * Owned by the Attention feature team. Renders simulated attention events
 * as marks along the lesson duration; clicking a mark jumps playback there
 * (missed-important-moment style navigation).
 */
export function AttentionTimeline({
  events,
  duration,
  currentTime,
  onSeek,
}: {
  events: AttentionEvent[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  return (
    <Card title="Attention timeline">
      <div className="relative h-8 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
        {events.map((event) => (
          <button
            key={event.id}
            title={`${event.type} at ${Math.round(event.start)}s`}
            onClick={() => onSeek(event.start)}
            className={`absolute top-1 h-6 rounded-full opacity-80 hover:opacity-100 ${TYPE_COLOR[event.type]}`}
            style={{
              left: `${(event.start / duration) * 100}%`,
              width: `${Math.max(((event.end - event.start) / duration) * 100, 1.5)}%`,
            }}
          />
        ))}
        <div
          className="absolute top-0 h-8 w-0.5 bg-indigo-600"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>
    </Card>
  );
}
