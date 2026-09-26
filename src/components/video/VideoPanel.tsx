import type { CaptionChunk } from "@/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const WHITEBOARD_POINTS = [
  "Light-dependent reactions → ATP + NADPH",
  "Light-independent reactions (Calvin cycle)",
  "CO₂ + ATP/NADPH → G3P → glucose",
];

/**
 * The lesson stage. There is no real video file — a CSS composition reads
 * better on a projector and keeps the repo light. What matters here is the
 * burned-in caption bar: this is an accessibility product for deaf learners,
 * so the captions are the hero element and are sized like it.
 */
export function VideoPanel({
  currentTime,
  duration,
  isPlaying,
  speed,
  caption,
  onPlayPause,
  onSpeedChange,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: 1 | 2;
  caption: CaptionChunk | null;
  onPlayPause: () => void;
  onSpeedChange: (speed: 1 | 2) => void;
  onSeek: (time: number) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative aspect-video max-h-[42vh] w-full overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        {/* Whiteboard */}
        <div className="absolute left-[6%] top-[10%] h-[62%] w-[52%] rounded-md bg-slate-50 p-4 shadow-lg">
          <p className="mb-2 border-b border-slate-300 pb-1.5 text-sm font-bold text-slate-800">
            Today&apos;s key points
          </p>
          <ul className="flex flex-col gap-1.5">
            {WHITEBOARD_POINTS.map((point) => (
              <li key={point} className="text-xs leading-snug text-slate-700">
                • {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Presenter */}
        <div className="absolute bottom-[32%] right-[8%] flex flex-col items-center gap-2">
          <div className="h-16 w-16 rounded-full bg-gradient-to-b from-amber-200 to-amber-300 shadow-md" />
          <div className="h-12 w-20 rounded-t-3xl bg-teal-600 shadow-md" />
        </div>
        <span className="absolute left-[6%] top-[76%] rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Prof. Emma Rossi
        </span>

        {/* Burned-in captions. Fixed height so the stage does not jump as
            chunks change length. */}
        <div className="absolute inset-x-0 bottom-0 flex min-h-[26%] items-center justify-center bg-black/75 px-6 py-4 backdrop-blur-sm">
          <p className="line-clamp-2 text-center text-2xl font-semibold leading-snug text-white xl:text-3xl">
            {caption?.text ?? ""}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlayPause}
          className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onSpeedChange(speed === 1 ? 2 : 1)}
          aria-label={`Playback speed ${speed}x, click to change`}
          className="rounded-full border border-zinc-300 px-2.5 py-1.5 text-xs font-medium tabular-nums text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {speed}×
        </button>
        <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTime}
          aria-label="Seek lesson"
          onChange={(e) => onSeek(Number(e.target.value))}
          className="flex-1 accent-indigo-600"
        />
      </div>
    </div>
  );
}
