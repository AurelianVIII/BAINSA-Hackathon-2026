"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { AttentionSample, TimelineBand } from "@/types";

const BAND_COLOR: Record<TimelineBand, string> = {
  high: "#10b981",
  recovered: "#10b981",
  away: "#f43f5e",
  confused: "#f59e0b",
  key: "#8b5cf6",
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const timeFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
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
    <Card title="Attention & understanding timeline">
      <div
        ref={containerRef}
        className="relative cursor-pointer select-none touch-none"
        onPointerDown={(e) => {
          setIsDragging(true);
          const time = timeFromClientX(e.clientX);
          if (time !== null) onSeek(Math.round(time));
        }}
        onPointerMove={(e) => {
          const time = timeFromClientX(e.clientX);
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
    </Card>
  );
}
