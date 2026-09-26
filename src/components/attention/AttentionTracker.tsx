"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { Card } from "@/components/ui/Card";
import { getAttentionLevel } from "@/lib/attention";
import {
  detectForVideo,
  loadFaceLandmarker,
  sampleFromFaceLandmarkerResult,
} from "@/lib/attention/real-tracker";
import type { AttentionSample } from "@/types";

/** How often to actually run inference — not every frame, to keep CPU/battery low. */
const INFERENCE_INTERVAL_MS = 250;

const LEVEL_STYLES: Record<"high" | "medium" | "low", { label: string; badge: string }> = {
  high: { label: "Attention: High", badge: "bg-emerald-500 text-white" },
  medium: { label: "Attention: Medium", badge: "bg-amber-500 text-white" },
  low: { label: "Attention: Low", badge: "bg-rose-500 text-white" },
};

/**
 * Webcams are largely exclusive-access at the OS/driver level. In FocusAid's
 * actual use case the student is often already in a Meet/Teams call holding
 * the camera, so `NotReadableError` (device busy) is the most likely real
 * failure — worth telling apart from "denied" or "no camera".
 */
function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is busy — probably already in use by Meet, Teams, or another app. Showing simulated view instead.";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied — showing simulated view instead.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found — showing simulated view instead.";
  }
  return "Camera unavailable — showing simulated view instead.";
}

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
 * Owned by the Attention feature team. Attention tracker with two modes:
 * a simulated silhouette (default) and a real webcam feed analyzed live via
 * MediaPipe Face Landmarker (`src/lib/attention/real-tracker.ts`).
 *
 * `useRealCamera` is controlled by the page (surfaced in Settings, not a
 * button on this card — one less thing competing for attention here). Real
 * capture is opt-in and off by default (ROADMAP.md risk #6: a permission
 * prompt or wrong face mid-demo is worse than a clean fallback; also, in
 * real usage the student is likely already in a Meet/Teams call holding the
 * camera, so getUserMedia can fail with NotReadableError for reasons that
 * have nothing to do with permissions). While real capture is on but no
 * face is detected yet (loading, or nobody in frame), the bars fall back to
 * the simulated `sample`/`level` props rather than freezing.
 */
export function AttentionTracker({
  currentTime,
  sample,
  level,
  useRealCamera,
  onToggleRealCamera,
  onLiveSample,
  headless = false,
}: {
  currentTime: number;
  sample: AttentionSample;
  level: "high" | "medium" | "low";
  useRealCamera: boolean;
  onToggleRealCamera: (active: boolean) => void;
  /** Called with each real detected sample, so the page can record it onto
   * the shared timeline instead of it only ever affecting this card. */
  onLiveSample?: (sample: AttentionSample) => void;
  headless?: boolean;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [liveSample, setLiveSample] = useState<AttentionSample | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentTimeRef = useRef(currentTime);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const onLiveSampleRef = useRef(onLiveSample);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    onLiveSampleRef.current = onLiveSample;
  }, [onLiveSample]);

  useEffect(() => {
    if (!useRealCamera) return;

    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;
    let lastInference = 0;

    loadFaceLandmarker()
      .then((landmarker) => {
        if (!cancelled) landmarkerRef.current = landmarker;
      })
      .catch((error) => {
        // Not fatal — the raw feed still shows, bars fall back to the
        // simulated sample — but say so, instead of just looking stuck.
        if (!cancelled) {
          console.error("Face Landmarker failed to load", error);
          setDetectionError(
            "Face-detection model failed to load — showing camera without live analysis."
          );
        }
      });

    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        setCameraError(null);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = mediaStream;

        const loop = () => {
          if (cancelled) return;
          // Always reschedule first — a throw below must not kill the loop
          // silently (it did, before this fix: no rAF meant "stuck forever"
          // with zero indication why).
          rafId = requestAnimationFrame(loop);

          const landmarker = landmarkerRef.current;
          const now = performance.now();
          if (
            landmarker &&
            video.readyState >= 2 &&
            now - lastInference >= INFERENCE_INTERVAL_MS
          ) {
            lastInference = now;
            try {
              const result = detectForVideo(landmarker, video, now);
              const newSample = result
                ? sampleFromFaceLandmarkerResult(result, currentTimeRef.current)
                : null;
              setLiveSample(newSample);
              if (newSample) onLiveSampleRef.current?.(newSample);
              setDetectionError(null);
            } catch (error) {
              console.error("Face Landmarker detectForVideo failed", error);
              setDetectionError("Live face analysis hit an error — showing camera without it.");
            }
          }
        };
        rafId = requestAnimationFrame(loop);
      })
      .catch((error) => {
        setCameraError(describeCameraError(error));
        onToggleRealCamera(false);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
      setLiveSample(null);
      setDetectionError(null);
    };
  }, [useRealCamera, onToggleRealCamera]);

  const effectiveSample = liveSample ?? sample;
  const effectiveLevel = liveSample ? getAttentionLevel(liveSample) : level;
  const { label, badge } = LEVEL_STYLES[effectiveLevel];

  if (headless) {
    if (!useRealCamera) return null;
    return (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden="true"
        className="hidden"
      />
    );
  }

  return (
    <Card title="Attention tracker" className="relative">
      {/* Hidden video element keeping background MediaPipe inference active when real camera is on */}
      {useRealCamera && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-hidden="true"
          className="hidden"
        />
      )}

      <div className="mb-3 flex items-center justify-between">
        <span
          role="status"
          aria-live="polite"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
        >
          {label}
        </span>
        {useRealCamera ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live webcam active
          </span>
        ) : (
          <span className="text-xs text-zinc-400">Simulated signal · Settings for camera</span>
        )}
      </div>

      {cameraError && (
        <p role="alert" className="mb-2 text-xs text-rose-500">
          {cameraError}
        </p>
      )}
      {detectionError && (
        <p role="alert" className="mb-2 text-xs text-amber-500">
          {detectionError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Bar label="Gaze to screen" value={effectiveSample.gaze} tone="emerald" />
        <Bar label="Confusion (brow)" value={effectiveSample.confusion} tone="rose" />
        <Bar label="Engagement" value={effectiveSample.engagement} tone="emerald" />
      </div>
    </Card>
  );
}
