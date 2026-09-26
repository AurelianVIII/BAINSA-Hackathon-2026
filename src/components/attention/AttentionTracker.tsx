"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { AttentionSample } from "@/types";

const LEVEL_STYLES: Record<"high" | "medium" | "low", { label: string; badge: string }> = {
  high: { label: "Attention: High", badge: "bg-emerald-500 text-white" },
  medium: { label: "Attention: Medium", badge: "bg-amber-500 text-white" },
  low: { label: "Attention: Low", badge: "bg-rose-500 text-white" },
};

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose";
}) {
  const pct = Math.round(value * 100);
  const barColor = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 motion-reduce:transition-none ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Owned by the Attention feature team. Simulated webcam attention tracker.
 * Real `getUserMedia` access is opt-in and off by default (ROADMAP.md risk
 * #6: a permission prompt or wrong face mid-demo is worse than a clean
 * fallback) — toggling it on only swaps the video feed underneath the
 * still-illustrative tracking box; it does not run any real face/gaze
 * detection, which stays out of scope for this prototype.
 */
export function AttentionTracker({
  sample,
  level,
}: {
  currentTime: number;
  sample: AttentionSample;
  level: "high" | "medium" | "low";
}) {
  const [useRealCamera, setUseRealCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!useRealCamera) return;

    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
      })
      .catch(() => {
        setCameraError("Camera unavailable — showing simulated view instead.");
        setUseRealCamera(false);
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [useRealCamera]);

  const { label, badge } = LEVEL_STYLES[level];

  return (
    <Card title="Attention tracker" className="relative">
      <div className="mb-2 flex items-center justify-between">
        <span
          role="status"
          aria-live="polite"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => setUseRealCamera((v) => !v)}
          className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {useRealCamera ? "Use simulated view" : "Use real webcam"}
        </button>
      </div>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900">
        {useRealCamera ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 100 100" className="h-2/3 w-2/3 text-zinc-600" fill="currentColor">
            <circle cx="50" cy="38" r="18" />
            <path d="M20 95 C20 65 35 55 50 55 C65 55 80 65 80 95 Z" />
          </svg>
        )}
        <div className="absolute left-1/2 top-[34%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-emerald-400">
          <span className="absolute -left-0.5 -top-0.5 h-2 w-2 border-l-2 border-t-2 border-emerald-400" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 border-r-2 border-t-2 border-emerald-400" />
          <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 border-b-2 border-l-2 border-emerald-400" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 border-b-2 border-r-2 border-emerald-400" />
        </div>
      </div>
      {cameraError && (
        <p role="alert" className="mt-2 text-xs text-rose-500">
          {cameraError}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <Bar label="Gaze to screen" value={sample.gaze} tone="emerald" />
        <Bar label="Confusion (brow)" value={sample.confusion} tone="rose" />
        <Bar label="Engagement" value={sample.engagement} tone="emerald" />
      </div>
    </Card>
  );
}
