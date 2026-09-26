"use client";

import { useRef, useState } from "react";
import type { AttentionSample, TimelineBand } from "@/types";

const BAND_COLOR: Record<TimelineBand, string> = {
  high: "#10b981",
  recovered: "#10b981",
  away: "#f43f5e",
  confused: "#f59e0b",
  key: "#3b82f6",
};

const LEGEND: { band: TimelineBand; label: string }[] = [
  { band: "high", label: "High attention" },
  { band: "away", label: "Looking away" },
  { band: "confused", label: "Confusion detected" },
  { band: "key", label: "Key information" },
  { band: "recovered", label: "Back on track" },
];

/** Catmull-Rom through `points`, converted to cubic bezier segments. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  const d = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Owned by the Attention feature team. Full-width attention & understanding
 * timeline: coloured bands behind a smoothed engagement curve, with a
 * mandatory legend (colour is never the only cue) and click/drag-to-seek.
 */
export function AttentionTimeline({
  bands,
  samples,
  duration,
  currentTime,
  onSeek,
}: {
  bands: { band: TimelineBand; start: number; end: number }[];
  samples: AttentionSample[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const minimalRef = useRef<HTMLDivElement>(null);
  const detailedRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const timeFromClientX = (clientX: number, target: HTMLDivElement | null) => {
    const rect = target?.getBoundingClientRect();
    if (!rect) return null;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return fraction * duration;
  };

  const linePath = smoothPath(
    samples.map((sample) => ({
      x: (sample.t / duration) * 1000,
      y: 110 - sample.engagement * 100,
    }))
  );

  const hoverSample =
    hoverTime !== null && samples.length > 0
      ? samples.reduce((closest, sample) =>
          Math.abs(sample.t - hoverTime) < Math.abs(closest.t - hoverTime) ? sample : closest
        )
      : null;

  return (
    <div className="relative">
      {/* Floating Detailed Panel (Floats in above the bar on arrow press) */}
      {isExpanded && (
        <div className="absolute bottom-full mb-2 inset-x-0 z-40 rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Attention &amp; understanding timeline
            </h3>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <span>Minimize</span>
              <span aria-hidden className="text-[10px]">▼</span>
            </button>
          </div>

          <div
            ref={detailedRef}
            role="slider"
            aria-label="Lesson attention timeline detailed graph, seek"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={formatTime(currentTime)}
            tabIndex={0}
            className="relative cursor-pointer select-none touch-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
            onPointerDown={(e) => {
              setIsDragging(true);
              const time = timeFromClientX(e.clientX, detailedRef.current);
              if (time !== null) onSeek(Math.round(time));
            }}
            onPointerMove={(e) => {
              const time = timeFromClientX(e.clientX, detailedRef.current);
              if (time === null) return;
              setHoverTime(time);
              if (isDragging) onSeek(Math.round(time));
            }}
            onPointerUp={() => setIsDragging(false)}
            onPointerLeave={() => {
              setIsDragging(false);
              setHoverTime(null);
            }}
          >
            <svg
              viewBox="0 0 1000 120"
              preserveAspectRatio="none"
              className="h-28 w-full rounded-lg"
            >
              {bands.map((segment, i) => (
                <rect
                  key={i}
                  x={(segment.start / duration) * 1000}
                  y={0}
                  width={((segment.end - segment.start) / duration) * 1000}
                  height={120}
                  fill={BAND_COLOR[segment.band]}
                  opacity={0.18}
                />
              ))}
              <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth={2} />
              <line
                x1={(currentTime / duration) * 1000}
                x2={(currentTime / duration) * 1000}
                y1={0}
                y2={120}
                stroke="currentColor"
                className="text-zinc-800 dark:text-zinc-200"
                strokeWidth={2}
              />
            </svg>
            {hoverSample && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow"
                style={{ left: `${(hoverSample.t / duration) * 100}%` }}
              >
                {formatTime(hoverSample.t)} · gaze {Math.round(hoverSample.gaze * 100)}% ·
                confusion {Math.round(hoverSample.confusion * 100)}% · engagement{" "}
                {Math.round(hoverSample.engagement * 100)}%
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {LEGEND.map(({ band, label }) => (
              <span key={band} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: BAND_COLOR[band] }}
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Minimal Timeline Bar (Default view) */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <span className="shrink-0 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Timeline
        </span>

        {/* Minimal colored timeline strip */}
        <div
          ref={minimalRef}
          role="slider"
          aria-label="Lesson attention timeline, seek"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={formatTime(currentTime)}
          tabIndex={0}
          className="relative h-4 flex-1 cursor-pointer select-none touch-none overflow-hidden rounded-full bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-800"
          onPointerDown={(e) => {
            setIsDragging(true);
            const time = timeFromClientX(e.clientX, minimalRef.current);
            if (time !== null) onSeek(Math.round(time));
          }}
          onPointerMove={(e) => {
            const time = timeFromClientX(e.clientX, minimalRef.current);
            if (time === null) return;
            setHoverTime(time);
            if (isDragging) onSeek(Math.round(time));
          }}
          onPointerUp={() => setIsDragging(false)}
          onPointerLeave={() => {
            setIsDragging(false);
            setHoverTime(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              onSeek(Math.min(duration, currentTime + 5));
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              onSeek(Math.max(0, currentTime - 5));
            } else if (e.key === "Home") {
              e.preventDefault();
              onSeek(0);
            } else if (e.key === "End") {
              e.preventDefault();
              onSeek(duration);
            }
          }}
        >
          {bands.map((segment, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(segment.start / duration) * 100}%`,
                width: `${((segment.end - segment.start) / duration) * 100}%`,
                backgroundColor: BAND_COLOR[segment.band],
                opacity: 0.65,
              }}
            />
          ))}

          {/* Current playhead line */}
          <div
            className="absolute top-0 bottom-0 w-1 -translate-x-1/2 bg-zinc-900 shadow-sm dark:bg-white"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        {/* Minimal hover time tooltip */}
        {hoverSample && !isExpanded && (
          <div
            className="pointer-events-none absolute -top-8 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-0.5 text-xs text-white shadow"
            style={{ left: `${(hoverSample.t / duration) * 100}%` }}
          >
            {formatTime(hoverSample.t)}
          </div>
        )}

        <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        {/* Arrow expand button */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          title={isExpanded ? "Collapse timeline" : "Expand attention timeline details"}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <span>Details</span>
          <span aria-hidden className="text-[10px]">{isExpanded ? "▼" : "▲"}</span>
        </button>
      </div>
    </div>
  );
}
