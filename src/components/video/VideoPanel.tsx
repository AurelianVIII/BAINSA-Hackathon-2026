import { Card } from "@/components/ui/Card";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Mock video player. Real playback is out of scope for this prototype —
 * this component exists to demonstrate the single source of truth for
 * `currentTime`, owned by the page composition layer (src/app/page.tsx).
 */
export function VideoPanel({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-zinc-900 text-zinc-400">
        <span className="text-sm">Lesson video placeholder</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onPlayPause}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span className="w-24 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 accent-indigo-600"
        />
      </div>
    </Card>
  );
}
